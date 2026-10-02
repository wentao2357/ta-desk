// TA Desk — interactive technical-analysis website on LuxAlgo Vela™
//
// Vela capabilities used:
//   VelaWorkspace (topbar, drawing tools, object tree, data window, layouts + sync, alerts,
//   screenshots, persistence) · 70+ native indicators + volume profile · Pine Script engine
//   (@luxalgo/vela-pinets) for custom scripts, alerts and strategy backtests (chart.runScript) ·
//   custom DataProvider (FMP / Yahoo) + Binance · market calendar → status badge & sessions ·
//   timeline marks (earnings / dividends / splits) · bar replay (ws.replay)

import { VelaWorkspace } from '@luxalgo/vela/workspace';
import { BinanceProvider } from '@luxalgo/vela/providers/binance';
import { PineWorkerEngine } from '@luxalgo/vela-pinets';

import { MarketProvider } from './provider.js';
import { GROUPS, localMatches, velaType, prefixFor, presetRow } from './symbols.js';
import { analyze, ratingLabel, fmtPct, fmtNum, fmtBig, setNumberLang } from './analysis.js';
import { PINE_SCRIPTS, PINE_MANIFEST, BACKTESTS } from './pine.js';
import { t, setLang, getLang } from './i18n.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = {
    get(k, d) {
        try {
            const v = localStorage.getItem(k);
            return v == null ? d : v;
        } catch {
            return d;
        }
    },
    set(k, v) {
        try {
            localStorage.setItem(k, v);
        } catch {
            /* private mode */
        }
    },
};
const params = new URLSearchParams(location.search);

// ───────────────────────── language / theme / colors ─────────────────────────

const browserZh = /^zh/i.test(navigator.language || '');
setLang(params.get('lang') || store.get('ta-lang', browserZh ? 'zh' : 'en'));
setNumberLang(getLang());
const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
let theme = store.get('ta-theme', systemDark() ? 'dark' : 'light');
const colorMode = store.get('ta-colors', 'intl');
const root = document.documentElement;
root.dataset.theme = theme;
root.dataset.colors = colorMode;
root.lang = getLang() === 'zh' ? 'zh-CN' : 'en';
const UP = colorMode === 'cn' ? '#f23645' : '#089981';
const DOWN = colorMode === 'cn' ? '#089981' : '#f23645';

// ───────────────────────── data provider + workspace ─────────────────────────

let ws;
const provider = new MarketProvider({
    onError: (ticker, msg) => ws?.toast(`${ticker}: ${msg}`, 'error', 5000),
    onMeta: (ticker) => {
        if (current().ticker === ticker) renderQuote();
    },
});

ws = new VelaWorkspace('#ws', {
    layout: '1',
    symbol: 'NASDAQ:AAPL',
    timeframe: params.get('tf') || 'D',
    live: true,
    theme,
    timezone: 'exchange',
    timeframes: ['1', '5', '15', '30', '60', '120', '240', 'D', 'W', 'M'],
    providers: { market: () => provider, binance: () => new BinanceProvider() },
    engines: { pine: () => new PineWorkerEngine() },
    indicators: PINE_MANIFEST,
    persist: 'ta-desk',
    ...(colorMode === 'cn' ? { upColor: UP, downColor: DOWN } : {}),
});
window.ws = ws; // Vela API in the console

// ───────────────────────── helpers ─────────────────────────

const TF_MS = (tf) => {
    const s = String(tf);
    let m = /^(\d+)$/.exec(s);
    if (m) return +m[1] * 60_000;
    m = /^(\d*)([SDWM])$/i.exec(s);
    if (m) return +(m[1] || 1) * { S: 1000, D: 86_400_000, W: 604_800_000, M: 2_592_000_000 }[m[2].toUpperCase()];
    return 86_400_000;
};
const TF_LABEL = (tf) => {
    const s = String(tf);
    const m = /^(\d*)([DWM])$/i.exec(s);
    if (m) return (m[1] && m[1] !== '1' ? `${m[1]}× ` : '') + t(`tf.${m[2].toUpperCase()}`);
    const ms = TF_MS(tf);
    return ms >= 3_600_000 ? t('tf.hour', { n: ms / 3_600_000 }) : t('tf.min', { n: ms / 60_000 });
};
const nameOf = (row) => (row ? (getLang() === 'zh' ? row.zh : row.en) : '');

function current() {
    const cell = ws.active;
    const chart = cell?.chart;
    const symbol = cell?.symbol || '';
    const res = chart?.data.resolve(symbol) || null;
    return { cell, chart, symbol, provider: res?.provider || null, ticker: res?.ticker || symbol.replace(/^[^:]+:/, ''), tf: cell?.timeframe || 'D' };
}

function toast(msg, kind = 'info') {
    ws.toast(msg, kind, 3500);
}

// ───────────────────────── analysis state ─────────────────────────

let state = { key: '', bars: [], analysis: null, loading: false, updatedAt: 0 };

async function refresh(force = false) {
    const ctx = current();
    if (!ctx.chart || !ctx.provider) return;
    const key = `${ctx.provider}:${ctx.ticker}:${ctx.tf}`;
    if (!force && state.key === key && Date.now() - state.updatedAt < 4000) return;
    if (state.key !== key) {
        state = { key, bars: [], analysis: null, loading: true, updatedAt: 0 };
        updateCards();
    }
    try {
        const inst = ctx.chart.data.providerInstance(ctx.provider);
        if (ctx.provider === 'market') provider.quote(ctx.ticker).then(renderQuote, () => {});
        const bars = await inst.getBars(ctx.ticker, ctx.tf, { limit: 400 }, { quiet: true });
        if (state.key !== key) return;
        state = { key, bars, analysis: analyze(bars, { barMs: TF_MS(ctx.tf) }), loading: false, updatedAt: Date.now() };
    } catch (e) {
        if (state.key !== key) return;
        state = { ...state, loading: false, error: e.message };
    }
    updateCards();
    renderQuote();
}
setInterval(() => {
    if (!document.hidden) refresh(true);
}, 15_000);

// ───────────────────────── search ─────────────────────────

const searchInput = $('#search');
const results = $('#results');
let items = [];
let activeIdx = 0;
let searchSeq = 0;
let searchTimer = null;

function norm(it) {
    return { ...it, vtype: it.vtype || velaType(it.type, it.symbol), prefix: it.prefix ?? prefixFor(it.exch, it.symbol) };
}
const itemName = (it) => (it.zh || it.en ? (getLang() === 'zh' ? it.zh || it.en : it.en || it.zh) : it.name || '');

function renderResults(list, { loading = false, browse = false } = {}) {
    items = list;
    activeIdx = 0;
    if (browse) {
        results.innerHTML = `<div class="browse">${GROUPS.map(
            (g) => `<section><h4>${esc(getLang() === 'zh' ? g.zh : g.en)}</h4><div class="chips">${g.rows
                .map(([tk, , , zh, en]) => `<button type="button" class="chip" data-sym="${esc(tk)}">${esc(getLang() === 'zh' ? zh : en)}<small>${esc(tk)}</small></button>`)
                .join('')}</div></section>`,
        ).join('')}</div>`;
        results.hidden = false;
        return;
    }
    if (!list.length) {
        results.innerHTML = `<div class="empty">${loading ? t('search.searching') : t('search.none')}</div>`;
        results.hidden = false;
        return;
    }
    results.innerHTML =
        list
            .map(
                (it, i) => `<button type="button" class="row${i === 0 ? ' on' : ''}" data-i="${i}">
            <span class="tk">${esc(it.symbol)}</span>
            <span class="nm">${esc(it.direct ? t('search.direct') : itemName(it))}</span>
            <span class="tag t-${esc(it.vtype)}">${esc(t(`type.${it.vtype}`))}</span>
            <span class="ex">${esc(it.exchDisp || it.prefix || '')}</span>
          </button>`,
            )
            .join('') + (loading ? `<div class="hint">${t('search.searching')}</div>` : '');
    results.hidden = false;
}

searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    clearTimeout(searchTimer);
    if (!q) return renderResults([], { browse: true });
    const local = localMatches(q).map(norm);
    renderResults(local, { loading: true });
    const seq = ++searchSeq;
    searchTimer = setTimeout(async () => {
        let remote = [];
        try {
            remote = await (await fetch(`/api/search?q=${encodeURIComponent(q)}`)).json();
        } catch {
            /* local results only */
        }
        if (seq !== searchSeq) return;
        const seen = new Set(local.map((x) => x.symbol.toUpperCase()));
        const merged = [...local, ...(Array.isArray(remote) ? remote : []).filter((r) => !seen.has(r.symbol.toUpperCase())).map((r) => norm({ ...r, source: 'market' }))];
        if (!merged.length && /^[\^A-Za-z0-9.=\-]{1,20}$/.test(q)) merged.push(norm({ symbol: q.toUpperCase(), direct: true, type: q.endsWith('=F') ? 'FUTURE' : q.startsWith('^') ? 'INDEX' : 'EQUITY', source: 'market' }));
        renderResults(merged);
    }, 220);
});
searchInput.addEventListener('focus', () => {
    if (!searchInput.value.trim()) renderResults([], { browse: true });
    else searchInput.dispatchEvent(new Event('input'));
});
searchInput.addEventListener('keydown', (e) => {
    const rows = $$('.row', results);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!rows.length) return;
        e.preventDefault();
        activeIdx = (activeIdx + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
        rows.forEach((r, i) => r.classList.toggle('on', i === activeIdx));
        rows[activeIdx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[activeIdx]) openItem(items[activeIdx]);
        else if (searchInput.value.trim()) openItem(norm({ symbol: searchInput.value.trim().toUpperCase(), direct: true, source: 'market' }));
    } else if (e.key === 'Escape') {
        results.hidden = true;
        searchInput.blur();
    }
});
results.addEventListener('mousedown', (e) => e.preventDefault());
results.addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (row) return openItem(items[+row.dataset.i]);
    const chip = e.target.closest('.chip');
    if (chip) {
        const r = presetRow(chip.dataset.sym);
        openItem(norm({ symbol: r.ticker, zh: r.zh, en: r.en, prefix: r.prefix ?? undefined, vtype: r.type, source: r.group === 'crypto' ? 'binance' : 'market' }));
    }
});
document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.search')) results.hidden = true;
});
document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
    }
});

async function openItem(it) {
    results.hidden = true;
    searchInput.value = '';
    searchInput.blur();
    if (it.source === 'binance') return ws.active.setSymbol(`BINANCE:${it.symbol}`);
    const isNew = !provider.has(it.symbol);
    if (isNew && (!it.prefix || it.direct || !(it.name || it.zh || it.en))) {
        try {
            const q = await provider.quote(it.symbol);
            it = { ...it, prefix: it.prefix || prefixFor(q.exchange, it.symbol), name: q.name, type: it.type || q.type };
        } catch (e) {
            return ws.toast(t('search.notFound', { s: it.symbol, e: e.message }), 'error', 5000);
        }
    }
    const d = provider.add({ symbol: it.symbol, name: it.en && it.zh && it.en !== it.zh ? `${it.en} · ${it.zh}` : itemName(it) || it.name, type: it.type || it.vtype?.toUpperCase?.(), exch: it.exch, prefix: it.prefix });
    if (isNew) {
        ws.chart.data.registerProvider('market', provider); // re-index so Vela's own picker knows it too
        await ws.chart.data.ready();
    }
    ws.active.setSymbol(ws.chart.data.canonicalSymbol(d.ticker) || `MARKET:${d.ticker}`);
}

// ───────────────────────── quote strip ─────────────────────────

const quoteEl = $('#quote');
function renderQuote() {
    const ctx = current();
    const meta = ctx.provider === 'market' ? provider.quotes.get(ctx.ticker) || provider.meta.get(ctx.ticker) : null;
    const a = state.analysis;
    const row = presetRow(ctx.ticker);
    const price = meta?.price ?? a?.price;
    const prevClose = meta?.prevClose;
    const chg = price != null && prevClose ? price - prevClose : a?.change;
    const chgPct = price != null && prevClose ? (price / prevClose - 1) * 100 : a?.changePct;
    const tone = chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat';
    const vt = row?.type || (ctx.provider === 'binance' ? 'crypto' : velaType(meta?.type, ctx.ticker));
    const isYield = vt === 'bond' && /^\^|2YY=F/.test(ctx.ticker);
    const digits = meta?.priceHint ?? (price < 10 ? 4 : 2);
    const lo52 = meta?.low52, hi52 = meta?.high52;
    const pos52 = lo52 != null && hi52 > lo52 && price != null ? Math.min(100, Math.max(0, ((price - lo52) / (hi52 - lo52)) * 100)) : null;
    const src = ctx.provider === 'binance' ? 'Binance' : meta?.source || '—';
    const display = nameOf(row) || meta?.name || '';
    const sub = row && meta?.name && getLang() === 'zh' ? meta.name : row && getLang() === 'zh' ? row.en : '';
    const stat = (k, v) => (v == null || v === '—' ? '' : `<div class="stat"><span>${t(k)}</span><b>${v}</b></div>`);
    quoteEl.innerHTML = `
      <div class="q-id">
        <div class="q-sym">${esc(ctx.ticker || '—')}</div>
        <div class="q-name" title="${esc(sub)}">${esc(display)}${sub && sub !== display ? ` <small>${esc(sub)}</small>` : ''}</div>
        <div class="q-tags">
          <span class="tag t-${esc(vt)}">${esc(t(`type.${vt}`))}</span>
          ${meta?.exchangeName ? `<span class="tag">${esc(meta.exchangeName)}</span>` : ''}
          ${meta?.currency ? `<span class="tag">${esc(meta.currency)}</span>` : ''}
          <span class="tag src">${t('q.src')} · ${esc(src)}</span>
        </div>
      </div>
      <div class="q-px ${tone}">
        <div class="px">${price != null ? fmtNum(price, digits) : '—'}${isYield ? '<small>%</small>' : ''}</div>
        <div class="chg">${chg != null ? `${chg > 0 ? '+' : ''}${fmtNum(chg, digits)}` : ''} <span>${fmtPct(chgPct)}</span>${isYield && chg != null ? ` <span>${(chg * 100).toFixed(1)} bp</span>` : ''}</div>
        <div class="when">${meta?.marketTime ? new Date(meta.marketTime).toLocaleString(getLang() === 'zh' ? 'zh-CN' : 'en-US', { hour12: false, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''} · ${esc(TF_LABEL(ctx.tf))}</div>
      </div>
      <div class="q-stats">
        ${stat('q.open', meta?.open != null ? fmtNum(meta.open, digits) : null)}
        ${stat('q.high', meta?.dayHigh != null ? fmtNum(meta.dayHigh, digits) : null)}
        ${stat('q.low', meta?.dayLow != null ? fmtNum(meta.dayLow, digits) : null)}
        ${stat('q.prev', prevClose != null ? fmtNum(prevClose, digits) : null)}
        ${stat('q.vol', meta?.volume ? fmtBig(meta.volume) : null)}
        ${stat('q.avgVol', meta?.avgVolume ? fmtBig(meta.avgVolume) : null)}
        ${stat('q.mcap', meta?.marketCap ? fmtBig(meta.marketCap) : null)}
        ${stat('q.beta', meta?.beta != null ? meta.beta.toFixed(2) : null)}
        ${stat('q.industry', meta?.industry ? esc(meta.industry) : null)}
        ${pos52 != null ? `<div class="stat range52"><span>${t('q.range52')}</span><div class="rbar"><i style="left:${pos52.toFixed(1)}%"></i></div><b>${fmtNum(lo52, digits)} – ${fmtNum(hi52, digits)}</b></div>` : ''}
      </div>`;
    document.title = `${ctx.ticker || ''} ${price != null ? fmtNum(price, digits) : ''} · ${t('app.name')}`;
}

// ───────────────────────── toolboxes ─────────────────────────

