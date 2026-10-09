import { useEffect, useMemo } from 'react'
import { activeAnchor, computeAnchors } from '../anchors'
import { indexAt, num, str, hms, type Series } from '../api'
import { useStore } from '../store'
import { place, useT } from '../i18n'
import { useCanvas } from './useCanvas'
import { useDistance } from './Tram3D'

/* Вид сбоку в стиле бортового дисплея: тёмный фон, путь с линейкой метров, крупный «Витязь-М».
   Всё, что на улице (шпалы, опоры, остановка, объект, светофор), привязано к пройденному пути и
   стоит на месте; трамвай подъезжает к нему. Положение объекта и светофора условное: дистанции в данных нет. */

const SECS = [9.6, 8.4, 9.6]          // длины секций, м (71-931М около 27 м)
const GAP = 0.5
const TRAM_LEN = SECS.reduce((a, b) => a + b, 0) + GAP * 2
const C = {
  bg0: '#0b1c36', bg1: '#13294d', grid: 'rgba(143,182,242,.10)', ruler: 'rgba(185,198,218,.55)',
  rail: '#9fb2cc', sleeper: 'rgba(159,178,204,.35)', wire: '#6f86a8', pole: '#4d6488',
  body: '#2f6fe4', bodyDark: '#2459bd', skirt: '#dde7f5', glass: '#0b1730', glassHi: '#1b3563', door: '#8fb6f2',
  roof: '#c9d6ea', amber: '#ffb020', text: '#e8eef8', muted: '#9fb0c8',
  ok: '#3df2a0', slate: '#a9bbd6', glow: '255,176,32',
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  g.beginPath(); g.roundRect(x, y, w, h, r); g.fill()
}

/** Надпись цветом события с неоновым свечением, без рамки. Возвращает ширину. */
function neon(g: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, font = '700 13px Golos Text, sans-serif') {
  g.save()
  g.font = font
  g.fillStyle = color; g.shadowColor = color
  g.shadowBlur = 14; g.fillText(text, x, y)
  g.shadowBlur = 5; g.fillText(text, x, y)
  g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,.55)'; g.globalCompositeOperation = 'lighter'; g.fillText(text, x, y)
  g.restore()
  g.font = font
  return g.measureText(text).width
}

/** Точка каждой остановки на пути: по записи, где до неё ближе всего (точнее всего). */
function useStops(win: Series | null, dist: number[]) {
  return useMemo(() => {
    const best = new Map<string, { d: number; at: number }>()
    if (!win || !dist.length) return best
    for (let i = 0; i < win.t.length; i++) {
      const name = str(win, 'stop_name', i), d = num(win, 'dist_to_stop', i)
      if (!name || d == null) continue
      const cur = best.get(name)
      if (!cur || d < cur.d) best.set(name, { d, at: dist[i] + d })
    }
    return best
  }, [win, dist])
}

