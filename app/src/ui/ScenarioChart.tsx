import { useEffect, useRef, useState } from 'react'
import type { Person, Scenario, SimulationResult } from '../engine/types'
import { man } from './format'

// シナリオごとの資産の合計（今の価値）を1つのグラフに重ねる。1つの軸（円）だけを使う。
// 1つ目のシナリオは実線＋面、2つ目以降は点線・破線にして、色だけに頼らず見分けられるようにする。

const STYLES = [
  { color: 'var(--good)', dash: undefined, legend: '' },
  { color: 'var(--warn)', dash: '1 6', legend: 'dotted' },
  { color: 'var(--series-2)', dash: '6 4', legend: 'dashed' },
  { color: 'var(--series-4)', dash: '2 3', legend: 'dashed' },
]

interface Props {
  scenarios: Scenario[]
  results: Record<string, SimulationResult>
  agePerson?: Person
  height?: number
}

export function ScenarioChart({ scenarios, results, agePerson, height = 190 }: Props) {
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
  useEffect(() => {
    if (hover === null) return
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setHover(null) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [hover])

  const series = scenarios.map((sc, i) => {
    const rows = results[sc.id]?.rows ?? []
    return {
      sc, style: STYLES[Math.min(i, STYLES.length - 1)],
      values: rows.map((r) => Math.max(0, r.total / r.inflationFactor)),
      shortfall: results[sc.id]?.firstShortfallYear ?? null,
    }
  })
  const years = (results[scenarios[0]?.id]?.rows ?? []).map((r) => r.year)
  const n = years.length
  const pad = { top: 10, right: 10, bottom: 26, left: 44 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const maxY = Math.max(1, ...series.flatMap((s) => s.values))
  const ticks = niceTicks(maxY)
  const yMax = ticks[ticks.length - 1]
  const x = (i: number) => pad.left + (n <= 1 ? 0 : (i / (n - 1)) * innerW)
  const y = (v: number) => pad.top + innerH - (v / yMax) * innerH
  const linePath = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('')
  const first = series[0]
  const areaPath = first && n > 0 ? `${linePath(first.values)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z` : ''

  const ageAt = (year: number) => (agePerson ? year - agePerson.birthYear : null)
  const tickEvery = n > 50 ? 10 : 5
  const firstAge = ageAt(years[0] ?? 0)
  // 目盛り：最初の年と、年齢（なければ年）が区切りのよい年。近すぎるものは省く
  const tickIdx: number[] = []
  years.forEach((yr, i) => {
    const a = ageAt(yr)
    const round = a !== null && firstAge !== null ? a % tickEvery === 0 : (yr - years[0]) % tickEvery === 0
    if ((i === 0 || round) && (tickIdx.length === 0 || x(i) - x(tickIdx[tickIdx.length - 1]) >= 36)) tickIdx.push(i)
  })
  const isTick = (i: number) => tickIdx.includes(i)

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - rect.left - pad.left) / innerW) * (n - 1))
    setHover(Math.min(n - 1, Math.max(0, i)))
  }
  const tooltipLeft = hover !== null ? Math.min(Math.max(0, x(hover) - 85), width - 180) : 0

  return (
    <div>
      {series.length > 1 && (
        <ul className="legend" aria-label="凡例">
          {series.map((s) => (
            <li key={s.sc.id}>
              <span className={`swatch line ${s.style.legend}`} style={{ borderTopColor: s.style.color }} />{s.sc.name}
            </li>
          ))}
        </ul>
      )}
      <div className="chart-wrap" ref={ref}>
        <svg height={height} role="img" aria-label={`資産の推移（今の価値）：${series.map((s) => `${s.sc.name}${s.shortfall ? `は${s.shortfall}年に不足` : 'は最後まで足りる'}`).join('、')}`}
          onPointerMove={onPointer} onPointerDown={onPointer}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null) }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text className="tick" x={pad.left - 6} y={y(t) + 4} textAnchor="end">{axisLabel(t)}</text>
            </g>
          ))}
          {first && <path d={areaPath} fill={first.style.color} opacity={0.12} />}
          {[...series].reverse().map((s) => (
            <path key={s.sc.id} d={linePath(s.values)} stroke={s.style.color} strokeWidth={3} fill="none"
              strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.style.dash} />
          ))}
          {series.map((s) => {
            if (s.shortfall === null) return null
            const i = years.indexOf(s.shortfall)
            if (i < 0) return null
            return <circle key={`m${s.sc.id}`} cx={x(i)} cy={y(s.values[i])} r={5} fill="var(--surface)" stroke={s.style.color} strokeWidth={2.5} />
          })}
          <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeWidth={1.5} />
          {years.map((yr, i) => isTick(i) && (
            <text key={yr} className="tick" x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : 'middle'}>
              {ageAt(yr) !== null ? `${ageAt(yr)}歳` : yr}
            </text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke="var(--ink-2)" strokeDasharray="3 3" />}
        </svg>
        {hover !== null && (
          <div className="tooltip" style={{ left: tooltipLeft }}>
            <div className="t-title">{years[hover]}年{agePerson ? `（${agePerson.nickname} ${ageAt(years[hover])}歳）` : ''}</div>
            {series.map((s) => (
              <div className="t-row" key={s.sc.id}>
                <span className="k"><span className={`swatch line ${s.style.legend}`} style={{ borderTopColor: s.style.color, borderTopWidth: 3, borderTopStyle: s.style.dash ? 'dotted' : 'solid', width: 12, display: 'inline-block' }} />{s.sc.name}</span>
                <span>{s.shortfall !== null && years[hover] >= s.shortfall ? '不足' : man(s.values[hover])}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function niceTicks(max: number): number[] {
  const raw = max / 3
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