const ICON = {
    overview: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    momentum: '<path d="M3 12h3l3-7 4 14 3-7h5"/>',
    volatility: '<path d="M3 8c4-4 14-4 18 0M3 16c4 4 14 4 18 0"/><path d="M3 12h18" stroke-dasharray="2 3"/>',
    volume: '<path d="M5 20V12M10 20V6M15 20v-9M20 20V9"/>',
    levels: '<path d="M3 6h18M3 12h12M3 18h18"/><circle cx="18" cy="12" r="2"/>',
    signals: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="3"/>',
    events: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    curve: '<path d="M3 19h18"/><path d="M4 15c3-6 6-8 9-8.5S19 7 20 6"/>',
    backtest: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M7 15l4-4 3 3 5-6"/>',
    pine: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16"/>',
    replay: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
    mtf: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
};
const icon = (id) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[id]}</svg>`;

const NATIVE_NAME = {
    'moving-average': 'MA 20/50', supertrend: 'SuperTrend', 'average-directional-index': 'ADX', rsi: 'RSI', macd: 'MACD', stochastic: 'Stoch',
    'bollinger-bands': 'Bollinger', 'average-true-range': 'ATR', 'historical-volatility': 'HV', 'on-balance-volume': 'OBV', 'money-flow-index': 'MFI', vpvr: 'VPVR',
    'pivot-points': 'Pivots', 'donchian-channels': 'Donchian', zigzag: 'ZigZag', 'williams-fractal': 'Fractals', 'parabolic-sar': 'SAR',
};

const TOOLBOXES = [
    { id: 'overview', group: 'analysis', natives: [] },
    { id: 'trend', group: 'chart', natives: [['moving-average', { length: 20, showMa2: true, ma2Length: 50 }], ['supertrend'], ['average-directional-index']] },
    { id: 'momentum', group: 'chart', natives: [['rsi'], ['macd'], ['stochastic']] },
    { id: 'volatility', group: 'chart', natives: [['bollinger-bands'], ['average-true-range'], ['historical-volatility']] },
    { id: 'volume', group: 'chart', natives: [['on-balance-volume'], ['money-flow-index'], ['vpvr']] },
    { id: 'levels', group: 'chart', natives: [['pivot-points'], ['donchian-channels']] },
    { id: 'signals', group: 'chart', natives: [['zigzag'], ['williams-fractal'], ['parabolic-sar']] },
    { id: 'events', group: 'analysis', natives: [] },
    { id: 'curve', group: 'analysis', natives: [] },
    { id: 'backtest', group: 'studio', natives: [] },
    { id: 'pine', group: 'studio', natives: [] },
    { id: 'replay', group: 'studio', natives: [] },
    { id: 'mtf', group: 'views', natives: [] },
];
const TB = Object.fromEntries(TOOLBOXES.map((x) => [x.id, x]));
const DEFAULT_TB = ['overview', 'trend', 'momentum', 'levels', 'events'];

const enabled = new Set(
    (params.get('tb') || store.get('ta-tb', DEFAULT_TB.join(',')))
        .split(',')
        .filter((id) => TB[id]),
);

function saveTb() {
    store.set('ta-tb', [...enabled].join(','));
    syncUrl();
}

/** Add this toolbox's indicators to a chart (skips types already there). */
function addNatives(chart, id) {
    const present = new Set(chart.presentNativeIndicators());
    for (const [type, inputs] of TB[id].natives) {
        if (present.has(type)) continue;
        chart.addNativeIndicator(type, inputs ? { inputs } : undefined);
    }
}
function removeNatives(chart, id) {
    const types = new Set(TB[id].natives.map(([type]) => type));
    for (const h of chart.indicators()) if (h.nativeType && types.has(h.nativeType)) h.remove();
}
const allCharts = () => ws.cells().map((c) => c.chart).filter(Boolean);

function setToolbox(id, on) {
    if (on === enabled.has(id)) return;
    if (on) enabled.add(id);
    else enabled.delete(id);
    for (const chart of allCharts()) (on ? addNatives : removeNatives)(chart, id);
    if (id === 'events') for (const chart of allCharts()) applyMarks(chart);
    if (id === 'mtf') setMtf(on);
    if (id === 'backtest' && !on) bt.clear();
    if (id === 'replay' && !on) ws.replay.stop();
    saveTb();
    renderSide();
    renderCards();
}

// ── sidebar ──
const side = $('#side');
function renderSide() {
    const groups = [
        ['analysis', ['overview', 'events', 'curve']],
        ['chart', ['trend', 'momentum', 'volatility', 'volume', 'levels', 'signals']],
        ['studio', ['backtest', 'pine', 'replay']],
        ['views', ['mtf']],
    ];
    side.innerHTML = `
      <div class="side-head"><h2>${t('side.title')}</h2>
        <div class="side-bulk"><button type="button" data-bulk="all">${t('side.all')}</button><button type="button" data-bulk="none">${t('side.none')}</button></div>
      </div>
      <p class="side-hint">${t('side.hint')}</p>
      ${groups
          .map(
              ([g, ids]) => `<section><h3>${t(`side.${g}`)}</h3>${ids
                  .map(
                      (id) => `<label class="tool${enabled.has(id) ? ' on' : ''}">
              <input type="checkbox" data-tb="${id}" ${enabled.has(id) ? 'checked' : ''}>
              <span class="ic">${icon(id)}</span>
              <span class="tx"><b>${t(`tb.${id}`)}</b><small>${t(`tb.${id}.d`)}</small></span>
              <span class="sw" aria-hidden="true"></span>
            </label>`,
                  )
                  .join('')}</section>`,
          )
          .join('')}`;
}
side.addEventListener('change', (e) => {
    const id = e.target.dataset?.tb;
    if (id) setToolbox(id, e.target.checked);
});
side.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bulk]');
    if (!b) return;
    const on = b.dataset.bulk === 'all';
    for (const x of TOOLBOXES) if (x.group === 'chart' || x.group === 'analysis') setToolbox(x.id, on);
});

// ───────────────────────── cards ─────────────────────────

const cardsEl = $('#cards');
const mounted = new Map(); // id → { el, update?, destroy? }

function renderCards() {
    // keep order of TOOLBOXES; mount new, unmount disabled
    for (const [id, m] of mounted) {
        if (!enabled.has(id)) {
            m.destroy?.();
            m.el.remove();
            mounted.delete(id);
        }
    }
    let prev = null;
    for (const tb of TOOLBOXES) {
        if (!enabled.has(tb.id)) continue;
        let m = mounted.get(tb.id);
        if (!m) {
            const el = document.createElement('article');
            el.className = `card c-${tb.id}`;
            el.dataset.tb = tb.id;
            const chips = tb.natives.length ? `<span class="on-chart">${tb.natives.map(([n]) => NATIVE_NAME[n] || n).join(' · ')}</span>` : '';
            el.innerHTML = `<header><span class="ic">${icon(tb.id)}</span><h3>${t(`tb.${tb.id}`)}</h3>${chips}<button type="button" class="x" aria-label="×" data-close="${tb.id}">×</button></header><div class="body"></div>`;
            m = { el, ...(CARDS[tb.id]?.mount?.($('.body', el)) || {}) };
            mounted.set(tb.id, m);
        }
        if (prev) prev.after(m.el);
        else cardsEl.prepend(m.el);
        prev = m.el;
    }
    cardsEl.classList.toggle('empty', enabled.size === 0);
    updateCards();
}
cardsEl.addEventListener('click', (e) => {
    const x = e.target.closest('[data-close]');
    if (x) setToolbox(x.dataset.close, false);
});
function updateCards() {
    for (const [, m] of mounted) m.update?.(state);
}
function remountCards() {
    for (const [, m] of mounted) {
        m.destroy?.();
        m.el.remove();
    }
    mounted.clear();
    renderCards();
}

const n = (v) => fmtNum(v);
const sigChip = (s) => (s > 0 ? `<span class="sg up">${t('sig.buy')}</span>` : s < 0 ? `<span class="sg down">${t('sig.sell')}</span>` : `<span class="sg">${t('sig.neutral')}</span>`);
const placeholder = (st) => (st.loading ? `<p class="muted">${t('c.loading')}</p>` : `<p class="muted">${esc(st.error || t('c.short'))}</p>`);
const footer = (st) => `<footer>${t('c.foot', { n: st.analysis.bars, tf: TF_LABEL(current().tf), time: new Date(st.updatedAt).toLocaleTimeString(getLang() === 'zh' ? 'zh-CN' : 'en-US', { hour12: false }) })}</footer>`;
const dataCard = (render) => ({
    mount: (body) => ({
        update: (st) => {
            const top = body.scrollTop;
            body.innerHTML = st.analysis ? render(st.analysis, st) : placeholder(st);
            body.scrollTop = top;
        },
    }),
});

function gaugeSvg(score, tone) {
    const s = Number.isFinite(score) ? Math.max(-1, Math.min(1, score)) : 0;
    const A = (v) => Math.PI * (1 - (v + 1) / 2);
    const cx = 110, cy = 100, r = 80;
    const seg = (a0, a1, cls) => {
        const p = (a) => [cx + Math.cos(a) * r, cy - Math.sin(a) * r];
        const [x0, y0] = p(a0), [x1, y1] = p(a1);
        return `<path class="${cls}" d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}"/>`;
    };
    const ang = A(s);
    const nx = cx + Math.cos(ang) * (r - 14), ny = cy - Math.sin(ang) * (r - 14);
    return `<svg viewBox="0 0 220 118" class="gauge" role="img" aria-label="${s.toFixed(2)}">
      ${seg(A(-1), A(-0.5) - 0.02, 'g-sd')}${seg(A(-0.5) + 0.02, A(-0.1) - 0.02, 'g-d')}${seg(A(-0.1) + 0.02, A(0.1) - 0.02, 'g-n')}${seg(A(0.1) + 0.02, A(0.5) - 0.02, 'g-u')}${seg(A(0.5) + 0.02, A(1), 'g-su')}
      <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" class="needle"/><circle cx="${cx}" cy="${cy}" r="5" class="hub"/>
      <text x="${cx - r}" y="${cy + 16}" class="g-lbl">${t('r.sellLbl')}</text><text x="${cx + r}" y="${cy + 16}" class="g-lbl" text-anchor="end">${t('r.buyLbl')}</text>
    </svg>`;
}

