// 技术摘要的计算（纯函数，输入为 Vela 同款 K 线 {time, open, high, low, close, volume}）。
// 评级方法与常见的"技术评级"一致：均线组 + 震荡指标组各自投票，再合成总分。

const last = (a) => a[a.length - 1];
const nz = (v) => (Number.isFinite(v) ? v : NaN);

export function sma(src, n) {
    const out = new Array(src.length).fill(NaN);
    let sum = 0;
    for (let i = 0; i < src.length; i++) {
        sum += src[i];
        if (i >= n) sum -= src[i - n];
        if (i >= n - 1) out[i] = sum / n;
    }
    return out;
}

export function ema(src, n) {
    const out = new Array(src.length).fill(NaN);
    const k = 2 / (n + 1);
    let prev = NaN;
    for (let i = 0; i < src.length; i++) {
        if (i === n - 1) {
            let s = 0;
            for (let j = 0; j < n; j++) s += src[j];
            prev = s / n;
        } else if (i >= n) prev = src[i] * k + prev * (1 - k);
        out[i] = i >= n - 1 ? prev : NaN;
    }
    return out;
}

/** Wilder 平滑（RSI / ATR / ADX 用）。 */
export function rma(src, n) {
    const out = new Array(src.length).fill(NaN);
    let prev = NaN;
    let seed = 0;
    let count = 0;
    for (let i = 0; i < src.length; i++) {
        const v = src[i];
        if (!Number.isFinite(v)) continue;
        if (count < n) {
            seed += v;
            count++;
            if (count === n) {
                prev = seed / n;
                out[i] = prev;
            }
        } else {
            prev = (prev * (n - 1) + v) / n;
            out[i] = prev;
        }
    }
    return out;
}

export function rsi(close, n = 14) {
    const up = [NaN], dn = [NaN];
    for (let i = 1; i < close.length; i++) {
        const d = close[i] - close[i - 1];
        up.push(Math.max(d, 0));
        dn.push(Math.max(-d, 0));
    }
    const au = rma(up, n), ad = rma(dn, n);
    return au.map((u, i) => (ad[i] === 0 ? 100 : 100 - 100 / (1 + u / ad[i])));
}

export function macd(close, f = 12, s = 26, sig = 9) {
    const ef = ema(close, f), es = ema(close, s);
    const line = ef.map((v, i) => v - es[i]);
    const first = line.findIndex(Number.isFinite);
    const sigLine = new Array(close.length).fill(NaN);
    if (first >= 0) {
        const e = ema(line.slice(first), sig);
        e.forEach((v, i) => (sigLine[first + i] = v));
    }
    return { line, signal: sigLine, hist: line.map((v, i) => v - sigLine[i]) };
}

