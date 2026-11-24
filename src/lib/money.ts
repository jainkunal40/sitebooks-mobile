/**
 * Indian currency formatting without relying on Intl (Hermes support varies).
 * Uses lakh/crore digit grouping: 12,34,567.
 */
export function formatINR(value: number, options: { decimals?: boolean } = {}): string {
  const decimals = options.decimals ?? false
  const negative = value < 0
  const absolute = Math.abs(value)

  const fixed = decimals ? absolute.toFixed(2) : String(Math.round(absolute))
  const [whole, fraction] = fixed.split('.')

  let grouped: string
  if (whole.length <= 3) {
    grouped = whole
  } else {
    const last3 = whole.slice(-3)
    const rest = whole.slice(0, -3)
    const parts: string[] = []
    let index = rest.length
    while (index > 0) {
      parts.unshift(rest.slice(Math.max(0, index - 2), index))
      index -= 2
    }
    grouped = `${parts.join(',')},${last3}`
  }

  const body = fraction ? `${grouped}.${fraction}` : grouped
  return `${negative ? '−' : ''}₹${body}`
}

/** Compact form for dashboards: ₹1.2L, ₹3.4Cr, ₹45,000. */
export function formatINRCompact(value: number): string {
  const absolute = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (absolute >= 1_00_00_000) return `${sign}₹${(absolute / 1_00_00_000).toFixed(2)}Cr`
  if (absolute >= 1_00_000) return `${sign}₹${(absolute / 1_00_000).toFixed(2)}L`
  return formatINR(value)
}

export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '')
  if (!cleaned) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}
