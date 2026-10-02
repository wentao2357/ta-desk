// Preset instruments — [ticker, listing prefix, Vela type, 中文名, English name, extra search keywords]
// Vela's own symbol search (type on the chart) indexes these; the header search also queries FMP / Yahoo live.

export const GROUPS = [
    {
        id: 'us',
        zh: '美股',
        en: 'US stocks',
        rows: [
            ['AAPL', 'NASDAQ', 'stock', '苹果', 'Apple'],
            ['MSFT', 'NASDAQ', 'stock', '微软', 'Microsoft'],
            ['NVDA', 'NASDAQ', 'stock', '英伟达', 'NVIDIA'],
            ['AMZN', 'NASDAQ', 'stock', '亚马逊', 'Amazon'],
            ['GOOGL', 'NASDAQ', 'stock', '谷歌', 'Alphabet'],
            ['META', 'NASDAQ', 'stock', 'Meta', 'Meta Platforms', '脸书 facebook'],
            ['TSLA', 'NASDAQ', 'stock', '特斯拉', 'Tesla'],
            ['AVGO', 'NASDAQ', 'stock', '博通', 'Broadcom'],
            ['AMD', 'NASDAQ', 'stock', '超威半导体', 'AMD'],
            ['NFLX', 'NASDAQ', 'stock', '奈飞', 'Netflix'],
            ['COST', 'NASDAQ', 'stock', '好市多', 'Costco'],
            ['PLTR', 'NASDAQ', 'stock', 'Palantir', 'Palantir'],
            ['INTC', 'NASDAQ', 'stock', '英特尔', 'Intel'],
            ['COIN', 'NASDAQ', 'stock', 'Coinbase', 'Coinbase'],
            ['MSTR', 'NASDAQ', 'stock', '微策略', 'Strategy (MicroStrategy)'],
            ['PDD', 'NASDAQ', 'stock', '拼多多', 'PDD Holdings'],
            ['BRK-B', 'NYSE', 'stock', '伯克希尔', 'Berkshire Hathaway'],
            ['JPM', 'NYSE', 'stock', '摩根大通', 'JPMorgan Chase'],
            ['V', 'NYSE', 'stock', '维萨', 'Visa'],
            ['XOM', 'NYSE', 'stock', '埃克森美孚', 'Exxon Mobil'],
            ['LLY', 'NYSE', 'stock', '礼来', 'Eli Lilly'],
            ['UNH', 'NYSE', 'stock', '联合健康', 'UnitedHealth'],
            ['WMT', 'NYSE', 'stock', '沃尔玛', 'Walmart'],
            ['KO', 'NYSE', 'stock', '可口可乐', 'Coca-Cola'],
            ['DIS', 'NYSE', 'stock', '迪士尼', 'Disney'],
            ['ORCL', 'NYSE', 'stock', '甲骨文', 'Oracle'],
            ['TSM', 'NYSE', 'stock', '台积电', 'TSMC ADR'],
            ['BABA', 'NYSE', 'stock', '阿里巴巴', 'Alibaba ADR'],
        ],
    },
    {
        id: 'etf',
        zh: 'ETF',
        en: 'ETFs',
        rows: [
            ['SPY', 'NYSEARCA', 'etf', '标普500 ETF', 'SPDR S&P 500'],
            ['QQQ', 'NASDAQ', 'etf', '纳指100 ETF', 'Invesco QQQ'],
            ['IWM', 'NYSEARCA', 'etf', '罗素2000 ETF', 'iShares Russell 2000'],
            ['DIA', 'NYSEARCA', 'etf', '道指 ETF', 'SPDR Dow Jones'],
            ['SMH', 'NASDAQ', 'etf', '半导体 ETF', 'VanEck Semiconductor'],
            ['XLF', 'NYSEARCA', 'etf', '金融板块 ETF', 'Financial Select SPDR'],
            ['XLE', 'NYSEARCA', 'etf', '能源板块 ETF', 'Energy Select SPDR'],
            ['XLK', 'NYSEARCA', 'etf', '科技板块 ETF', 'Technology Select SPDR'],
            ['GLD', 'NYSEARCA', 'etf', '黄金 ETF', 'SPDR Gold'],
            ['SLV', 'NYSEARCA', 'etf', '白银 ETF', 'iShares Silver'],
            ['USO', 'NYSEARCA', 'etf', '原油 ETF', 'United States Oil'],
            ['KWEB', 'NYSEARCA', 'etf', '中概互联 ETF', 'KraneShares China Internet'],
            ['FXI', 'NYSEARCA', 'etf', '中国大盘 ETF', 'iShares China Large-Cap'],
            ['2800.HK', 'HKEX', 'etf', '盈富基金', 'Tracker Fund of Hong Kong'],
        ],
    },
    {
        id: 'idx',
        zh: '指数',
        en: 'Indices',
        rows: [
            ['^GSPC', 'SP', 'index', '标普500指数', 'S&P 500'],
            ['^IXIC', 'NASDAQ', 'index', '纳斯达克综合指数', 'Nasdaq Composite'],
            ['^NDX', 'NASDAQ', 'index', '纳斯达克100指数', 'Nasdaq 100'],
            ['^DJI', 'DJ', 'index', '道琼斯工业指数', 'Dow Jones Industrial'],
            ['^RUT', 'RUSSELL', 'index', '罗素2000指数', 'Russell 2000'],
            ['^VIX', 'CBOE', 'index', '恐慌指数', 'CBOE Volatility (VIX)'],
            ['DX-Y.NYB', 'ICEUS', 'index', '美元指数', 'US Dollar Index (DXY)'],
            ['^HSI', 'HKEX', 'index', '恒生指数', 'Hang Seng'],
            ['^HSTECH', 'HKEX', 'index', '恒生科技指数', 'Hang Seng Tech'],
            ['000001.SS', 'SSE', 'index', '上证指数', 'SSE Composite', '上证综指'],
            ['399001.SZ', 'SZSE', 'index', '深证成指', 'SZSE Component'],
            ['000300.SS', 'SSE', 'index', '沪深300', 'CSI 300'],
            ['^N225', 'TSE', 'index', '日经225', 'Nikkei 225'],
            ['^GDAXI', 'XETR', 'index', '德国DAX', 'DAX'],
            ['^FTSE', 'LSE', 'index', '富时100', 'FTSE 100'],
        ],
    },
    {
        id: 'hk',
        zh: '港股',
        en: 'Hong Kong',
        rows: [
            ['0700.HK', 'HKEX', 'stock', '腾讯控股', 'Tencent', '腾讯'],
            ['9988.HK', 'HKEX', 'stock', '阿里巴巴', 'Alibaba'],
            ['3690.HK', 'HKEX', 'stock', '美团', 'Meituan'],
            ['1810.HK', 'HKEX', 'stock', '小米集团', 'Xiaomi', '小米'],
            ['1211.HK', 'HKEX', 'stock', '比亚迪股份', 'BYD', '比亚迪'],
            ['9618.HK', 'HKEX', 'stock', '京东集团', 'JD.com', '京东'],
            ['1024.HK', 'HKEX', 'stock', '快手', 'Kuaishou'],
            ['0005.HK', 'HKEX', 'stock', '汇丰控股', 'HSBC', '汇丰'],
            ['0941.HK', 'HKEX', 'stock', '中国移动', 'China Mobile'],
            ['2318.HK', 'HKEX', 'stock', '中国平安', 'Ping An'],
            ['0388.HK', 'HKEX', 'stock', '香港交易所', 'HKEX', '港交所'],
            ['0981.HK', 'HKEX', 'stock', '中芯国际', 'SMIC'],
        ],
    },
    {
        id: 'cn',
        zh: 'A股',
        en: 'China A',
        rows: [
            ['600519.SS', 'SSE', 'stock', '贵州茅台', 'Kweichow Moutai', '茅台'],
            ['601318.SS', 'SSE', 'stock', '中国平安', 'Ping An (A)'],
            ['600036.SS', 'SSE', 'stock', '招商银行', 'China Merchants Bank'],
            ['601398.SS', 'SSE', 'stock', '工商银行', 'ICBC'],
            ['600900.SS', 'SSE', 'stock', '长江电力', 'China Yangtze Power'],
            ['688981.SS', 'SSE', 'stock', '中芯国际 A', 'SMIC (A)'],
            ['000858.SZ', 'SZSE', 'stock', '五粮液', 'Wuliangye'],
            ['300750.SZ', 'SZSE', 'stock', '宁德时代', 'CATL'],
            ['002594.SZ', 'SZSE', 'stock', '比亚迪 A', 'BYD (A)'],
            ['000333.SZ', 'SZSE', 'stock', '美的集团', 'Midea'],
        ],
    },
    {
        id: 'fut',
        zh: '期货',
        en: 'Futures',
        rows: [
            ['ES=F', 'CME', 'futures', '标普500期货', 'E-mini S&P 500'],
            ['NQ=F', 'CME', 'futures', '纳指100期货', 'E-mini Nasdaq 100'],
            ['YM=F', 'CBOT', 'futures', '道指期货', 'E-mini Dow'],
            ['RTY=F', 'CME', 'futures', '罗素2000期货', 'E-mini Russell 2000'],
            ['CL=F', 'NYMEX', 'futures', 'WTI原油期货', 'WTI Crude Oil', '原油'],
            ['BZ=F', 'NYMEX', 'futures', '布伦特原油期货', 'Brent Crude'],
            ['NG=F', 'NYMEX', 'futures', '天然气期货', 'Natural Gas'],
            ['GC=F', 'COMEX', 'futures', '黄金期货', 'Gold', '黄金'],
            ['SI=F', 'COMEX', 'futures', '白银期货', 'Silver', '白银'],
            ['HG=F', 'COMEX', 'futures', '铜期货', 'Copper', '铜'],
            ['PL=F', 'NYMEX', 'futures', '铂金期货', 'Platinum'],
            ['ZC=F', 'CBOT', 'futures', '玉米期货', 'Corn'],
            ['ZS=F', 'CBOT', 'futures', '大豆期货', 'Soybeans'],
            ['KC=F', 'ICEUS', 'futures', '咖啡期货', 'Coffee'],
            ['CC=F', 'ICEUS', 'futures', '可可期货', 'Cocoa'],
            ['6E=F', 'CME', 'futures', '欧元期货', 'Euro FX'],
            ['6J=F', 'CME', 'futures', '日元期货', 'Japanese Yen'],
            ['BTC=F', 'CME', 'futures', '比特币期货', 'CME Bitcoin'],
        ],
    },
    {
        id: 'ust',
        zh: '美债',
        en: 'Treasuries',
        rows: [
            ['^IRX', 'CBOE', 'bond', '13周美债收益率', '13-Week T-Bill Yield', '3个月'],
            ['2YY=F', 'CBOT', 'bond', '2年期美债收益率', '2-Year Yield'],
            ['^FVX', 'CBOE', 'bond', '5年期美债收益率', '5-Year Yield'],
            ['^TNX', 'CBOE', 'bond', '10年期美债收益率', '10-Year Yield', '十年期美债 美债'],
            ['^TYX', 'CBOE', 'bond', '30年期美债收益率', '30-Year Yield'],
            ['ZT=F', 'CBOT', 'futures', '2年期美债期货', '2-Year T-Note Futures'],
            ['ZF=F', 'CBOT', 'futures', '5年期美债期货', '5-Year T-Note Futures'],
            ['ZN=F', 'CBOT', 'futures', '10年期美债期货', '10-Year T-Note Futures'],
            ['ZB=F', 'CBOT', 'futures', '30年期美债期货', '30-Year T-Bond Futures'],
            ['ZQ=F', 'CBOT', 'futures', '联邦基金期货', '30-Day Fed Funds Futures'],
            ['TLT', 'NASDAQ', 'etf', '20年+美债 ETF', 'iShares 20+ Year Treasury'],
            ['IEF', 'NASDAQ', 'etf', '7-10年美债 ETF', 'iShares 7-10 Year Treasury'],
            ['SHY', 'NASDAQ', 'etf', '1-3年美债 ETF', 'iShares 1-3 Year Treasury'],
            ['TIP', 'NYSEARCA', 'etf', '通胀保值美债 ETF', 'iShares TIPS'],
        ],
    },
    {
        id: 'fx',
        zh: '外汇',
        en: 'FX',
        rows: [
            ['EURUSD=X', 'FX', 'forex', '欧元/美元', 'EUR/USD'],
            ['JPY=X', 'FX', 'forex', '美元/日元', 'USD/JPY'],
            ['GBPUSD=X', 'FX', 'forex', '英镑/美元', 'GBP/USD'],
            ['CNY=X', 'FX', 'forex', '美元/人民币', 'USD/CNY'],
            ['CNH=X', 'FX', 'forex', '美元/离岸人民币', 'USD/CNH'],
            ['HKD=X', 'FX', 'forex', '美元/港币', 'USD/HKD'],
            ['AUDUSD=X', 'FX', 'forex', '澳元/美元', 'AUD/USD'],
        ],
    },
    {
        id: 'crypto',
        zh: '加密',
        en: 'Crypto',
        rows: [
            ['BTCUSDT', null, 'crypto', '比特币', 'Bitcoin'],
            ['ETHUSDT', null, 'crypto', '以太坊', 'Ethereum'],
            ['SOLUSDT', null, 'crypto', 'Solana', 'Solana'],
        ],
    },
];

