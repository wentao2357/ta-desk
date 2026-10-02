// Pine Script 示例：放进 Vela 的指标清单（Indicators 弹窗里可勾选），也是 Pine 编辑器的模板。
// 由 @luxalgo/vela-pinets（PineTS 引擎，Web Worker 中运行）执行。

export const PINE_SCRIPTS = [
    {
        name: 'EMA 带 8/21/55', en: 'EMA ribbon 8/21/55',
        script: `//@version=5
indicator("EMA 带 8/21/55", overlay=true)
fastLen = input.int(8, "快线")
midLen = input.int(21, "中线")
slowLen = input.int(55, "慢线")
plot(ta.ema(close, fastLen), "EMA 快", color=color.new(color.teal, 0), linewidth=1)
plot(ta.ema(close, midLen), "EMA 中", color=color.new(color.orange, 0), linewidth=1)
plot(ta.ema(close, slowLen), "EMA 慢", color=color.new(color.red, 0), linewidth=2)`,
    },
    {
        name: '均线交叉策略（回测）', en: 'MA crossover strategy',
        script: `//@version=5
strategy("均线交叉策略", overlay=true, initial_capital=100000, default_qty_type=strategy.percent_of_equity, default_qty_value=100)
fastLen = input.int(20, "快线")
slowLen = input.int(50, "慢线")
fast = ta.sma(close, fastLen)
slow = ta.sma(close, slowLen)
plot(fast, "快线", color=color.aqua)
plot(slow, "慢线", color=color.fuchsia)
if ta.crossover(fast, slow)
    strategy.entry("做多", strategy.long)
if ta.crossunder(fast, slow)
    strategy.close("做多")`,
    },
    {
        name: '唐奇安通道突破', en: 'Donchian breakout',
        script: `//@version=5
indicator("唐奇安通道突破", overlay=true)
len = input.int(20, "周期")
upper = ta.highest(high, len)[1]
lower = ta.lowest(low, len)[1]
plot(upper, "上轨", color=color.green)
plot(lower, "下轨", color=color.red)
plotshape(close > upper, "向上突破", shape.triangleup, location.belowbar, color.green)
plotshape(close < lower, "向下突破", shape.triangledown, location.abovebar, color.red)`,
    },
    {
        name: 'RSI 超买超卖提醒', en: 'RSI overbought/oversold alerts',
        script: `//@version=5
indicator("RSI 超买超卖提醒")
len = input.int(14, "长度")
hi = input.int(70, "超买线")
lo = input.int(30, "超卖线")
r = ta.rsi(close, len)
plot(r, "RSI", color=color.purple)
hline(hi, "超买", color=color.red)
hline(lo, "超卖", color=color.green)
if ta.crossover(r, hi)
    alert("RSI 上穿超买线", alert.freq_once_per_bar_close)
if ta.crossunder(r, lo)
    alert("RSI 下穿超卖线", alert.freq_once_per_bar_close)`,
    },
    {
        name: '成交量异动', en: 'Volume spikes',
        script: `//@version=5
indicator("成交量异动")
len = input.int(20, "均量周期")
mult = input.float(2.0, "放量倍数")
avg = ta.sma(volume, len)
spike = volume > avg * mult
plot(volume, "成交量", style=plot.style_columns, color=spike ? color.orange : color.gray)
plot(avg, "均量", color=color.blue)`,
    },
    {
        name: '价格突破提醒（自定价位）', en: 'Price level alert',
        script: `//@version=5
indicator("价格突破提醒", overlay=true)
level = input.float(0.0, "提醒价位（0 = 用 20 日高点）")
ref = level > 0 ? level : ta.highest(high, 20)[1]
plot(ref, "提醒价位", color=color.orange, linewidth=2)
if ta.crossover(close, ref)
    alert("价格向上突破提醒价位", alert.freq_once_per_bar_close)
if ta.crossunder(close, ref)
    alert("价格向下跌破提醒价位", alert.freq_once_per_bar_close)`,
    },
];

export const PINE_MANIFEST = PINE_SCRIPTS.map((s) => ({ name: `${s.en} · ${s.name}`, script: s.script, language: 'pine', enabled: false }));

// 回测用的参数化策略（全仓做多、无手续费）。plot "bh" 是同期买入持有收益，用于对比。
const HEAD = (title) => `//@version=5
strategy("${title}", overlay=true, initial_capital=100000, default_qty_type=strategy.percent_of_equity, default_qty_value=100)
var float firstClose = na
if na(firstClose)
    firstClose := close
plot((close / firstClose - 1) * 100, "bh", display=display.none)
`;

export const BACKTESTS = {
    ma: {
        params: [['fast', 20, 2, 400], ['slow', 50, 3, 600]],
        src: (p) => HEAD(`MA ${p.fast}/${p.slow}`) + `fast = ta.sma(close, ${p.fast})
slow = ta.sma(close, ${p.slow})
plot(fast, "fast", color=color.aqua)
plot(slow, "slow", color=color.fuchsia)
if ta.crossover(fast, slow)
    strategy.entry("L", strategy.long)
if ta.crossunder(fast, slow)
    strategy.close("L")`,
    },
    donchian: {
        params: [['len', 20, 2, 400]],
        src: (p) => HEAD(`Donchian ${p.len}`) + `up = ta.highest(high, ${p.len})[1]
dn = ta.lowest(low, ${Math.max(2, Math.round(p.len / 2))})[1]
plot(up, "upper", color=color.green)
plot(dn, "exit", color=color.red)
if close > up
    strategy.entry("L", strategy.long)
if close < dn
    strategy.close("L")`,
    },
    rsi: {
        params: [['len', 14, 2, 100], ['lo', 30, 1, 50], ['hi', 70, 50, 99]],
        src: (p) => HEAD(`RSI ${p.len} ${p.lo}/${p.hi}`) + `r = ta.rsi(close, ${p.len})
if ta.crossover(r, ${p.lo})
    strategy.entry("L", strategy.long)
if ta.crossunder(r, ${p.hi})
    strategy.close("L")`,
    },
    macd: {
        params: [['fast', 12, 2, 100], ['slow', 26, 3, 200]],
        src: (p) => HEAD(`MACD ${p.fast}/${p.slow}`) + `[m, s, h] = ta.macd(close, ${p.fast}, ${p.slow}, 9)
if ta.crossover(m, s)
    strategy.entry("L", strategy.long)
if ta.crossunder(m, s)
    strategy.close("L")`,
    },
};
