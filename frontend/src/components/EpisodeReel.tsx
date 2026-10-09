import { useEffect, useRef, useState } from 'react'
import { KIND_COLOR, dmy, hms, indexAt, ms, num, str, type Series } from '../api'
import { useStore } from '../store'
import { place, useT, type Key } from '../i18n'
import Replay2D from './Replay2D'

/** Кнопка «Скачать ролик эпизода». На время записи невидимо собирается кадр 1280×720:
 *  2D-реконструкция + состояние системы + графики + субтитр из фактов. Всё из окна этого эпизода. */
const W = 1280, H = 720
const SCENE = { x: 0, y: 44, w: 820, h: 470 }
const SIDE = { x: 836, y: 56, w: 428 }
const PLOT = { x: 24, y: 560, w: 1232, h: 140 }
const MUTED = '#8A97A3', BG = '#1E2833', PANEL = '#26323E'
const FONT = 'Golos Text, sans-serif'

const LAMPS: [string, Key, string][] = [
  ['danger_real', 'lampDanger', '#0B2E7A'], ['tl_real', 'lampTl', '#2F7FE0'], ['sl_real', 'lampSl', '#A8BCD4'],
  ['brake_mech', 'lampMech', '#5d6a72'], ['brake_rail', 'lampRail', '#6A3FD0'], ['brake_emergency', 'lampEmerg', '#6A3FD0'],
  ['brake_crash', 'lampCrash', '#6A3FD0'], ['as_is_skid', 'lampSkid', '#0FA3B8'],
]
const SENSORS = ['t25Front', 'leftImage', 'tramSlaveVisor', 'ubloxGps', 'minsEth', 'odoFbTram', 'dbwFbTram']
const BANDS: [string, string][] = [['danger_real', 'rgba(11,46,122,.35)'], ['tl_real', 'rgba(47,127,224,.35)'], ['brake_rail', 'rgba(106,63,208,.4)']]

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.roundRect(x, y, w, h, r); g.fill()
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (g.measureText(next).width > maxW && line) { out.push(line); line = word } else line = next
  }
  if (line) out.push(line)
  return out
}

/** Полоса графика: линии рядов, заливка срабатываний, курсор. */
function strip(g: CanvasRenderingContext2D, win: Series, cursor: number, y: number, h: number,
  rows: [string, string][], lo: number, hi: number, label: string) {
  const { x, w } = PLOT
  const t0 = win.t[0], t1 = win.t[win.t.length - 1]
  const X = (t: number) => x + ((t - t0) / (t1 - t0 || 1)) * w
  const Y = (v: number) => y + h - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * h
  g.fillStyle = PANEL; g.fillRect(x, y, w, h)
  for (const [k, c] of BANDS) {
    g.fillStyle = c
    for (let i = 0; i < win.t.length - 1; i++) if ((num(win, k, i) ?? 0) > 0.5) g.fillRect(X(win.t[i]), y, X(win.t[i + 1]) - X(win.t[i]) + 1, h)
  }
  for (const [k, c] of rows) {
    g.strokeStyle = c; g.lineWidth = 2; g.beginPath()
    let started = false
    win.t.forEach((t, i) => {
      const v = num(win, k, i)
      if (v == null) { started = false; return }
      if (started) g.lineTo(X(t), Y(v)); else { g.moveTo(X(t), Y(v)); started = true }
    })
    g.stroke()
  }
  g.fillStyle = MUTED; g.font = `12px ${FONT}`; g.fillText(label, x + 8, y + 16)
  g.strokeStyle = '#fff'; g.lineWidth = 1.5
  g.beginPath(); g.moveTo(X(cursor), y - 4); g.lineTo(X(cursor), y + h + 4); g.stroke()
}