export function trueRange(bars) {
    return bars.map((b, i) => (i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
}

export const atr = (bars, n = 14) => rma(trueRange(bars), n);

export function stoch(bars, k = 14, d = 3, smooth = 3) {
    const raw = bars.map((b, i) => {
        if (i < k - 1) return NaN;
        let hh = -Infinity, ll = Infinity;
        for (let j = i - k + 1; j <= i; j++) {
            hh = Math.max(hh, bars[j].high);
            ll = Math.min(ll, bars[j].low);
        }
        return hh === ll ? 50 : ((b.close - ll) / (hh - ll)) * 100;
    });
    const kk = smaNaN(raw, smooth);
    return { k: kk, d: smaNaN(kk, d) };
}

function smaNaN(src, n) {
    const first = src.findIndex(Number.isFinite);
    const out = new Array(src.length).fill(NaN);
    if (first < 0) return out;
    sma(src.slice(first), n).forEach((v, i) => (out[first + i] = v));
    return out;
}

export function adx(bars, n = 14) {
    const pdm = [0], mdm = [0];
    for (let i = 1; i < bars.length; i++) {
        const up = bars[i].high - bars[i - 1].high;
        const dn = bars[i - 1].low - bars[i].low;
        pdm.push(up > dn && up > 0 ? up : 0);
        mdm.push(dn > up && dn > 0 ? dn : 0);
    }
    const tr = rma(trueRange(bars), n);
    const p = rma(pdm, n).map((v, i) => (100 * v) / tr[i]);
    const m = rma(mdm, n).map((v, i) => (100 * v) / tr[i]);
    const dx = p.map((v, i) => (v + m[i] === 0 ? 0 : (100 * Math.abs(v - m[i])) / (v + m[i])));
    return { adx: rma(dx, n), plus: p, minus: m };
}

export function cci(bars, n = 20) {
    const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
    const ma = sma(tp, n);
    return tp.map((v, i) => {
        if (!Number.isFinite(ma[i])) return NaN;
        let dev = 0;
        for (let j = i - n + 1; j <= i; j++) dev += Math.abs(tp[j] - ma[i]);
        dev /= n;
        return dev === 0 ? 0 : (v - ma[i]) / (0.015 * dev);
    });
}

export function williamsR(bars, n = 14) {
    return bars.map((b, i) => {
        if (i < n - 1) return NaN;
        let hh = -Infinity, ll = Infinity;
        for (let j = i - n + 1; j <= i; j++) {
            hh = Math.max(hh, bars[j].high);
            ll = Math.min(ll, bars[j].low);
        }
        return hh === ll ? -50 : ((hh - b.close) / (hh - ll)) * -100;
    });
}

export function bollinger(close, n = 20, mult = 2) {
    const mid = sma(close, n);
    const up = [], lo = [];
    for (let i = 0; i < close.length; i++) {
        if (!Number.isFinite(mid[i])) {
            up.push(NaN);
            lo.push(NaN);
            continue;
        }
        let s = 0;
        for (let j = i - n + 1; j <= i; j++) s += (close[j] - mid[i]) ** 2;
        const sd = Math.sqrt(s / n);
        up.push(mid[i] + mult * sd);
        lo.push(mid[i] - mult * sd);
    }
    return { mid, up, lo };
}

export function obv(bars) {
    let v = 0;
    return bars.map((b, i) => {
        if (i > 0) v += b.close > bars[i - 1].close ? b.volume || 0 : b.close < bars[i - 1].close ? -(b.volume || 0) : 0;
        return v;
    });
}

function slope(arr, n) {
    const ys = arr.slice(-n).filter(Number.isFinite);
    if (ys.length < 3) return 0;
    const mx = (ys.length - 1) / 2;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0, den = 0;
    ys.forEach((y, i) => {
        num += (i - mx) * (y - my);
        den += (i - mx) ** 2;
    });
    return den ? num / den : 0;
}

/** 摆动高低点（左右各 k 根），用于支撑/阻力。 */
function swings(bars, k = 3) {
    const highs = [], lows = [];
    for (let i = k; i < bars.length - k; i++) {
        let isH = true, isL = true;
        for (let j = i - k; j <= i + k; j++) {
            if (j === i) continue;
            if (bars[j].high > bars[i].high) isH = false;
            if (bars[j].low < bars[i].low) isL = false;
        }
        if (isH) highs.push(bars[i].high);
        if (isL) lows.push(bars[i].low);
    }
    return { highs, lows };
}

const vote = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** Rating bucket → i18n key + tone. */
export function ratingLabel(score) {
    if (!Number.isFinite(score)) return { key: 'r.na', tone: 'neutral' };
    if (score <= -0.5) return { key: 'r.strongSell', tone: 'down' };
    if (score <= -0.1) return { key: 'r.sell', tone: 'down' };
    if (score < 0.1) return { key: 'r.neutral', tone: 'neutral' };
    if (score < 0.5) return { key: 'r.buy', tone: 'up' };
    return { key: 'r.strongBuy', tone: 'up' };
}

/**
 * 主分析入口。返回分组好的指标、信号与评级，面板直接渲染。
 * @param {Array<{time:number,open:number,high:number,low:number,close:number,volume?:number}>} bars
 * @param {{ barMs: number, meta?: any }} ctx
 */
export function analyze(bars, ctx) {
    if (!bars || bars.length < 30) return null;
    const close = bars.map((b) => b.close);
    const c = last(close);
    const prev = close[close.length - 2];
    const hasVolume = bars.slice(-30).some((b) => (b.volume || 0) > 0);

    // ── 均线组 ──
    const maRows = [];
    let maBuy = 0, maSell = 0, maNeutral = 0;
    for (const [kind, n] of [['SMA', 10], ['EMA', 10], ['SMA', 20], ['EMA', 20], ['SMA', 50], ['EMA', 50], ['SMA', 100], ['SMA', 200]]) {
        if (bars.length < n + 1) continue;
        const v = last(kind === 'SMA' ? sma(close, n) : ema(close, n));
        const s = vote(c - v);
        s > 0 ? maBuy++ : s < 0 ? maSell++ : maNeutral++;
        maRows.push({ name: `${kind} ${n}`, value: v, signal: s });
    }

    // ── 震荡组 ──
    const osc = [];
    const r = rsi(close, 14);
    const rNow = last(r), rPrev = r[r.length - 2];
    osc.push({ name: 'RSI (14)', value: rNow, signal: rNow < 30 && rNow > rPrev ? 1 : rNow > 70 && rNow < rPrev ? -1 : 0, note: rNow >= 70 ? 'n.overbought' : rNow <= 30 ? 'n.oversold' : '' });
    const st = stoch(bars);
    const kN = last(st.k), dN = last(st.d);
    osc.push({ name: 'Stoch %K (14,3,3)', value: kN, signal: kN < 20 && kN > dN ? 1 : kN > 80 && kN < dN ? -1 : 0, note: kN >= 80 ? 'n.overbought' : kN <= 20 ? 'n.oversold' : '' });
    const cc = cci(bars);
    const ccN = last(cc), ccP = cc[cc.length - 2];
    osc.push({ name: 'CCI (20)', value: ccN, signal: ccN < -100 && ccN > ccP ? 1 : ccN > 100 && ccN < ccP ? -1 : 0 });
    const ad = adx(bars);
    const adN = last(ad.adx);
    const di = last(ad.plus) - last(ad.minus);
    osc.push({ name: 'ADX (14)', value: adN, signal: adN > 20 ? vote(di) : 0, note: adN >= 25 ? 'n.trending' : adN < 20 ? 'n.noTrend' : '' });
    const m = macd(close);
    osc.push({ name: 'MACD (12,26)', value: last(m.line), signal: vote(last(m.line) - last(m.signal)), note: last(m.hist) > 0 ? 'n.histPos' : 'n.histNeg' });
    const mom = c - close[close.length - 11];
    osc.push({ name: 'Momentum (10)', value: mom, signal: vote(mom - (close[close.length - 2] - close[close.length - 12])) });
    const wr = last(williamsR(bars));
    osc.push({ name: 'Williams %R (14)', value: wr, signal: wr < -80 ? 1 : wr > -20 ? -1 : 0 });
    let oBuy = 0, oSell = 0, oNeutral = 0;
    for (const o of osc) (o.signal > 0 ? oBuy++ : o.signal < 0 ? oSell++ : oNeutral++);

    const maScore = maRows.length ? (maBuy - maSell) / maRows.length : NaN;
    const oscScore = osc.length ? (oBuy - oSell) / osc.length : NaN;
    const total = Number.isFinite(maScore) && Number.isFinite(oscScore) ? (maScore + oscScore) / 2 : Number.isFinite(maScore) ? maScore : oscScore;

    // ── 波动 ──
    const at = last(atr(bars));
    const bb = bollinger(close);
    const bbUp = last(bb.up), bbLo = last(bb.lo), bbMid = last(bb.mid);
    const widthSeries = bb.up.map((u, i) => (u - bb.lo[i]) / bb.mid[i]).filter(Number.isFinite);
    const wNow = last(widthSeries);
    const wHist = widthSeries.slice(-120);
    const wPct = wHist.length ? (wHist.filter((x) => x <= wNow).length / wHist.length) * 100 : NaN;
    const rets = close.slice(-21).map((v, i, a) => (i ? Math.log(v / a[i - 1]) : NaN)).filter(Number.isFinite);
    const sd = Math.sqrt(rets.reduce((s, x) => s + x * x, 0) / Math.max(rets.length - 1, 1) - (rets.reduce((s, x) => s + x, 0) / rets.length) ** 2 * (rets.length / Math.max(rets.length - 1, 1)));
    const barsPerYear = ctx.barMs >= 86_400_000 ? (365.25 * 86_400_000 * (252 / 365.25)) / ctx.barMs : (252 * 6.5 * 3_600_000) / ctx.barMs;
    const hv = sd * Math.sqrt(barsPerYear) * 100;

    // ── 量能 ──
    let volume = null;
    if (hasVolume) {
        const vols = bars.map((b) => b.volume || 0);
        const avg20 = last(sma(vols, 20));
        const lastVol = last(vols);
        const ob = obv(bars);
        volume = { last: lastVol, avg20, ratio: avg20 ? lastVol / avg20 : NaN, obvTrend: vote(slope(ob, 20)), priceTrend: vote(slope(close, 20)) };
    }

    // ── 关键价位 ──
    const pb = bars[bars.length - 2];
    const P = (pb.high + pb.low + pb.close) / 3;
    const pivots = { P, R1: 2 * P - pb.low, S1: 2 * P - pb.high, R2: P + (pb.high - pb.low), S2: P - (pb.high - pb.low), R3: pb.high + 2 * (P - pb.low), S3: pb.low - 2 * (pb.high - P) };
    const sw = swings(bars.slice(-250));
    const resist = sw.highs.filter((h) => h > c).sort((a, b) => a - b)[0];
    const support = sw.lows.filter((l) => l < c).sort((a, b) => b - a)[0];
    const win = (n) => bars.slice(-n);
    const hi20 = Math.max(...win(20).map((b) => b.high)), lo20 = Math.min(...win(20).map((b) => b.low));
    const hi55 = Math.max(...win(55).map((b) => b.high)), lo55 = Math.min(...win(55).map((b) => b.low));

    // ── 区间涨跌 ──
    const perf = [];
    for (const n of [1, 5, 20, 60, 120, 250]) {
        if (close.length > n) perf.push({ bars: n, value: (c / close[close.length - 1 - n] - 1) * 100 });
    }
    if (ctx.barMs >= 86_400_000 && ctx.barMs < 7 * 86_400_000) {
        const y = new Date(last(bars).time).getUTCFullYear();
        const firstIdx = bars.findIndex((b) => new Date(b.time).getUTCFullYear() === y);
        if (firstIdx > 0) perf.push({ ytd: true, value: (c / close[firstIdx - 1] - 1) * 100 });
    }

    // ── 事件信号（最近几根内发生的） ──
    const signals = [];
    const crossedWithin = (a, b, n) => {
        for (let i = a.length - n; i < a.length; i++) {
            if (i < 1) continue;
            const d0 = a[i - 1] - b[i - 1], d1 = a[i] - b[i];
            if (Number.isFinite(d0) && Number.isFinite(d1)) {
                if (d0 <= 0 && d1 > 0) return { dir: 1, ago: a.length - 1 - i };
                if (d0 >= 0 && d1 < 0) return { dir: -1, ago: a.length - 1 - i };
            }
        }
        return null;
    };
    if (bars.length > 205) {
        const x = crossedWithin(sma(close, 50), sma(close, 200), 15);
        if (x) signals.push({ tone: x.dir > 0 ? 'up' : 'down', key: x.dir > 0 ? 's.golden' : 's.death', p: { n: x.ago } });
    }
    const mx = crossedWithin(m.line, m.signal, 5);
    if (mx) signals.push({ tone: mx.dir > 0 ? 'up' : 'down', key: mx.dir > 0 ? 's.macdUp' : 's.macdDown', p: { n: mx.ago } });
    if (c >= hi55) signals.push({ tone: 'up', key: 's.high55' });
    else if (c >= hi20) signals.push({ tone: 'up', key: 's.high20' });
    if (c <= lo55) signals.push({ tone: 'down', key: 's.low55' });
    else if (c <= lo20) signals.push({ tone: 'down', key: 's.low20' });
    if (c > bbUp) signals.push({ tone: 'up', key: 's.aboveBB' });
    if (c < bbLo) signals.push({ tone: 'down', key: 's.belowBB' });
    if (Number.isFinite(wPct) && wPct <= 10) signals.push({ tone: 'neutral', key: 's.squeeze' });
    const lb = last(bars);
    if (lb.low > pb.high) signals.push({ tone: 'up', key: 's.gapUp', p: { v: fmtPct((lb.low / pb.high - 1) * 100) } });
    if (lb.high < pb.low) signals.push({ tone: 'down', key: 's.gapDown', p: { v: fmtPct((lb.high / pb.low - 1) * 100) } });
    if (volume && volume.ratio >= 2) signals.push({ tone: c >= prev ? 'up' : 'down', key: 's.volSpike', p: { v: volume.ratio.toFixed(1) } });
    if (volume && volume.obvTrend !== 0 && volume.priceTrend !== 0 && volume.obvTrend !== volume.priceTrend) signals.push({ tone: 'neutral', key: volume.priceTrend > 0 ? 's.divBear' : 's.divBull' });
    if (rNow >= 70) signals.push({ tone: 'down', key: 's.rsiOB', p: { v: rNow.toFixed(0) } });
    if (rNow <= 30) signals.push({ tone: 'up', key: 's.rsiOS', p: { v: rNow.toFixed(0) } });

    // 趋势结构描述
    const s20 = last(sma(close, 20)), s50 = last(sma(close, 50)), s200 = bars.length > 200 ? last(sma(close, 200)) : NaN;
    let structure = 'st.range';
    if (Number.isFinite(s200)) {
        if (c > s20 && s20 > s50 && s50 > s200) structure = 'st.bullStack';
        else if (c < s20 && s20 < s50 && s50 < s200) structure = 'st.bearStack';
        else if (c > s200) structure = 'st.above200';
        else structure = 'st.below200';
    } else if (c > s20 && s20 > s50) structure = 'st.bullShort';
    else if (c < s20 && s20 < s50) structure = 'st.bearShort';

    return {
        price: c,
        change: c - prev,
        changePct: (c / prev - 1) * 100,
        rating: { total, ma: maScore, osc: oscScore, maCounts: [maSell, maNeutral, maBuy], oscCounts: [oSell, oNeutral, oBuy] },
        structure,
        maRows,
        osc,
        volatility: { atr: at, atrPct: (at / c) * 100, bbUp, bbLo, bbMid, percentB: ((c - bbLo) / (bbUp - bbLo)) * 100, widthPct: wNow * 100, widthRank: wPct, hv },
        volume,
        levels: { pivots, resist, support, hi20, lo20, hi55, lo55 },
        perf,
        signals,
        bars: bars.length,
        series: { close: close.slice(-120), sma20: sma(close, 20).slice(-120), bbUp: bb.up.slice(-120), bbLo: bb.lo.slice(-120) },
    };
}

export function fmtPct(v, digits = 2) {
    if (!Number.isFinite(v)) return '—';
    return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

export function fmtNum(v, digits) {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    const d = digits ?? (a >= 1000 ? 2 : a >= 10 ? 2 : a >= 1 ? 3 : 4);
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

let bigLang = 'zh';
export function setNumberLang(l) {
    bigLang = l;
}
export function fmtBig(v) {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (bigLang === 'zh') {
        if (a >= 1e12) return `${(v / 1e12).toFixed(2)} 万亿`;
        if (a >= 1e8) return `${(v / 1e8).toFixed(2)} 亿`;
        if (a >= 1e4) return `${(v / 1e4).toFixed(1)} 万`;
    } else {
        if (a >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
        if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
        if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
        if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    }
    return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export { nz };