const isYieldSym = () => /^\^(IRX|FVX|TNX|TYX)$|^2YY=F$/.test(current().ticker);

const CARDS = {
    overview: dataCard((a, st) => {
        const r = a.rating;
        const lab = ratingLabel(r.total);
        const cnt = (c) => t('r.counts', { s: c[0], n: c[1], b: c[2] });
        return `<div class="ov">
            <div class="ov-g">${gaugeSvg(r.total, lab.tone)}<div class="verdict ${lab.tone}">${t(lab.key)}</div></div>
            <div class="ov-sub">
              <div><span>${t('r.ma')}</span><b class="${ratingLabel(r.ma).tone}">${t(ratingLabel(r.ma).key)}</b><em>${cnt(r.maCounts)}</em></div>
              <div><span>${t('r.osc')}</span><b class="${ratingLabel(r.osc).tone}">${t(ratingLabel(r.osc).key)}</b><em>${cnt(r.oscCounts)}</em></div>
              <div><span>${t('c.structure')}</span><b>${t(a.structure)}</b></div>
            </div></div>
          <h4>${t('c.perf')}</h4>
          <div class="perf">${a.perf.map((p) => `<div><span>${p.ytd ? t('c.perf.ytd') : t('c.perf.bars', { n: p.bars })}</span><b class="${p.value > 0 ? 'up' : p.value < 0 ? 'down' : ''}">${fmtPct(p.value)}</b></div>`).join('')}</div>
          ${footer(st)}<p class="disc">${t('c.disclaimer')}</p>`;
    }),
    trend: dataCard((a) => `<p class="lead">${t(a.structure)}</p><table class="tt">${a.maRows.map((m) => `<tr><td>${m.name}</td><td>${n(m.value)}</td><td>${sigChip(m.signal)}</td></tr>`).join('')}
        ${(() => {
            const adx = a.osc.find((o) => o.name.startsWith('ADX'));
            return adx ? `<tr><td>${adx.name}</td><td>${n(adx.value)}${adx.note ? ` <em>${t(adx.note)}</em>` : ''}</td><td>${sigChip(adx.signal)}</td></tr>` : '';
        })()}</table>`),
    momentum: dataCard((a) => `<table class="tt">${a.osc.filter((o) => !o.name.startsWith('ADX')).map((o) => `<tr><td>${o.name}</td><td>${n(o.value)}${o.note ? ` <em>${t(o.note)}</em>` : ''}</td><td>${sigChip(o.signal)}</td></tr>`).join('')}</table>`),
    volatility: dataCard((a) => {
        const v = a.volatility;
        return `<table class="tt">
          <tr><td>${t('c.atr')}</td><td>${n(v.atr)} <em>${v.atrPct.toFixed(2)}%</em></td></tr>
          <tr><td>${t('c.hv')}</td><td>${Number.isFinite(v.hv) ? v.hv.toFixed(1) + '%' : '—'}</td></tr>
          <tr><td>${t('c.pb')}</td><td>${v.percentB.toFixed(0)}</td></tr>
          <tr><td>${t('c.bw')}</td><td>${v.widthPct.toFixed(2)}% <em>${Number.isFinite(v.widthRank) ? t('c.pct', { v: v.widthRank.toFixed(0) }) : ''}</em></td></tr>
        </table>${bandSpark(a)}`;
    }),
    volume: dataCard((a) => {
        const v = a.volume;
        if (!v) return `<p class="muted">${t('c.noVol')}</p>`;
        return `<table class="tt">
          <tr><td>${t('c.lastVol')}</td><td>${fmtBig(v.last)}</td></tr>
          <tr><td>${t('c.avgVol')}</td><td>${fmtBig(v.avg20)}</td></tr>
          <tr><td>${t('c.volRatio')}</td><td class="${v.ratio >= 1.5 ? 'hot' : ''}">${Number.isFinite(v.ratio) ? v.ratio.toFixed(2) + '×' : '—'}</td></tr>
          <tr><td>${t('c.obv')}</td><td>${v.obvTrend > 0 ? `<span class="up">${t('c.up')}</span>` : v.obvTrend < 0 ? `<span class="down">${t('c.down')}</span>` : t('c.flat')}</td></tr>
        </table>`;
    }),
    levels: dataCard((a) => {
        const L = a.levels;
        const meta = provider.quotes.get(current().ticker);
        const rows = [
            ['c.resist', L.resist], ['c.support', L.support],
            ['c.r21', `${n(L.pivots.R2)} / ${n(L.pivots.R1)}`], ['c.p', L.pivots.P], ['c.s12', `${n(L.pivots.S1)} / ${n(L.pivots.S2)}`],
            ['c.hl20', `${n(L.hi20)} / ${n(L.lo20)}`], ['c.hl55', `${n(L.hi55)} / ${n(L.lo55)}`],
            ...(meta?.high52 ? [['c.hl52', `${n(meta.high52)} / ${n(meta.low52)}`]] : []),
        ];
        return `${ladder(a)}<table class="tt">${rows.map(([k, v]) => `<tr><td>${t(k)}</td><td>${typeof v === 'number' ? n(v) : v ?? '—'}</td></tr>`).join('')}</table>`;
    }),
    signals: dataCard((a) => (a.signals.length ? `<ul class="sigs">${a.signals.map((s) => `<li class="${s.tone}">${esc(t(s.key, s.p))}</li>`).join('')}</ul>` : `<p class="muted">${t('s.none')}</p>`)),
    events: { mount: (body) => mountEvents(body) },
    curve: { mount: (body) => mountCurve(body) },
    backtest: { mount: (body) => bt.mount(body) },
    pine: { mount: (body) => mountPine(body) },
    replay: { mount: (body) => mountReplay(body) },
    mtf: { mount: (body) => ((body.innerHTML = `<p class="muted">${t('mtf.card')}</p>`), {}) },
};

