import { useEffect } from 'react'
import { indexAt, num, str, hms } from '../api'
import { useStore } from '../store'
import { place, useT } from '../i18n'
import { useCanvas } from './useCanvas'
import { useDistance } from './Tram3D'

const K = 5.2           // пикселей на метр
const SECS = [9.2, 8.6, 9.2]
const GAP = 0.55
const TRAM_LEN = SECS.reduce((a, b) => a + b, 0) + GAP * 2
const RED = '#c4262e', GLASS = '#1d2a33', WHITE = '#f3f1ec'
const FACADES = ['#e9c874', '#dca7a2', '#a9c7a6', '#e8ddc9', '#c9d6e3', '#e3b07c']

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  g.beginPath(); g.roundRect(x, y, w, h, r); g.fill()
}

/** Вид сбоку: трамвай с пантографом у контактного провода, объекты впереди условно. */
export default function Replay2D() {
  const { win, cursor } = useStore()
  const { t, obj: objName, ctrl, lang } = useT()
  const dist = useDistance(win)
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
    const ground = h * 0.8
    const front = 60 + TRAM_LEN * K
    const Y = (m: number) => ground - m * K // высота в метрах -> экран

    // небо и застройка (параллакс)
    const sky = g.createLinearGradient(0, 0, 0, ground)
    sky.addColorStop(0, '#c7d9e6'); sky.addColorStop(1, '#eef3f6')
    g.fillStyle = sky; g.fillRect(0, 0, w, ground)
    for (let k = -1; k < 14; k++) {
      const bw = 90 + (k % 3) * 24
      const bx = ((k * 120 - pos * K * 0.35) % (14 * 120) + 14 * 120) % (14 * 120) - 120
      const bh = 120 + ((k * 37) % 4) * 22
      g.fillStyle = FACADES[((k % 6) + 6) % 6]
      g.fillRect(bx, ground - bh - 26, bw, bh)
      g.fillStyle = 'rgba(40,55,66,.55)'
      for (let r = 0; r < Math.floor(bh / 26); r++) for (let c = 0; c < Math.floor(bw / 20); c++) g.fillRect(bx + 6 + c * 20, ground - bh - 18 + r * 26, 9, 12)
    }
    // тротуар, мостовая, рельс
    g.fillStyle = '#b9b4aa'; g.fillRect(0, ground - 26, w, 8)
    g.fillStyle = '#5b6165'; g.fillRect(0, ground - 18, w, h - ground + 18)
    g.fillStyle = '#7d8079'; g.fillRect(0, ground - 2, w, h - ground + 2)
    g.fillStyle = '#c3cace'; g.fillRect(0, ground - 3, w, 3)
    // контактная сеть
    const wireY = Y(6)
    for (let s = Math.floor((pos - 30) / 30) * 30; ; s += 30) {
      const x = front + (s - pos) * K
      if (x > w + 20) break
      if (x < -20) continue
      g.fillStyle = '#6f787d'; g.fillRect(x - 3, Y(8), 6, ground - 26 - Y(8))
      g.fillRect(x, Y(6.9), 30, 3)
    }
    g.strokeStyle = '#3a3f42'; g.lineWidth = 1.5
    g.beginPath(); g.moveTo(0, wireY); g.lineTo(w, wireY); g.stroke()
    g.strokeStyle = '#59606a'; g.lineWidth = 1
    g.beginPath(); g.moveTo(0, Y(6.8)); g.lineTo(w, Y(6.8)); g.stroke()

    // остановка: реальное расстояние из CSV
    const dStop = num(win, 'dist_to_stop', i), stopName = str(win, 'stop_name', i)
    if (dStop != null && stopName && dStop < (w - front) / K) {
      const x0 = front + dStop * K
      g.fillStyle = '#c8c3b8'; g.fillRect(x0, ground - 10, 30 * K, 10)
      g.fillStyle = '#3a4a55'; g.fillRect(x0 + 40, Y(2.6), 70, 5); g.fillRect(x0 + 44, Y(2.6), 4, 2.6 * K - 10); g.fillRect(x0 + 102, Y(2.6), 4, 2.6 * K - 10)
      g.fillStyle = '#1d4f91'; rr(g, x0 + 40, Y(3.6), 150, 20, 3)
      g.fillStyle = '#fff'; g.font = '600 12px Golos Text, sans-serif'
      g.fillText(`${place(stopName, lang)} · ${dStop.toFixed(0)} ${lang === "ru" ? "м" : "m"}`.slice(0, 30), x0 + 46, Y(3.6) + 14)
    }

    // объект и светофор условно: по тормозному пути
    const near = (k: string) => [i - 1, i, i + 1].some((q) => q >= 0 && q < win.t.length && (num(win, k, q) ?? 0) > 0.5)
    const ob = str(win, 'goal_obj_type', i) ?? 'Unknown'
    const dangerReal = near('danger_real'), dangerReq = near('danger_act')
    const tlReal = near('tl_real'), tlReq = near('tl_act')
    const dCond = Math.min(80, Math.max(12, (sp / 3.6) ** 2 / 2 + 8))
    const xo = front + dCond * K
    if (dangerReal) {
      const gr = g.createLinearGradient(front, 0, xo, 0)
      gr.addColorStop(0, 'rgba(209,53,43,.45)'); gr.addColorStop(1, 'rgba(209,53,43,.08)')
      g.fillStyle = gr; g.fillRect(front, ground - 4, xo - front, 10)
    }
    const showObj = ['Ped', 'Vehicle', 'Tram', 'Obstacle'].includes(ob) || dangerReal || dangerReq
    if (showObj) {
      g.save(); g.setLineDash([5, 4]); g.strokeStyle = '#d1352b'; g.lineWidth = 2
      if (ob === 'Vehicle') {
        g.fillStyle = 'rgba(47,111,214,.85)'; rr(g, xo, Y(1.5), 4.3 * K, 1.1 * K, 6); rr(g, xo + 0.8 * K, Y(2.0), 2.4 * K, 0.7 * K, 6)
        g.fillStyle = '#222'; [xo + 0.9 * K, xo + 3.4 * K].forEach((cx) => { g.beginPath(); g.arc(cx, ground - 0.35 * K, 0.35 * K, 0, 7); g.fill() })
      } else if (ob === 'Tram') {
        g.fillStyle = 'rgba(109,44,145,.85)'; rr(g, xo, Y(3.3), 27 * K, 3 * K, 8)
      } else {
        g.fillStyle = '#d1352b'; rr(g, xo - 6, Y(1.55), 12, 1.0 * K, 5)
        g.fillRect(xo - 5, Y(0.6), 4, 0.6 * K); g.fillRect(xo + 1, Y(0.6), 4, 0.6 * K)
        g.fillStyle = '#f0c8a8'; g.beginPath(); g.arc(xo, Y(1.75), 0.2 * K, 0, 7); g.fill()
      }
      g.restore()
      g.fillStyle = '#8d2a1c'; g.font = '600 12px Golos Text, sans-serif'
      g.fillText(`${objName(ob)}, ${t('schematic')}`, xo - 10, Y(4.2))
    }
    if (ob === 'TrafficLightSignal' || tlReq || tlReal) {
      const xl = showObj ? xo + 70 : xo
      g.fillStyle = '#2a2f33'; g.fillRect(xl, Y(4), 4, 4 * K); rr(g, xl - 7, Y(5.3), 18, 1.4 * K, 3)
      ;['#ff3022', '#ffb020', '#2fd17a'].forEach((c, k) => {
        const on = (k === 0 && tlReal) || (k === 1 && tlReq && !tlReal)
        g.fillStyle = on ? c : '#444'; g.beginPath(); g.arc(xl + 2, Y(5.3) + 7 + k * 8.5, 3.3, 0, 7); g.fill()
      })
      g.fillStyle = '#7a5507'; g.font = '12px Golos Text, sans-serif'
      g.fillText(t('schematic'), xl + 16, Y(4.6))
    }

    // трамвай
    const ctl = str(win, 'controller', i) ?? 'und'
    const brakes = ['brake_mech', 'brake_rail', 'brake_crash', 'brake_emergency'].some((c) => (num(win, c, i) ?? 0) > 0.5)
    const rail = (num(win, 'brake_rail', i) ?? 0) > 0.5 || (num(win, 'brake_crash', i) ?? 0) > 0.5
    let x = front - TRAM_LEN * K
    const rear = x
    const floor = 0.45
    SECS.forEach((len, k) => {
      const L = len * K
      const isFront = k === 0, isRear = k === 2
      // тележки и колёса
      const bogies = isFront ? [L - 2.4 * K] : isRear ? [2.4 * K] : [L / 2]
      bogies.forEach((bx) => {
        g.fillStyle = '#2a2f33'; rr(g, x + bx - 1.3 * K, Y(0.75), 2.6 * K, 0.4 * K, 3)
        ;[-0.95, 0.95].forEach((dx) => {
          g.fillStyle = '#3b4045'; g.beginPath(); g.arc(x + bx + dx * K, ground - 0.33 * K, 0.33 * K, 0, 7); g.fill()
          g.strokeStyle = '#9aa3a8'; g.lineWidth = 1.2
          const a = pos / 0.33
          g.beginPath(); g.moveTo(x + bx + dx * K, ground - 0.33 * K); g.lineTo(x + bx + dx * K + Math.cos(a) * 0.3 * K, ground - 0.33 * K + Math.sin(a) * 0.3 * K); g.stroke()
        })
        if (rail) { g.fillStyle = '#b44dff'; g.fillRect(x + bx - 0.55 * K, ground - 0.12 * K - 3, 1.1 * K, 4) }
      })
      // кузов: красный низ, окна, белый верх
      const r: [number, number, number, number] = [isRear ? 10 : 3, isFront ? 18 : 3, isFront ? 8 : 3, isRear ? 8 : 3]
      g.fillStyle = WHITE; rr(g, x, Y(3.25), L, (3.25 - floor) * K, r)
      g.fillStyle = RED; rr(g, x, Y(1.5), L, (1.5 - floor) * K, [0, 0, r[2], r[3]])
      g.fillStyle = GLASS; g.fillRect(x + 4, Y(2.7), L - (isFront ? 14 : 8), 1.15 * K)
      g.fillStyle = WHITE
      for (let px = x + 4 + 1.45 * K; px < x + L - 10; px += 1.45 * K) g.fillRect(px, Y(2.7), 3, 1.15 * K)
      // двери
      const doors = isFront || isRear ? [2.6, len - 3.2] : [len / 2 - 2.2, len / 2 + 1.0]
      doors.forEach((d) => {
        g.fillStyle = '#9ea7ab'; g.fillRect(x + d * K, Y(2.75), 1.3 * K, 2.25 * K)
        g.fillStyle = GLASS; g.fillRect(x + d * K + 4, Y(2.55), 0.5 * K, 1.2 * K); g.fillRect(x + d * K + 0.65 * K, Y(2.55), 0.5 * K, 1.2 * K)
      })
      // крыша
      g.fillStyle = '#aeb5b8'; rr(g, x + (isFront ? 2 : isRear ? 3.2 : 2.3) * K, Y(3.75), 2.6 * K, 0.45 * K, 3)
      if (isFront) {
        g.fillStyle = GLASS
        g.beginPath(); g.moveTo(x + L - 10, Y(2.85)); g.lineTo(x + L, Y(2.5)); g.lineTo(x + L, Y(1.55)); g.lineTo(x + L - 10, Y(1.55)); g.fill()
        g.fillStyle = '#111'; g.fillRect(x + L - 26, Y(3.15), 22, 9)
        g.fillStyle = '#ffb020'; g.font = '600 8px Golos Text, sans-serif'; g.fillText((str(win, 'route', i) ?? '').split('.')[0], x + L - 22, Y(3.15) + 8)
        g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(x + L - 3, Y(0.85), 3, 0, 7); g.fill()
        g.fillStyle = ctl === 'auto' ? '#4aa3ff' : ctl === 'driver' ? '#ffffff' : '#7c8890'
        g.beginPath(); g.arc(x + L - 6, Y(3.35), 3, 0, 7); g.fill()
      }
      x += L
      if (k < 2) { g.fillStyle = '#2b2b2b'; g.fillRect(x, Y(3.1), GAP * K, 2.6 * K); x += GAP * K }
    })
    // задние огни
    g.fillStyle = brakes ? '#ff2a1a' : '#5a1010'
    g.fillRect(rear - 2, Y(1.05), 4, 7)
    if (brakes) { g.fillStyle = 'rgba(255,42,26,.25)'; g.beginPath(); g.arc(rear, Y(0.95), 14, 0, 7); g.fill() }
    // пантограф над средней секцией
    const pcx = rear + (SECS[2] + GAP) * K + (SECS[1] / 2) * K
    g.strokeStyle = '#5b6369'; g.lineWidth = 3
    g.beginPath(); g.moveTo(pcx - 0.7 * K, Y(3.35)); g.lineTo(pcx + 0.75 * K, Y(4.85)); g.lineTo(pcx - 0.2 * K, wireY + 3); g.stroke()
    g.fillStyle = '#30363a'; g.fillRect(pcx - 0.2 * K - 9, wireY, 18, 3)

    // показания
    g.fillStyle = 'rgba(255,255,255,.88)'; rr(g, 12, 12, 220, 74, 8)
    g.fillStyle = '#16222b'; g.font = '600 30px Unbounded, Golos Text, sans-serif'
    g.fillText(sp.toFixed(1), 24, 50)
    const spW = g.measureText(sp.toFixed(1)).width
    g.font = '13px Golos Text, sans-serif'; g.fillStyle = '#5d6a72'
    g.fillText(t('kmh'), 30 + spW, 50)
    const gs = num(win, 'goal_speed', i)
    g.fillText(`${t('target')} ${gs == null ? t('noData') : gs.toFixed(0) + ' ' + t('kmh')} · ${ctrl(ctl)}`, 24, 72)
    g.fillStyle = '#16222b'; g.font = '600 14px Golos Text, sans-serif'
    g.fillText(hms(cursor), w - 84, 28)
    const warn = num(win, 'm_warn_level', i) ?? 0
    const tags: [string, string][] = []
    if (warn > 0) tags.push([`${lang === 'ru' ? 'предупреждение' : 'warning'} ${warn.toFixed(0)}`, '#e3a21a'])
    if (dangerReal) tags.push([lang === 'ru' ? 'торможение: препятствие' : 'braking: obstacle', '#d1352b'])
    if (tlReal) tags.push([lang === 'ru' ? 'торможение: светофор' : 'braking: signal', '#b07c0b'])
    if (rail) tags.push([lang === 'ru' ? 'рельсовый тормоз' : 'rail brake', '#6d2c91'])
    let tx = 246
    g.font = '600 12px Golos Text, sans-serif'
    for (const [txt, c] of tags) {
      const tw = g.measureText(txt).width + 16
      g.fillStyle = c; rr(g, tx, 14, tw, 22, 11)
      g.fillStyle = '#fff'; g.fillText(txt, tx + 8, 29)
      tx += tw + 6
    }
  }, [win, cursor, dist, size, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={ref} className="replay2d" aria-label="2D reconstruction" />
}
