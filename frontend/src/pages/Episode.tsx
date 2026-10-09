import { useEffect, useMemo, useState } from 'react'
import { KIND_COLOR, api, dmy, hms, indexAt, ms, num, str, type Fact } from '../api'
import { useStore, type View } from '../store'
import { place, useT, type Key } from '../i18n'
import Tram3D, { PARTS, type PartId } from '../components/Tram3D'
import Replay2D from '../components/Replay2D'
import VideoPanel from '../components/VideoPanel'
import Charts from '../components/Charts'
import { openEpisode } from '../nav'

const SECTIONS = ['circumstances', 'reaction', 'result', 'limits'] as const

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
  ['danger_real', 'lampDanger', '#d1352b'], ['tl_real', 'lampTl', '#e3a21a'], ['sl_real', 'lampSl', '#8c9aa3'],
  ['brake_mech', 'lampMech', '#16222b'], ['brake_rail', 'lampRail', '#6d2c91'], ['brake_crash', 'lampCrash', '#6d2c91'],
  ['brake_emergency', 'lampEmerg', '#6d2c91'], ['as_is_skid', 'lampSkid', '#138a8a'],
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
      <div className="gauge">
        <svg viewBox="0 0 120 70" aria-hidden>
          <path d="M10 62 A50 50 0 0 1 110 62" stroke="#e3e8ea" strokeWidth="10" fill="none" strokeLinecap="round" />
          <path d="M10 62 A50 50 0 0 1 110 62" stroke="#16222b" strokeWidth="10" fill="none" strokeLinecap="round"
            strokeDasharray={`${(Math.min(v ?? 0, 70) / 70) * 157} 157`} />
          {g != null && <circle cx={60 - 50 * Math.cos((Math.min(g, 70) / 70) * Math.PI)} cy={62 - 50 * Math.sin((Math.min(g, 70) / 70) * Math.PI)} r="5" fill="#2f9e5f" />}
        </svg>
        <b>{v == null ? '-' : v.toFixed(0)}</b>
        <span>{t('kmh')}{g != null ? `, ${t('target')} ${g.toFixed(0)}` : ''}</span>
      </div>
      <div className="handles">
        <span>{t('control')}: <b className={`ctrl ctrl-${c}`}>{ctrl(c)}</b></span>
        {[['sHDriver', hd, '#16222b'], ['sHAssist', ha, '#2f6fd6']].map(([k, val, colr]) => (
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
          return <span key={k} className={`lamp ${on ? 'on' : ''}`} style={on ? { background: colr, borderColor: colr } : undefined}>{t(label)}</span>
        })}
      </div>
    </div>
  )
}

