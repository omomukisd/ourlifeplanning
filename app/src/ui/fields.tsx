import { useEffect, useId, useState } from 'react'

// 入力欄の部品。金額は「万円」、率は「%」で入力し、内部では円・小数で持つ。

interface NumProps {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  unit?: string
  /** 表示値 = 内部値 ÷ scale */
  scale?: number
  hint?: string
  wide?: boolean
  allowEmpty?: boolean
  step?: number
}

export function NumField({ label, value, onChange, unit, scale = 1, hint, wide, allowEmpty, step }: NumProps) {
  const id = useId()
  const toText = (v: number | null) => (v === null ? '' : String(+(v / scale).toFixed(4)))
  const [text, setText] = useState(toText(value))
  useEffect(() => {
    const parsed = text.trim() === '' ? null : Number(text) * scale
    if (parsed !== value) setText(toText(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div className={`field${wide ? ' wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="control">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step ?? 'any'}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            const t = e.target.value.trim()
            if (t === '') { if (allowEmpty) onChange(null); return }
            const n = Number(t)
            if (Number.isFinite(n)) onChange(Math.round(n * scale * 1e6) / 1e6)
          }}
        />
        {unit && <span className="unit">{unit}</span>}
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export const ManField = (p: Omit<NumProps, 'scale' | 'unit'>) => <NumField {...p} scale={10_000} unit="万円" />
export const PctField = (p: Omit<NumProps, 'scale' | 'unit'>) => <NumField {...p} scale={0.01} unit="%" />

export function TextField({ label, value, onChange, wide }: { label: string; value: string; onChange: (v: string) => void; wide?: boolean }) {
  const id = useId()
  return (
    <div className={`field${wide ? ' wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export function SelectField<T extends string>({ label, value, options, onChange, wide }: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  wide?: boolean
}) {
  const id = useId()
  return (
    <div className={`field${wide ? ' wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

export function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check field wide">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
