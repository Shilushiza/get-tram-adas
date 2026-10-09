import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

export const AXIS = {
  axisLine: { lineStyle: { color: '#c9d1d5' } },
  axisTick: { show: false },
  axisLabel: { color: '#5d6a72', fontFamily: 'Golos Text', fontSize: 11 },
  splitLine: { lineStyle: { color: '#edf0f2' } },
}

export const TOOLTIP = {
  backgroundColor: '#17202B', borderWidth: 0, padding: [8, 12],
  textStyle: { color: '#fff', fontFamily: 'Golos Text', fontSize: 12 },
}

export default function EChart({ option, height = 260, onClick }: {
  option: EChartsOption; height?: number; onClick?: (p: { name?: string; seriesName?: string; data?: unknown }) => void
}) {
  return (
    <ReactECharts
      option={{ textStyle: { fontFamily: 'Golos Text' }, animationDuration: 700, animationEasing: 'cubicOut', ...option }}
      style={{ height, width: '100%' }}
      notMerge
      onEvents={onClick ? { click: onClick } : undefined}
    />
  )
}
