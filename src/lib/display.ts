import { formatINR } from '@/lib/money'

export function money(value: number | null | undefined): string {
  return formatINR(value ?? 0)
}

export function pct(part: number, whole: number): string {
  if (!whole) return '—'
  return `${Math.round((part / whole) * 100)}%`
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