function Narrative() {
  const { selected, lang } = useStore()
  const { t } = useT()
  const [text, setText] = useState<string | null>(null)
  const [model, setModel] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [llm, setLlm] = useState<{ enabled: boolean } | null>(null)
  useEffect(() => { api.llm().then(setLlm).catch(() => setLlm(null)) }, [])
  useEffect(() => {
    setErr(null); setText(null)
    if (!selected) return
    api.episode(selected.id, lang).then((e) => { setText(e.narrative?.text ?? null); setModel(e.narrative?.model) })
  }, [selected?.id, lang]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!selected) return null
  const run = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await api.narrative(selected.id, lang, !!text)
      setText(r.text); setModel(r.model)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <section className="ai">
      <div className="ai-h">
        <h3>{t('aiTitle')}</h3>
        {llm?.enabled && (
          <button className="btn primary" disabled={busy} onClick={run}>
            {busy ? <span className="spinner" /> : null}{busy ? t('aiBusy') : text ? t('aiRerun') : t('aiRun')}
          </button>
        )}
      </div>
      {text ? (
        <div className="ai-text">
          {text.split(/\n+/).filter(Boolean).map((p, k) => {
            const head = /^[«"]?[A-ZА-ЯЁ][^.]{0,60}[»"]?:?$/.test(p.trim().replace(/^#+\s*|\*\*/g, ''))
            return <p key={k} className={head ? 'head' : ''}>{p.replace(/^#+\s*|\*\*/g, '')}</p>
          })}
          <small>{t('aiModel')} {model}</small>
        </div>
      ) : <p className="hint">{llm?.enabled ? t('aiHint') : t('aiOff')}</p>}
      {err && <p className="err">{t('aiErr')}: {err}</p>}
    </section>
  )
}

export default function Episode() {
  const { selected, episodes, kinds, view, lang, set } = useStore()
  const { t, kind, obj, sev } = useT()
  const [part, setPart] = useState<PartId | null>(null)
  const list = useMemo(() => episodes.filter((e) => kinds.has(e.kind)), [episodes, kinds])
  if (!selected) return <div className="empty big">…</div>
  const e = selected
  const idx = list.findIndex((x) => x.id === e.id)
  const goto = (f: Fact) => set({ cursor: ms(f.t), playing: false })
  const title = `${kind(e.kind)}${e.obj_type !== 'Unknown' && e.kind !== 'traffic_light' ? `: ${obj(e.obj_type)}` : ''}`
  const views: [View, Key][] = [['3d', 'view3d'], ['2d', 'view2d'], ['video', 'viewVideo']]

  return (
    <div className="episode">
      <header className="ep-head">
        <button className="btn ghost" onClick={() => set({ page: 'overview' })}>← {t('back')}</button>
        <div className="ep-title">
          <i style={{ background: KIND_COLOR[e.kind] }} />
          <h1>{title}</h1>
          <span className={`sev sev-${e.severity}`}>{sev(e.severity)}</span>
        </div>
        <p className="ep-sub">
          {t('wagon')} {e.wagon}, {dmy(ms(e.start))} {hms(ms(e.start))}, {t('route')} {e.route}
          {e.stop ? `, ${t('nearStop')} «${place(e.stop, lang)}»` : ''}
        </p>
        <div className="ep-nav">
          <button className="btn" disabled={idx <= 0} onClick={() => openEpisode(list[idx - 1].id)}>{t('prev')}</button>
          <button className="btn" disabled={idx < 0 || idx >= list.length - 1} onClick={() => openEpisode(list[idx + 1].id)}>{t('next')}</button>
        </div>
      </header>

      <div className="ep-kpis">
        <div><b>{e.speed_start.toFixed(0)} → {e.speed_min.toFixed(0)}</b><span>{t('speedDrop')}{e.stopped ? `, ${t('stoppedShort')}` : ''}</span></div>
        <div><b>{e.max_decel.toFixed(2)}</b><span>{t('maxDecel')}</span></div>
        <div><b>{e.reaction_s == null ? t('none') : `${e.reaction_s.toFixed(0)} s`}</b><span>{t('reaction')}</span></div>
        <div><b>{e.warn_max ? e.warn_max.toFixed(0) : t('none')}</b><span>{t('warnMax')}</span></div>
      </div>

      <div className="ep-grid">
        <div className="ep-main">
          <section className="panel viewer">
            <div className="tabs" role="tablist">
              {views.map(([v, k]) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => set({ view: v })}>{t(k)}</button>
              ))}
              <span className="grow" />
              {view === '3d' && <span className="hint">{t('hoverHint')}</span>}
            </div>
            <div className="viewer-body">
              {view === '3d' && <Tram3D mode="replay" onPick={setPart} />}
              {view === '2d' && <Replay2D />}
              {view === 'video' && <VideoPanel />}
              {view === '3d' && part && (
                <div className="part-card">
                  <button className="x" onClick={() => setPart(null)} aria-label="close">×</button>
                  <b>{PARTS[part][lang]}</b>
                  <p>{lang === 'ru' ? PARTS[part].dru : PARTS[part].den}</p>
                  {PARTS[part].fields.length > 0 && <code>{PARTS[part].fields.join(', ')}</code>}
                </div>
              )}
            </div>
            {view !== 'video' && <Player />}
          </section>
          <StateStrip />
          <section className="panel">
            <div className="panel-h"><h2>{t('chartsTitle')}</h2><span className="hint">{t('chartsHint')}</span></div>
            <Charts />
            <div className="legend-bands">
              {t('bands')}:
              <i style={{ background: 'rgba(209,53,43,.55)' }} />{t('lampDanger')}
              <i style={{ background: 'rgba(227,162,26,.6)' }} />{t('lampTl')}
              <i style={{ background: 'rgba(140,154,163,.45)' }} />{t('lampSl')}
              <i style={{ background: 'rgba(109,44,145,.6)' }} />{t('lampRail')}
            </div>
          </section>
        </div>
        <aside className="ep-side">
          <Narrative />
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
      </div>
    </div>
  )
}
