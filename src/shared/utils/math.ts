export const round = (value: number, digits = 6) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export const percentChange = (from: number, to: number) => {
  if (!Number.isFinite(from) || from === 0) return null
  return to / from - 1
}