export default function EpisodeReel() {
  const { win, selected, set } = useStore()
  const { t, obj, ctrl, kind, lang } = useT()
  const ref = useRef<HTMLCanvasElement>(null)
  const sceneHost = useRef<HTMLDivElement>(null)
  const [recording, setRecording] = useState(false)

  const paint = useRef<() => void>(() => {})
  paint.current = () => {
    const { win, cursor, selected } = useStore.getState()
    const c = ref.current, g = c?.getContext('2d')
    if (!c || !g || !win || !selected || cursor == null) return
    const i = indexAt(win.t, cursor)
    g.fillStyle = BG; g.fillRect(0, 0, W, H)

    // заголовок
    g.fillStyle = KIND_COLOR[selected.kind]; g.fillRect(24, 14, 6, 20)
    g.fillStyle = '#fff'; g.font = `600 18px ${FONT}`
    const title = `${kind(selected.kind)}${selected.obj_type !== 'Unknown' ? `: ${obj(selected.obj_type)}` : ''}`
    g.fillText(title, 40, 31)
    const titleW = g.measureText(title).width
    g.fillStyle = MUTED; g.font = `14px ${FONT}`
    g.fillText(`${t('wagon')} ${selected.wagon}, ${dmy(ms(selected.start))}, ${t('route')} ${selected.route}`, 40 + titleW + 16, 31)
    g.fillStyle = '#fff'; g.font = `600 18px ${FONT}`
    g.textAlign = 'right'; g.fillText(hms(cursor), W - 24, 31); g.textAlign = 'left'

    // сцена: кадр 2D-реконструкции этого эпизода
    const src = sceneHost.current?.querySelector('canvas')
    if (src && src.width) g.drawImage(src, SCENE.x + 24, SCENE.y + 8, SCENE.w - 32, SCENE.h - 16)

    // панель состояния
    g.fillStyle = PANEL; rr(g, SIDE.x, SIDE.y, SIDE.w, 452, 10)
    let y = SIDE.y + 30
    const row = (label: string, value: string, color = '#fff') => {
      g.fillStyle = MUTED; g.font = `13px ${FONT}`; g.fillText(label, SIDE.x + 18, y)
      g.fillStyle = color; g.font = `600 15px ${FONT}`; g.textAlign = 'right'; g.fillText(value, SIDE.x + SIDE.w - 18, y); g.textAlign = 'left'
      y += 28
    }
    const v = num(win, 'speed', i), gs = num(win, 'goal_speed', i)
    g.fillStyle = '#fff'; g.font = `600 44px Unbounded, ${FONT}`
    const vTxt = v == null ? '-' : v.toFixed(1)
    g.fillText(vTxt, SIDE.x + 18, y + 20)
    const vW = g.measureText(vTxt).width
    g.fillStyle = MUTED; g.font = `15px ${FONT}`
    g.fillText(`${t('kmh')}, ${t('target')} ${gs == null ? t('noData') : gs.toFixed(0)}`, SIDE.x + 28 + vW, y + 18)
    y += 56
    const o = str(win, 'goal_obj_type', i)
    row(t('object'), o ? obj(o) : t('noData'), o && o !== 'Unknown' ? '#F2B36B' : '#fff')
    row(lang === 'ru' ? 'Режим автомата' : 'FSM state', str(win, 'fsm_state', i) ?? t('noData'))
    row(t('control'), ctrl(str(win, 'controller', i) ?? 'und'))
    const hd = num(win, 'handle_driver', i) ?? 0, ha = num(win, 'handle_assistant', i) ?? 0
    row(lang === 'ru' ? 'Рукоятка: водитель / ассистент' : 'Handle: driver / assistant', `${hd > 0 ? '+' : ''}${hd.toFixed(0)} / ${ha > 0 ? '+' : ''}${ha.toFixed(0)}`)
    const stop = str(win, 'stop_name', i), dts = num(win, 'dist_to_stop', i)
    row(lang === 'ru' ? 'Остановка' : 'Stop', stop ? `${place(stop, lang)}${dts != null ? `, ${dts.toFixed(0)} м` : ''}` : t('noData'))
    // уровень предупреждения
    const warn = num(win, 'm_warn_level', i) ?? 0
    g.fillStyle = MUTED; g.font = `13px ${FONT}`; g.fillText(lang === 'ru' ? 'Уровень предупреждения' : 'Warning level', SIDE.x + 18, y)
    g.fillStyle = '#3a4754'; rr(g, SIDE.x + 18, y + 8, SIDE.w - 36, 8, 4)
    if (warn > 0) { g.fillStyle = '#E0A100'; rr(g, SIDE.x + 18, y + 8, (SIDE.w - 36) * Math.min(1, warn / 255), 8, 4) }
    y += 40
    // лампы
    let lx = SIDE.x + 18
    g.font = `600 12px ${FONT}`
    for (const [k, label, col] of LAMPS) {
      const on = (num(win, k, i) ?? 0) > 0.5
      const tw = g.measureText(t(label)).width + 18
      if (lx + tw > SIDE.x + SIDE.w - 12) { lx = SIDE.x + 18; y += 30 }
      g.fillStyle = on ? col : '#33404c'; rr(g, lx, y - 15, tw, 24, 12)
      g.fillStyle = on ? '#fff' : '#7d8a96'; g.fillText(t(label), lx + 9, y + 1)
      lx += tw + 6
    }
    y += 34
    const lost = SENSORS.filter((k) => (num(win, k, i) ?? 1) < 0.5).length
    row(lang === 'ru' ? 'Датчики' : 'Sensors', lost ? (lang === 'ru' ? `нет данных: ${lost} из ${SENSORS.length}` : `${lost} of ${SENSORS.length} silent`) : (lang === 'ru' ? 'все на связи' : 'all online'),
      lost ? '#F2B36B' : '#7ED3A4')

    // субтитр: последний факт разбора к этому моменту
    const facts = selected.facts.filter((f) => f.section !== 'limits' && ms(f.t) <= cursor)
    const f = facts[facts.length - 1]
    if (f) {
      g.font = `15px ${FONT}`
      const lines = wrap(g, `${hms(ms(f.t))}  ${(lang === 'en' && f.text_en ? f.text_en : f.text).replace(/^(В|At) \d\d:\d\d:\d\d(\.\d)?:? ?/, '')}`, SCENE.w - 80)
      const bh = 14 + lines.length * 21
      g.fillStyle = 'rgba(16,22,28,.82)'; rr(g, SCENE.x + 40, SCENE.y + SCENE.h - bh - 18, SCENE.w - 64, bh, 8)
      g.fillStyle = '#fff'
      lines.forEach((l, k) => g.fillText(l, SCENE.x + 54, SCENE.y + SCENE.h - bh - 18 + 26 + k * 21))
    }

    // графики
    strip(g, win, cursor, PLOT.y - 34, 74, [['goal_speed', '#8A97A3'], ['speed', '#ffffff']], 0, 70,
      lang === 'ru' ? 'Скорость и требуемая скорость, км/ч' : 'Speed and target speed, km/h')
    strip(g, win, cursor, PLOT.y + 50, 74, [['handle_driver', '#cfd6dc'], ['handle_assistant', '#4FA3E0']], -15, 15,
      lang === 'ru' ? 'Рукоятка: водитель (светлая), ассистент (синяя)' : 'Handle: driver (light), assistant (blue)')
  }
  // запись ведёт свой таймер: кадр рисуется и сразу отдаётся в поток, не завися от requestAnimationFrame
  const record = () => {
    const c = ref.current
    if (!c || !win || !selected) { setRecording(false); return }
    const stream = c.captureStream(0)
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
    const r = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined)
    const chunks: Blob[] = []
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    r.onstop = () => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }))
      a.download = `episode_${selected.id.replace('#', '_')}.webm`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      setRecording(false)
    }
    const t0 = win.t[0], t1 = win.t[win.t.length - 1], step = 1000 / 30
    let cur = t0
    set({ cursor: cur, playing: false })
    r.start(250)
    const timer = setInterval(() => {
      cur = Math.min(t1, cur + step * useStore.getState().rate)
      useStore.getState().set({ cursor: cur })
      paint.current()
      track.requestFrame()
      if (cur >= t1) { clearInterval(timer); setTimeout(() => r.stop(), 300) }
    }, step)
  }

  // кадр и источник сцены монтируются только на время записи; дадим 2D-сцене отрисоваться и стартуем
  useEffect(() => {
    if (!recording) return
    const id = setTimeout(record, 400)
    return () => clearTimeout(id)
  }, [recording]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <button className="btn reel-btn" disabled={recording || !win} onClick={() => setRecording(true)} title={t('reelNote')}>
        {recording ? <span className="spinner dark" /> : null}{recording ? t('reelRecording') : t('reelDownload')}
      </button>
      {recording && (
        <div className="reel-offscreen" aria-hidden>
          <canvas ref={ref} width={W} height={H} />
          <div ref={sceneHost} className="reel-src"><Replay2D /></div>
        </div>
      )}
    </>
  )
}
