import { useEffect, useRef, useState } from 'react'
import { manDetail } from './format'

// 月ごとの収入と支出の棒グラフ（横に並べる）。計画の支出（月平均）を破線で重ねる。1つの軸（円）だけを使う。

export interface MonthPoint {
  yearMonth: string
  income: number
  expense: number
  /** 計画の支出（月平均）。計画の範囲外なら null */
  planExpense: number | null
  /** 支出の12か月移動平均 */
  expenseAvg: number
}

const INCOME = { label: '収入', color: 'var(--series-1)' }
const EXPENSE = { label: '支出', color: 'var(--series-2)' }

export function MonthlyChart({ points, height = 220 }: { points: MonthPoint[]; height?: number }) {
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
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setHover(null) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [hover])

  const n = points.length
  const pad = { top: 8, right: 8, bottom: 28, left: 40 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const maxY = Math.max(1, ...points.flatMap((p) => [p.income, p.expense, p.planExpense ?? 0]))
  const ticks = niceTicks(maxY)
  const yMax = ticks[ticks.length - 1]
  const y = (v: number) => pad.top + innerH - (Math.max(0, v) / yMax) * innerH
  const groupW = innerW / Math.max(1, n)
  const barW = Math.max(3, Math.min(14, (groupW - 6) / 2))
  const gx = (i: number) => pad.left + groupW * i + groupW / 2
  const labelEvery = n > 12 ? 3 : n > 6 ? 2 : 1

  // 上の角だけ丸めた棒
  const bar = (cx: number, v: number) => {
    const top = y(v)
    const bottom = y(0)
    const h = bottom - top
    if (h <= 0) return ''
    const r = Math.min(4, barW / 2, h)
    const x0 = cx - barW / 2
    const x1 = cx + barW / 2
    return `M${x0},${bottom}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x1 - r}Q${x1},${top} ${x1},${top + r}V${bottom}Z`
  }

  // 計画の支出（月ごとの階段状の破線）
  const planPath = points.map((p, i) => {
    if (p.planExpense === null) return ''
    const x0 = pad.left + groupW * i
    return `M${x0},${y(p.planExpense)}H${x0 + groupW}`
  }).join('')
  const avgPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${gx(i)},${y(p.expenseAvg)}`).join('')

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - rect.left - pad.left) / groupW)
    setHover(Math.min(n - 1, Math.max(0, i)))
  }
  const hv = hover !== null ? points[hover] : null
  const tooltipLeft = hover !== null ? Math.min(Math.max(0, gx(hover) - 85), width - 180) : 0
  const monthLabel = (ym: string, i: number) => {
    const [yy, mm] = ym.split('-')
    return i < labelEvery || mm === '01' ? `${yy.slice(2)}/${Number(mm)}` : `${Number(mm)}月`
  }

  return (
    <div>
      <ul className="legend" aria-label="凡例">
        <li><span className="swatch" style={{ background: INCOME.color }} />{INCOME.label}</li>
        <li><span className="swatch" style={{ background: EXPENSE.color }} />{EXPENSE.label}</li>
        <li><span className="swatch line" style={{ borderTopColor: 'var(--ink-2)' }} />支出の12か月平均</li>
        <li><span className="swatch line dashed" style={{ borderTopColor: 'var(--muted)' }} />計画の支出</li>
      </ul>
      <div className="chart-wrap" ref={ref}>
        <svg height={height} role="img" aria-label="月ごとの収入と支出"
          onPointerMove={onPointer} onPointerDown={onPointer}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null) }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text className="tick" x={pad.left - 6} y={y(t) + 4} textAnchor="end">{t === 0 ? '0' : `${Math.round(t / 10_000)}万`}</text>
            </g>
          ))}
          {hover !== null && <rect x={pad.left + groupW * hover} y={pad.top} width={groupW} height={innerH} fill="var(--ink-2)" opacity={0.06} />}
          {points.map((p, i) => (
            <g key={p.yearMonth}>
              <path d={bar(gx(i) - barW / 2 - 1, p.income)} fill={INCOME.color} />
              <path d={bar(gx(i) + barW / 2 + 1, p.expense)} fill={EXPENSE.color} />
            </g>
          ))}
          <path d={planPath} stroke="var(--muted)" strokeWidth={2} strokeDasharray="4 3" fill="none" />
          {n > 1 && <path d={avgPath} stroke="var(--ink-2)" strokeWidth={2} fill="none" strokeLinejoin="round" />}
          <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeWidth={1} />
          {points.map((p, i) => (n - 1 - i) % labelEvery === 0 && (
            <text key={`x${p.yearMonth}`} className="tick" x={gx(i)} y={height - 8} textAnchor="middle">{monthLabel(p.yearMonth, i)}</text>
          ))}
        </svg>
        {hv && (
          <div className="tooltip" style={{ left: tooltipLeft }}>
            <div className="t-title">{Number(hv.yearMonth.slice(0, 4))}年{Number(hv.yearMonth.slice(5))}月</div>
            <div className="t-row"><span className="k"><span className="swatch" style={{ background: INCOME.color, width: 8, height: 8, borderRadius: 2, display: 'inline-block' }} />収入</span><span>{manDetail(hv.income)}</span></div>
            <div className="t-row"><span className="k"><span className="swatch" style={{ background: EXPENSE.color, width: 8, height: 8, borderRadius: 2, display: 'inline-block' }} />支出</span><span>{manDetail(hv.expense)}</span></div>
            <div className="t-row t-total"><span>収支</span><span>{hv.income - hv.expense >= 0 ? '+' : '−'}{manDetail(Math.abs(hv.income - hv.expense))}</span></div>
            <div className="t-row"><span className="k">支出の12か月平均</span><span>{manDetail(hv.expenseAvg)}</span></div>
            {hv.planExpense !== null && <div className="t-row"><span className="k">計画の支出</span><span>{manDetail(hv.planExpense)}</span></div>}
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