const EXCH_PREFIX = {
    NMS: 'NASDAQ', NGM: 'NASDAQ', NCM: 'NASDAQ', NAS: 'NASDAQ', NIM: 'NASDAQ',
    NYQ: 'NYSE', NYS: 'NYSE', ASE: 'AMEX', PCX: 'NYSEARCA', BTS: 'CBOE', OBB: 'OTC', PNK: 'OTC', OQB: 'OTC', OQX: 'OTC',
    HKG: 'HKEX', SHH: 'SSE', SHZ: 'SZSE', TYO: 'TSE', JPX: 'TSE', OSA: 'OSE', KSC: 'KRX', KOE: 'KOSDAQ', TAI: 'TWSE', TWO: 'TPEX',
    SES: 'SGX', ASX: 'ASX', LSE: 'LSE', IOB: 'LSE', GER: 'XETR', FRA: 'FWB', PAR: 'EURONEXT', AMS: 'EURONEXT', MIL: 'MIL', TOR: 'TSX', NSI: 'NSE', BSE: 'BSE',
    CME: 'CME', CBT: 'CBOT', NYM: 'NYMEX', CMX: 'COMEX', NYB: 'ICEUS', CBF: 'CBOE', CCY: 'FX', CCC: 'CRYPTO',
    SNP: 'SP', DJI: 'DJ', WCB: 'CBOE', CGI: 'CBOE', CXI: 'CBOE',
};

