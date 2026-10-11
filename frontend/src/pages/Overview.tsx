import { SiteQR } from '../components/PhoneQR'
import './map.css'
import VideoPanel from '../components/VideoPanel'
import { useEffect, useState, type ReactNode } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip as LTooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { CTRL_COLOR, KINDS, KIND_COLOR, OBJ_COLOR, api, dmy, hms, ms, type Kind, type Stats } from '../api'
import { useStore } from '../store'
import { place, useT } from '../i18n'
import EChart, { AXIS, TOOLTIP } from '../components/EChart'
import Tram3D, { PARTS, type PartId } from '../components/Tram3D'
import { openEpisode } from '../nav'
import { insights } from '../insights'
import SceneBoundary from '../components/SceneBoundary'

function Kpi({ value, label, tone, wide, children }: {
  value: string; label: string; tone?: 'alarm' | 'assist'; wide?: boolean; children?: ReactNode
}) {
  return (
    <div className={`kpi ${tone ?? ''} ${wide ? 'wide' : ''}`}>
      <div className="kpi-v"><b>{value}</b><span>{label}</span></div>
      {children}
    </div>
  )
}

/** Знак 5.17 «Место остановки трамвая»: синий прямоугольник с белой каймой и силуэтом трамвая. */
function StopSign() {
  return (
    <svg className="stop-sign" viewBox="0 0 14 16" aria-hidden>
      <rect x=".5" y=".5" width="13" height="15" rx="1.6" fill="currentColor" />
      <rect x="1.7" y="1.7" width="10.6" height="12.6" rx=".9" fill="none" stroke="#fff" strokeWidth=".9" />
      <path d="M3.4 6.2h6.4l1.2 2.3v2.6H3.4z" fill="#fff" />
      <path d="M7 6.2 8.3 4.3h-2" stroke="#fff" strokeWidth=".7" fill="none" />
      <path d="M2.8 12.3h8.4" stroke="#fff" strokeWidth=".7" />
    </svg>
  )
}

/** Тонкая полоса долей: контекст к числу вместо пустой подписи. */
function Share({ parts }: { parts: { v: number; c: string; title: string }[] }) {
  const sum = parts.reduce((a, p) => a + p.v, 0) || 1
  return (
    <div className="share" role="img" aria-label={parts.map((p) => `${p.title} ${Math.round((p.v / sum) * 100)}%`).join(', ')}>
      {parts.map((p, i) => <i key={i} title={`${p.title}: ${Math.round((p.v / sum) * 100)}%`} style={{ flexGrow: p.v, background: p.c }} />)}
    </div>
  )
}

/** Разброс частоты по вагонам: точки на общей шкале, засечка парка. */
function WagonStrip({ s, fmt1 }: { s: Stats; fmt1: (n: number) => string }) {
  const { t } = useT()
  const w = s.wagons_rate.filter((x) => x.per100 != null)
  if (w.length < 2 || s.per100km == null) return null
  const max = Math.max(...w.map((x) => x.per100!)) * 1.08
  const x = (v: number) => `${(v / max) * 100}%`
  const avg = s.per100km
  // вагоны заметно чаще парка; близкие по значению (точки сливаются) подписываем одной меткой
  const hi = w.filter((r) => r.per100! > avg * 1.25).sort((a, b) => b.per100! - a.per100!)
  const groups: typeof hi[] = []
  for (const r of hi) {
    const g = groups[groups.length - 1]
    if (g && Math.abs(g[0].per100! - r.per100!) / max < 0.04) g.push(r); else groups.push([r])
  }
  return (
    <div className="wstrip">
      <div className="wstrip-track">
        <span className="wstrip-avg" style={{ left: x(avg) }} />
        {groups.map((g) => (
          <em key={g.map((r) => r.wagon).join()} style={{ left: x(g[0].per100!) }}>
            {g.map((r) => `№ ${r.wagon}`).join(', ')}: {fmt1(g[0].per100!)}
          </em>
        ))}
        {w.map((r) => (
          <i key={r.wagon} className={r.per100! > avg * 1.25 ? 'hi' : ''} style={{ left: x(r.per100!) }}
            title={`${t('wagon')} ${r.wagon}: ${fmt1(r.per100!)}`} />
        ))}
      </div>
      <small>{t('kpiSpread')} {fmt1(Math.min(...w.map((r) => r.per100!)))} {t('to')} {fmt1(Math.max(...w.map((r) => r.per100!)))}; {t('kpiFleet')}</small>
    </div>
  )
}

