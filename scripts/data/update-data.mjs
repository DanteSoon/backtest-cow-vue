import fs from 'node:fs/promises'
import path from 'node:path'
import { assessSeriesQuality, dedupeAndSortSeries, round } from './data-quality.mjs'

const ROOT = process.cwd()
const PUBLIC_DATA_DIR = path.join(ROOT, 'public', 'data')

const INDEX_CONFIG = {
  SPX: {
    name: '标普500指数',
    shortName: '标普500',
    market: 'US',
    currency: 'USD',
    symbol: '^GSPC',
    description: '美国大盘股基准指数，覆盖 500 家代表性上市公司。',
    source: 'yahoo',
  },
  NDX: {
    name: '纳斯达克100指数',
    shortName: '纳斯达克100',
    market: 'US',
    currency: 'USD',
    symbol: '^NDX',
    description: '纳斯达克市场 100 家大型非金融公司构成的成长型指数。',
    source: 'yahoo',
  },
  DJI: {
    name: '道琼斯工业平均指数',
    shortName: '道琼斯',
    market: 'US',
    currency: 'USD',
    symbol: '^DJI',
    description: '美国历史最久的价格加权指数之一，反映传统蓝筹股表现。',
    source: 'yahoo',
  },
  RUT: {
    name: '罗素2000指数',
    shortName: '罗素2000',
    market: 'US',
    currency: 'USD',
    symbol: '^RUT',
    description: '美国中小盘股代表指数，更能体现风险偏好变化。',
    source: 'yahoo',
  },
  CSI300: {
    name: '沪深300指数',
    shortName: '沪深300',
    market: 'CN',
    currency: 'CNY',
    symbol: '1.000300',
    description: '沪深两市 300 只大市值股票组成的核心宽基指数。',
    source: 'eastmoney',
  },
  CSI500: {
    name: '中证500指数',
    shortName: '中证500',
    market: 'CN',
    currency: 'CNY',
    symbol: '1.000905',
    description: 'A 股中盘风格核心指数，兼顾成长与周期属性。',
    source: 'eastmoney',
  },
}

const ensureDir = async (dir) => fs.mkdir(dir, { recursive: true })

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  return response.json()
}

const fetchYahooSeries = async (symbol) => {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=0&period2=${Math.floor(Date.now() / 1000)}&interval=1d&includePrePost=false&events=div%2Csplits`
  const json = await fetchJson(url)
  const result = json.chart?.result?.[0]
  const timestamps = result?.timestamp ?? []
  const quote = result?.indicators?.quote?.[0] ?? {}
  const closes = quote.close ?? []
  const opens = quote.open ?? []
  const highs = quote.high ?? []
  const lows = quote.low ?? []
  const volumes = quote.volume ?? []
  return timestamps
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: opens[index],
      high: highs[index],
      low: lows[index],
      close: closes[index],
      volume: volumes[index],
    }))
    .filter((item) => Number.isFinite(item.close))
    .map((item) => ({
      date: item.date,
      open: round(Number(item.open ?? item.close), 4),
      high: round(Number(item.high ?? item.close), 4),
      low: round(Number(item.low ?? item.close), 4),
      close: round(Number(item.close), 4),
      volume: Number.isFinite(Number(item.volume)) ? round(Number(item.volume), 2) : null,
    }))
}

const fetchEastmoneySeries = async (symbol) => {
  const url = new URL('https://push2his.eastmoney.com/api/qt/stock/kline/get')
  url.searchParams.set('secid', symbol)
  url.searchParams.set('klt', '101')
  url.searchParams.set('fqt', '0')
  url.searchParams.set('lmt', '100000')
  url.searchParams.set('end', '20500101')
  url.searchParams.set('iscca', '1')
  url.searchParams.set('fields1', 'f1,f2,f3,f4,f5,f6')
  url.searchParams.set('fields2', 'f51,f52,f53,f54,f55,f56,f57,f58,f61')
  const json = await fetchJson(url.toString())
  return (json.data?.klines ?? []).map((line) => {
    const [date, open, close, high, low, volume] = line.split(',')
    return {
      date,
      open: round(Number(open), 4),
      high: round(Number(high), 4),
      low: round(Number(low), 4),
      close: round(Number(close), 4),
      volume: Number.isFinite(Number(volume)) ? round(Number(volume), 2) : null,
    }
  })
}

const buildManifestEntry = (code, config, series) => ({
  code,
  name: config.name,
  shortName: config.shortName,
  market: config.market,
  currency: config.currency,
  source: config.source,
  sourceSymbol: config.symbol,
  tradingCalendar: config.market,
  startDate: series[0].date,
  endDate: series.at(-1).date,
  pointCount: series.length,
  latestClose: series.at(-1).close,
  latestDate: series.at(-1).date,
  description: config.description,
  dataQuality: assessSeriesQuality(series, config.market),
})

const fetchUsdCnySeries = async () => {
  const yahooSeries = await fetchYahooSeries('USDCNY=X')
  return yahooSeries.map((item) => ({
    date: item.date,
    usdCny: round(item.close, 6),
  }))
}

const main = async () => {
  await ensureDir(path.join(PUBLIC_DATA_DIR, 'indices'))
  await ensureDir(path.join(PUBLIC_DATA_DIR, 'fx'))

  const manifest = {
    updatedAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    indices: [],
  }

  for (const [code, config] of Object.entries(INDEX_CONFIG)) {
    const rawSeries =
      config.source === 'yahoo'
        ? await fetchYahooSeries(config.symbol)
        : await fetchEastmoneySeries(config.symbol)
    const series = dedupeAndSortSeries(rawSeries)
    if (series.length === 0) {
      throw new Error(`No series data for ${code}`)
    }
    await fs.writeFile(
      path.join(PUBLIC_DATA_DIR, 'indices', `${code}.json`),
      JSON.stringify(series, null, 2),
    )
    manifest.indices.push(buildManifestEntry(code, config, series))
  }

  const fxSeries = await fetchUsdCnySeries()

  await fs.writeFile(path.join(PUBLIC_DATA_DIR, 'fx', 'usd-cny.json'), JSON.stringify(fxSeries, null, 2))
  await fs.writeFile(path.join(PUBLIC_DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))

  console.log(`Generated manifest with ${manifest.indices.length} indices and ${fxSeries.length} fx points.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