export function velaType(quoteType, symbol = '') {
    switch (String(quoteType || '').toUpperCase()) {
        case 'EQUITY': return 'stock';
        case 'ETF': return 'etf';
        case 'MUTUALFUND': return 'fund';
        case 'FUTURE': return 'futures';
        case 'CURRENCY': return 'forex';
        case 'CRYPTOCURRENCY': return 'crypto';
        case 'INDEX': return /^\^(IRX|FVX|TNX|TYX)$/.test(symbol) ? 'bond' : 'index';
        default: return /=F$/.test(symbol) ? 'futures' : /=X$/.test(symbol) ? 'forex' : symbol.startsWith('^') ? 'index' : 'stock';
    }
}

export function prefixFor(exch, symbol = '') {
    if (exch && EXCH_PREFIX[exch]) return EXCH_PREFIX[exch];
    if (/=X$/.test(symbol)) return 'FX';
    if (/\.HK$/.test(symbol)) return 'HKEX';
    if (/\.SS$/.test(symbol)) return 'SSE';
    if (/\.SZ$/.test(symbol)) return 'SZSE';
    if (exch) return String(exch).toUpperCase().replace(/[^A-Z0-9_]/g, '') || undefined;
    return undefined;
}

const ROWS = GROUPS.flatMap((g) => g.rows.map(([ticker, prefix, type, zh, en, kw]) => ({ ticker, prefix, type, zh, en, kw: kw || '', group: g.id })));

