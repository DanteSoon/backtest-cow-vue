import dayjs from 'dayjs'

export interface CashflowPoint {
  date: string
  amount: number
}

const xnpv = (rate: number, cashflows: CashflowPoint[]) => {
  const first = dayjs(cashflows[0]?.date)
  return cashflows.reduce((sum, flow) => {
    const years = dayjs(flow.date).diff(first, 'day') / 365
    return sum + flow.amount / (1 + rate) ** years
  }, 0)
}

export const calculateXirr = (cashflows: CashflowPoint[]) => {
  const hasPositive = cashflows.some((item) => item.amount > 0)
  const hasNegative = cashflows.some((item) => item.amount < 0)
  if (!hasPositive || !hasNegative) return null

  let low = -0.9999
  let high = 10

  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2
    const value = xnpv(mid, cashflows)
    if (Math.abs(value) < 1e-7) return mid
    if (value > 0) low = mid
    else high = mid
  }

  return (low + high) / 2
}