export default function Replay2D() {
  const { win, cursor } = useStore()
  const { t, obj: objName, ctrl, lang } = useT()
  const dist = useDistance(win)
  const anchors = useMemo(() => computeAnchors(win, dist), [win, dist])
  const stops = useStops(win, dist)
  const { ref, size, ctx } = useCanvas()

  useEffect(() => {
    const g = ctx()
    if (!g || !win || cursor == null || !dist.length) return
    const { w, h } = size
    const i = indexAt(win.t, cursor)
    const j = Math.min(i + 1, win.t.length - 1)
    const f = j > i ? Math.min(1, Math.max(0, (cursor - win.t[i]) / (win.t[j] - win.t[i]))) : 0
    const sp = Math.min(num(win, 'speed', i) ?? 0, 100)
    const pos = dist[i] + (dist[j] - dist[i]) * f
    const ru = lang === 'ru'

    // масштаб: трамвай занимает ~42% ширины, впереди видно ~37 м
    const K = Math.max(6, (w * 0.42) / TRAM_LEN)
    const front = w * 0.46
    const ground = Math.round(h * 0.70)
    const Y = (m: number) => ground - m * K
    const X = (worldM: number) => front + (worldM - pos) * K   // точка на пути -> экран

    // фон
    const bg = g.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, C.bg1); bg.addColorStop(1, C.bg0)
    g.fillStyle = bg; g.fillRect(0, 0, w, h)
    // сетка через 5 м по высоте и длине (привязана к пути)
    g.strokeStyle = C.grid; g.lineWidth = 1
    for (let m = Math.floor((pos - front / K) / 5) * 5; X(m) < w; m += 5) {
      g.beginPath(); g.moveTo(X(m), 0); g.lineTo(X(m), ground); g.stroke()
    }
    for (let m = 5; Y(m) > 0; m += 5) { g.beginPath(); g.moveTo(0, Y(m)); g.lineTo(w, Y(m)); g.stroke() }

    // контактная сеть и опоры через 35 м
    const wireY = Y(5.9)
    for (let m = Math.floor((pos - front / K) / 35) * 35; X(m) < w + 20; m += 35) {
      const x = X(m)
      g.fillStyle = C.pole; g.fillRect(x - 2, Y(7.2), 4, ground - Y(7.2))
      g.fillRect(x - 2, Y(6.4), 26, 2.5)
    }
    g.strokeStyle = C.wire; g.lineWidth = 1.4
    g.beginPath(); g.moveTo(0, wireY); g.lineTo(w, wireY); g.stroke()
    g.beginPath(); g.moveTo(0, Y(6.35)); g.lineTo(w, Y(6.35)); g.stroke()

    // путь: шпалы через 1 м, рельс
    g.fillStyle = C.sleeper
    for (let m = Math.floor(pos - front / K); X(m) < w; m += 1) g.fillRect(X(m) - 0.18 * K, ground + 2, 0.36 * K, 5)
    g.fillStyle = C.rail; g.fillRect(0, ground - 1, w, 3)

    // линейка метров от носа трамвая
    const rulerY = ground + 40
    g.strokeStyle = C.ruler; g.lineWidth = 1
    g.beginPath(); g.moveTo(front, rulerY); g.lineTo(w - 10, rulerY); g.stroke()
    g.fillStyle = C.muted; g.font = '11px Golos Text, sans-serif'
    for (let m = 0; front + m * K < w - 20; m += 10) {
      const x = front + m * K
      g.beginPath(); g.moveTo(x, rulerY - 5); g.lineTo(x, rulerY + 5); g.stroke()
      g.fillText(m === 0 ? (ru ? 'нос' : 'nose') : `${m} ${ru ? 'м' : 'm'}`, x - 8, rulerY + 18)
    }

    // остановки: стоят на пути
    for (const [name, s] of stops) {
      const x0 = X(s.at)
      if (x0 < -260 || x0 > w + 20) continue
      g.fillStyle = 'rgba(221,231,245,.18)'; g.fillRect(x0, ground - 7, 24 * K, 7)       // платформа
      g.fillStyle = C.pole; g.fillRect(x0 + 6, Y(3.2), 3, 3.2 * K)
      g.fillStyle = '#fff'; g.fillRect(x0 - 4, Y(3.6), 23, 23)                             // табличка остановки
      g.strokeStyle = C.body; g.lineWidth = 2.5; g.strokeRect(x0 - 4, Y(3.6), 23, 23)
      g.fillStyle = C.body; g.font = '700 15px Golos Text, sans-serif'; g.fillText('Т', x0 + 2.5, Y(3.6) + 17)
      g.fillStyle = C.text; g.font = '600 12px Golos Text, sans-serif'
      g.fillText(place(name, lang), x0 + 24, Y(3.6) + 10)
      const left = s.at - pos
      if (left > 0) { g.fillStyle = C.muted; g.font = '11px Golos Text, sans-serif'; g.fillText(`${left.toFixed(0)} ${ru ? 'м' : 'm'}`, x0 + 24, Y(3.6) + 24) }
    }

    // признаки на текущий момент
    const near = (k: string) => [i - 1, i, i + 1].some((q) => q >= 0 && q < win.t.length && (num(win, k, q) ?? 0) > 0.5)
    const ob = str(win, 'goal_obj_type', i) ?? 'Unknown'
    const dangerReal = near('danger_real')
    const tlReal = near('tl_real'), tlReq = near('tl_act')
    const aObj = activeAnchor(anchors.obj, i), aTl = activeAnchor(anchors.tl, i)
    const xo = aObj ? X(aObj.at) : 0

    // светофор
    if (aTl && X(aTl.at) > front - 4) {
      const xl = X(aTl.at) + (aObj && Math.abs(aTl.at - aObj.at) < 6 ? 4 * K : 0)
      g.fillStyle = C.pole; g.fillRect(xl - 2, Y(4.2), 4, 4.2 * K)
      g.fillStyle = '#05101f'; rr(g, xl - 9, Y(5.9), 18, 46, 4)
      ;[['255,48,34', tlReal], ['255,176,32', tlReq && !tlReal], ['47,209,122', false]].forEach(([rgb, on], k) => {
        const cy = Y(5.9) + 8 + k * 15
        if (on) { const gl = g.createRadialGradient(xl, cy, 0, xl, cy, 18); gl.addColorStop(0, `rgba(${rgb},.55)`); gl.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gl; g.beginPath(); g.arc(xl, cy, 18, 0, 7); g.fill() }
        g.fillStyle = on ? `rgb(${rgb})` : '#1d2a3d'; g.beginPath(); g.arc(xl, cy, 5, 0, 7); g.fill()
      })
      g.fillStyle = C.muted; g.font = '11px Golos Text, sans-serif'; g.fillText(t('schematic'), xl + 13, Y(4.4))
    }

    // объект: светящийся маркер на пути
    const showObj = !!aObj && xo > front - 4
    if (dangerReal && showObj) {
      const gr = g.createLinearGradient(front, 0, xo, 0)
      gr.addColorStop(0, `rgba(${C.glow},.30)`); gr.addColorStop(1, `rgba(${C.glow},.05)`)
      g.fillStyle = gr; g.fillRect(front, ground - 3, xo - front, 6)
    }
    if (showObj && aObj) {
      const fading = aObj.outcome === 'passed' && i > aObj.to
      const pulse = 0.88 + 0.12 * Math.sin(cursor / 260)
      const cy = Y(1.4), R = 3.2 * K * pulse
      g.save(); g.globalAlpha = fading ? 0.3 : 1
      const halo = g.createRadialGradient(xo, cy, 0, xo, cy, R)
      halo.addColorStop(0, `rgba(255,236,190,.95)`); halo.addColorStop(0.3, `rgba(${C.glow},.6)`); halo.addColorStop(1, `rgba(${C.glow},0)`)
      g.fillStyle = halo; g.beginPath(); g.arc(xo, cy, R, 0, 7); g.fill()
      const spot = g.createRadialGradient(xo, ground, 0, xo, ground, 2.6 * K)
      spot.addColorStop(0, `rgba(${C.glow},.45)`); spot.addColorStop(1, `rgba(${C.glow},0)`)
      g.fillStyle = spot; g.fillRect(xo - 2.6 * K, ground - 8, 5.2 * K, 16)
      g.fillStyle = '#fff8e6'; g.beginPath(); g.arc(xo, cy, 0.45 * K, 0, 7); g.fill()
      g.restore()
      const lbl = `${objName(ob === 'Unknown' ? 'Obstacle' : ob)}, ${t('schematic')}`
      g.font = '600 12px Golos Text, sans-serif'
      g.fillStyle = C.text; g.fillText(lbl, xo - g.measureText(lbl).width / 2, cy - R - 6)
    }

    // трамвай
    const ctl = str(win, 'controller', i) ?? 'und'
    const brakes = ['brake_mech', 'brake_rail', 'brake_crash', 'brake_emergency'].some((c) => (num(win, c, i) ?? 0) > 0.5)
    const rail = (num(win, 'brake_rail', i) ?? 0) > 0.5 || (num(win, 'brake_crash', i) ?? 0) > 0.5
    const floor = 0.35, top = 3.35
    let x = front - TRAM_LEN * K
    const rear = x
    SECS.forEach((len, k) => {
      const L = len * K
      const isFront = k === 2, isRear = k === 0
      // тележки
      const bogies = isRear ? [2.6] : isFront ? [len - 3.2] : [len / 2]
      bogies.forEach((b) => {
        const bx = x + b * K
        g.fillStyle = '#05101f'; rr(g, bx - 1.4 * K, Y(0.62), 2.8 * K, 0.42 * K, 3)
        ;[-0.9, 0.9].forEach((dx) => {
          const cx = bx + dx * K, cyw = ground - 0.32 * K
          g.fillStyle = '#26364f'; g.beginPath(); g.arc(cx, cyw, 0.32 * K, 0, 7); g.fill()
          g.strokeStyle = '#8fa3c0'; g.lineWidth = 1.2
          const a = pos / 0.32
          g.beginPath(); g.moveTo(cx, cyw); g.lineTo(cx + Math.cos(a) * 0.28 * K, cyw + Math.sin(a) * 0.28 * K); g.stroke()
        })
        if (rail) {   // магнитно-рельсовый тормоз прижат к рельсу
          const gl = g.createRadialGradient(bx, ground, 0, bx, ground, 1.6 * K)
          gl.addColorStop(0, 'rgba(179,140,255,.7)'); gl.addColorStop(1, 'rgba(179,140,255,0)')
          g.fillStyle = gl; g.fillRect(bx - 1.6 * K, ground - 1.6 * K, 3.2 * K, 1.6 * K)
          g.fillStyle = '#b38cff'; g.fillRect(bx - 0.6 * K, ground - 4, 1.2 * K, 4)
        }
      })
      // кузов
      const bodyTop = Y(top), bodyH = (top - floor) * K
      g.fillStyle = C.body
      if (isFront) {
        // наклонный лоб «Витязя»
        g.beginPath()
        g.moveTo(x, bodyTop); g.lineTo(x + L - 1.6 * K, bodyTop)
        g.quadraticCurveTo(x + L - 0.3 * K, bodyTop + 0.1 * K, x + L, Y(1.6))
        g.lineTo(x + L, Y(floor)); g.lineTo(x, Y(floor)); g.closePath(); g.fill()
      } else {
        rr(g, x, bodyTop, L, bodyH, isRear ? [6, 0, 0, 2] : 0)
      }
      // юбка и белая полоса
      g.fillStyle = C.skirt; g.fillRect(x, Y(0.95), isFront ? L - 0.05 * K : L, (0.95 - floor) * K)
      g.fillStyle = '#ffffff'; g.fillRect(x, Y(1.12), isFront ? L - 0.3 * K : L, 2)
      // окна: лента с переплётами
      const wy = Y(2.75), wh = 1.15 * K
      const wx0 = x + 0.5 * K, wx1 = x + L - (isFront ? 2.1 * K : 0.5 * K)
      g.fillStyle = C.glass; g.fillRect(wx0, wy, wx1 - wx0, wh)
      g.fillStyle = C.glassHi; g.fillRect(wx0, wy, wx1 - wx0, wh * 0.28)
      g.fillStyle = C.body
      for (let px = wx0 + 1.5 * K; px < wx1 - 4; px += 1.5 * K) g.fillRect(px, wy, 2.5, wh)
      // двери
      const doors = isRear ? [1.6, len - 3.0] : isFront ? [1.4, len - 4.6] : [len / 2 - 0.65]
      doors.forEach((d) => {
        const dx = x + d * K
        g.fillStyle = C.door; g.fillRect(dx, Y(2.95), 1.3 * K, (2.95 - floor - 0.05) * K)
        g.fillStyle = C.glass; g.fillRect(dx + 3, Y(2.75), 0.65 * K - 4, 1.5 * K); g.fillRect(dx + 0.65 * K + 1, Y(2.75), 0.65 * K - 4, 1.5 * K)
      })
      // крышевое оборудование
      g.fillStyle = C.roof; rr(g, x + (isFront ? 1.4 : isRear ? 2.4 : 1.8) * K, Y(top + 0.45), 3.4 * K, 0.45 * K, 2)
      if (isFront) {
        // чёрная маска лба, табло маршрута, фара
        g.fillStyle = C.glass
        g.beginPath(); g.moveTo(x + L - 2.0 * K, Y(3.0)); g.lineTo(x + L - 1.0 * K, Y(3.0))
        g.quadraticCurveTo(x + L - 0.2 * K, Y(2.7), x + L - 0.02 * K, Y(1.75)); g.lineTo(x + L - 2.0 * K, Y(1.75)); g.closePath(); g.fill()
        g.fillStyle = '#05101f'; g.fillRect(x + L - 4.6 * K, Y(3.25), 2.4 * K, 0.36 * K)
        g.fillStyle = C.amber; g.font = `700 ${Math.max(8, 0.3 * K)}px Golos Text, sans-serif`
        g.fillText((str(win, 'route', i) ?? '').split('.')[0], x + L - 4.4 * K, Y(3.25) + 0.3 * K)
        const hx = x + L - 0.25 * K, hy = Y(0.75)
        const hl = g.createRadialGradient(hx, hy, 0, hx, hy, 1.4 * K); hl.addColorStop(0, 'rgba(255,248,220,.75)'); hl.addColorStop(1, 'rgba(255,248,220,0)')
        g.fillStyle = hl; g.beginPath(); g.arc(hx, hy, 1.4 * K, 0, 7); g.fill()
        g.fillStyle = '#fffbe8'; g.beginPath(); g.arc(hx, hy, 2.6, 0, 7); g.fill()
        // кто управляет: огонёк над кабиной (синий ассистент, белый водитель)
        g.fillStyle = ctl === 'auto' ? '#4aa3ff' : ctl === 'driver' ? '#ffffff' : '#6b7a92'
        g.beginPath(); g.arc(x + L - 2.4 * K, Y(top) - 4, 3, 0, 7); g.fill()
      }
      x += L
      if (k < 2) { g.fillStyle = '#05101f'; g.fillRect(x, Y(3.05), GAP * K, 2.6 * K); x += GAP * K }
    })
    // задние огни: красные при торможении
    const tl = brakes ? '#ff3b2f' : '#5a1a1a'
    g.fillStyle = tl; g.fillRect(rear - 1, Y(1.0), 4, 0.5 * K)
    if (brakes) { const gl = g.createRadialGradient(rear, Y(0.8), 0, rear, Y(0.8), 2 * K); gl.addColorStop(0, 'rgba(255,59,47,.45)'); gl.addColorStop(1, 'rgba(255,59,47,0)'); g.fillStyle = gl; g.beginPath(); g.arc(rear, Y(0.8), 2 * K, 0, 7); g.fill() }
    // однорычажный пантограф над средней секцией
    const pcx = rear + (SECS[0] + GAP + SECS[1] / 2) * K
    g.strokeStyle = '#b9c6da'; g.lineWidth = 2.5
    g.beginPath(); g.moveTo(pcx - 0.8 * K, Y(top + 0.2)); g.lineTo(pcx + 0.6 * K, Y(top + 1.4)); g.lineTo(pcx - 0.3 * K, wireY + 2); g.stroke()
    g.fillStyle = '#b9c6da'; g.fillRect(pcx - 0.3 * K - 10, wireY - 1, 20, 3)

    // итог эпизода: остановился до объекта или проехал после снятия сигнала
    if (aObj && aObj.outcome === 'stopped' && aObj.stopIdx != null && i >= aObj.stopIdx) {
      const xs = X(dist[aObj.stopIdx])
      const by = ground + 18   // скобка «сколько не доехал» под рельсом, чтобы не спорить с подписью объекта
      g.save(); g.setLineDash([6, 4]); g.strokeStyle = C.ok; g.lineWidth = 2
      g.beginPath(); g.moveTo(xs, Y(3.8)); g.lineTo(xs, by + 6); g.stroke(); g.restore()
      g.strokeStyle = C.ok; g.lineWidth = 2
      g.beginPath(); g.moveTo(xs, by); g.lineTo(xo, by); g.moveTo(xo, by - 5); g.lineTo(xo, by + 5); g.stroke()
      g.fillStyle = C.ok; g.font = '700 12px Golos Text, sans-serif'
      const gapTxt = `~${aObj.gap} ${ru ? 'м' : 'm'}`
      g.fillText(gapTxt, xo + 8, by + 4)
    }
    let outcome: [string, string] | null = null
    if (aObj && aObj.outcome === 'stopped' && aObj.stopIdx != null && i >= aObj.stopIdx)
      outcome = [ru ? `Остановился до объекта, ~${aObj.gap} м (условно)` : `Stopped before the object, ~${aObj.gap} m (schematic)`, C.ok]
    else if (anchors.obj.some((a) => a.outcome === 'passed' && i > a.to && i <= a.to + 3))
      outcome = [ru ? 'Сигнал снят, трамвай продолжил движение' : 'Signal cleared, the tram kept going', C.slate]
    if (outcome) {
      g.font = '700 16px Golos Text, sans-serif'
      const ow = g.measureText(outcome[0]).width
      neon(g, w / 2 - ow / 2, h - 18, outcome[0], outcome[1], '700 16px Golos Text, sans-serif')
    }

    // показания: рамка по ширине самой длинной строки
    const gs = num(win, 'goal_speed', i)
    const spTxt = sp.toLocaleString(ru ? 'ru-RU' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    const sub = `${t('target')} ${gs == null ? t('noData') : gs.toFixed(0) + ' ' + t('kmh')}, ${ctrl(ctl)}`
    g.font = '700 34px "Sofia Sans Condensed", Golos Text, sans-serif'
    const spW = g.measureText(spTxt).width
    g.font = '13px Golos Text, sans-serif'
    const boxW = Math.max(spW + 6 + g.measureText(t('kmh')).width, g.measureText(sub).width) + 28
    g.fillStyle = 'rgba(5,16,31,.72)'; rr(g, 14, 14, boxW, 76, 6)
    g.fillStyle = '#fff'; g.font = '700 34px "Sofia Sans Condensed", Golos Text, sans-serif'
    g.fillText(spTxt, 28, 54)
    g.font = '13px Golos Text, sans-serif'; g.fillStyle = C.muted
    g.fillText(t('kmh'), 34 + spW, 54)
    g.fillText(sub, 28, 76)
    g.fillStyle = C.text; g.font = '700 15px Golos Text, sans-serif'
    g.textAlign = 'right'; g.fillText(hms(cursor), w - 16, 32); g.textAlign = 'left'
    const warn = num(win, 'm_warn_level', i) ?? 0
    const tags: [string, string][] = []
    if (warn > 0) tags.push([`${ru ? 'предупреждение' : 'warning'} ${warn.toFixed(0)}`, '#ffd166'])
    if (dangerReal) tags.push([ru ? 'торможение: препятствие' : 'braking: obstacle', '#ff9a4d'])
    if (tlReal) tags.push([ru ? 'торможение: светофор' : 'braking: signal', '#6cc4ff'])
    if (rail) tags.push([ru ? 'рельсовый тормоз' : 'rail brake', '#c4a8ff'])
    let tx = 14 + boxW + 12
    for (const [txt, c] of tags) tx += neon(g, tx, 36, txt, c) + 18
  }, [win, cursor, dist, size, lang, anchors, stops]) // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={ref} className="replay2d" aria-label="2D reconstruction" />
}