export default function Overview() {
  const { trip, kinds, set } = useStore()
  const { t, kind, obj, ctrl, sev, lang } = useT()
  const [s, setS] = useState<Stats | null>(null)
  const [part, setPart] = useState<PartId | null>(null)
  const ks = KINDS.filter((k) => kinds.has(k))
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

  useEffect(() => {
    setS(null)
    api.stats(trip, ks).then(setS)
  }, [trip, kinds]) // eslint-disable-line react-hooks/exhaustive-deps

  const ins = s ? insights(s, lang) : null
  const wagons = s ? [...s.wagons_rate].filter((w) => w.per100 != null).sort((a, b) => b.per100! - a.per100!) : []
  const fmt = (n: number) => n.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')
  const fmt1 = (n: number) => n.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 1 })
  const fmt2 = (n: number) => n.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const pct = (x: number) => `${Math.round(x * 100)}%`
  const toggleKind = (k: Kind) => {
    const n = new Set(kinds)
    if (n.has(k) && n.size > 1) n.delete(k)
    else n.add(k)
    set({ kinds: n })
  }

  return (
    <div className="overview">
      <section className="intro">
        <div>
          <h1>{t('introTitle')}</h1>
          <p>{t('introLead')}</p>
        </div>
        <ol className="steps">
          <li><b>1</b><span>{t('step1')}</span></li>
          <li><b>2</b><span>{t('step2')}</span></li>
          <li><b>3</b><span>{t('step3')}</span></li>
        </ol>
        <div className="dataset">
          <span>{trip === 'all' ? t('dsDemo') : t('dsOne')}</span>
          <div className="row">
            <button className="btn primary" disabled={!s?.top.length} onClick={() => s?.top[0] && openEpisode(s.top[0].id)}>{t('ctaFirst')}</button>
            <button className="btn" onClick={() => set({ page: 'upload' })}>{t('dsUpload')}</button>
          </div>
          <SiteQR />
        </div>
      </section>

      <section className="hero">
        <div className="hero-3d panel">
          <SceneBoundary fallback={<p className="no3d">{t('no3dShowcase')}</p>}>
            <Tram3D mode="showcase" onPick={setPart} />
            <div className="hero-hint">{t(touch ? 'touchHint' : 'hoverHint')}</div>
          </SceneBoundary>
          {part && (
            <div className="part-card">
              <button className="x" onClick={() => setPart(null)} aria-label="close">×</button>
              <b>{PARTS[part][lang]}</b>
              <p>{lang === 'ru' ? PARTS[part].dru : PARTS[part].den}</p>
              {PARTS[part].fields.length > 0 && <code>{PARTS[part].fields.join(', ')}</code>}
            </div>
          )}
        </div>
        <div className="kpis-grid">
          {s ? (
            <>
              <Kpi wide value={s.per100km != null ? fmt1(s.per100km) : '-'} label={`${t('kpiEpisodes')} ${t('kpiPer100')}`}>
                <WagonStrip s={s} fmt1={fmt1} />
              </Kpi>
              <Kpi value={pct(s.total ? s.critical / s.total : 0)} label={t('kpiCritical')} tone="alarm">
                <Share parts={[{ v: s.critical, c: 'var(--alarm)', title: t('kpiCritical') }, { v: s.total - s.critical, c: 'var(--line)', title: sev(1) }]} />
                <small className="kpi-note">{fmt(s.critical)} {lang === 'ru' ? 'из' : 'of'} {fmt(s.total)}</small>
              </Kpi>
              <Kpi value={pct(s.assist_share)} label={t('kpiAssist')} tone="assist">
                <Share parts={Object.entries(s.by_controller).map(([k, v]) => ({ v, c: CTRL_COLOR[k], title: ctrl(k) }))} />
              </Kpi>
              <Kpi value={pct(s.stopped_share)} label={t('kpiStopped')}>
                <Share parts={[{ v: s.stopped_share, c: 'var(--ink)', title: t('kpiStopped') }, { v: 1 - s.stopped_share, c: 'var(--line)', title: '' }]} />
              </Kpi>
              <Kpi value={fmt(Math.round(s.km))} label={t('kpiKm')}>
                <small className="kpi-note">{s.trips} {t('kpiTrips')}, {s.wagons.length} {t('kpiWagons')}</small>
              </Kpi>
            </>
          ) : Array.from({ length: 5 }, (_, i) => <div key={i} className={`kpi skeleton ${i ? '' : 'wide'}`} />)}
        </div>
      </section>

      <div className="kind-filter" role="group">
        {KINDS.map((k) => (
          <button key={k} className={`chip kind k-${k} ${k === 'speed_limit' || k === 'skid' ? 'pale' : ''}`} style={{ '--c': KIND_COLOR[k] } as React.CSSProperties} aria-pressed={kinds.has(k)} onClick={() => toggleKind(k)}>
            <i style={{ background: KIND_COLOR[k] }} />{kind(k)}
            {s?.by_kind[k] != null && <b>{fmt(s.by_kind[k])}</b>}
          </button>
        ))}
      </div>
      {s && (
        <p className="kind-note">
          {t('kindShown')} <b>{fmt(s.total)}</b> {t('of')} <b>{fmt(s.total_all)}</b>.{' '}
          {!kinds.has('speed_limit') && t('kindSlHidden')}
        </p>
      )}

      {!s && (
        <div className="grid" aria-busy="true">
          {['c7', 'c5', 'c4', 'c8'].map((c, i) => <section key={i} className={`panel ${c} sk-panel`}><span /><span /><div /></section>)}
        </div>
      )}
      {s && ins && (
        <div className="grid">
          <section className="panel c7">
            <div className="panel-h"><h2>{t('chTop')}</h2><span className="hint">{t('chTopHint')}</span></div>
            <p className="insight">{ins.top}</p>
            <div className="top-list">
              <div className="top-row top-head" aria-hidden><i /><span>{t('when')}</span><span>{t('what')}</span><span>{t('speedDrop')}</span><span>{t('where')}</span><span>{t('decelShort')}</span></div>
              {s.top.slice(0, 12).map((e) => (
                <button key={e.id} className="top-row" onClick={() => openEpisode(e.id)}>
                  <i style={{ background: KIND_COLOR[e.kind] }} />
                  <span className="when">{dmy(ms(e.start))} {hms(ms(e.start))}</span>
                  <span className="what">{kind(e.kind)}{e.obj_type !== 'Unknown' && e.kind !== 'traffic_light' ? `: ${obj(e.obj_type)}` : ''}</span>
                  <span className="dv">{e.speed_start - e.speed_min >= 1 ? `−${Math.round(e.speed_start - e.speed_min)} ${t('kmh')}` : ''}</span>
                  <span className="where">{e.stop
                    ? <><StopSign />{place(e.stop, lang)}</>
                    : <>{t('wagon')} <span className="bort">{e.wagon}</span></>}</span>
                  <span className="decel" title={t('maxDecel')}>
                    <span className="meter"><i style={{ left: 0, width: `${Math.min(e.max_decel / 3, 1) * 100}%`, background: e.severity >= 3 ? 'var(--alarm)' : 'var(--ink-2)' }} /></span>
                    {fmt2(e.max_decel)}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel c5 map-panel">
            <h2>{t('chMap')}</h2>
            <p className="insight">{ins.map}</p>
            <div className="map">
              <MapContainer center={[59.94, 30.36]} zoom={11} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
                {/* OpenStreetMap: доступен в России без VPN; серые тайлы, чтобы точки срабатываний читались */}
                <TileLayer className="tiles-muted" attribution='&copy; OpenStreetMap'
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {s.points.map(([la, lo, k, sv, id]) => (
                  <CircleMarker key={id} center={[la, lo]} radius={sv >= 2 ? 6 : 3.5}
                    pathOptions={{ color: KIND_COLOR[k], fillColor: KIND_COLOR[k], fillOpacity: sv >= 2 ? 0.75 : 0.35, weight: sv >= 2 ? 1.5 : 0 }}
                    eventHandlers={{ click: () => openEpisode(id) }}>
                    <LTooltip>{kind(k)}, {sev(sv)}</LTooltip>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          </section>

          <section className="panel c4">
            <h2>{t('chKinds')}</h2>
            <p className="insight">{ins.kinds}</p>
            <EChart height={280} onClick={(p) => p.name && toggleKind(KINDS.find((k) => kind(k) === p.name)!)} option={{
              tooltip: { ...TOOLTIP, trigger: 'item' },
              series: [{
                type: 'pie', radius: ['52%', '82%'], center: ['50%', '50%'], padAngle: 2, itemStyle: { borderRadius: 6 },
                label: { show: false },
                data: ks.filter((k) => s.by_kind[k]).map((k) => ({ name: kind(k), value: s.by_kind[k], itemStyle: { color: KIND_COLOR[k] } })),
              }],
              graphic: [{ type: 'text', left: 'center', top: '43%', style: { text: fmt(s.total), font: '700 30px Sofia Sans Condensed', fill: '#13203A' } },
                { type: 'text', left: 'center', top: '56%', style: { text: t('kpiEpisodes'), font: '12px Golos Text', fill: '#5d6a72' } }],
            }} />
            <ul className="legend">
              {ks.filter((k) => s.by_kind[k]).map((k) => (
                <li key={k}><i style={{ background: KIND_COLOR[k] }} />{kind(k)}<b>{Math.round((s.by_kind[k] / s.total) * 100)}%</b></li>
              ))}
            </ul>
          </section>

          <section className="panel c8">
            <h2>{t('chHours')}</h2>
            <p className="insight">{ins.hours}</p>
            <EChart height={330} option={{
              tooltip: { ...TOOLTIP, trigger: 'axis' },
              grid: { left: 44, right: 12, top: 16, bottom: 28 },
              xAxis: { type: 'category', data: s.hours.hour.map((h) => String(h).padStart(2, '0')), ...AXIS },
              yAxis: { type: 'value', ...AXIS },
              series: ks.filter((k) => s.hours[k]).map((k) => ({
                name: kind(k), type: 'bar', stack: 'h', data: s.hours[k], itemStyle: { color: KIND_COLOR[k] },
                barWidth: '62%', emphasis: { focus: 'series' },
              })),
            }} />
          </section>

          <section className="panel c6">
            <h2>{t('chWagons')}</h2>
            <p className="insight">{ins.wagons}</p>
            <EChart height={260} onClick={(p) => {
              const w = String(p.name)
              const tr = useStore.getState().trips.find((x) => x.wagon === w)
              if (tr) set({ trip: tr.trip })
            }} option={{
              tooltip: { ...TOOLTIP, trigger: 'axis' },
              grid: { left: 60, right: 40, top: 26, bottom: 24 },
              yAxis: { type: 'category', inverse: true, data: wagons.map((w) => w.wagon), ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: (v: string) => `№ ${v}` } },
              xAxis: { type: 'value', ...AXIS },
              series: [{
                type: 'bar', barWidth: 16,
                data: wagons.map((w) => ({ value: w.per100, itemStyle: { color: (w.per100 ?? 0) > (s.per100km ?? 0) * 1.25 ? '#0B2E7A' : '#A8BCD4', borderRadius: [0, 3, 3, 0] } })),
                label: { show: true, position: 'right', color: '#33424c', fontSize: 11, formatter: (p: { value: unknown }) => fmt1(Number(p.value)) },
                markLine: s.per100km == null ? undefined : {
                  symbol: 'none', silent: true, lineStyle: { color: '#17202B', type: 'solid', width: 1.5 },
                  label: { formatter: `${t('kpiFleetShort')} ${fmt1(s.per100km)}`, color: '#17202B', fontSize: 11, position: 'start' },
                  data: [{ xAxis: s.per100km }],
                },
              }],
            }} />
          </section>

          <section className="panel c3">
            <h2>{t('chControl')}</h2>
            <p className="insight">{ins.control}</p>
            <EChart height={260} option={{
              tooltip: { ...TOOLTIP, trigger: 'item' },
              series: [{
                type: 'pie', radius: ['50%', '80%'], padAngle: 2, itemStyle: { borderRadius: 5 },
                label: { show: false },
                data: Object.entries(s.by_controller).map(([k, v]) => ({ name: ctrl(k), value: v, itemStyle: { color: CTRL_COLOR[k] } })),
              }],
              legend: { bottom: 0, textStyle: { color: '#33424c' }, icon: 'circle', itemWidth: 9 },
            }} />
          </section>

          <section className="panel c3">
            <h2>{t('chSpeed')}</h2>
            <p className="insight">{ins.speed}</p>
            <EChart height={260} option={{
              tooltip: { ...TOOLTIP, trigger: 'axis' },
              grid: { left: 40, right: 8, top: 10, bottom: 40 },
              xAxis: { type: 'category', data: s.speed_hist.bins, ...AXIS, name: t('kmh'), nameLocation: 'middle', nameGap: 26,
                axisLabel: { ...AXIS.axisLabel, interval: 2 } },
              yAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: (v: number) => fmt(v) } },
              series: [{ type: 'bar', barWidth: '80%', data: s.speed_hist.n.map((v) => ({ value: v, itemStyle: { color: v === Math.max(...s.speed_hist.n) ? '#17202B' : '#B9C1CA', borderRadius: [2, 2, 0, 0] } })) }],
            }} />
          </section>

          <section className="panel c5">
            <h2>{t('chObjects')}</h2>
            <p className="insight">{ins.objects}</p>
            <EChart height={250} option={{
              tooltip: { ...TOOLTIP, trigger: 'item' },
              series: [{
                type: 'pie', radius: ['45%', '78%'], padAngle: 2, itemStyle: { borderRadius: 5 },
                label: { color: '#33424c', formatter: (p: { name?: string; percent?: number }) => `${p.name}\n${Math.round(p.percent ?? 0)}%`, fontSize: 12 },
                data: [
                  ...Object.entries(s.by_obj).map(([k, v]) => ({ name: obj(k), value: v, itemStyle: { color: OBJ_COLOR[k] ?? '#A8BCD4' } })),
                  { name: t('unknown'), value: s.obj_unknown, itemStyle: { color: '#dde3e6' } },
                ],
              }],
            }} />
            <p className="hint">{t('chObjectsHint')}</p>
          </section>

          <section className="panel c7">
            <h2>{t('chStops')}</h2>
            <p className="insight">{ins.stops}</p>
            <EChart height={330} option={{
              tooltip: { ...TOOLTIP, trigger: 'axis' },
              grid: { left: 8, right: 30, top: 6, bottom: 6, containLabel: true },
              yAxis: { type: 'category', inverse: true, data: s.stops.map((x) => place(x.stop, lang)), ...AXIS,
                axisLabel: { ...AXIS.axisLabel, width: 170, overflow: 'truncate' } },
              xAxis: { type: 'value', show: false },
              series: [
                { name: sev(2), type: 'bar', stack: 's', data: s.stops.map((x) => x.crit), itemStyle: { color: '#0B2E7A' }, barWidth: 13 },
                { name: sev(1), type: 'bar', stack: 's', data: s.stops.map((x) => x.n - x.crit), itemStyle: { color: '#c9d1d5', borderRadius: [0, 3, 3, 0] },
                  label: { show: true, position: 'right', formatter: (p: { dataIndex: number }) => String(s.stops[p.dataIndex].n), color: '#33424c', fontSize: 11 } },
              ],
            }} />
          </section>

          <section className="panel c12 gt-videos">
            <h2>{t('gtVideosTitle')}</h2>
            <p className="insight">{t('gtVideosLead')}</p>
            <VideoPanel />
          </section>
        </div>
      )}
    </div>
  )
}