/** Close vs Bollinger band, last 120 bars (volatility card). */
function bandSpark(a) {
    const { close, bbUp, bbLo, sma20 } = a.series;
    const all = [...close, ...bbUp, ...bbLo].filter(Number.isFinite);
    if (all.length < 10) return '';
    const lo = Math.min(...all), hi = Math.max(...all);
    const W = 320, H = 90, x = (i) => (i / (close.length - 1)) * W, y = (v) => 4 + (1 - (v - lo) / (hi - lo || 1)) * (H - 8);
    const path = (arr) => arr.map((v, i) => (Number.isFinite(v) ? `${i && Number.isFinite(arr[i - 1]) ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}` : '')).join('');
    let band = '';
    const idx = bbUp.map((v, i) => (Number.isFinite(v) ? i : -1)).filter((i) => i >= 0);
    if (idx.length > 2) band = `M${idx.map((i) => `${x(i).toFixed(1)} ${y(bbUp[i]).toFixed(1)}`).join('L')}L${idx.reverse().map((i) => `${x(i).toFixed(1)} ${y(bbLo[i]).toFixed(1)}`).join('L')}Z`;
    return `<svg viewBox="0 0 ${W} ${H}" class="spark" preserveAspectRatio="none" role="img" aria-label="Bollinger"><path d="${band}" class="band"/><path d="${path(sma20)}" class="mid"/><path d="${path(close)}" class="px"/></svg>`;
}

