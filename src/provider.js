// 数据提供器：把本地服务器 (/api/*) 接到 Vela 的 DataProvider 端口。
// 必需方法 getBars；另外实现了 listSymbols（品种索引 + 搜索）、getSymbolInfo（时区 / 交易时段 / 币种）、
// getCalendar（交易时段 → 市场状态徽标、盘前盘后阴影）、subscribe（实时轮询）。

import { presetDescriptors, prefixFor, velaType } from './symbols.js';

const DAY = 86_400_000;

// ── 时区工具（浏览器端，Intl） ──
const dtf = new Map();
function partsIn(tz, ms) {
    let f = dtf.get(tz);
    if (!f) {
        f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
        dtf.set(tz, f);
    }
    return Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
}
function offsetMs(tz, ms) {
    const p = partsIn(tz, ms);
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
export function zonedToUtc(y, mo, d, h, mi, tz) {
    const guess = Date.UTC(y, mo, d, h, mi);
    const t = guess - offsetMs(tz, guess);
    return guess - offsetMs(tz, t);
}

function parseWindow(s) {
    const m = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(s || '');
    return m ? { sh: +m[1], sm: +m[2], eh: +m[3], em: +m[4] } : null;
}

export class MarketProvider {
    /** @param {{ onError?: (ticker: string, message: string) => void, onMeta?: (ticker: string, meta: any) => void }} hooks */
    constructor(hooks = {}) {
        this.hooks = hooks;
        this.list = presetDescriptors();
        this.index = new Set(this.list.map((d) => d.ticker.toUpperCase()));
        this.meta = new Map(); // ticker → 服务器返回的元数据（最新报价、时区、时段……）
        this.events = new Map(); // ticker → { dividends, splits }
        this.infoCache = new Map();
        this.quotes = new Map(); // ticker → /api/quote 的结果（报价条用：昨收按日计算）
        this.erroredAt = new Map();
    }

    info() {
        return {
            name: 'market',
            displayName: 'FMP / Yahoo',
            supportedTimeframes: ['1', '3', '5', '15', '30', '45', '60', '120', '180', '240', 'D', 'W', 'M'],
            capabilities: { enumerate: true, stream: true, symbolInfo: true },
        };
    }

    async listSymbols() {
        return this.list.slice();
    }

    has(ticker) {
        return this.index.has(String(ticker).toUpperCase());
    }

    /** 把搜索到的新品种加入索引（之后需重新 registerProvider 让 Vela 重建索引）。 */
    add({ symbol, name, type, exch, prefix }) {
        if (this.has(symbol)) return this.list.find((d) => d.ticker.toUpperCase() === symbol.toUpperCase());
        const d = { ticker: symbol, description: name || symbol, type: velaType(type, symbol), prefix: prefix ?? prefixFor(exch, symbol) };
        this.list.push(d);
        this.index.add(symbol.toUpperCase());
        return d;
    }

    async getBars(ticker, timeframe, range = {}, opts = {}) {
        const qs = new URLSearchParams({ symbol: ticker, tf: timeframe });
        if (range.from) qs.set('from', String(Math.floor(range.from)));
        if (range.to) qs.set('to', String(Math.floor(range.to)));
        if (range.limit) qs.set('limit', String(range.limit));
        let res, body;
        try {
            res = await fetch(`/api/bars?${qs}`);
            body = await res.json();
        } catch (e) {
            body = { error: '本地服务器无响应，请确认 node server.mjs 仍在运行' };
            res = { ok: false };
        }
        if (!res.ok) {
            const msg = body?.error || '数据加载失败';
            // 同一品种 20 秒内只提示一次（轮询失败不刷屏）
            if (!opts.quiet && Date.now() - (this.erroredAt.get(ticker) || 0) > 20_000) {
                this.erroredAt.set(ticker, Date.now());
                this.hooks.onError?.(ticker, msg);
            }
            throw new Error(msg);
        }
        if (body.meta) {
            this.meta.set(ticker, body.meta);
            this.hooks.onMeta?.(ticker, body.meta);
        }
        if (body.events && ((body.events.dividends || []).length || (body.events.splits || []).length)) this.events.set(ticker, body.events);
        return body.bars.map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }));
    }

    /** 实时：每 5 秒拉最近 3 根（标签页隐藏时暂停）。服务器端有缓存，多个图表共享一次上游请求。 */
    subscribe(ticker, timeframe, onBar) {
        let stopped = false;
        let timer = null;
        const tick = async () => {
            if (stopped) return;
            if (!document.hidden) {
                try {
                    const bars = await this.getBars(ticker, timeframe, { limit: 3 }, { quiet: true });
                    if (!stopped) for (const b of bars) onBar(b);
                } catch {
                    /* 暂时性错误：继续轮询 */
                }
            }
            if (!stopped) timer = setTimeout(tick, 5_000);
        };
        timer = setTimeout(tick, 5_000);
        return () => {
            stopped = true;
            if (timer) clearTimeout(timer);
        };
    }

    async quote(ticker) {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || '报价获取失败');
        this.quotes.set(ticker, { ...body, at: Date.now() });
        this.meta.set(ticker, { ...(this.meta.get(ticker) || {}), ...body });
        return body;
    }

    async getSymbolInfo(ticker) {
        const hit = this.infoCache.get(ticker);
        if (hit && Date.now() - hit.at < 10 * 60_000) return hit.info;
        let m = this.meta.get(ticker);
        if (!m?.timezone) m = await this.quote(ticker).catch(() => m);
        if (!m) return undefined;
        const hint = Number.isFinite(m.priceHint) ? m.priceHint : 2;
        const d = this.list.find((x) => x.ticker.toUpperCase() === ticker.toUpperCase());
        const info = {
            ticker,
            description: m.name || d?.description || ticker,
            type: velaType(m.type, ticker),
            currency: m.currency || 'USD',
            timezone: m.timezone || 'Etc/UTC',
            session: m.session || '0000-2400',
            ...(m.sessionExt ? { session_extended: m.sessionExt } : {}),
            exchange: m.exchangeName || m.exchange,
            prefix: d?.prefix,
            mintick: 10 ** -hint,
            pricescale: 10 ** hint,
        };
        this.infoCache.set(ticker, { at: Date.now(), info });
        return info;
    }

    /** 交易时段日历：工作日按品种的常规 / 延长时段生成（不含节假日——Yahoo/FMP 免费接口不提供）。 */
    async getCalendar(ticker, range) {
        const info = await this.getSymbolInfo(ticker);
        if (!info) return [];
        if (info.session === '24x7') return [[range.from, range.to]];
        const w = parseWindow(range.session === 'extended' ? info.session_extended || info.session : info.session);
        if (!w) return [];
        const tz = info.timezone;
        const out = [];
        for (let t = range.from - DAY; t < range.to + DAY; t += DAY) {
            const p = partsIn(tz, t);
            if (p.weekday === 'Sat' || p.weekday === 'Sun') continue;
            const y = +p.year, mo = +p.month - 1, d = +p.day;
            const a = zonedToUtc(y, mo, d, w.sh, w.sm, tz);
            const b = zonedToUtc(y, mo, d, w.eh, w.em, tz);
            if (b > a && b > range.from && a < range.to) {
                const prev = out.at(-1);
                if (prev && prev[0] === a) continue;
                out.push([Math.max(a, range.from), Math.min(b, range.to)]);
            }
        }
        return out;
    }
}
