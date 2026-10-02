#!/usr/bin/env node
// Vela 技术分析网站 —— 服务器（零依赖，Node 18+；可部署到 Render / Railway / Fly / 任意 VPS）
//
//   部署：设置环境变量 FMP_API_KEY（不要把 key 提交到代码仓库）；PORT 由平台注入
//   可选：FMP_MAX_PER_MIN（每分钟最多调用 FMP 次数，默认 250，超出自动改走 Yahoo）
//         RATE_LIMIT_PER_MIN（每个访客 IP 每分钟最多请求数，默认 240）
//         SOURCE_URL（页面底部"源码"链接——PineTS 为 AGPL，公开提供服务时需提供源码）
//
//   node server.mjs                         → http://localhost:8686
//   FMP_API_KEY=你的key node server.mjs     → 启用 FMP（股票/ETF/指数/外汇优先走 FMP）
//   PORT=9000 node server.mjs               → 换端口
//   MOCK=1 node server.mjs                  → 离线演示（合成行情，不联网）
//
// FMP key 也可以写进同目录的 config.json：{ "fmpApiKey": "..." }
//
// 作用：
//   1. 提供 public/ 下的前端页面（Vela 工作区 + 分析面板）
//   2. 代理行情，解决浏览器跨域限制：
//        /api/search?q=                              代码 / 名称搜索（FMP + Yahoo 合并）
//        /api/bars?symbol=&tf=&from=&to=&limit=      K 线（FMP 优先，失败回退 Yahoo）
//        /api/quote?symbol=                          最新报价与元数据
//        /api/events?symbol=                         财报日（FMP）
//        /api/treasury                               美债收益率曲线（FMP，回退 Yahoo）
//
// 需要代理上网时：Node 22.3+/20.18+ 可用  NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 node server.mjs

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'public');
const PORT = Number(process.env.PORT) || 8686;
const MOCK = process.env.MOCK === '1';
const FMP_KEY = (() => {
    if (process.env.FMP_API_KEY) return process.env.FMP_API_KEY.trim();
    try {
        return String(JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8')).fmpApiKey || '').trim();
    } catch {
        return '';
    }
})();
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const YAHOO_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const FMP_HOST = 'https://financialmodelingprep.com/stable';

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

// ───────────────────────── 缓存 ─────────────────────────

const cache = new Map(); // key → { at, ttl, value }
const inflight = new Map();

function cached(key, ttl, fn) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < hit.ttl) return Promise.resolve(hit.value);
    if (inflight.has(key)) return inflight.get(key);
    const p = fn()
        .then((value) => {
            cache.set(key, { at: Date.now(), ttl, value });
            if (cache.size > 3000) cache.delete(cache.keys().next().value);
            return value;
        })
        .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
}

const httpError = (status, message) => Object.assign(new Error(message), { status });

// ───────────────────────── 上游：Yahoo ─────────────────────────

async function yahoo(path) {
    let lastErr;
    for (const host of YAHOO_HOSTS) {
        try {
            const res = await fetch(host + path, { headers: { 'User-Agent': UA, Accept: 'application/json,text/plain,*/*' }, signal: AbortSignal.timeout(15_000) });
            const text = await res.text();
            let json;
            try {
                json = JSON.parse(text);
            } catch {
                throw httpError(502, `Yahoo HTTP ${res.status}`);
            }
            if (!res.ok) {
                const msg = json?.chart?.error?.description || json?.finance?.error?.description || `Yahoo HTTP ${res.status}`;
                if (res.status === 404) throw httpError(404, msg); // 代码不存在：换主机也没用
                lastErr = httpError(502, msg);
                continue;
            }
            return json;
        } catch (e) {
            if (e.status === 404) throw e;
            lastErr = e;
        }
    }
    throw lastErr ?? httpError(502, 'Yahoo unreachable / Yahoo 不可达');
}

// ───────────────────────── 上游：FMP ─────────────────────────

