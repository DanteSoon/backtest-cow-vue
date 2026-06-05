import type { DataManifest, FxPoint, IndexCode, PricePoint, SeriesBundle } from '@/shared/types/domain'

const fetchJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}`)
  }
  return (await response.json()) as T
}

export const fetchManifest = () => fetchJson<DataManifest>('/data/manifest.json')

export const fetchIndexSeries = async (
  code: IndexCode,
  manifest: DataManifest,
): Promise<SeriesBundle> => {
  const meta = manifest.indices.find((item) => item.code === code)
  if (!meta) {
    throw new Error(`Unknown index code: ${code}`)
  }
  const series = await fetchJson<PricePoint[]>(`/data/indices/${code}.json`)
  return { meta, series }
}

export const fetchFxSeries = () => fetchJson<FxPoint[]>('/data/fx/usd-cny.json')
