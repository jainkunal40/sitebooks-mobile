/** Date helpers. The database stores plain `YYYY-MM-DD` for transaction dates. */

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Accepts 2026-11-24, 24/11/2026 or 24-11-2026 and returns YYYY-MM-DD. */
export function normalizeDateInput(input: string): string | null {
  const value = input.trim()
  if (!value) return null

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value)
  if (dmy) return validDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))

  return null
}

function validDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Inclusive day count; returns null when either end is missing or reversed. */
export function daysBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${end}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null
  return Math.round((b - a) / 86_400_000) + 1
}
