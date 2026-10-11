import { useEffect, useMemo, useState } from 'react'
import { KIND_COLOR, dmy, hms, indexAt, ms, num, str, type Fact } from '../api'
import { useStore, type View } from '../store'
import { place, useT, type Key } from '../i18n'
import Tram3D, { PARTS, type PartId } from '../components/Tram3D'
import Replay2D from '../components/Replay2D'
import EpisodeReel from '../components/EpisodeReel'
import Charts from '../components/Charts'
import { openEpisode } from '../nav'
import AiPanel, { AiBanner } from '../components/AiPanel'
import SceneBoundary from '../components/SceneBoundary'
import './episode.css'

const SECTIONS = ['circumstances', 'reaction', 'result', 'limits'] as const

/** Шкала под числом: где значение относительно разумного максимума. */
function Meter({ v, max, from, color }: { v: number; max: number; from?: number; color: string }) {
  const a = Math.max(0, Math.min(1, (from ?? 0) / max)), b = Math.max(0, Math.min(1, v / max))
  return <div className="meter" aria-hidden><i style={{ left: `${a * 100}%`, width: `${Math.max(b - a, 0.01) * 100}%`, background: color }} /></div>
}

function Player() {
  const { win, cursor, playing, rate, selected, set } = useStore()
  const { t } = useT()
  useEffect(() => {
    if (!playing || !win) return
    let raf = 0, last = performance.now()
    const end = win.t[win.t.length - 1]
    const tick = (now: number) => {
      const { cursor: c, rate: r } = useStore.getState()
      const next = (c ?? win.t[0]) + (now - last) * r
      last = now
      if (next >= end) { set({ cursor: end, playing: false }); return }
      set({ cursor: next })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, win, set])
  if (!win || !selected) return null
  const t0 = win.t[0], t1 = win.t[win.t.length - 1]
  const trig = ms(selected.start)
  return (
    <div className="player">
      <button className="btn primary play" onClick={() => {
        if (!playing && cursor != null && cursor >= t1) set({ cursor: t0 })
        set({ playing: !playing })
      }} aria-label={playing ? t('pause') : t('play')}>
        {playing ? <svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
          : <svg viewBox="0 0 16 16"><path d="M4 2.5v11l9.5-5.5z" /></svg>}
      </button>
      <button className="btn" onClick={() => set({ cursor: trig - 5000, playing: false })}>{t('toTrigger')}</button>
      <div className="scrub">
        <div className="scrub-mark" style={{ left: `${((trig - t0) / (t1 - t0)) * 100}%`, background: KIND_COLOR[selected.kind] }} />
        <input type="range" min={t0} max={t1} step={100} value={cursor ?? t0}
          onChange={(e) => set({ cursor: Number(e.target.value), playing: false })} aria-label="timeline" />
      </div>
      <span className="time">{cursor ? hms(cursor) : ''}</span>
      <div className="rates" role="group">
        {[1, 2, 4, 8].map((r) => (
          <button key={r} className="rate" aria-pressed={rate === r} onClick={() => set({ rate: r })}>{r}×</button>
        ))}
      </div>
    </div>
  )
}

const LAMPS: [string, Key, string][] = [
  ['danger_real', 'lampDanger', '#0B2E7A'], ['tl_real', 'lampTl', '#2F7FE0'], ['sl_real', 'lampSl', '#A8BCD4'],
  ['brake_mech', 'lampMech', '#17202B'], ['brake_rail', 'lampRail', '#6A3FD0'], ['brake_crash', 'lampCrash', '#6A3FD0'],
  ['brake_emergency', 'lampEmerg', '#6A3FD0'], ['as_is_skid', 'lampSkid', '#0FA3B8'],
]

function StateStrip() {
  const { win, cursor } = useStore()
  const { t, ctrl, obj } = useT()
  if (!win || cursor == null) return null
  const i = indexAt(win.t, cursor)
  const v = num(win, 'speed', i), g = num(win, 'goal_speed', i)
  const c = str(win, 'controller', i) ?? 'und'
  const o = str(win, 'goal_obj_type', i)
  const hd = num(win, 'handle_driver', i) ?? 0, ha = num(win, 'handle_assistant', i) ?? 0
  return (
    <div className="state-strip">
      <div className="spd">
        <div className="spd-v"><b>{v == null ? '-' : v.toFixed(0)}</b><span>{t('kmh')}</span></div>
        <div className="spd-track" aria-hidden>
          <i style={{ width: `${(Math.min(v ?? 0, 70) / 70) * 100}%` }} />
          {g != null && <em style={{ left: `${(Math.min(g, 70) / 70) * 100}%` }} />}
        </div>
        <div className="spd-scale" aria-hidden><span>0</span><span>35</span><span>70</span></div>
        <small>{g != null ? `${t('target')} ${g.toFixed(0)} ${t('kmh')}` : ' '}</small>
      </div>
      <div className="handles">
        <span>{t('control')}: <b className={`ctrl ctrl-${c}`}>{ctrl(c)}</b></span>
        {[['sHDriver', hd, '#17202B'], ['sHAssist', ha, '#0072B2']].map(([k, val, colr]) => (
          <div className="hbar" key={k as string}>
            <small>{t(k as Key)}</small>
            <div className="track"><i style={{ left: '50%', width: `${Math.abs(val as number) / 30 * 100}%`, transform: (val as number) < 0 ? 'translateX(-100%)' : 'none', background: colr as string }} /></div>
            <small className="num">{(val as number) > 0 ? '+' : ''}{(val as number).toFixed(0)}</small>
          </div>
        ))}
        <span>{t('object')}: <b>{o ? obj(o) : t('noData')}</b></span>
      </div>
      <div className="lamps">
        {LAMPS.map(([k, label, colr]) => {
          const on = (num(win, k, i) ?? 0) > 0.5
          return <span key={k} className={`lamp ${on ? 'on' : ''}`} style={{ '--c': colr } as React.CSSProperties}>{t(label)}</span>
        })}
      </div>
    </div>
  )
}

const SEC_COLOR: Record<string, string> = { circumstances: '#A8BCD4', reaction: '#0B2E7A', result: '#17202B', limits: '#2F7FE0' }

/** Хронология фактов: где в окне эпизода что произошло; клик переносит курсор. */
function FactLine() {
  const { selected, win, cursor, set } = useStore()
  const { t } = useT()
  if (!selected || !win) return null
  const t0 = win.t[0], t1 = win.t[win.t.length - 1]
  const x = (v: number) => `${Math.max(0, Math.min(1, (v - t0) / (t1 - t0))) * 100}%`
  return (
    <section className="factline">
      <h3>{t('timeline')}</h3>
      {SECTIONS.map((sec) => {
        const fs = selected.facts.filter((f) => f.section === sec)
        if (!fs.length) return null
        return (
          <div className="fl-row" key={sec}>
            <small>{t(`ss_${sec}` as Key)}</small>
            <div className="fl-track">
              {cursor != null && <span className="fl-cur" style={{ left: x(cursor) }} />}
              {fs.map((f, k) => (
                <button key={k} style={{ left: x(ms(f.t)), background: SEC_COLOR[sec] }} title={`${hms(ms(f.t))} ${f.text}`}
                  aria-label={`${hms(ms(f.t))}`} onClick={() => set({ cursor: ms(f.t), playing: false })} />
              ))}
            </div>
          </div>
        )
      })}
      <div className="fl-axis"><span>{hms(t0)}</span><span>{hms(t1)}</span></div>
    </section>
  )
}

export default function Episode() {
  const { selected, episodes, kinds, view, lang, set } = useStore()
  const { t, kind, obj, sev } = useT()
  const loc = lang === 'ru' ? 'ru-RU' : 'en-US'
  const n0 = (x: number) => x.toLocaleString(loc, { maximumFractionDigits: 0 })
  const n2 = (x: number) => x.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const [part, setPart] = useState<PartId | null>(null)
  // правая колонка с хронологией и фактами сворачивается; выбор запоминаем
  const [sideOpen, setSideOpen] = useState(() => { try { return localStorage.getItem('epSide') !== 'closed' } catch { return true } })
  const toggleSide = () => setSideOpen((o) => {
    try { localStorage.setItem('epSide', o ? 'closed' : 'open') } catch { /* приватный режим */ }
    return !o
  })
  const list = useMemo(() => episodes.filter((e) => kinds.has(e.kind)), [episodes, kinds])
  if (!selected) return <div className="empty big" role="status"><span className="spinner dark" />{t('epLoading')}</div>
  const e = selected
  const idx = list.findIndex((x) => x.id === e.id)
  const goto = (f: Fact) => set({ cursor: ms(f.t), playing: false })
  const title = `${kind(e.kind)}${e.obj_type !== 'Unknown' && e.kind !== 'traffic_light' ? `: ${obj(e.obj_type)}` : ''}`
  const views: [View, Key][] = [['3d', 'view3d'], ['2d', 'view2d']]

  return (
    <div className="episode">
      <header className="ep-head">
        <button className="btn ghost back" onClick={() => set({ page: 'overview' })}>
          <svg viewBox="0 0 16 16" aria-hidden><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          {t('back')}
        </button>
        <div className="ep-title">
          {/* цвет категории несёт сам заголовок, без полоски; бледный цвет ограничения скорости не читается текстом */}
          <h1 style={{ color: e.kind === 'speed_limit' ? 'var(--ink-2)' : KIND_COLOR[e.kind] }}>{title}</h1>
          <span className={`sev sev-${e.severity}`}>{sev(e.severity)}</span>
        </div>
        <p className="ep-sub">
          {t('wagon')} {e.wagon}, {dmy(ms(e.start))} {hms(ms(e.start))}, {t('route')} {e.route}
          {e.stop ? `, ${t('nearStop')} «${place(e.stop, lang)}»` : ''}
        </p>
        <div className="ep-nav">
          <AiPanel />
          <button className="btn" disabled={idx <= 0} onClick={() => openEpisode(list[idx - 1].id)}>{t('prev')}</button>
          <button className="btn" disabled={idx < 0 || idx >= list.length - 1} onClick={() => openEpisode(list[idx + 1].id)}>{t('next')}</button>
        </div>
      </header>

      <div className="ep-kpis">
        <div className="ep-kpi speed">
          <b>{n0(e.speed_start)}<small> {t('kmh')}</small> <span className="to">{t('to')}</span> {n0(e.speed_min)}</b>
          <span>{t('speedDrop')}{e.stopped ? `, ${t('stoppedShort')}` : ''}</span>
          <Meter v={e.speed_start} max={70} from={e.speed_min} color="var(--ink)" />
        </div>
        <div className="ep-kpi">
          <b>{n2(e.max_decel)}</b><span>{t('maxDecel')}</span>
          <Meter v={e.max_decel} max={3} color={e.max_decel >= 1.5 ? 'var(--alarm)' : 'var(--ink-2)'} />
        </div>
        <div className="ep-kpi">
          <b>{e.reaction_s == null ? t('none') : `${n0(e.reaction_s)} ${t('sec')}`}</b><span>{t('reaction')}</span>
        </div>
        <div className="ep-kpi">
          <b>{e.warn_max ? n0(e.warn_max) : t('none')}</b><span>{t('warnMax')}</span>
          <Meter v={e.warn_max ?? 0} max={255} color="var(--warn)" />
        </div>
      </div>

      <AiBanner />

      <div className={`ep-grid ${sideOpen ? '' : 'side-closed'}`}>
        <div className="ep-main">
          <section className="panel viewer">
            <div className="tabs" role="tablist">
              {views.map(([v, k]) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => set({ view: v })}>{t(k)}</button>
              ))}
              <span className="grow" />
              {view === '3d' && <span className="hint">{t('hoverHint')}</span>}
              <EpisodeReel />
            </div>
            <div className="viewer-body">
              {view === '3d' && (
                <SceneBoundary fallback={
                  <div className="no3d"><p>{t('no3d')}</p><button className="btn" onClick={() => set({ view: '2d' })}>{t('open2d')}</button></div>
                }>
                  <Tram3D mode="replay" onPick={setPart} />
                </SceneBoundary>
              )}
              {view === '2d' && <Replay2D />}
              {view === '3d' && part && (
                <div className="part-card">
                  <button className="x" onClick={() => setPart(null)} aria-label="close">×</button>
                  <b>{PARTS[part][lang]}</b>
                  <p>{lang === 'ru' ? PARTS[part].dru : PARTS[part].den}</p>
                  {PARTS[part].fields.length > 0 && <code>{PARTS[part].fields.join(', ')}</code>}
                </div>
              )}
            </div>
            <Player />
          </section>
          <StateStrip />
          <section className="panel">
            <div className="panel-h"><h2>{t('chartsTitle')}</h2><span className="hint">{t('chartsHint')}</span></div>
            <Charts />
            <div className="legend-bands">
              {t('bands')}:
              <i style={{ background: 'rgba(11,46,122,.45)' }} />{t('lampDanger')}
              <i style={{ background: 'rgba(47,127,224,.45)' }} />{t('lampTl')}
              <i style={{ background: 'rgba(168,188,212,.35)' }} />{t('lampSl')}
              <i style={{ background: 'rgba(106,63,208,.85)', height: 4 }} />{lang === 'ru' ? 'тормоз (полоска снизу)' : 'brake (strip at the bottom)'}
            </div>
          </section>
        </div>
        {!sideOpen ? (
          <button className="side-rail" onClick={toggleSide} aria-expanded={false} aria-controls="ep-side">
            <span>{lang === 'ru' ? 'Хронология и факты' : 'Timeline and facts'}</span>
          </button>
        ) : (
        <aside className="ep-side" id="ep-side">
          <button className="side-toggle" onClick={toggleSide} aria-expanded={true} aria-controls="ep-side">
            {lang === 'ru' ? 'Свернуть панель' : 'Collapse panel'}
          </button>
          <FactLine />
          {SECTIONS.map((sname) => {
            const facts = e.facts.filter((f) => f.section === sname)
            if (!facts.length) return null
            return (
              <section key={sname} className={`facts sec-${sname}`}>
                <h3>{t(`sec_${sname}` as Key)}</h3>
                {facts.map((f, k) => (
                  <div className="fact" key={k}>
                    <button onClick={() => goto(f)}>{hms(ms(f.t))}</button>
                    <p>
                      {(lang === 'en' && f.text_en ? f.text_en : f.text).replace(/^(В|At) \d\d:\d\d:\d\d:? ?/, '')}
                      <small>{t('field')}: {f.field}</small>
                    </p>
                  </div>
                ))}
              </section>
            )
          })}
        </aside>
        )}
      </div>
    </div>
  )
}
