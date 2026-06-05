import fs from 'node:fs/promises'
import path from 'node:path'
import { assessSeriesQuality } from './data-quality.mjs'

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, 'public', 'data')

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'))

const assertSorted = (series, valueKey = 'close') => {
  for (let i = 1; i < series.length; i += 1) {
    if (series[i - 1].date > series[i].date) {
      throw new Error(`Series not sorted at index ${i}`)
    }
    if (!Number.isFinite(series[i][valueKey])) {
      throw new Error(`Invalid numeric value at index ${i}`)
    }
  }
}

const assertPriceShape = (series, code) => {
  for (const [index, point] of series.entries()) {
    for (const field of ['open', 'high', 'low', 'close']) {
      if (!Number.isFinite(point[field])) {
        throw new Error(`${code} invalid ${field} at index ${index}`)
      }
    }
    if (point.high < Math.max(point.open, point.close) || point.low > Math.min(point.open, point.close)) {
      throw new Error(`${code} has inconsistent OHLC at index ${index}`)
    }
    if (point.volume !== null && !Number.isFinite(point.volume)) {
      throw new Error(`${code} invalid volume at index ${index}`)
    }
  }
}

const main = async () => {
  const manifest = await readJson(path.join(DATA_DIR, 'manifest.json'))
  if (!Array.isArray(manifest.indices) || manifest.indices.length === 0) {
    throw new Error('Manifest indices missing')
  }

  const report = {
    updatedAt: new Date().toISOString(),
    summary: {
      indices: manifest.indices.length,
      warnings: 0,
      errors: 0,
    },
    indices: [],
  }

  for (const meta of manifest.indices) {
    const series = await readJson(path.join(DATA_DIR, 'indices', `${meta.code}.json`))
    if (!Array.isArray(series) || series.length === 0) {
      throw new Error(`Series missing for ${meta.code}`)
    }
    assertSorted(series)
    assertPriceShape(series, meta.code)

    if (meta.startDate !== series[0].date) {
      throw new Error(`${meta.code} manifest startDate mismatch`)
    }
    if (meta.endDate !== series.at(-1).date) {
      throw new Error(`${meta.code} manifest endDate mismatch`)
    }
    if (meta.latestDate !== series.at(-1).date) {
      throw new Error(`${meta.code} manifest latestDate mismatch`)
    }
    if (meta.latestClose !== series.at(-1).close) {
      throw new Error(`${meta.code} manifest latestClose mismatch`)
    }
    if (meta.pointCount !== series.length) {
      throw new Error(`${meta.code} manifest pointCount mismatch`)
    }

    const quality = assessSeriesQuality(series, meta.tradingCalendar)
    const severity = quality.validationStatus
    if (severity === 'warning') report.summary.warnings += 1
    if (severity === 'error') report.summary.errors += 1
    report.indices.push({
      code: meta.code,
      validationStatus: severity,
      staleDays: quality.staleDays,
      pointCount: quality.pointCount,
      missingRangeCount: quality.missingRangeCount,
      missingDateRanges: quality.missingDateRanges,
      confirmedClosures: quality.confirmedClosures,
      fieldCoverage: quality.fieldCoverage,
      message: quality.message,
    })
  }

  const fxSeries = await readJson(path.join(DATA_DIR, 'fx', 'usd-cny.json'))
  assertSorted(fxSeries, 'usdCny')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