const FMP_MAX_PER_MIN = Number(process.env.FMP_MAX_PER_MIN) || 250;
let fmpWindow = { start: Date.now(), n: 0 };
async function fmp(endpoint, params = {}) {
    if (!FMP_KEY) throw httpError(501, '未配置 FMP key');
    if (Date.now() - fmpWindow.start > MIN) fmpWindow = { start: Date.now(), n: 0 };
    if (++fmpWindow.n > FMP_MAX_PER_MIN) throw httpError(429, 'FMP 每分钟额度已用完，暂时改走 Yahoo');
    const qs = new URLSearchParams({ ...params, apikey: FMP_KEY });
    const res = await fetch(`${FMP_HOST}/${endpoint}?${qs}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        // FMP 的套餐限制有时以纯文本返回
        throw httpError(res.status === 200 ? 502 : res.status, `FMP: ${text.slice(0, 160)}`);
    }
    if (!res.ok || (json && !Array.isArray(json) && (json['Error Message'] || json.error))) {
        throw httpError(res.status === 200 ? 402 : res.status, `FMP: ${json['Error Message'] || json.error || `HTTP ${res.status}`}`);
    }
    return json;
}

// ───────────────────────── 时区 / 交易时段 ─────────────────────────

const dtfCache = new Map();
/** tz 在 atMs 时刻相对 UTC 的偏移（秒）。 */
function tzOffsetSec(tz, atMs) {
    let f = dtfCache.get(tz);
    if (!f) {
        f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        dtfCache.set(tz, f);
    }
    const p = Object.fromEntries(f.formatToParts(new Date(atMs)).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUtc - Math.floor(atMs / 1000) * 1000) / 1000);
}
/** 交易所本地时间 → UTC 毫秒。 */
function zonedToUtc(y, mo, d, h, mi, s, tz) {
    const guess = Date.UTC(y, mo, d, h, mi, s);
    let t = guess - tzOffsetSec(tz, guess) * 1000;
    t = guess - tzOffsetSec(tz, t) * 1000; // 夏令时边界再校正一次
    return t;
}

/** 按代码后缀推断交易所时区、币种、交易时段（FMP 路径用；Yahoo 自带这些信息）。 */
function marketOf(symbol) {
    const s = symbol.toUpperCase();
    const table = [
        [/\.HK$|^\^HS/, 'Asia/Hong_Kong', 'HKD', '0930-1600', null],
        [/\.(SS|SZ)$/, 'Asia/Shanghai', 'CNY', '0930-1500', null],
        [/\.T$|^\^N225$/, 'Asia/Tokyo', 'JPY', '0900-1530', null],
        [/\.L$|^\^FTSE$/, 'Europe/London', 'GBP', '0800-1630', null],
        [/\.(DE|F)$|^\^GDAXI$/, 'Europe/Berlin', 'EUR', '0900-1730', null],
        [/\.PA$|^\^FCHI$/, 'Europe/Paris', 'EUR', '0900-1730', null],
        [/\.TO$/, 'America/Toronto', 'CAD', '0930-1600', null],
        [/\.AX$/, 'Australia/Sydney', 'AUD', '1000-1600', null],
        [/=X$|=F$|\.NYB$/, 'America/New_York', 'USD', '0000-2400', null],
    ];
    for (const [re, tz, cur, session, ext] of table) if (re.test(s)) return { timezone: tz, currency: cur, session, sessionExt: ext };
    return { timezone: 'America/New_York', currency: 'USD', session: '0930-1600', sessionExt: s.startsWith('^') ? null : '0400-2000' };
}

/** Yahoo 的 currentTradingPeriod → 'HHMM-HHMM'（交易所本地时间）。 */
function hhmm(ms, off) {
    const m = Math.round((((ms / 1000 + off) % 86400) + 86400) % 86400 / 60);
    return String(Math.floor(m / 60)).padStart(2, '0') + String(m % 60).padStart(2, '0');
}
function windowStr(a, b, off) {
    if (!a || !b) return null;
    const s = hhmm(a, off);
    let e = hhmm(b, off);
    if (e === '0000') e = '2400';
    return s < e ? `${s}-${e}` : null;
}

// ───────────────────────── 周期换算 ─────────────────────────

/** Vela 周期字符串 → { unit, n }。纯数字 = 分钟；D/W/M 及其倍数；也接受 15m/4h/1d 写法。 */
function parseTf(tf) {
    const s = String(tf || 'D').trim();
    let m = /^(\d+)$/.exec(s);
    if (m) return { unit: 'min', n: Math.max(1, +m[1]) };
    m = /^(\d*)([SDWM])$/.exec(s.toUpperCase());
    if (m) {
        const n = Math.max(1, +(m[1] || 1));
        if (m[2] === 'S') return { unit: 'min', n: 1 }; // 无秒级数据，退化到 1 分钟
        return { unit: { D: 'day', W: 'week', M: 'month' }[m[2]], n };
    }
    m = /^(\d+)\s*(m|h|d|w)$/i.exec(s);
    if (m) {
        const n = +m[1];
        const u = m[2].toLowerCase();
        if (u === 'm') return { unit: 'min', n };
        if (u === 'h') return { unit: 'min', n: n * 60 };
        if (u === 'd') return { unit: 'day', n };
        return { unit: 'week', n };
    }
    return { unit: 'day', n: 1 };
}

/** Yahoo：原生周期 + 聚合倍数 + 可回溯天数。 */
function yahooPlan(tf) {
    const { unit, n } = parseTf(tf);
    if (unit === 'min') {
        let base;
        if ([1, 2, 5, 15, 30, 60, 90].includes(n)) base = n;
        else if (n % 60 === 0) base = 60;
        else base = [30, 15, 5, 2, 1].find((b) => n % b === 0) ?? 1;
        return { intraday: true, interval: `${base}m`, baseMs: base * MIN, factor: n / base, barMs: n * MIN, backDays: base === 1 ? 29 : base === 60 ? 729 : 59, spanCapDays: base === 1 ? 7 : null };
    }
    if (unit === 'day') return { intraday: false, interval: '1d', factor: n, barMs: n * DAY };
    if (unit === 'week') return { intraday: false, interval: '1wk', factor: n, barMs: n * 7 * DAY };
    return { intraday: false, interval: '1mo', factor: n, barMs: n * 30 * DAY };
}

/** FMP：分时 1min/5min/15min/30min/1hour/4hour，日线以上由日线聚合。 */
function fmpPlan(tf) {
    const { unit, n } = parseTf(tf);
    if (unit === 'min') {
        const base = [240, 60, 30, 15, 5, 1].find((b) => n % b === 0) ?? 1;
        const name = { 1: '1min', 5: '5min', 15: '15min', 30: '30min', 60: '1hour', 240: '4hour' }[base];
        return { intraday: true, interval: name, baseMs: base * MIN, factor: n / base, barMs: n * MIN, spanCapDays: base <= 5 ? 5 : base <= 30 ? 30 : 120 };
    }
    if (unit === 'day') return { intraday: false, interval: '1d', factor: n, barMs: n * DAY };
    if (unit === 'week') return { intraday: false, interval: '1wk', factor: n, barMs: n * 7 * DAY };
    return { intraday: false, interval: '1mo', factor: n, barMs: n * 30 * DAY };
}

// ───────────────────────── K 线整理 ─────────────────────────

const localDayKey = (tMs, off) => Math.floor((tMs + off * 1000) / DAY);
const localMidnightUtc = (tMs, off) => localDayKey(tMs, off) * DAY - off * 1000;

/** 对齐时间、去重合并；日线以上统一到"交易所本地日期 00:00"，周线对齐周一，月线对齐 1 号。 */
function normalizeBars(bars, p, off) {
    const out = new Map();
    const dayAnchor = new Map();
    for (const b of bars) {
        let t;
        if (p.intraday) {
            const dk = localDayKey(b.time, off);
            if (!dayAnchor.has(dk)) dayAnchor.set(dk, b.time);
            const a = dayAnchor.get(dk);
            t = a + Math.floor((b.time - a) / p.baseMs) * p.baseMs;
        } else {
            t = localMidnightUtc(b.time, off);
            if (p.interval === '1mo') {
                const d = new Date(t + off * 1000);
                t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - off * 1000;
            } else if (p.interval === '1wk') {
                const dk = localDayKey(b.time, off);
                const dow = (new Date(dk * DAY).getUTCDay() + 6) % 7; // 周一 = 0
                t = (dk - dow) * DAY - off * 1000;
            }
        }
        const prev = out.get(t);
        if (!prev) out.set(t, { ...b, time: t });
        else {
            prev.high = Math.max(prev.high, b.high);
            prev.low = Math.min(prev.low, b.low);
            prev.close = b.close;
            prev.volume = (prev.volume || 0) + (b.volume || 0);
        }
    }
    return [...out.values()].sort((a, b) => a.time - b.time);
}

/** 非原生周期（3 分钟、2 小时、2 日……）按倍数聚合。 */
function aggregate(bars, p, off) {
    if (p.factor <= 1) return bars;
    const out = [];
    let cur = null;
    let key = null;
    const span = p.baseMs * p.factor;
    const dayAnchor = new Map();
    bars.forEach((b, i) => {
        let k;
        let t = b.time;
        if (p.intraday) {
            const dk = localDayKey(b.time, off);
            if (!dayAnchor.has(dk)) dayAnchor.set(dk, b.time);
            const a = dayAnchor.get(dk);
            const bucket = Math.floor((b.time - a) / span);
            k = `${dk}:${bucket}`;
            t = a + bucket * span;
        } else k = Math.floor(i / p.factor);
        if (k !== key) {
            cur = { ...b, time: t };
            out.push(cur);
            key = k;
        } else {
            cur.high = Math.max(cur.high, b.high);
            cur.low = Math.min(cur.low, b.low);
            cur.close = b.close;
            cur.volume = (cur.volume || 0) + (b.volume || 0);
        }
    });
    return out;
}

function clip(bars, p, fromQ, toQ, limit) {
    if (fromQ) bars = bars.filter((b) => b.time >= fromQ - p.barMs);
    if (toQ) bars = bars.filter((b) => b.time <= toQ);
    if (!fromQ && bars.length > limit) bars = bars.slice(-limit);
    return bars;
}

/** 请求窗口：给了 from 用 from，否则按 limit 估算日历跨度（夜盘/周末留余量）。 */
function windowFor(p, fromQ, toQ, limit) {
    const now = Date.now();
    const to = Math.min(toQ || now, now);
    let from;
    if (fromQ) from = fromQ;
    else if (p.intraday) from = to - limit * p.barMs * 4 - 3 * DAY;
    else from = to - limit * p.barMs * (p.interval === '1d' ? 1.5 : 1.1) - 7 * DAY;
    if (p.intraday && p.backDays) from = Math.max(from, now - p.backDays * DAY);
    if (p.intraday && p.spanCapDays) from = Math.max(from, to - p.spanCapDays * DAY);
    return { from: Math.max(from, 0), to, live: to > now - DAY };
}

// ───────────────────────── Yahoo 数据 ─────────────────────────

function parseYahooChart(json) {
    const r = json?.chart?.result?.[0];
    if (!r) throw httpError(404, json?.chart?.error?.description || 'No data / 没有数据');
    const meta = r.meta || {};
    const ts = r.timestamp || [];
    const q = r.indicators?.quote?.[0] || {};
    const bars = [];
    for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
        if (c == null || o == null || h == null || l == null) continue;
        bars.push({ time: ts[i] * 1000, open: o, high: Math.max(h, o, c), low: Math.min(l, o, c), close: c, volume: q.volume?.[i] ?? 0 });
    }
    return { meta, bars, events: r.events || {} };
}

function yahooMeta(m) {
    const tp = m.currentTradingPeriod || {};
    const off = m.gmtoffset ?? 0;
    const type = m.instrumentType;
    let session = windowStr(tp.regular?.start * 1000, tp.regular?.end * 1000, off);
    let sessionExt = windowStr(tp.pre?.start * 1000, tp.post?.end * 1000, off);
    if (type === 'CRYPTOCURRENCY') session = '24x7';
    else if (type === 'FUTURE' || type === 'CURRENCY' || !session) session = '0000-2400';
    if (sessionExt === session || session === '24x7' || session === '0000-2400') sessionExt = null;
    return {
        source: 'Yahoo',
        symbol: m.symbol,
        name: m.longName || m.shortName || m.symbol,
        currency: m.currency,
        exchange: m.exchangeName,
        exchangeName: m.fullExchangeName || m.exchangeName,
        type,
        timezone: m.exchangeTimezoneName || 'Etc/UTC',
        gmtoffset: off,
        priceHint: m.priceHint,
        price: m.regularMarketPrice,
        prevClose: m.chartPreviousClose ?? m.previousClose,
        dayHigh: m.regularMarketDayHigh,
        dayLow: m.regularMarketDayLow,
        volume: m.regularMarketVolume,
        high52: m.fiftyTwoWeekHigh,
        low52: m.fiftyTwoWeekLow,
        marketTime: m.regularMarketTime ? m.regularMarketTime * 1000 : null,
        session,
        sessionExt,
    };
}

async function yahooBars(symbol, tf, fromQ, toQ, limit) {
    const p = yahooPlan(tf);
    const { from, to, live } = windowFor(p, fromQ, toQ, limit);
    if (from >= to) return { bars: [], meta: null, events: {} };
    // 只在接近"现在"的请求上用短缓存；纯历史段长缓存。窗口取整，让轮询命中同一缓存键。
    const ttl = live ? 8_000 : 30 * MIN;
    const bucket = live ? Math.floor(Date.now() / ttl) : 0;
    const p1 = Math.floor(from / (p.intraday ? HOUR : DAY)) * (p.intraday ? 3600 : 86400);
    const p2 = live ? Math.floor(((bucket + 1) * ttl) / 1000) + (p.intraday ? 0 : 86400) : Math.floor(to / 1000) + (p.intraday ? 0 : 86400);
    const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=${p.interval}&includePrePost=false&events=div%7Csplit`;
    const raw = await cached(`y:${symbol}:${p.interval}:${p1}:${p2}`, ttl, async () => (MOCK ? mockChart(symbol, p, from, to) : parseYahooChart(await yahoo(path))));
    const off = raw.meta.gmtoffset ?? 0;
    const bars = clip(aggregate(normalizeBars(raw.bars, p, off), p, off), p, fromQ, toQ, limit);
    const ev = raw.events || {};
    return {
        bars,
        meta: yahooMeta(raw.meta),
        events: {
            dividends: Object.values(ev.dividends || {}).map((d) => ({ t: d.date * 1000, amount: d.amount })),
            splits: Object.values(ev.splits || {}).map((s) => ({ t: s.date * 1000, ratio: s.splitRatio || `${s.numerator}:${s.denominator}` })),
        },
    };
}

async function yahooQuote(symbol) {
    if (MOCK) return yahooMeta(mockChart(symbol, yahooPlan('D'), Date.now() - 400 * DAY, Date.now()).meta);
    const { meta } = parseYahooChart(await yahoo(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`));
    return yahooMeta(meta);
}

// ───────────────────────── FMP 数据 ─────────────────────────

/** Yahoo 代码 → FMP 代码；返回 null 表示交给 Yahoo。
 *  当前 key 的套餐实测：美股 / 美国 ETF / 美国指数可用；港股、A股、外汇分时返回 402 → 走 Yahoo。
 *  期货、美债收益率、美元指数 FMP 不覆盖 → 走 Yahoo。
 *  若升级了 FMP 套餐，可在 config.json 里设 "fmpAllMarkets": true 让国际市场也先试 FMP。 */
const FMP_ALL = (() => {
    try {
        return !!JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8')).fmpAllMarkets;
    } catch {
        return false;
    }
})();
const FMP_US_INDEX = /^\^(GSPC|IXIC|NDX|DJI|RUT|SOX|NYA|XAX|OEX|SPX)$/;
// Yahoo 连续期货 → FMP 期货代码（实测本 key 可用：报价 + 分时 + 日线）
const FMP_FUTURES = {
    'ES=F': 'ESUSD', 'NQ=F': 'NQUSD', 'YM=F': 'YMUSD', 'RTY=F': 'RTYUSD',
    'CL=F': 'CLUSD', 'BZ=F': 'BZUSD', 'NG=F': 'NGUSD', 'HO=F': 'HOUSD', 'RB=F': 'RBUSD',
    'GC=F': 'GCUSD', 'SI=F': 'SIUSD', 'HG=F': 'HGUSD', 'PL=F': 'PLUSD', 'PA=F': 'PAUSD', 'MGC=F': 'MGCUSD', 'SIL=F': 'SILUSD', 'ALI=F': 'ALIUSD',
    'ZC=F': 'ZCUSX', 'ZS=F': 'ZSUSX', 'ZM=F': 'ZMUSD', 'ZL=F': 'ZLUSX', 'ZO=F': 'ZOUSX', 'ZR=F': 'ZRUSD', 'KE=F': 'KEUSX',
    'KC=F': 'KCUSX', 'CC=F': 'CCUSD', 'CT=F': 'CTUSX', 'SB=F': 'SBUSX', 'OJ=F': 'OJUSX', 'LBR=F': 'LBUSD', 'LE=F': 'LEUSX', 'GF=F': 'GFUSX', 'HE=F': 'HEUSX', 'DC=F': 'DCUSD',
    'ZT=F': 'ZTUSD', 'ZF=F': 'ZFUSD', 'ZN=F': 'ZNUSD', 'ZB=F': 'ZBUSD', 'ZQ=F': 'ZQUSD',
    'DX-Y.NYB': 'DXUSD', 'DX=F': 'DXUSD',
};
function toFmp(symbol) {
    const s = symbol.toUpperCase();
    if (FMP_FUTURES[s]) return FMP_FUTURES[s];
    if (s.endsWith('=F') || s.includes('.NYB')) return null;
    if (s.startsWith('^')) return FMP_US_INDEX.test(s) || (FMP_ALL && !/^\^(IRX|FVX|TNX|TYX)$/.test(s)) ? s : null;
    if (!FMP_ALL && (s.endsWith('=X') || s.includes('.') || /-USD$/.test(s))) return null;
    let m = /^([A-Z]{6})=X$/.exec(s);
    if (m) return m[1];
    m = /^([A-Z]{3})=X$/.exec(s);
    if (m) return `USD${m[1]}`;
    if (/^[A-Z]+-USD$/.test(s)) return s.replace('-', '');
    return s;
}

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

function parseFmpRows(rows, tz) {
    const bars = [];
    for (const r of Array.isArray(rows) ? rows : []) {
        const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(r.date || '');
        if (!m || r.close == null) continue;
        const t = zonedToUtc(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), tz);
        const o = +r.open, c = +r.close;
        bars.push({ time: t, open: o, high: Math.max(+r.high, o, c), low: Math.min(+r.low, o, c), close: c, volume: +r.volume || 0 });
    }
    return bars.sort((a, b) => a.time - b.time);
}

async function fmpQuoteRaw(fsym) {
    return cached(`fq:${fsym}`, 15_000, async () => {
        const rows = await fmp('quote', { symbol: fsym });
        if (!rows?.[0]) throw httpError(404, `Not found / 找不到: ${fsym}`);
        return rows[0];
    });
}

async function fmpProfile(fsym) {
    return cached(`fp:${fsym}`, 12 * HOUR, async () => (await fmp('profile', { symbol: fsym }).catch(() => []))?.[0] || null);
}

async function fmpMeta(symbol, fsym) {
    const mk = marketOf(symbol);
    const [q, prof] = await Promise.all([fmpQuoteRaw(fsym), fmpProfile(fsym)]);
    const isFx = /=X$/.test(symbol);
    return {
        source: 'FMP',
        symbol,
        name: q.name || prof?.companyName || symbol,
        currency: prof?.currency || (isFx ? fsym.slice(3) : mk.currency),
        exchange: q.exchange || prof?.exchange,
        exchangeName: prof?.exchangeFullName || q.exchange,
        type: isFx ? 'CURRENCY' : /=F$/.test(symbol) ? 'FUTURE' : symbol.startsWith('^') || /\.NYB$/.test(symbol) ? 'INDEX' : prof?.isEtf ? 'ETF' : 'EQUITY',
        timezone: mk.timezone,
        gmtoffset: tzOffsetSec(mk.timezone, Date.now()),
        priceHint: isFx ? 4 : 2,
        price: q.price,
        prevClose: q.previousClose,
        open: q.open,
        dayHigh: q.dayHigh,
        dayLow: q.dayLow,
        volume: q.volume,
        high52: q.yearHigh,
        low52: q.yearLow,
        marketCap: q.marketCap,
        pe: q.pe,
        eps: q.eps,
        avg50: q.priceAvg50,
        avg200: q.priceAvg200,
        avgVolume: q.avgVolume ?? prof?.averageVolume,
        beta: prof?.beta,
        sector: prof?.sector,
        industry: prof?.industry,
        marketTime: q.timestamp ? q.timestamp * 1000 : null,
        session: mk.session,
        sessionExt: mk.sessionExt,
    };
}

async function fmpBars(symbol, fsym, tf, fromQ, toQ, limit) {
    const p = fmpPlan(tf);
    const mk = marketOf(symbol);
    const { from, to, live } = windowFor(p, fromQ, toQ, limit);
    if (from >= to) return { bars: [], meta: null, events: {} };
    // FMP 按调用次数计费：实时段缓存 15 秒（多个图表/轮询共用一次调用）
    const ttl = live ? 15_000 : 30 * MIN;
    const bucket = live ? Math.floor(Date.now() / ttl) : 0;
    const f = ymd(from);
    const t = ymd(to + DAY);
    const rows = await cached(`f:${fsym}:${p.interval}:${f}:${t}:${bucket}`, ttl, () =>
        p.intraday ? fmp(`historical-chart/${p.interval}`, { symbol: fsym, from: f, to: t }) : fmp('historical-price-eod/full', { symbol: fsym, from: f, to: t }),
    );
    const meta = await fmpMeta(symbol, fsym).catch(() => ({ source: 'FMP', symbol, name: symbol, ...mk, gmtoffset: tzOffsetSec(mk.timezone, Date.now()) }));
    const off = meta.gmtoffset;
    let bars = parseFmpRows(rows, mk.timezone);
    // 日线：今天的K线 FMP 可能还没生成，用实时报价补上正在形成的这一根
    if (!p.intraday && live && meta.price != null && meta.open != null) {
        const today = localMidnightUtc(meta.marketTime || Date.now(), off);
        if (!bars.length || localMidnightUtc(bars.at(-1).time, off) < today) {
            if (!meta.marketTime || Date.now() - meta.marketTime < 4 * DAY) bars.push({ time: today, open: meta.open, high: meta.dayHigh ?? meta.price, low: meta.dayLow ?? meta.price, close: meta.price, volume: meta.volume || 0 });
        }
    }
    bars = clip(aggregate(normalizeBars(bars, p, off), p, off), p, fromQ, toQ, limit);
    return { bars, meta, events: {} };
}

// ───────────────────────── 路由：选数据源 ─────────────────────────

const fmpBroken = new Map(); // fsym → 失败时间：FMP 不支持的代码 30 分钟内直接走 Yahoo

async function getBars(symbol, tf, fromQ, toQ, limitQ) {
    const want = Math.min(Math.max(limitQ || 500, 1), 20000);
    // 实时段（无 from/to）统一按 ≥600 根取数，让 Vela 的轮询、摘要面板、首屏共用同一个上游缓存
    const limit = !fromQ && !toQ ? Math.max(want, 600) : want;
    const out = await getBarsInner(symbol, tf, fromQ, toQ, limit);
    if (!fromQ && out.bars.length > want) out.bars = out.bars.slice(-want);
    return out;
}

async function getBarsInner(symbol, tf, fromQ, toQ, limit) {
    const fsym = FMP_KEY && !MOCK ? toFmp(symbol) : null;
    if (fsym && !(Date.now() - (fmpBroken.get(fsym) || 0) < 30 * MIN)) {
        try {
            const r = await fmpBars(symbol, fsym, tf, fromQ, toQ, limit);
            if (r.bars.length) return pack(r);
            // 空结果：历史回填段超出 FMP 套餐年限 → 用 Yahoo 补更早的数据；实时段为空 → FMP 不支持此代码
            if (!(toQ && toQ < Date.now() - 2 * DAY)) fmpBroken.set(fsym, Date.now());
        } catch (e) {
            // 额度用完（429）只暂停 1 分钟；其它错误（402 套餐不含等）暂停 30 分钟
            if (e.status === 429) fmpBroken.set(fsym, Date.now() - 29 * MIN);
            else if (e.status !== 404 || !toQ) fmpBroken.set(fsym, Date.now());
            console.warn(`[FMP→Yahoo] ${symbol} ${tf}: ${e.message}`);
        }
    }
    try {
        return pack(await yahooBars(symbol, tf, fromQ, toQ, limit));
    } catch (e) {
        // 云服务器 IP 偶尔被 Yahoo 限流：收益率品种改用 FMP 的财政部每日收益率（仅日线以上）
        if (YIELD_COL[symbol.toUpperCase()] && FMP_KEY && !MOCK && !fmpPlan(tf).intraday) return pack(await fmpYieldBars(symbol, tf, fromQ, toQ, limit));
        throw e;
    }
}

const YIELD_COL = { '^IRX': 'month3', '2YY=F': 'year2', '^FVX': 'year5', '^TNX': 'year10', '^TYX': 'year30' };

async function treasuryRows(fromMs, toMs) {
    const chunks = [];
    for (let end = toMs; end > fromMs; end -= 88 * DAY) chunks.push([Math.max(fromMs, end - 88 * DAY), end]);
    const rows = await Promise.all(chunks.slice(0, 24).map(([a, b]) => cached(`tr:${ymd(a)}:${ymd(b)}`, b > Date.now() - 2 * DAY ? 30 * MIN : 24 * HOUR, () => fmp('treasury-rates', { from: ymd(a), to: ymd(b) }).catch(() => []))));
    const byDate = new Map();
    for (const r of rows.flat()) if (r?.date) byDate.set(r.date, r);
    return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function fmpYieldBars(symbol, tf, fromQ, toQ, limit) {
    const col = YIELD_COL[symbol.toUpperCase()];
    const p = fmpPlan(tf);
    const { from, to } = windowFor(p, fromQ, toQ, Math.min(limit, 1500));
    const tz = 'America/New_York';
    const rows = await treasuryRows(from, to + DAY);
    let bars = parseFmpRows(rows.filter((r) => r[col] != null).map((r) => ({ date: r.date, open: r[col], high: r[col], low: r[col], close: r[col], volume: 0 })), tz);
    const off = tzOffsetSec(tz, Date.now());
    bars = clip(aggregate(normalizeBars(bars, p, off), p, off), p, fromQ, toQ, limit);
    if (!bars.length && !toQ) throw httpError(502, 'No yield data / 暂无收益率数据');
    const last = bars.at(-1), prev = bars.at(-2);
    return { bars, meta: { source: 'FMP（财政部每日收益率）', symbol, name: { month3: '13-Week Treasury Yield', year2: '2-Year Treasury Yield', year5: '5-Year Treasury Yield', year10: '10-Year Treasury Yield', year30: '30-Year Treasury Yield' }[col], currency: 'USD', type: 'INDEX', timezone: tz, gmtoffset: off, priceHint: 3, price: last?.close, prevClose: prev?.close, session: '0930-1600', sessionExt: null }, events: {} };
}

const pack = (r) => ({ bars: r.bars.map((b) => [b.time, b.open, b.high, b.low, b.close, b.volume ?? 0]), meta: r.meta, events: r.events });

async function getQuote(symbol) {
    return cached(`quote:${symbol}`, 5_000, async () => {
        const fsym = FMP_KEY && !MOCK ? toFmp(symbol) : null;
        if (fsym) {
            try {
                return await fmpMeta(symbol, fsym);
            } catch (e) {
                console.warn(`[FMP→Yahoo] quote ${symbol}: ${e.message}`);
            }
        }
        try {
            return await yahooQuote(symbol);
        } catch (e) {
            if (YIELD_COL[symbol.toUpperCase()] && FMP_KEY && !MOCK) return (await fmpYieldBars(symbol, 'D', undefined, undefined, 30)).meta;
            throw e;
        }
    });
}

async function getEvents(symbol) {
    const fsym = FMP_KEY && !MOCK ? toFmp(symbol) : null;
    if (!fsym || symbol.startsWith('^') || /=X$/.test(symbol)) return { earnings: [], dividends: [], splits: [] };
    return cached(`ev:${fsym}`, 6 * HOUR, async () => {
        const tz = marketOf(symbol).timezone;
        const at = (date) => {
            const [y, m, d] = date.split('-').map(Number);
            return zonedToUtc(y, m - 1, d, 0, 0, 0, tz);
        };
        const list = (x) => (Array.isArray(x) ? x.filter((r) => r && r.date) : []);
        const [earn, div, spl] = await Promise.all([
            fmp('earnings', { symbol: fsym, limit: 60 }).catch(() => []),
            fmp('dividends', { symbol: fsym, limit: 80 }).catch(() => []),
            fmp('splits', { symbol: fsym, limit: 20 }).catch(() => []),
        ]);
        return {
            earnings: list(earn).map((r) => ({ t: at(r.date), date: r.date, epsActual: r.epsActual, epsEstimated: r.epsEstimated, revenueActual: r.revenueActual, revenueEstimated: r.revenueEstimated })),
            dividends: list(div).map((r) => ({ t: at(r.date), amount: r.dividend ?? r.adjDividend, paymentDate: r.paymentDate, yield: r.yield })),
            splits: list(spl).map((r) => ({ t: at(r.date), ratio: `${r.numerator}:${r.denominator}` })),
        };
    });
}

async function search(q) {
    return cached(`search:${q.toLowerCase()}`, 60_000, async () => {
        if (MOCK) return [];
        const tasks = [
            yahoo(`/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0&enableFuzzyQuery=false`)
                .then((json) =>
                    (json.quotes || [])
                        .filter((x) => x.symbol && x.quoteType && x.quoteType !== 'OPTION')
                        .map((x) => ({ symbol: x.symbol, name: x.shortname || x.longname || x.symbol, type: x.quoteType, exch: x.exchange, exchDisp: x.exchDisp, source: 'Yahoo' })),
                )
                .catch(() => []),
        ];
        if (FMP_KEY) {
            const fmpMap = (rows) =>
                (Array.isArray(rows) ? rows : []).map((x) => ({ symbol: x.symbol, name: x.name || x.symbol, type: /^\^/.test(x.symbol) ? 'INDEX' : 'EQUITY', exch: x.exchange, exchDisp: x.exchangeFullName || x.exchange, source: 'FMP' }));
            tasks.push(fmp('search-symbol', { query: q, limit: 10 }).then(fmpMap).catch(() => []));
            tasks.push(fmp('search-name', { query: q, limit: 10 }).then(fmpMap).catch(() => []));
        }
        const [yh, ...rest] = await Promise.all(tasks);
        const seen = new Set(yh.map((x) => x.symbol.toUpperCase()));
        const merged = [...yh];
        for (const x of rest.flat()) {
            const k = x.symbol.toUpperCase();
            if (!seen.has(k)) {
                seen.add(k);
                merged.push(x);
            }
        }
        return merged.slice(0, 25);
    });
}

// ───────────────────────── 美债收益率曲线 ─────────────────────────

const CURVE_KEYS = [
    ['month1', '1M', 1 / 12], ['month2', '2M', 2 / 12], ['month3', '3M', 0.25], ['month6', '6M', 0.5],
    ['year1', '1Y', 1], ['year2', '2Y', 2], ['year3', '3Y', 3], ['year5', '5Y', 5], ['year7', '7Y', 7],
    ['year10', '10Y', 10], ['year20', '20Y', 20], ['year30', '30Y', 30],
];

async function treasury() {
    return cached('treasury', 30 * MIN, async () => {
        let rows = [];
        if (FMP_KEY && !MOCK) {
            const now = Date.now();
            const chunks = [0, 1, 2, 3, 4].map((i) => fmp('treasury-rates', { from: ymd(now - (i + 1) * 88 * DAY), to: ymd(now - i * 88 * DAY) }).catch(() => []));
            rows = (await Promise.all(chunks)).flat().filter((r) => r && r.date);
        }
        if (rows.length) {
            const byDate = new Map(rows.map((r) => [r.date, r]));
            const days = [...byDate.keys()].sort();
            const series = days.map((d) => byDate.get(d));
            return { source: 'FMP（美国财政部每日收益率）', maturities: CURVE_KEYS.map(([k, label, years]) => ({ key: k, label, years })), rows: series.map((r) => ({ date: r.date, v: CURVE_KEYS.map(([k]) => (r[k] == null ? null : +r[k])) })) };
        }
        // 回退：Yahoo 的 5 个收益率品种
        const picks = [['^IRX', '3M', 0.25], ['2YY=F', '2Y', 2], ['^FVX', '5Y', 5], ['^TNX', '10Y', 10], ['^TYX', '30Y', 30]];
        const res = await Promise.all(picks.map(([s]) => yahooBars(s, 'D', undefined, undefined, 420).catch(() => ({ bars: [], meta: null }))));
        const dates = new Map();
        res.forEach((r, i) => {
            const off = r.meta?.gmtoffset ?? 0;
            for (const b of r.bars) {
                const d = new Date(b.time + off * 1000).toISOString().slice(0, 10);
                if (!dates.has(d)) dates.set(d, Array(picks.length).fill(null));
                dates.get(d)[i] = b.close;
            }
        });
        const keys = [...dates.keys()].sort();
        return { source: 'Yahoo（^IRX / 2YY=F / ^FVX / ^TNX / ^TYX）', maturities: picks.map(([s, label, years]) => ({ key: s, label, years })), rows: keys.map((d) => ({ date: d, v: dates.get(d) })) };
    });
}

// ───────────────────────── 离线演示数据 ─────────────────────────

function mockChart(symbol, p, from, to) {
    // 价格是时间的确定性函数：任意请求窗口拼接起来都一致（回填、轮询不会跳价）
    let seed = 0;
    for (const ch of symbol) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const hash = (t) => {
        let x = (Math.floor(t / MIN) ^ seed) >>> 0;
        x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
        x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
        return ((x ^ (x >>> 16)) >>> 0) / 2 ** 32;
    };
    const isYield = symbol.startsWith('^') || symbol === '2YY=F';
    const isFut = symbol.endsWith('=F') && !isYield;
    const base = isYield ? 4.2 : isFut ? 2400 : 40 + (seed % 400);
    const ph = (seed % 1000) / 159;
    const logp = (t) =>
        0.35 * Math.sin(t / (400 * DAY) + ph) + 0.12 * Math.sin(t / (61 * DAY) + 2 * ph) + 0.05 * Math.sin(t / (9 * DAY) + 3 * ph) + 0.012 * Math.sin(t / (0.4 * DAY) + ph) + 0.006 * (hash(t) - 0.5);
    const px = (t) => base * Math.exp(logp(t));
    const step = p.intraday ? p.baseMs : p.interval === '1wk' ? 7 * DAY : p.interval === '1mo' ? 30 * DAY : DAY;
    const start = Math.max(Math.floor(from / step) * step, Math.floor((to - 8000 * step) / step) * step);
    const n = Math.ceil((to - start) / step);
    const bars = [];
    for (let i = 0; i < n; i++) {
        const t = start + i * step;
        if (t > Date.now()) break;
        const dow = new Date(t).getUTCDay();
        if (p.interval === '1d' && (dow === 0 || dow === 6)) continue;
        const o = px(t);
        const c = px(Math.min(t + step, Date.now()));
        const w = Math.abs(c - o) + o * 0.004 * Math.sqrt(step / DAY);
        const h = Math.max(o, c) + w * hash(t + 1) * 0.8;
        const l = Math.min(o, c) - w * hash(t + 2) * 0.8;
        bars.push({ time: t, open: o, high: h, low: l, close: c, volume: isYield ? 0 : Math.round(1e6 * (0.4 + hash(t + 3) * 1.6) * Math.sqrt(step / DAY)) });
    }
    const last = bars.at(-1);
    const prev = bars.at(-2) ?? last;
    const recent = bars.slice(-252);
    const meta = {
        symbol,
        longName: `${symbol}（演示数据）`,
        currency: 'USD',
        exchangeName: 'DEMO',
        fullExchangeName: 'Demo',
        instrumentType: isYield ? 'INDEX' : isFut ? 'FUTURE' : 'EQUITY',
        exchangeTimezoneName: 'Etc/UTC',
        gmtoffset: 0,
        regularMarketPrice: last?.close,
        chartPreviousClose: prev?.close,
        regularMarketDayHigh: last?.high,
        regularMarketDayLow: last?.low,
        regularMarketVolume: last?.volume,
        fiftyTwoWeekHigh: recent.length ? Math.max(...recent.map((b) => b.high)) : null,
        fiftyTwoWeekLow: recent.length ? Math.min(...recent.map((b) => b.low)) : null,
        regularMarketTime: Math.floor(Date.now() / 1000),
        currentTradingPeriod: null,
        priceHint: 2,
    };
    return { meta, bars, events: {} };
}

// ───────────────────────── HTTP ─────────────────────────

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

function send(res, status, body, type = 'application/json; charset=utf-8') {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const staticCache = new Map();
const RATE = Number(process.env.RATE_LIMIT_PER_MIN) || 240;
const hits = new Map(); // ip → { start, n }
function limited(req) {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const now = Date.now();
    let h = hits.get(ip);
    if (!h || now - h.start > MIN) {
        h = { start: now, n: 0 };
        hits.set(ip, h);
        if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > MIN) hits.delete(k);
    }
    return ++h.n > RATE;
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (url.pathname.startsWith('/api/') && url.pathname !== '/api/health' && limited(req)) return send(res, 429, { error: '请求太频繁，请稍后再试 / Too many requests, please slow down' });
    const q = (k) => (url.searchParams.get(k) || '').trim();
    const num = (k) => (url.searchParams.get(k) ? Number(url.searchParams.get(k)) : undefined);
    try {
        switch (url.pathname) {
            case '/api/search':
                return send(res, 200, q('q') ? await search(q('q')) : []);
            case '/api/bars':
                if (!q('symbol')) return send(res, 400, { error: 'missing symbol' });
                return send(res, 200, await getBars(q('symbol'), q('tf') || 'D', num('from'), num('to'), num('limit')));
            case '/api/quote':
                if (!q('symbol')) return send(res, 400, { error: 'missing symbol' });
                return send(res, 200, await getQuote(q('symbol')));
            case '/api/events':
                return send(res, 200, q('symbol') ? await getEvents(q('symbol')) : { earnings: [], dividends: [], splits: [] });
            case '/api/treasury':
                return send(res, 200, await treasury());
            case '/api/health':
                return send(res, 200, { ok: true, mock: MOCK, fmp: !!FMP_KEY, sourceUrl: process.env.SOURCE_URL || '' });
        }
        // 静态文件（内存缓存 + gzip + ETag）
        let rel = decodeURIComponent(url.pathname);
        if (rel.endsWith('/')) rel += 'index.html';
        const file = normalize(join(ROOT, rel));
        if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden', 'text/plain');
        const st = await stat(file).catch(() => null);
        if (!st || !st.isFile()) return send(res, 404, 'not found', 'text/plain');
        const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
        let entry = staticCache.get(file);
        if (!entry || entry.etag !== etag) {
            const buf = await readFile(file);
            entry = { etag, buf, gz: /\.(js|html|css|json|svg|txt|map)$/.test(file) ? gzipSync(buf, { level: 9 }) : null };
            staticCache.set(file, entry);
        }
        const headers = { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', ETag: etag, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' };
        if (req.headers['if-none-match'] === etag) {
            res.writeHead(304, headers);
            return res.end();
        }
        if (entry.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
            res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip' });
            return res.end(entry.gz);
        }
        res.writeHead(200, headers);
        res.end(entry.buf);
    } catch (e) {
        send(res, e.status && e.status < 600 ? e.status : 502, { error: e.message || String(e) });
    }
});

export { parseFmpRows, zonedToUtc, normalizeBars, aggregate, fmpPlan, yahooPlan, parseYahooChart, yahooMeta, toFmp, windowStr, tzOffsetSec };

if (process.argv[1] && normalize(fileURLToPath(import.meta.url)).toLowerCase() === normalize(process.argv[1]).replace(/(\.mjs)?$/, ".mjs").toLowerCase()) server.listen(PORT, () => {
    const src = MOCK ? '演示数据（MOCK=1）' : FMP_KEY ? 'FMP + Yahoo' : 'Yahoo（未配置 FMP_API_KEY）';
    console.log(`\n  Vela 技术分析网站已启动 → http://localhost:${PORT}\n  数据源：${src}\n`);
});
