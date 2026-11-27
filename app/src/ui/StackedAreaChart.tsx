import { useEffect, useRef, useState } from 'react'
import type { Person } from '../engine/types'
import { man } from './format'

// 積み上げ面グラフ（1つの軸・円）。資産の推移と収入の推移で共用する。

export interface ChartSeries {
  key: string
  label: string
  color: string
}

export interface ChartPoint {
  year: number
  /** series と同じ順番の値 */
  values: number[]
  /** 合計（省略時は values の和） */
  total?: number
  /** 背景を赤くする年（資金不足など） */
  alert?: boolean
}

interface Props {
  series: ChartSeries[]
  points: ChartPoint[]
  ariaLabel: string
  /** 横軸に年齢を添える人 */
  agePerson?: Person
  height?: number
  /** alert の年の凡例とツールチップの文言 */
  alertLabel?: { legend: string; tooltip: string }
  /** true なら1年ごとの階段状（年額が急に変わるデータ向け） */
  step?: boolean
}

export function StackedAreaChart({ series, points, ariaLabel, agePerson, height = 240, alertLabel, step = false }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(340)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // タッチでは指を離すと pointerleave が来るので、グラフの外をタップしたときに閉じる
  useEffect(() => {
    if (hover === null) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setHover(null)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [hover])

  const data = points.map((p) => ({ ...p, values: p.values.map((v) => Math.max(0, v)), total: p.total ?? p.values.reduce((a, b) => a + Math.max(0, b), 0) }))
  const pad = { top: 8, right: 8, bottom: 28, left: 44 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const maxY = Math.max(1, ...data.map((d) => d.values.reduce((a, b) => a + b, 0)))
  const yTicks = niceTicks(maxY)
  const yMax = yTicks[yTicks.length - 1]
  const n = data.length
  const x = (i: number) => pad.left + (n <= 1 ? 0 : (i / (n - 1)) * innerW)
  const y = (v: number) => pad.top + innerH - (v / yMax) * innerH

  const stacks = data.map((d) => {
    let acc = 0
    return d.values.map((v) => { const lo = acc; acc += v; return [lo, acc] as const })
  })
  const half = n <= 1 ? 0 : innerW / (n - 1) / 2
  // 階段状のときは、各年の値を前後半年ずつの水平線にする（端はグラフの内側に収める）
  const xs = (i: number) => (step ? [Math.max(pad.left, x(i) - half), Math.min(width - pad.right, x(i) + half)] : [x(i)])
  const areaPath = (gi: number) => {
    if (n === 0) return ''
    const top = data.flatMap((_, i) => xs(i).map((px) => `${px},${y(stacks[i][gi][1])}`))
    const bottom = data.flatMap((_, i) => xs(i).map((px) => `${px},${y(stacks[i][gi][0])}`)).reverse()
    return `M${top.join('L')}L${bottom.join('L')}Z`
  }

  const xTickEvery = n > 50 ? 10 : 5
  const startYear = data[0]?.year ?? 0
  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const i = Math.round(((px - pad.left) / innerW) * (n - 1))
    setHover(Math.min(n - 1, Math.max(0, i)))
  }
  const hv = hover !== null ? data[hover] : null
  const tooltipLeft = hover !== null ? Math.min(Math.max(0, x(hover) - 80), width - 170) : 0

  return (
    <div>
      {series.length > 1 && (
        <ul className="legend" aria-label="凡例">
          {series.map((g) => (
            <li key={g.key}><span className="swatch" style={{ background: g.color }} />{g.label}</li>
          ))}
          {alertLabel && <li><span className="swatch" style={{ background: 'var(--critical)' }} />{alertLabel.legend}</li>}
        </ul>
      )}
      <div className="chart-wrap" ref={ref}>
        <svg
          height={height}
          role="img"
          aria-label={ariaLabel}
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null) }}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text className="tick" x={pad.left - 6} y={y(t) + 4} textAnchor="end">{axisLabel(t)}</text>
            </g>
          ))}
          {data.map((d, i) => d.alert && (
            <rect key={`s${d.year}`} x={x(i) - innerW / Math.max(1, n - 1) / 2} y={pad.top} width={innerW / Math.max(1, n - 1)} height={innerH}
              fill="var(--critical)" opacity={0.15} />
          ))}
          {series.map((g, gi) => (
            <path key={g.key} d={areaPath(gi)} fill={g.color} fillOpacity={0.85} stroke="var(--surface)" strokeWidth={1.5} strokeLinejoin="round" />
          ))}
          <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeWidth={1} />
          {data.map((d, i) => (d.year - startYear) % xTickEvery === 0 && (
            <text key={`x${d.year}`} className="tick" x={x(i)} y={height - 8} textAnchor="middle">
              {agePerson ? `${d.year - agePerson.birthYear}歳` : d.year}
            </text>
          ))}
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="3 3" />
          )}
        </svg>
        {hv && (
          <div className="tooltip" style={{ left: tooltipLeft }}>
            <div className="t-title">
              {hv.year}年{agePerson ? `（${agePerson.nickname} ${hv.year - agePerson.birthYear}歳）` : ''}
            </div>
            {series.map((g, gi) => (
              <div className="t-row" key={g.key}>
                <span className="k"><span className="swatch" style={{ background: g.color, width: 8, height: 8, borderRadius: 2, display: 'inline-block' }} />{g.label}</span>
                <span>{man(hv.values[gi])}</span>
              </div>
            ))}
            {series.length > 1 && <div className="t-row t-total"><span>合計</span><span>{man(hv.total)}</span></div>}
            {hv.alert && alertLabel && <div className="t-row" style={{ color: 'var(--critical-ink)' }}><span>{alertLabel.tooltip}</span></div>}
          </div>
        )}
      </div>
    </div>
  )
}

function niceTicks(max: number): number[] {
  const raw = max / 4
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(v)
  return ticks
}

function axisLabel(v: number): string {
  if (v === 0) return '0'
  if (v >= 100_000_000) return `${+(v / 100_000_000).toFixed(1)}億`
  return `${Math.round(v / 10_000).toLocaleString('ja-JP')}万`
}
