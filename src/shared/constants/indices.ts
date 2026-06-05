import type { DataQualitySummary, IndexCode, IndexMeta } from '@/shared/types/domain'

export const INDEX_ORDER: IndexCode[] = ['SPX', 'NDX', 'DJI', 'RUT', 'CSI300', 'CSI500']

const emptyQuality: DataQualitySummary = {
  validationStatus: 'warning',
  staleDays: 0,
  pointCount: 0,
  missingRangeCount: 0,
  missingDateRanges: [],
  confirmedClosures: [],
  fieldCoverage: {
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: 0,
  },
  issueCount: 0,
  hasSuspiciousGaps: false,
  message: '等待数据生成',
}

export const INDEX_META_MAP: Record<
  IndexCode,
  Omit<IndexMeta, 'startDate' | 'endDate' | 'latestClose' | 'latestDate' | 'pointCount' | 'dataQuality'>
> =
  {
    SPX: {
      code: 'SPX',
      name: '标普500指数',
      shortName: '标普500',
      market: 'US',
      currency: 'USD',
      source: 'yahoo',
      sourceSymbol: '^GSPC',
      tradingCalendar: 'US',
      description: '美国大盘股基准指数，覆盖 500 家代表性上市公司。',
    },
    NDX: {
      code: 'NDX',
      name: '纳斯达克100指数',
      shortName: '纳斯达克100',
      market: 'US',
      currency: 'USD',
      source: 'yahoo',
      sourceSymbol: '^NDX',
      tradingCalendar: 'US',
      description: '纳斯达克市场 100 家大型非金融公司构成的成长型指数。',
    },
    DJI: {
      code: 'DJI',
      name: '道琼斯工业平均指数',
      shortName: '道琼斯',
      market: 'US',
      currency: 'USD',
      source: 'yahoo',
      sourceSymbol: '^DJI',
      tradingCalendar: 'US',
      description: '美国历史最久的价格加权指数之一，反映传统蓝筹股表现。',
    },
    RUT: {
      code: 'RUT',
      name: '罗素2000指数',
      shortName: '罗素2000',
      market: 'US',
      currency: 'USD',
      source: 'yahoo',
      sourceSymbol: '^RUT',
      tradingCalendar: 'US',
      description: '美国中小盘股代表指数，更能体现风险偏好变化。',
    },
    CSI300: {
      code: 'CSI300',
      name: '沪深300指数',
      shortName: '沪深300',
      market: 'CN',
      currency: 'CNY',
      source: 'eastmoney',
      sourceSymbol: '1.000300',
      tradingCalendar: 'CN',
      description: '沪深两市 300 只大市值股票组成的核心宽基指数。',
    },
    CSI500: {
      code: 'CSI500',
      name: '中证500指数',
      shortName: '中证500',
      market: 'CN',
      currency: 'CNY',
      source: 'eastmoney',
      sourceSymbol: '1.000905',
      tradingCalendar: 'CN',
      description: 'A 股中盘风格核心指数，兼顾成长与周期属性。',
    },
  }

export const DEFAULT_INDEX_CODE: IndexCode = 'NDX'
export const EMPTY_DATA_QUALITY = emptyQuality
