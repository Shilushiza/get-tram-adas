import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip as LTooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { CTRL_COLOR, KINDS, KIND_COLOR, OBJ_COLOR, api, dmy, hms, ms, type Kind, type Stats } from '../api'
import { useStore } from '../store'
import { place, useT } from '../i18n'
import EChart, { AXIS, TOOLTIP } from '../components/EChart'
import Tram3D, { PARTS, type PartId } from '../components/Tram3D'
import { openEpisode } from '../nav'

function Kpi({ value, label, tone }: { value: string; label: string; tone?: 'alarm' | 'assist' }) {
  return (
    <div className={`kpi ${tone ?? ''}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

export default function Overview() {
  const { trip, kinds, set } = useStore()
  const { t, kind, obj, ctrl, sev, lang } = useT()
  const [s, setS] = useState<Stats | null>(null)
  const [part, setPart] = useState<PartId | null>(null)
  const ks = KINDS.filter((k) => kinds.has(k))

  useEffect(() => {
    setS(null)
    api.stats(trip, ks).then(setS)
  }, [trip, kinds]) // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (n: number) => n.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')
  const pct = (x: number) => `${Math.round(x * 100)}%`
  const toggleKind = (k: Kind) => {
    const n = new Set(kinds)
    if (n.has(k) && n.size > 1) n.delete(k)
    else n.add(k)
    set({ kinds: n })
  }

  return (
    <div className="overview">
      <section className="hero">
        <div className="hero-3d panel">
          <Tram3D mode="showcase" onPick={setPart} />
          <div className="hero-hint">{t('hoverHint')}</div>
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
              <Kpi value={fmt(s.total)} label={t('kpiEpisodes')} />
              <Kpi value={fmt(s.critical)} label={t('kpiCritical')} tone="alarm" />
              <Kpi value={s.per100km?.toFixed(1) ?? '-'} label={t('kpiPer100')} />
              <Kpi value={fmt(Math.round(s.km))} label={t('kpiKm')} />
              <Kpi value={pct(s.assist_share)} label={t('kpiAssist')} tone="assist" />
              <Kpi value={pct(s.stopped_share)} label={t('kpiStopped')} />
            </>
          ) : Array.from({ length: 6 }, (_, i) => <div key={i} className="kpi skeleton" />)}
        </div>
      </section>

      <div className="kind-filter" role="group">
        {KINDS.map((k) => (
          <button key={k} className="chip" aria-pressed={kinds.has(k)} onClick={() => toggleKind(k)}>
            <i style={{ background: KIND_COLOR[k] }} />{kind(k)}
            {s?.by_kind[k] != null && <b>{fmt(s.by_kind[k])}</b>}
          </button>
        ))}
      </div>

      {s && (
        <div className="grid">
          <section className="panel c4">
            <h2>{t('chKinds')}</h2>
            <EChart height={280} onClick={(p) => p.name && toggleKind(KINDS.find((k) => kind(k) === p.name)!)} option={{
              tooltip: { ...TOOLTIP, trigger: 'item' },
              series: [{
                type: 'pie', radius: ['52%', '82%'], center: ['50%', '50%'], padAngle: 2, itemStyle: { borderRadius: 6 },
                label: { show: false },
                data: ks.filter((k) => s.by_kind[k]).map((k) => ({ name: kind(k), value: s.by_kind[k], itemStyle: { color: KIND_COLOR[k] } })),
              }],
              graphic: [{ type: 'text', left: 'center', top: '43%', style: { text: fmt(s.total), font: '600 26px IBM Plex Sans Condensed', fill: '#16222b' } },
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

          <section className="panel c7 map-panel">
            <h2>{t('chMap')}</h2>
            <div className="map">
              <MapContainer center={[59.94, 30.36]} zoom={11} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
                <TileLayer attribution='Tiles &copy; Esri'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}" />
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

          <section className="panel c5">
            <h2>{t('chObjects')}</h2>
            <EChart height={250} option={{
              tooltip: { ...TOOLTIP, trigger: 'item' },
              series: [{
                type: 'pie', radius: ['45%', '78%'], padAngle: 2, itemStyle: { borderRadius: 5 },
                label: { color: '#33424c', formatter: '{b}\n{d}%', fontSize: 12 },
                data: [
                  ...Object.entries(s.by_obj).map(([k, v]) => ({ name: obj(k), value: v, itemStyle: { color: OBJ_COLOR[k] ?? '#8c9aa3' } })),
                  { name: t('unknown'), value: s.obj_unknown, itemStyle: { color: '#dde3e6' } },
                ],
              }],
            }} />
            <p className="hint">{t('chObjectsHint')}</p>
          </section>

          <section className="panel c6">
            <h2>{t('chWagons')}</h2>
            <EChart height={260} onClick={(p) => {
              const w = String(p.name)
              const tr = useStore.getState().trips.find((x) => x.wagon === w)
              if (tr) set({ trip: tr.trip })
            }} option={{
              tooltip: { ...TOOLTIP, trigger: 'axis' },
              grid: { left: 60, right: 30, top: 10, bottom: 24 },
              yAxis: { type: 'category', data: s.wagons_rate.map((w) => w.wagon), ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: (v: string) => `№ ${v}` } },
              xAxis: { type: 'value', ...AXIS },
              series: [{
                type: 'bar', data: s.wagons_rate.map((w) => w.per100), barWidth: 16,
                itemStyle: { color: '#16222b', borderRadius: [0, 4, 4, 0] },
                label: { show: true, position: 'right', color: '#33424c', fontSize: 11 },
              }],
            }} />
          </section>

          <section className="panel c3">
            <h2>{t('chControl')}</h2>
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
            <EChart height={260} option={{
              tooltip: { ...TOOLTIP, trigger: 'axis' },
              grid: { left: 40, right: 8, top: 10, bottom: 40 },
              xAxis: { type: 'category', data: s.speed_hist.bins, ...AXIS, name: t('kmh'), nameLocation: 'middle', nameGap: 26,
                axisLabel: { ...AXIS.axisLabel, interval: 2 } },
              yAxis: { type: 'value', ...AXIS },
              series: [{ type: 'bar', data: s.speed_hist.n, itemStyle: { color: '#2f6fd6', borderRadius: [3, 3, 0, 0] }, barWidth: '80%' }],
            }} />
          </section>

          <section className="panel c5">
            <h2>{t('chStops')}</h2>
            <EChart height={330} option={{
              tooltip: { ...TOOLTIP, trigger: 'axis' },
              grid: { left: 8, right: 30, top: 6, bottom: 6, containLabel: true },
              yAxis: { type: 'category', inverse: true, data: s.stops.map((x) => place(x.stop, lang)), ...AXIS,
                axisLabel: { ...AXIS.axisLabel, width: 170, overflow: 'truncate' } },
              xAxis: { type: 'value', show: false },
              series: [
                { name: sev(2), type: 'bar', stack: 's', data: s.stops.map((x) => x.crit), itemStyle: { color: '#D55E00' }, barWidth: 13 },
                { name: sev(1), type: 'bar', stack: 's', data: s.stops.map((x) => x.n - x.crit), itemStyle: { color: '#c9d1d5', borderRadius: [0, 3, 3, 0] },
                  label: { show: true, position: 'right', formatter: (p: { dataIndex: number }) => String(s.stops[p.dataIndex].n), color: '#33424c', fontSize: 11 } },
              ],
            }} />
          </section>

          <section className="panel c7">
            <h2>{t('chTop')}</h2>
            <div className="top-list">
              {s.top.slice(0, 12).map((e) => (
                <button key={e.id} className="top-row" onClick={() => openEpisode(e.id)}>
                  <i style={{ background: KIND_COLOR[e.kind] }} />
                  <span className="when">{dmy(ms(e.start))} {hms(ms(e.start))}</span>
                  <span className="what">{kind(e.kind)}{e.obj_type !== 'Unknown' && e.kind !== 'traffic_light' ? `: ${obj(e.obj_type)}` : ''}</span>
                  <span className="drop">{e.speed_start - e.speed_min >= 1 ? `−${Math.round(e.speed_start - e.speed_min)} ${t('kmh')}` : ''}</span>
                  <span className="where">{e.stop ? place(e.stop, lang) : `${t('wagon')} ${e.wagon}`}</span>
                  <span className={`sev sev-${e.severity}`}>{sev(e.severity)}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
