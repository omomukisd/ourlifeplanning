// 線のアイコン（文字色を使う）。飾りなので読み上げない。

const paths: Record<string, React.ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  fire: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>,
  actuals: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 12l2 2 4-4" /></>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  check: <path d="M6 12.5l4 4L18 8" />,
  alert: <><path d="M12 8v5" /><path d="M12 16.5v.5" /></>,
}

export function Icon({ name, size = 22, strokeWidth = 2 }: { name: keyof typeof paths; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}
