/** 円 → 「1,234万円」。1億以上は「1.23億円」 */
export function man(yen: number, opts: { sign?: boolean } = {}): string {
  const sign = opts.sign && yen > 0 ? '+' : ''
  const abs = Math.abs(yen)
  if (abs >= 100_000_000) return `${sign}${yen < 0 ? '−' : ''}${(abs / 100_000_000).toFixed(2)}億円`
  return `${sign}${yen < 0 ? '−' : ''}${Math.round(abs / 10_000).toLocaleString('ja-JP')}万円`
}

/** 円 → 「12.3万円」（月額向け） */
export function manDetail(yen: number): string {
  return `${(yen / 10_000).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万円`
}

export function pct(rate: number): string {
  return `${(rate * 100).toLocaleString('ja-JP', { maximumFractionDigits: 2 })}%`
}

let seq = 0
export function newId(prefix: string): string {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}${seq}`
}
