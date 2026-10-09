import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import { useStore } from '../store'
import { useT } from '../i18n'
import type { Series } from '../api'

// заливка, когда воздействие применено: верхняя половина для подсистем, нижняя для тормозов
// цвета те же, что у типов срабатываний (KIND_COLOR): препятствие киноварь, светофор янтарь, тормоза пурпур
export const BANDS: [string, string, number][] = [
  ['sl_real', 'rgba(138,147,159,.18)', 0], ['tl_real', 'rgba(176,122,0,.24)', 0], ['danger_real', 'rgba(213,94,0,.24)', 0],
  ['brake_rail', 'rgba(180,68,127,.22)', 1], ['brake_crash', 'rgba(180,68,127,.38)', 1], ['brake_emergency', 'rgba(180,68,127,.55)', 1],
]

function bandsPlugin(get: () => Series | null): uPlot.Plugin {
  return {
    hooks: {
      drawClear: (u) => {
        const s = get()
        if (!s) return
        const { ctx, bbox } = u
        for (const [key, color, lane] of BANDS) {
          const v = s[key] as (number | null)[] | undefined
          if (!v) continue
          ctx.fillStyle = color
          for (let i = 0; i < s.t.length; i++) {
            if ((v[i] ?? 0) < 0.5) continue
            const x0 = u.valToPos(s.t[i], 'x', true)
            const x1 = u.valToPos(s.t[Math.min(i + 1, s.t.length - 1)], 'x', true)
            ctx.fillRect(x0, bbox.top + lane * bbox.height * 0.5, Math.max(x1 - x0, 2), bbox.height * 0.5)
          }
        }
      },
    },
  }
}

function cursorPlugin(get: () => number | null): uPlot.Plugin {
  return {
    hooks: {
      draw: (u) => {
        const c = get()
        if (c == null) return
        const x = u.valToPos(c, 'x', true)
        const { ctx, bbox } = u
        ctx.save()
        ctx.strokeStyle = '#17202B'
        ctx.lineWidth = 2 * devicePixelRatio
        ctx.beginPath(); ctx.moveTo(x, bbox.top); ctx.lineTo(x, bbox.top + bbox.height); ctx.stroke()
        ctx.fillStyle = '#17202B'
        ctx.beginPath(); ctx.arc(x, bbox.top, 4 * devicePixelRatio, 0, 7); ctx.fill()
        ctx.restore()
      },
    },
  }
}

const tz = (ts: number) => uPlot.tzDate(new Date(ts), 'Europe/Moscow')
const col = (s: Series, k: string) => (s[k] as (number | null)[] | undefined) ?? s.t.map(() => null)
const fmt = (d: number) => (v: number | null) => (v == null ? '-' : v.toFixed(d))

export default function Charts() {
  const win = useStore((s) => s.win)
  const cursor = useStore((s) => s.cursor)
  const lang = useStore((s) => s.lang)
  const { t } = useT()
  const box = useRef<HTMLDivElement>(null)
  const plots = useRef<uPlot[]>([])
  const winRef = useRef(win)
  const curRef = useRef(cursor)
  winRef.current = win
  curRef.current = cursor

  useEffect(() => {
    const el = box.current
    if (!el || !win) return
    el.innerHTML = ''
    const width = el.clientWidth
    const axisStyle = { stroke: '#556170', grid: { stroke: '#e7ebef' }, ticks: { show: false }, font: '11px Golos Text' }
    const clock = (v: number) => new Date(v).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const xAxis = { ...axisStyle, values: (_u: uPlot, splits: number[]) => splits.map(clock) }
    const common = (h: number) => ({
      width, height: h, ms: 1 as const, tzDate: tz,
      cursor: { sync: { key: 'ep' }, drag: { x: false, y: false } },
      plugins: [bandsPlugin(() => winRef.current), cursorPlugin(() => curRef.current)],
      axes: [xAxis, { ...axisStyle, size: 40 }],
    })
    const timeVal = (_u: uPlot, v: number | null) =>
      v == null ? '' : new Date(v).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' })
    const a = new uPlot({
      ...common(200),
      series: [
        { label: lang === 'ru' ? 'Время' : 'Time', value: timeVal },
        { label: `${t('sSpeed')}, ${t('kmh')}`, stroke: '#17202B', width: 2.2, fill: 'rgba(23,32,43,.05)', points: { show: false }, value: (_u, v) => fmt(1)(v) },
        { label: `${t('sGoal')}, ${t('kmh')}`, stroke: '#0072B2', width: 1.6, dash: [6, 4], points: { show: false }, value: (_u, v) => fmt(0)(v) },
      ],
      scales: { y: { range: (_u, _mn, mx) => [0, Math.max(20, Math.min(mx ?? 0, 90) + 5)] } },
    }, [win.t, col(win, 'speed'), col(win, 'goal_speed')] as uPlot.AlignedData, el)
    const stepped = uPlot.paths.stepped!({ align: 1 })
    const b = new uPlot({
      ...common(140),
      series: [
        { label: lang === 'ru' ? 'Время' : 'Time', value: timeVal },
        { label: t('sHDriver'), stroke: '#17202B', width: 1.6, paths: stepped, points: { show: false }, value: (_u, v) => fmt(0)(v) },
        { label: t('sHAssist'), stroke: '#0072B2', width: 2.2, paths: stepped, points: { show: false }, value: (_u, v) => fmt(0)(v) },
      ],
      scales: { y: { range: [-15, 15] } },
    }, [win.t, col(win, 'handle_driver'), col(win, 'handle_assistant')] as uPlot.AlignedData, el)
    plots.current = [a, b]
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      for (const u of plots.current) if (Math.abs(u.width - w) > 2) u.setSize({ width: w, height: u.height })
    })
    ro.observe(el)
    for (const u of plots.current) {
      u.over.addEventListener('click', () => {
        const idx = u.cursor.idx
        if (idx != null) useStore.getState().set({ cursor: win.t[idx], playing: false })
      })
    }
    return () => {
      ro.disconnect()
      plots.current.forEach((u) => u.destroy())
      plots.current = []
    }
  }, [win, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    plots.current.forEach((u) => u.redraw(false, false))
  }, [cursor])

  return <div className="charts" ref={box} />
}