/** Vertical price ladder: current price among the key levels (levels card). */
function ladder(a) {
    const L = a.levels;
    const pts = [
        ['R2', L.pivots.R2], ['R1', L.pivots.R1], ['P', L.pivots.P], ['S1', L.pivots.S1], ['S2', L.pivots.S2],
        [t('c.resist').split(/[（(]/)[0], L.resist], [t('c.support').split(/[（(]/)[0], L.support],
    ].filter(([, v]) => Number.isFinite(v));
    const vals = [...pts.map(([, v]) => v), a.price];
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const H = 150, W = 320, y = (v) => 10 + (1 - (v - lo) / (hi - lo || 1)) * (H - 20);
    const isSR = (k) => k !== 'R2' && k !== 'R1' && k !== 'P' && k !== 'S1' && k !== 'S2';
    return `<svg viewBox="0 0 ${W} ${H}" class="ladder" role="img" aria-label="levels">
      ${pts.map(([k, v]) => `<g class="${isSR(k) ? 'sr' : 'pv'} ${v >= a.price ? 'above' : 'below'}"><line x1="${isSR(k) ? 150 : 40}" x2="${isSR(k) ? 300 : 140}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${isSR(k) ? 300 : 40}" y="${(y(v) - 3).toFixed(1)}" text-anchor="${isSR(k) ? 'end' : 'start'}">${esc(k)} ${n(v)}</text></g>`).join('')}
      <line x1="20" x2="310" y1="${y(a.price).toFixed(1)}" y2="${y(a.price).toFixed(1)}" class="now"/><circle cx="20" cy="${y(a.price).toFixed(1)}" r="4" class="now-dot"/>
    </svg>`;
}

// ── events card + chart marks ──
const eventsCache = new Map();
async function eventsFor(ticker) {
    if (!eventsCache.has(ticker)) eventsCache.set(ticker, fetch(`/api/events?symbol=${encodeURIComponent(ticker)}`).then((r) => r.json()).catch(() => ({})));
    const ev = await eventsCache.get(ticker);
    const fromBars = provider.events.get(ticker) || {};
    const pick = (a, b) => ((a || []).length ? a : b || []);
    return { earnings: ev.earnings || [], dividends: pick(ev.dividends, fromBars.dividends), splits: pick(ev.splits, fromBars.splits) };
}

const marksWired = new WeakSet();
async function applyMarks(chart) {
    if (!chart) return;
    if (!marksWired.has(chart)) {
        marksWired.add(chart);
        chart.marks.defineGroup({ id: 'earnings', label: 'Earnings' }).defineGroup({ id: 'dividends', label: 'Dividends' }).defineGroup({ id: 'splits', label: 'Splits' });
        chart.on('market:changed', () => void applyMarks(chart));
    }
    const sym = chart.market.symbol || '';
    const res = chart.data.resolve(sym);
    if (!enabled.has('events') || !res || res.provider !== 'market') return chart.marks.clear();
    await chart.ready().catch(() => {});
    const ev = await eventsFor(res.ticker);
    if (chart.market.symbol !== sym || !enabled.has('events')) return;
    const day = (ms) => new Date(ms).toISOString().slice(0, 10);
    const marks = [];
    for (const e of ev.earnings) {
        const beat = e.epsActual != null && e.epsEstimated != null ? e.epsActual - e.epsEstimated : null;
        marks.push({
            id: `e-${e.date}`, time: e.t, group: 'earnings',
            title: e.epsActual == null ? t('ev.earningsEst') : t('ev.earnings'),
            tooltip: `${t('ev.earnings')} ${e.date}${beat != null ? ` · EPS ${beat >= 0 ? t('ev.beat') : t('ev.miss')}` : ''}`,
            glyph: { shape: 'circle', color: beat == null ? '#a0a4ad' : beat >= 0 ? UP : DOWN, letter: 'E' },
            content: { panel: { items: [
                { type: 'field', label: t('ev.date'), value: e.date },
                { type: 'field', label: 'EPS', value: `${e.epsActual ?? '—'} / ${e.epsEstimated ?? '—'}` },
                { type: 'field', label: t('ev.rev'), value: `${e.revenueActual != null ? fmtBig(e.revenueActual) : '—'} / ${e.revenueEstimated != null ? fmtBig(e.revenueEstimated) : '—'}` },
            ] } },
        });
    }
    for (const d of ev.dividends) {
        marks.push({ id: `d-${d.t}`, time: d.t, group: 'dividends', title: t('ev.dividend'), tooltip: `${t('ev.dividend')} ${d.amount != null ? (+d.amount).toFixed(4) : ''}`, glyph: { shape: 'circle', color: '#2962ff', letter: 'D' },
            content: { panel: { items: [{ type: 'field', label: t('ev.exDate'), value: day(d.t) }, { type: 'field', label: t('ev.perShare'), value: d.amount != null ? (+d.amount).toFixed(4) : '—' }, ...(d.paymentDate ? [{ type: 'field', label: t('ev.payDate'), value: d.paymentDate }] : [])] } } });
    }
    for (const s of ev.splits) marks.push({ id: `s-${s.t}`, time: s.t, group: 'splits', title: t('ev.splitT'), tooltip: `${t('ev.splitT')} ${s.ratio}`, glyph: { shape: 'circle', color: '#9c27b0', letter: 'S' }, content: { panel: { items: [{ type: 'field', label: t('ev.date'), value: day(s.t) }, { type: 'field', label: t('ev.ratio'), value: s.ratio }] } } });
    chart.marks.set(marks);
}

function mountEvents(body) {
    let key = '';
    const draw = async () => {
        const ctx = current();
        if (ctx.provider !== 'market') return (body.innerHTML = `<p class="muted">${t('ev.none')}</p>`);
        if (key === ctx.ticker && body.innerHTML) return;
        key = ctx.ticker;
        const ev = await eventsFor(ctx.ticker);
        if (key !== current().ticker) return;
        const now = Date.now();
        const next = ev.earnings.filter((e) => e.t > now).sort((a, b) => a.t - b.t)[0];
        const last = ev.earnings.filter((e) => e.t <= now && e.epsActual != null).sort((a, b) => b.t - a.t)[0];
        const div = ev.dividends.slice().sort((a, b) => b.t - a.t)[0];
        const spl = ev.splits.slice().sort((a, b) => b.t - a.t)[0];
        if (!next && !last && !div && !spl) return (body.innerHTML = `<p class="muted">${t('ev.none')}</p>`);
        const days = next ? Math.ceil((next.t - now) / 86_400_000) : null;
        body.innerHTML = `<table class="tt">
          ${next ? `<tr><td>${t('ev.next')}</td><td>${next.date} <em>${getLang() === 'zh' ? `${days} 天后` : `in ${days}d`}</em></td></tr>` : ''}
          ${next?.epsEstimated != null ? `<tr><td>EPS est.</td><td>${next.epsEstimated}</td></tr>` : ''}
          ${last ? `<tr><td>${t('ev.last')}</td><td>${last.date}</td></tr><tr><td>${t('ev.eps')}</td><td class="${last.epsActual >= last.epsEstimated ? 'up' : 'down'}">${last.epsActual} / ${last.epsEstimated ?? '—'}</td></tr>` : ''}
          ${last?.revenueActual != null ? `<tr><td>${t('ev.rev')}</td><td>${fmtBig(last.revenueActual)} / ${fmtBig(last.revenueEstimated)}</td></tr>` : ''}
          ${div ? `<tr><td>${t('ev.div')}</td><td>${day(div.t)} · ${(+div.amount).toFixed(4)}</td></tr>` : ''}
          ${spl ? `<tr><td>${t('ev.split')}</td><td>${day(spl.t)} · ${esc(spl.ratio)}</td></tr>` : ''}
        </table><p class="muted">${t('ev.hint')}</p>`;
    };
    const day = (ms) => new Date(ms).toISOString().slice(0, 10);
    return { update: () => void draw() };
}

// ── Treasury curve card ──
const CURVE_TO_SYMBOL = { '3M': '^IRX', '2Y': '2YY=F', '5Y': '^FVX', '10Y': '^TNX', '30Y': '^TYX' };
let treasuryP = null;
function mountCurve(body) {
    body.innerHTML = `<p class="muted">${t('cv.loading')}</p>`;
    body.addEventListener('click', (e) => {
        const tr = e.target.closest('tr.link');
        if (tr) openItem(norm({ symbol: tr.dataset.sym, source: 'market', ...(presetRow(tr.dataset.sym) ? { zh: presetRow(tr.dataset.sym).zh, en: presetRow(tr.dataset.sym).en, prefix: presetRow(tr.dataset.sym).prefix, vtype: 'bond' } : {}) }));
    });
    treasuryP ??= fetch('/api/treasury').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));
    treasuryP.then(
        (data) => (body.innerHTML = curveHtml(data)),
        (e) => {
            treasuryP = null;
            body.innerHTML = `<p class="muted">${t('cv.fail', { e: esc(e.message) })}</p>`;
        },
    );
    return {};
}
function curveHtml(data) {
    const rows = data.rows.filter((r) => r.v.some((x) => x != null));
    if (!rows.length) return `<p class="muted">—</p>`;
    const latest = rows.at(-1);
    const ago = (days) => {
        const target = new Date(latest.date).getTime() - days * 86_400_000;
        let best = rows[0];
        for (const r of rows) if (new Date(r.date).getTime() <= target) best = r;
        return best;
    };
    const lines = [
        { k: 'cv.latest', row: latest, c: 'c0' }, { k: 'cv.m1', row: ago(30), c: 'c1' }, { k: 'cv.m6', row: ago(182), c: 'c2' }, { k: 'cv.y1', row: ago(365), c: 'c3' },
    ].filter((l, i, arr) => i === 0 || l.row.date !== arr[i - 1].row.date);
    const mats = data.maturities;
    const W = 340, H = 190, L = 36, R = 10, T = 12, B = 24;
    const vals = lines.flatMap((l) => l.row.v).filter((x) => x != null);
    let lo = Math.floor(Math.min(...vals) * 4) / 4, hi = Math.ceil(Math.max(...vals) * 4) / 4;
    if (hi - lo < 0.5) hi = lo + 0.5;
    const x = (i) => L + (i / (mats.length - 1)) * (W - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const ticks = [0, 1, 2, 3, 4].map((k) => lo + (k * (hi - lo)) / 4);
    const path = (row) => row.v.map((v, i) => (v == null ? '' : `${'ML'[+(i > 0)]}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).join('');
    const spread = (a, b) => {
        const ia = mats.findIndex((m) => m.label === a), ib = mats.findIndex((m) => m.label === b);
        if (ia < 0 || ib < 0) return '';
        const pts = data.rows.map((r) => ({ d: r.date, v: r.v[ib] != null && r.v[ia] != null ? (r.v[ib] - r.v[ia]) * 100 : null })).filter((p) => p.v != null);
        if (pts.length < 5) return '';
        const W2 = 340, H2 = 80, l2 = 36, r2 = 10;
        const vs = pts.map((p) => p.v), lo2 = Math.min(0, ...vs), hi2 = Math.max(0, ...vs);
        const x2 = (i) => l2 + (i / (pts.length - 1)) * (W2 - l2 - r2), y2 = (v) => 6 + (1 - (v - lo2) / (hi2 - lo2 || 1)) * (H2 - 20);
        const last = vs.at(-1);
        return `<div class="spread-h"><span>${t('cv.spread', { a: b, b: a })}</span><b class="${last >= 0 ? 'up' : 'down'}">${last >= 0 ? '+' : ''}${last.toFixed(0)} bp</b><em>${last < 0 ? t('cv.inverted') : t('cv.normal')}</em></div>
          <svg viewBox="0 0 ${W2} ${H2}" class="chart-svg" role="img" aria-label="spread"><line x1="${l2}" x2="${W2 - r2}" y1="${y2(0).toFixed(1)}" y2="${y2(0).toFixed(1)}" class="zero"/>
          <text x="${l2 - 4}" y="${(y2(hi2) + 4).toFixed(1)}" text-anchor="end" class="ax">${hi2.toFixed(0)}</text><text x="${l2 - 4}" y="${y2(lo2).toFixed(1)}" text-anchor="end" class="ax">${lo2.toFixed(0)}</text>
          <path d="${pts.map((p, i) => `${'ML'[+(i > 0)]}${x2(i).toFixed(1)} ${y2(p.v).toFixed(1)}`).join('')}" class="ln c0"/>
          <text x="${l2}" y="${H2 - 2}" class="ax">${pts[0].d}</text><text x="${W2 - r2}" y="${H2 - 2}" text-anchor="end" class="ax">${pts.at(-1).d}</text></svg>`;
    };
    const prev = rows.at(-2);
    return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="yield curve">
        ${ticks.map((tk) => `<line x1="${L}" x2="${W - R}" y1="${y(tk).toFixed(1)}" y2="${y(tk).toFixed(1)}" class="grid"/><text x="${L - 5}" y="${(y(tk) + 3).toFixed(1)}" text-anchor="end" class="ax">${tk.toFixed(2)}</text>`).join('')}
        ${mats.map((m, i) => `<text x="${x(i).toFixed(1)}" y="${H - 7}" text-anchor="middle" class="ax">${m.label}</text>`).join('')}
        ${lines.slice().reverse().map((l) => `<path d="${path(l.row)}" class="ln ${l.c}"/>`).join('')}
        ${latest.v.map((v, i) => (v == null ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" class="pt"/>`)).join('')}
      </svg>
      <div class="legend">${lines.map((l) => `<span class="${l.c}"><i></i>${t(l.k)} <small>${l.row.date}</small></span>`).join('')}</div>
      ${spread('2Y', '10Y')}${spread('3M', '10Y')}
      <h4>${t('cv.table')} <small>${latest.date}</small></h4>
      <table class="tt yields">${mats.map((m, i) => {
          const v = latest.v[i], p = prev?.v[i], bp = v != null && p != null ? (v - p) * 100 : null, sym = CURVE_TO_SYMBOL[m.label];
          return `<tr${sym ? ` class="link" data-sym="${sym}"` : ''}><td>${m.label}${sym ? ' ↗' : ''}</td><td>${v != null ? v.toFixed(2) + '%' : '—'}</td><td class="${bp > 0 ? 'up' : bp < 0 ? 'down' : ''}">${bp != null ? `${bp > 0 ? '+' : ''}${bp.toFixed(1)} bp` : ''}</td></tr>`;
      }).join('')}</table>
      <p class="muted">${t('cv.open')} ${t('cv.src', { s: esc(data.source) })}</p>`;
}

// ── Backtest card ──
const bt = {
    kind: 'ma',
    vals: Object.fromEntries(Object.entries(BACKTESTS).map(([k, v]) => [k, Object.fromEntries(v.params.map(([p, d]) => [p, d]))])),
    result: null,
    off: null,
    out: null,
    clear() {
        this.off?.();
        this.off = null;
        this.result?.remove?.();
        this.result = null;
    },
    mount(body) {
        const LBL = { fast: 'bt.fast', slow: 'bt.slow', len: 'bt.len', lo: 'bt.lo', hi: 'bt.hi' };
        const draw = () => {
            const def = BACKTESTS[this.kind];
            body.innerHTML = `<div class="form">
                <label>${t('bt.strategy')}<select id="bt-kind">${Object.keys(BACKTESTS).map((k) => `<option value="${k}" ${k === this.kind ? 'selected' : ''}>${t(`bt.${k}`)}</option>`).join('')}</select></label>
                ${def.params.map(([p, , min, max]) => `<label>${t(LBL[p])}<input type="number" id="bt-${p}" min="${min}" max="${max}" value="${this.vals[this.kind][p]}"></label>`).join('')}
                <button type="button" class="primary" id="bt-run">${this.result ? t('bt.again') : t('bt.run')}</button>
              </div><div id="bt-out" class="bt-out"></div><p class="muted">${t('bt.note')}</p>`;
            this.out = $('#bt-out', body);
            $('#bt-kind', body).onchange = (e) => {
                this.kind = e.target.value;
                draw();
            };
            for (const [p] of def.params) $(`#bt-${p}`, body).onchange = (e) => (this.vals[this.kind][p] = Math.round(+e.target.value) || this.vals[this.kind][p]);
            $('#bt-run', body).onclick = () => this.run();
        };
        draw();
        return { destroy: () => (this.out = null) };
    },
    async run() {
        const chart = ws.chart;
        this.clear();
        if (this.out) this.out.innerHTML = `<p class="muted">${t('bt.running')}</p>`;
        const r = await chart.runScript(BACKTESTS[this.kind].src(this.vals[this.kind]));
        if (!r.ok) {
            if (this.out) this.out.innerHTML = `<p class="err">${esc(t('bt.err', { e: r.error?.message || r.error }))}</p>`;
            return;
        }
        this.result = r;
        await this.show(r.run);
        this.off = r.onUpdate((run) => {
            if (run.cause !== 'tick' || run.complete) void this.show(run);
        });
    },
    async show(run) {
        if (!this.out || !run?.strategy) return;
        const s = run.strategy;
        const trades = await run.trades();
        const closed = trades.filter((x) => !x.open);
        const winRate = s.wins + s.losses ? (s.wins / (s.wins + s.losses)) * 100 : NaN;
        const pf = s.grossLoss ? s.grossProfit / Math.abs(s.grossLoss) : NaN;
        const cap = s.initialCapital || 100000;
        const net = ((s.equity - cap) / cap) * 100;
        const bh = run.plots?.bh;
        const dd = (s.maxDrawdown / cap) * 100;
        // equity curve from closed trades
        let eq = cap;
        const pts = [cap, ...closed.map((x) => (eq += x.pnl ?? 0))];
        const lo = Math.min(...pts), hi = Math.max(...pts), W = 320, H = 70;
        const curve = pts.length > 1 ? `<svg viewBox="0 0 ${W} ${H}" class="spark eq" preserveAspectRatio="none" role="img" aria-label="equity"><path d="${pts.map((v, i) => `${'ML'[+(i > 0)]}${((i / (pts.length - 1)) * W).toFixed(1)} ${(4 + (1 - (v - lo) / (hi - lo || 1)) * (H - 8)).toFixed(1)}`).join('')}" class="px"/></svg>` : '';
        const fmtD = (ms) => new Date(ms).toISOString().slice(0, 10);
        this.out.innerHTML = `<div class="kpis">
            <div><span>${t('bt.net')}</span><b class="${net >= 0 ? 'up' : 'down'}">${fmtPct(net)}</b></div>
            <div><span>${t('bt.bh')}</span><b class="${bh >= 0 ? 'up' : 'down'}">${bh != null ? fmtPct(bh) : '—'}</b></div>
            <div><span>${t('bt.trades')}</span><b>${closed.length}${s.position ? ` <small>+1 ${t('bt.open')}</small>` : ''}</b></div>
            <div><span>${t('bt.win')}</span><b>${Number.isFinite(winRate) ? winRate.toFixed(0) + '%' : '—'}</b></div>
            <div><span>${t('bt.pf')}</span><b>${Number.isFinite(pf) ? pf.toFixed(2) : '—'}</b></div>
            <div><span>${t('bt.dd')}</span><b class="down">${Number.isFinite(dd) ? '-' + dd.toFixed(1) + '%' : '—'}</b></div>
          </div>${curve}
          ${closed.length ? `<h4>${t('bt.recent')}</h4><table class="tt trades"><tr><th>${t('bt.entry')}</th><th>${t('bt.exit')}</th><th>${t('bt.pnl')}</th></tr>${closed.slice(-6).reverse().map((x) => `<tr><td>${fmtD(x.entry.time)} <em>${n(x.entry.price)}</em></td><td>${x.exit ? `${fmtD(x.exit.time)} <em>${n(x.exit.price)}</em>` : '—'}</td><td class="${(x.pnl ?? 0) >= 0 ? 'up' : 'down'}">${x.pnl != null ? fmtPct((x.pnl / (x.entry.price * x.qty)) * 100, 1) : '—'}</td></tr>`).join('')}</table>` : ''}`;
    },
};

