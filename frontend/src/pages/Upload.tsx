import { useRef, useState } from 'react'
import { KIND_COLOR, KINDS, api, hms, ms, type EpisodeSummary, type Kind } from '../api'
import { useStore } from '../store'
import { useT, type Key } from '../i18n'
import EChart, { TOOLTIP } from '../components/EChart'
import { openEpisode } from '../nav'

type Stage = 'idle' | 'sending' | 'parse_json' | 'parse_csv' | 'merge' | 'detect' | 'done' | 'error'
const ORDER: Stage[] = ['sending', 'parse_csv', 'merge', 'detect', 'done']

export default function Upload() {
  const { t, kind, obj } = useT()
  const set = useStore((s) => s.set)
  const [files, setFiles] = useState<File[]>([])
  const [drag, setDrag] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [rows, setRows] = useState(0)
  const [eps, setEps] = useState<EpisodeSummary[]>([])
  const [total, setTotal] = useState(0)
  const [trip, setTrip] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const add = (list: FileList | null) => {
    if (!list) return
    setFiles((prev) => [...prev, ...Array.from(list)].filter((f, i, a) => a.findIndex((x) => x.name === f.name) === i))
    setErr(null)
  }
  const reset = () => { setFiles([]); setStage('idle'); setRows(0); setEps([]); setTotal(0); setTrip(null); setErr(null) }

  const start = async () => {
    if (!files.some((f) => f.name.toLowerCase().endsWith('.csv'))) { setErr(t('upNeedCsv')); return }
    setStage('sending'); setEps([]); setErr(null)
    try {
      const { job } = await api.upload(files)
      const es = new EventSource(`/api/jobs/${job}/stream`)
      es.onmessage = (m) => {
        const ev = JSON.parse(m.data)
        if (ev.type === 'stage') { setStage(ev.stage === 'parse_json' ? 'parse_json' : ev.stage); if (ev.total) setTotal(ev.total) }
        if (ev.type === 'progress' && ev.rows) setRows(ev.rows)
        if (ev.type === 'episode') { setEps((p) => [...p, ev.episode]); setTotal(ev.total) }
        if (ev.type === 'done') {
          setStage('done'); setTrip(ev.trip); es.close()
          api.trips().then((trips) => set({ trips }))
        }
        if (ev.type === 'error') { setStage('error'); setErr(ev.message); es.close() }
      }
      es.onerror = () => es.close()
    } catch (e) {
      setStage('error'); setErr((e as Error).message)
    }
  }

  const counts = KINDS.map((k) => ({ k, n: eps.filter((e) => e.kind === k).length })).filter((x) => x.n)
  const busy = stage !== 'idle' && stage !== 'done' && stage !== 'error'
  const stageIdx = ORDER.indexOf(stage === 'parse_json' ? 'parse_csv' : stage)

  return (
    <div className="upload">
      <header className="up-head">
        <h1>{t('upTitle')}</h1>
        <p>{t('upLead')}</p>
      </header>

      {stage === 'idle' || stage === 'error' ? (
        <>
          <ol className="stages preview" aria-label={t('upPlan')}>
            {ORDER.map((st) => <li key={st}><i />{st === 'sending' ? t('upSending') : t(`st_${st}` as Key)}</li>)}
          </ol>
          <div className="slots">
            {([['csv', 'move_detailed_*.csv', 'upCsvNeed'], ['json', '*.jsonseq', 'upJsonOpt']] as const).map(([ext, mask, k]) => {
              const f = files.find((x) => (ext === 'csv' ? /\.csv$/i : /\.jsonseq$|\.json$/i).test(x.name))
              return (
                <div key={ext} className={`slot ${f ? 'ok' : ''}`}>
                  <span className={`ftype ${ext}`}>{ext}</span>
                  <div><b>{f ? f.name : mask}</b><small>{f ? `${(f.size / 1e6).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB` : t(k)}</small></div>
                  {f && <svg viewBox="0 0 16 16" aria-hidden><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
              )
            })}
          </div>
          <div className={`drop ${drag ? 'over' : ''}`} role="button" tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files) }}>
            <svg viewBox="0 0 48 48" aria-hidden><path d="M24 31V11m0 0-8 8m8-8 8 8M10 30v6a3 3 0 0 0 3 3h22a3 3 0 0 0 3-3v-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <b>{t('upDrop')}</b>
            <input ref={input} type="file" multiple accept=".csv,.jsonseq,.json" hidden onChange={(e) => add(e.target.files)} />
          </div>
          {files.length > 0 && (
            <ul className="files">
              {files.map((f) => (
                <li key={f.name}>
                  <span className={`ftype ${f.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json'}`}>{f.name.split('.').pop()}</span>
                  {f.name}<small>{(f.size / 1e6).toFixed(1)} MB</small>
                  <button className="x" onClick={() => setFiles(files.filter((x) => x !== f))} aria-label="remove">×</button>
                </li>
              ))}
            </ul>
          )}
          {err && <p className="err" role="alert">{stage === 'error' ? `${t('upFail')}: ${err}` : err}</p>}
          {files.some((f) => /\.csv$/i.test(f.name)) && !files.some((f) => /\.jsonseq$|\.json$/i.test(f.name)) && <p className="hint">{t('upNoJson')}</p>}
          <button className="btn primary big" disabled={!files.length} onClick={start}>{t('upStart')}</button>
        </>
      ) : (
        <div className="live">
          <ol className="stages">
            {ORDER.map((s, i) => (
              <li key={s} className={i < stageIdx || stage === 'done' ? 'done' : i === stageIdx ? 'now' : ''}>
                <i />{s === 'sending' ? t('upSending') : t(`st_${s}` as Key)}
              </li>
            ))}
          </ol>
          <div className="live-grid">
            <div className="live-kpis">
              <div className="kpi"><b>{eps.length.toLocaleString()}</b><span>{t('upFound')}{total ? ` / ${total}` : ''}</span></div>
              <div className="kpi"><b>{rows.toLocaleString()}</b><span>{t('upRows')}</span></div>
              <div className="progress"><i style={{ width: `${total ? (eps.length / total) * 100 : busy ? 8 : 100}%` }} /></div>
              {stage === 'done' && (
                <div className="row">
                  <button className="btn primary" onClick={() => { set({ trip: trip!, page: 'overview' }) }}>{t('upOpen')}</button>
                  <button className="btn" onClick={reset}>{t('upAgain')}</button>
                </div>
              )}
            </div>
            <div className="panel">
              <EChart height={240} option={{
                tooltip: { ...TOOLTIP, trigger: 'item' },
                series: [{
                  type: 'pie', radius: ['52%', '82%'], padAngle: 2, itemStyle: { borderRadius: 5 }, label: { show: false },
                  animationDurationUpdate: 300,
                  data: counts.map(({ k, n }) => ({ name: kind(k), value: n, itemStyle: { color: KIND_COLOR[k as Kind] } })),
                }],
                legend: { bottom: 0, icon: 'circle', itemWidth: 9 },
              }} />
            </div>
            <div className="stream">
              {eps.slice(-14).reverse().map((e) => (
                <button key={e.id} className="stream-row" onClick={() => openEpisode(e.id)} disabled={stage !== 'done'}>
                  <i style={{ background: KIND_COLOR[e.kind] }} />
                  <span>{hms(ms(e.start))}</span>
                  <span>{kind(e.kind)}{e.obj_type !== 'Unknown' && e.kind !== 'traffic_light' ? `: ${obj(e.obj_type)}` : ''}</span>
                  <span className="num">{Math.round(e.speed_start)}→{Math.round(e.speed_min)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