export function presetRow(ticker) {
    return ROWS.find((r) => r.ticker.toUpperCase() === String(ticker).toUpperCase());
}

/** Vela SymbolDescriptors for the market provider (description searchable in both languages). */
export function presetDescriptors() {
    const seen = new Set();
    return ROWS.filter((r) => r.group !== 'crypto' && !seen.has(r.ticker) && seen.add(r.ticker)).map((r) => ({
        ticker: r.ticker,
        prefix: r.prefix,
        type: r.type,
        description: r.en === r.zh ? r.en : `${r.en} · ${r.zh}`,
    }));
}

/** Instant local fuzzy match on ticker / Chinese / English names / keywords. */
export function localMatches(query, limit = 8) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored = [];
    const seen = new Set();
    for (const r of ROWS) {
        if (seen.has(r.ticker)) continue;
        const t = r.ticker.toLowerCase();
        const hay = `${r.zh} ${r.en} ${r.kw}`.toLowerCase();
        let score = -1;
        if (t === q) score = 100;
        else if (t.startsWith(q)) score = 80;
        else if (hay.split(/[\s·()/]+/).some((w) => w === q)) score = 70;
        else if (hay.includes(q)) score = 50;
        else if (t.includes(q)) score = 40;
        if (score < 0) continue;
        seen.add(r.ticker);
        scored.push({ score, symbol: r.ticker, prefix: r.prefix, vtype: r.type, zh: r.zh, en: r.en, source: r.group === 'crypto' ? 'binance' : 'market' });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