// ── Pine editor card ──
function mountPine(body) {
    body.innerHTML = `<label class="row-lbl">${t('pine.tpl')}<select id="pine-tpl">${PINE_SCRIPTS.map((s, i) => `<option value="${i}">${esc(getLang() === 'zh' ? s.name : s.en)}</option>`).join('')}</select></label>
      <textarea id="pine-src" spellcheck="false" aria-label="Pine Script"></textarea>
      <div class="row-act"><button type="button" class="primary" id="pine-run">${t('pine.add')}</button><span class="kbd">Ctrl/⌘ + Enter</span></div>
      <pre id="pine-out" class="pine-out" hidden></pre><p class="muted">${t('pine.note')}</p>`;
    const tpl = $('#pine-tpl', body), src = $('#pine-src', body), out = $('#pine-out', body);
    src.value = store.get('ta-pine', '') || PINE_SCRIPTS[0].script;
    tpl.onchange = () => {
        src.value = PINE_SCRIPTS[+tpl.value].script;
        store.set('ta-pine', src.value);
    };
    src.oninput = () => store.set('ta-pine', src.value);
    const run = async () => {
        out.hidden = false;
        out.className = 'pine-out';
        out.textContent = t('pine.running');
        const r = await ws.chart.runIndicator(src.value);
        if (r.ok) {
            const title = /(?:indicator|strategy)\(\s*["']([^"']+)["']/.exec(src.value)?.[1] || r.handle.title;
            out.className = 'pine-out ok';
            out.textContent = t('pine.ok', { t: title });
        } else {
            out.className = 'pine-out err';
            out.textContent = t('pine.err', { e: r.error?.message || r.error });
        }
    };
    src.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Tab') {
            e.preventDefault();
            src.setRangeText('    ', src.selectionStart, src.selectionEnd, 'end');
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run();
    });
    $('#pine-run', body).onclick = run;
    return {};
}

