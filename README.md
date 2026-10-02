# TA Desk · 技术分析台

An interactive technical-analysis website built on [LuxAlgo Vela™](https://github.com/LuxAlgo/Vela). Visitors type any stock, future or US Treasury, then switch technical toolboxes on and off. Each toolbox draws its indicators on the chart and adds an analysis card. Chinese / English toggle.

一个基于 Vela 的互动技术分析网站：输入股票、期货或美债，在左侧打开/关闭技术工具箱，每个工具会画到图上并给出分析卡片。中英文可切换。

---

## 1. Put it online (Render, free) · 上线

The site is one Node.js server with no dependencies to install (the front end is prebuilt in `public/app.js`).

1. **Create a GitHub repository** and upload everything in this folder.
   新建一个 GitHub 仓库，把本文件夹全部上传。
   - Do not upload a file containing your FMP key. 不要上传任何含 key 的文件。
2. On [render.com](https://render.com): **New → Blueprint**, pick the repository. Render reads `render.yaml` and creates the web service.
   在 Render 选 New → Blueprint，选择这个仓库。
3. When it asks for environment variables, fill in:
   部署时填写环境变量：
   - `FMP_API_KEY` = your FMP key 你的 FMP key
   - `SOURCE_URL` = your GitHub repository link 你的仓库地址（见第 5 节许可说明）
4. Deploy. Your site is at `https://<name>.onrender.com`. Share that link.
   部署完成后把 `https://<名字>.onrender.com` 分享给别人即可。

Notes 注意:
- Render's free plan sleeps after ~15 minutes without visitors; the first visit after that takes 30–60 s to wake. A paid instance ($7/month) stays awake.
  免费方案 15 分钟无人访问会休眠，下次打开要等 30–60 秒。
- Any Node 18+ host works the same way (Railway, Fly.io, a VPS): start command `node server.mjs`, set `FMP_API_KEY`. The server listens on `PORT`.
  其他平台同理：启动命令 `node server.mjs`，设置 `FMP_API_KEY`。

## 2. Run it on your own computer · 本地运行

Needs [Node.js 18+](https://nodejs.org).

```bash
FMP_API_KEY=your_key node server.mjs        # macOS / Linux
set FMP_API_KEY=your_key && node server.mjs # Windows (cmd)
```

Or copy `config.example.json` to `config.json`, put the key in it, and run `node server.mjs` (or double-click `start.command` / `start.bat`). Open <http://localhost:8686>. `config.json` is git-ignored.

Demo without internet 离线演示: `MOCK=1 node server.mjs`.

## 3. What visitors can do · 功能

**Search 搜索** — Chinese or English names and tickers: 腾讯, Apple, 黄金, gold, ES=F, 十年期美债, ^TNX. Click the empty box to browse by market.

**Toolboxes 工具箱** (left sidebar; on phones tap 工具箱 / Toolbox):

| Toolbox | On the chart | Analysis card |
|---|---|---|
| Overview 总览评级 | — | Buy/sell rating gauge (moving averages + oscillators), trend structure, returns |
| Events 事件 | Earnings / dividend / split markers | Next and last earnings, EPS vs estimate, latest dividend |
| Treasury curve 美债曲线 | — | 1M–30Y curve vs 1/6/12 months ago, 10Y−2Y and 10Y−3M spreads |
| Trend 趋势 | MA 20/50, SuperTrend, ADX | MA table with buy/sell votes |
| Momentum 动量 | RSI, MACD, Stochastic | Oscillator table |
| Volatility 波动 | Bollinger, ATR, historical vol | ATR, HV, %B, band-width rank, mini chart |
| Volume 量能 | OBV, MFI, volume profile | Relative volume, OBV trend |
| Key levels 关键价位 | Pivots, Donchian | Price ladder: pivots, swing support/resistance, 20/55/52-wk highs and lows |
| Signals 信号与形态 | ZigZag, fractals, SAR | Golden/death cross, MACD cross, breakouts, gaps, volume spikes, divergence |
| Backtest 策略回测 | Entry/exit markers | MA cross, Donchian, RSI, MACD strategies: net profit vs buy & hold, win rate, profit factor, drawdown, trades |
| Pine editor | Your script | Write Pine v5/v6 indicators, strategies, alerts |
| Bar replay K线回放 | Replays bar by bar | Start N bars back or from a date, play / step / speed |
| Multi-timeframe 多周期 | 4 linked charts | 1h / 4h / daily / weekly |

The chart itself keeps every Vela tool: 70+ indicators (Indicators button), drawing tools, chart types, layouts, alerts, object tree, data window, screenshots, time zones. Settings and drawings are saved in each visitor's browser.

**Share 分享** — "Copy link" copies a URL with the symbol, timeframe, toolboxes and language, e.g. `/?s=NASDAQ:NVDA&tf=D&tb=overview,trend,backtest&lang=en`.

## 4. Data sources · 数据来源

| Instrument | Source |
|---|---|
| US stocks, US ETFs, US indices | FMP (real-time quote, daily, 1-min to 4-hour) → Yahoo if FMP fails |
| Futures (ES, NQ, CL, GC, SI, HG, NG, ZN, ZB …) | FMP → Yahoo |
| Treasury yields (^IRX, 2YY=F, ^FVX, ^TNX, ^TYX) | Yahoo; daily falls back to FMP Treasury rates |
| Yield curve | FMP Treasury rates (1M–30Y) → Yahoo |
| Hong Kong, China A-shares, FX | Yahoo (your FMP plan returns 402 for these) |
| Crypto | Binance, live |
| Earnings / dividends / splits | FMP |

Protections built into the server 服务器保护:
- `FMP_MAX_PER_MIN` (default 250): above this many FMP calls per minute the server switches to Yahoo, so visitors cannot burn your quota. Set it to your plan's limit.
- `RATE_LIMIT_PER_MIN` (default 240): requests per visitor IP per minute.
- Responses are cached (8–15 s for live data, 30 min for history), so many visitors on the same symbol share one upstream call.

Known limits 已知限制: Yahoo sometimes rate-limits cloud-server IPs. When that happens, Hong Kong / A-share / FX symbols and intraday yields may fail to load; US stocks, futures and daily yields keep working through FMP. Some Yahoo quotes are delayed ~15 minutes. Trading calendars use weekdays and regular sessions, without holidays.

## 5. Licensing · 许可

- **Vela™** is Apache-2.0 with an attribution requirement: keep the Vela logo on the chart (or the "Charts by Vela™" link in the footer). See `third_party/vela-NOTICE.txt`.
- **@luxalgo/vela-pinets and PineTS** (the Pine engine) are **AGPL-3.0**. Running this site for other people means you must offer them its source code: put the code in a public repository and set `SOURCE_URL`, which adds a "Source" link to the footer.
- The analysis is for technical-analysis purposes only and is not investment advice.

## 6. Development · 开发

```bash
npm install
npm run build   # rebuild public/app.js from src/
npm run demo    # demo data
```

| File | Contents |
|---|---|
| `server.mjs` | Static files, FMP/Yahoo proxy, timeframe aggregation, caching, rate limits |
| `src/app.js` | Search, quote strip, toolboxes, cards, backtest, Pine, replay, URL state |
| `src/provider.js` | Vela `DataProvider` (bars, live polling, symbol info, market calendar) |
| `src/analysis.js` | Indicator math and rating |
| `src/i18n.js` | Chinese / English strings |
| `src/symbols.js` | Preset instruments with Chinese and English names |
| `src/pine.js` | Pine templates and backtest strategies |

`ws` in the browser console is the live `VelaWorkspace`.