// ── Replay card ──
function mountReplay(body) {
    body.innerHTML = `<div class="form">
        <label>${t('rp.from')}<select id="rp-back">${[50, 100, 250, 500].map((v) => `<option value="${v}" ${v === 100 ? 'selected' : ''}>${t('rp.bars', { n: v })}</option>`).join('')}<option value="date">${t('rp.date')}</option></select></label>
        <input type="date" id="rp-date" hidden aria-label="date">
        <label>${t('rp.speed')}<select id="rp-speed"><option value="250">4×</option><option value="500">2×</option><option value="1000" selected>1×</option><option value="2000">0.5×</option></select></label>
      </div>
      <div class="row-act"><button type="button" class="primary" id="rp-start">${t('rp.start')}</button><button type="button" id="rp-play" disabled>${t('rp.play')}</button><button type="button" id="rp-step" disabled>${t('rp.step')}</button><button type="button" id="rp-stop" disabled>${t('rp.stop')}</button></div>
      <p id="rp-info" class="muted mono">${t('rp.idle')}</p>`;
    const r = ws.replay;
    const back = $('#rp-back', body), date = $('#rp-date', body), speed = $('#rp-speed', body), play = $('#rp-play', body), step = $('#rp-step', body), stop = $('#rp-stop', body), info = $('#rp-info', body);
    back.onchange = () => (date.hidden = back.value !== 'date');
    const sync = () => {
        const s = r.state;
        play.disabled = step.disabled = stop.disabled = !s.active;
        play.textContent = s.playing ? t('rp.pause') : t('rp.play');
        info.textContent = s.active ? t('rp.state', { t: s.cursorTime ? new Date(s.cursorTime).toLocaleString(getLang() === 'zh' ? 'zh-CN' : 'en-US', { hour12: false }) : '—', n: s.remaining ?? '—' }) : t('rp.idle');
    };
    $('#rp-start', body).onclick = async () => {
        let from;
        if (back.value === 'date') {
            if (!date.value) return toast(t('rp.pickDate'));
            from = new Date(`${date.value}T00:00:00`).getTime();
        } else {
            const ctx = current();
            const nBack = +back.value;
            const bars = await ctx.chart.data.providerInstance(ctx.provider).getBars(ctx.ticker, ctx.tf, { limit: nBack + 5 }, { quiet: true }).catch(() => []);
            from = bars.length > nBack ? bars[bars.length - 1 - nBack].time : (r.bounds?.first ?? Date.now() - nBack * TF_MS(ctx.tf));
        }
        await r.start({ from });
        sync();
    };
    play.onclick = () => {
        r.state.playing ? r.pause() : r.play(+speed.value);
        sync();
    };
    speed.onchange = () => r.state.playing && r.play(+speed.value);
    step.onclick = () => {
        r.step();
        sync();
    };
    stop.onclick = () => {
        r.stop();
        sync();
    };
    const offs = [r.on('replay:step', sync), r.on('replay:end', sync)];
    sync();
    return { destroy: () => offs.forEach((f) => typeof f === 'function' && f()) };
}

// ── multi-timeframe view ──
function setMtf(on) {
    if (!on) {
        ws.setLayout('1');
        return;
    }
    const sym = ws.active.symbol;
    const tf = ws.active.timeframe;
    ws.setLayout('4');
    const tfs = /^\d+$/.test(tf) && +tf < 60 ? [tf, '60', 'D', 'W'] : ['60', '240', 'D', 'W'];
    ws.cells().forEach((c, i) => {
        if (c.symbol !== sym) c.setSymbol(sym);
        c.setTimeframe(tfs[i] || 'D');
    });
    ws.sync.set('symbol', true);
    ws.sync.set('crosshair', true);
    toast(t('mtf.on'));
}

// ───────────────────────── header controls ─────────────────────────

function renderStatic() {
    root.lang = getLang() === 'zh' ? 'zh-CN' : 'en';
    for (const el of $$('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of $$('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
    $('#colors').textContent = t(colorMode === 'cn' ? 'nav.colors.cn' : 'nav.colors.intl');
}

$('#lang').onclick = () => {
    setLang(getLang() === 'zh' ? 'en' : 'zh');
    setNumberLang(getLang());
    store.set('ta-lang', getLang());
    renderStatic();
    renderSide();
    remountCards();
    renderQuote();
    renderFooter();
    for (const chart of allCharts()) applyMarks(chart);
    syncUrl();
};
$('#theme').onclick = () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    store.set('ta-theme', theme);
    root.dataset.theme = theme;
    ws.setTheme(theme);
};
$('#colors').onclick = () => {
    store.set('ta-colors', colorMode === 'cn' ? 'intl' : 'cn');
    location.reload();
};
$('#share').onclick = async () => {
    syncUrl();
    try {
        await navigator.clipboard.writeText(location.href);
        toast(t('nav.shared'), 'success');
    } catch {
        prompt?.('', location.href);
    }
};
$('#toggle-side').onclick = () => document.body.classList.toggle('side-open');

let health = {};
function renderFooter() {
    const src = health.mock ? t('mock') : health.fmp ? 'FMP · Yahoo · Binance' : health.ok ? 'Yahoo · Binance' : t('offline');
    $('#foot').innerHTML = `<span>${t('foot.src', { s: src })} · ${t('foot.delay')}</span>
      <span><a href="https://luxalgo.com/vela" target="_blank" rel="noopener">${t('foot.vela')}</a>${health.sourceUrl ? ` · <a href="${esc(health.sourceUrl)}" target="_blank" rel="noopener">${t('foot.code')}</a>` : ''}</span>
      <span>${t('c.disclaimer')}</span>`;
}
fetch('/api/health')
    .then((r) => r.json())
    .then((h) => {
        health = h;
        renderFooter();
    })
    .catch(() => renderFooter());

// ───────────────────────── URL state ─────────────────────────

function syncUrl() {
    const ctx = current();
    const p = new URLSearchParams();
    if (ctx.symbol) p.set('s', ctx.symbol);
    if (ctx.tf) p.set('tf', ctx.tf);
    p.set('tb', [...enabled].join(','));
    p.set('lang', getLang());
    history.replaceState(null, '', `${location.pathname}?${p}`);
}

// ───────────────────────── wiring ─────────────────────────

const wired = new WeakSet();
function wireCell(cell) {
    const chart = cell?.chart;
    if (!chart || wired.has(chart)) return;
    wired.add(chart);
    void applyMarks(chart);
    chart.ready().then(() => {
        for (const id of enabled) if (TB[id]?.natives.length) addNatives(chart, id);
    });
    chart.on('market:changed', () => {
        if (ws.active?.chart !== chart) return;
        renderQuote();
        refresh(true);
        syncUrl();
        if (mounted.has('events')) mounted.get('events').update?.(state);
        if (enabled.has('backtest') && bt.result) void bt.run();
    });
}
for (const c of ws.cells()) wireCell(c);
ws.on('cell:created', ({ id }) => wireCell(ws.cell(id)));
ws.on('cell:active', () => {
    wireCell(ws.active);
    renderQuote();
    refresh(true);
});
ws.on('layout:changed', () => {
    const multi = ws.cells().length > 1;
    if (multi !== enabled.has('mtf')) {
        multi ? enabled.add('mtf') : enabled.delete('mtf');
        saveTb();
        renderSide();
        renderCards();
    }
});

// boot
renderStatic();
renderSide();
renderCards();
renderQuote();
renderFooter();
(async () => {
    await ws.chart.data.ready();
    const s = params.get('s');
    if (s && s !== ws.active.symbol) {
        const bare = s.replace(/^[^:]+:/, '');
        if (/^binance:/i.test(s)) ws.active.setSymbol(s);
        else if (ws.chart.data.resolve(s)) ws.active.setSymbol(s);
        else await openItem(norm({ symbol: bare, direct: true, source: 'market' }));
    }
    if (enabled.has('mtf') && ws.cells().length === 1) setMtf(true);
    renderQuote();
    refresh(true);
    syncUrl();
})();

// close the mobile toolbox drawer when tapping outside it
document.addEventListener('click', (e) => {
    if (document.body.classList.contains('side-open') && !e.target.closest('.side') && !e.target.closest('#toggle-side')) document.body.classList.remove('side-open');
});
