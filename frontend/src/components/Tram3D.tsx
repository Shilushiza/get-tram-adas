import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { Environment, Html, Lightformer, OrbitControls, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { indexAt, num, str, type Series } from '../api'
import { useStore } from '../store'
import { activeAnchor, computeAnchors } from '../anchors'
import { place, useT } from '../i18n'

/* ------------------------------------------------------------------ */
/* Модули вагона, на которые можно навести и кликнуть                  */
/* ------------------------------------------------------------------ */

export type PartId = 'cameras' | 'radar' | 'nav' | 'bvt' | 'pantograph' | 'rail_brake' | 'cab' | 'brakes'

export const PARTS: Record<PartId, { ru: string; en: string; dru: string; den: string; fields: string[] }> = {
  cameras: {
    ru: 'Блок камер ТБК-01', en: 'TBK-01 camera unit', fields: ['t25Front', 'leftImage', 'tramSlaveVisor'],
    dru: 'Две камеры смотрят по ходу движения. По ним система находит пешеходов, автомобили, трамваи и сигналы светофоров.',
    den: 'Two forward-looking cameras. The system uses them to find pedestrians, cars, trams and traffic signals.',
  },
  radar: {
    ru: 'Радар CPRR24.L', en: 'CPRR24.L radar', fields: [],
    dru: 'Измеряет расстояние и скорость объектов впереди; работает в темноте, дождь и снег. Отдельного флага в выгрузке нет.',
    den: 'Measures distance and speed of objects ahead; works at night, in rain and snow. There is no separate flag in the export.',
  },
  nav: {
    ru: 'Навигация G2NAV', en: 'G2NAV navigation', fields: ['ubloxGps', 'minsEth'],
    dru: 'Спутниковый приёмник и инерциальный блок: где вагон на карте маршрута и где ближайшая остановка.',
    den: 'GNSS receiver and inertial unit: where the tram is on the route map and where the next stop is.',
  },
  bvt: {
    ru: 'Вычислительный блок БВТ-01', en: 'BVT-01 compute unit', fields: ['dbwFbTram', 'odoFbTram'],
    dru: 'Собирает данные камер, радара и навигации, решает, предупредить водителя или затормозить, и пишет телеметрию.',
    den: 'Fuses cameras, radar and navigation, decides whether to warn the driver or brake, and logs the telemetry.',
  },
  pantograph: {
    ru: 'Пантограф', en: 'Pantograph', fields: [],
    dru: 'Токоприёмник: снимает ток с контактного провода. Именно он отличает трамвай от автобуса и метро.',
    den: 'Current collector touching the overhead wire. It is what tells a tram apart from a bus or a metro train.',
  },
  rail_brake: {
    ru: 'Магнитно-рельсовый тормоз', en: 'Magnetic rail brake', fields: ['brake_rail', 'brake_crash', 'brake_emergency'],
    dru: 'Башмаки между колёсами примагничиваются к рельсам при экстренном торможении.',
    den: 'Shoes between the wheels clamp magnetically onto the rails during emergency braking.',
  },
  cab: {
    ru: 'Кабина и рукоятка', en: 'Cab and master controller', fields: ['handle_driver', 'handle_assistant', 'controller'],
    dru: 'Рукоятка тяги и торможения от −15 до +15. Ей управляет водитель или ассистент.',
    den: 'Traction and brake handle from −15 to +15, driven by the driver or by the assistant.',
  },
  brakes: {
    ru: 'Механический тормоз', en: 'Mechanical brake', fields: ['brake_mech'],
    dru: 'Служебный тормоз. Задние огни загораются, когда он включён.',
    den: 'Service brake. The tail lights light up while it is engaged.',
  },
}

const ACCENT = new THREE.Color('#ffb020')

/** Подсветка узла при наведении и вспышка при клике. Материалы узла свои, не общие с соседями. */
function Part({ id, children, hovered, onHover, onPick }: {
  id: PartId; children: ReactNode; hovered: PartId | null
  onHover: (p: PartId | null) => void; onPick: (p: PartId, at: THREE.Vector3) => void
}) {
  const g = useRef<THREE.Group>(null)
  const pulse = useRef(0)
  const mats = useRef<THREE.MeshStandardMaterial[]>([])
  const on = hovered === id
  const apply = (k: number) => {
    for (const m of mats.current) {
      if (m.userData.base === undefined) m.userData.base = { c: m.emissive.clone(), i: m.emissiveIntensity }
      if (k > 0) { m.emissive.copy(ACCENT); m.emissiveIntensity = k }
      else { m.emissive.copy(m.userData.base.c); m.emissiveIntensity = m.userData.base.i }
    }
  }
  useEffect(() => {
    const s = new Set<THREE.MeshStandardMaterial>()
    g.current?.traverse((o) => {
      const mm = (o as THREE.Mesh).material
      for (const m of Array.isArray(mm) ? mm : mm ? [mm] : []) if ('emissive' in m && !m.userData.noHover) s.add(m as THREE.MeshStandardMaterial)
    })
    mats.current = [...s]
    apply(on ? 0.45 : 0)
  }, [on]) // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => {
    if (pulse.current <= 0) return
    pulse.current = Math.max(0, pulse.current - dt * 2.4)
    apply((on ? 0.45 : 0) + Math.sin(pulse.current * Math.PI) * 0.9)
  })
  return (
    <group
      ref={g}
      onPointerOver={(e) => { e.stopPropagation(); onHover(id); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = '' }}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); pulse.current = 1; onPick(id, e.point.clone()) }}
    >
      {children}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Текстуры из canvas                                                  */
/* ------------------------------------------------------------------ */

function useLabelTexture(text: string, opts: { w?: number; h?: number; bg?: string; fg?: string; font?: string } = {}) {
  return useMemo(() => {
    const { w = 512, h = 128, bg = '#111', fg = '#ffb020', font = '600 78px Golos Text, sans-serif' } = opts
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')!
    if (bg !== 'transparent') { g.fillStyle = bg; g.fillRect(0, 0, w, h) }
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(text, w / 2, h / 2 + 4)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number], srgb = true) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(...repeat)
  t.anisotropy = 8
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Детерминированный генератор: застройка одинакова при каждом заходе. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------------------------------------------ */
/* Общая геометрия и инстансинг                                        */
/* ------------------------------------------------------------------ */

type V3 = [number, number, number]
interface Item { p: V3; s?: V3; r?: V3; c?: string }

const BOX = new THREE.BoxGeometry(1, 1, 1)
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12)
const CROWN = new THREE.IcosahedronGeometry(1, 1)
const ROOF = (() => {
  const s = new THREE.Shape()
  s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0.17, 1); s.lineTo(-0.17, 1); s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false })
  g.translate(0, 0, -0.5); g.rotateY(Math.PI / 2)
  return g
})()
const WHEEL = new THREE.CylinderGeometry(0.31, 0.31, 0.11, 24).rotateX(Math.PI / 2)

/** Много одинаковых объектов одним вызовом отрисовки. */
function Inst({ geo = BOX, mat, items, cast, receive }: {
  geo?: THREE.BufferGeometry; mat: THREE.Material; items: Item[]; cast?: boolean; receive?: boolean
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D(), c = new THREE.Color()
    items.forEach((it, i) => {
      o.position.set(...it.p)
      o.rotation.set(...(it.r ?? [0, 0, 0]))
      o.scale.set(...(it.s ?? [1, 1, 1]))
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      if (it.c) m.setColorAt(i, c.set(it.c))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [items])
  if (!items.length) return null
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} castShadow={cast} receiveShadow={receive} />
}

const std = (color: string, roughness = 0.6, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra })

/* ------------------------------------------------------------------ */
/* Трамвай: 71-931М «Витязь-М» (ПК ТС), силуэт петербургских вагонов   */
/* ------------------------------------------------------------------ */

/** Ливрея. Голубая по запросу; настоящая петербургская: body и panto '#c8202a'. */
const LIVERY = {
  body: '#2b8fe3', stripe: '#ffffff', skirt: '#aab3ba', roof: '#d9dfe4', mask: '#0a0e12',
  glass: '#172430', chin: '#15181b', doorEdge: '#ffc21a', panto: '#2b8fe3', frame: '#0e1215',
}
const BORT = '8152' // бортовой номер (условный)

// поперечное сечение кузова: ширина 2.5 м, низкий пол, скруглённые плечи крыши
const W = 1.25, Y0 = 0.34, YS = 2.6, YT = 3.3, RS = YT - YS
const halfW = (y: number) => (y <= YS ? W : W - RS + Math.sqrt(Math.max(0, RS * RS - (y - YS) ** 2)))
// профиль лба сбоку: x(y) от торца кузова, наклонное лобовое стекло
const NOSE: [number, number][] = [[0.34, 1.08], [0.45, 1.2], [0.62, 1.28], [0.95, 1.32], [1.15, 1.3], [1.25, 1.27], [2.9, 0.66], [3.05, 0.55], [3.18, 0.4], [3.3, 0.18]]
const noseX = (y: number) => {
  if (y <= NOSE[0][0]) return NOSE[0][1]
  for (let i = 1; i < NOSE.length; i++) {
    const [y1, x1] = NOSE[i]
    if (y <= y1) { const [y0, x0] = NOSE[i - 1]; return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0) }
  }
  return NOSE[NOSE.length - 1][1]
}
const SIDE_FR = 0.4 // доля лба, где борт ещё прямой; дальше скругление в плане
const frontX = (s: number, y: number) => {
  const n = noseX(y), e = SIDE_FR * n
  return e + (n - e) * Math.cbrt(Math.max(0, 1 - Math.abs(s) ** 3))
}

type Band = [number, number, string, number]
interface Patch { f: (a: number, b: number) => V3; a: V3; b: V3; color: string; out: V3 }

/** Сетка-обшивка из параметрических лоскутов с цветом по вершинам (ливрея без текстур, один вызов). */
function buildPatches(patches: Patch[]) {
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = []
  const c = new THREE.Color(), va = new THREE.Vector3(), vb = new THREE.Vector3()
  for (const p of patches) {
    const [a0, a1, na] = p.a, [b0, b1, nb] = p.b
    const am = (a0 + a1) / 2, bm = (b0 + b1) / 2, ea = (a1 - a0) * 0.05, eb = (b1 - b0) * 0.05
    const A1 = p.f(am + ea, bm), A0 = p.f(am - ea, bm), B1 = p.f(am, bm + eb), B0 = p.f(am, bm - eb)
    va.set(A1[0] - A0[0], A1[1] - A0[1], A1[2] - A0[2]); vb.set(B1[0] - B0[0], B1[1] - B0[1], B1[2] - B0[2])
    const n = va.cross(vb)
    const flip = n.x * p.out[0] + n.y * p.out[1] + n.z * p.out[2] < 0
    c.set(p.color)
    const base = pos.length / 3
    for (let i = 0; i <= na; i++) for (let j = 0; j <= nb; j++) {
      pos.push(...p.f(a0 + ((a1 - a0) * i) / na, b0 + ((b1 - b0) * j) / nb))
      col.push(c.r, c.g, c.b); uv.push(i / na, j / nb)
    }
    for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) {
      const q = base + i * (nb + 1) + j, r = q + nb + 1
      if (flip) idx.push(q, q + 1, r, q + 1, r + 1, r)
      else idx.push(q, r, q + 1, q + 1, r, r + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

const L = LIVERY
const SIDE_BANDS: Band[] = [
  [Y0, 0.64, L.skirt, 1], [0.64, 0.98, L.body, 1], [0.98, 1.04, L.stripe, 1], [1.04, 1.1, L.body, 1],
  [1.1, 2.56, L.glass, 1], [2.56, 2.6, L.stripe, 1], [2.6, YT, L.body, 10],
]
const CAB_SIDE: Band[] = [
  [Y0, 0.64, L.skirt, 2], [0.64, 0.98, L.body, 3], [0.98, 1.04, L.stripe, 1], [1.04, 1.1, L.body, 1], [1.1, YT, L.mask, 16],
]
const CAB_FRONT: Band[] = [
  [Y0, 0.5, L.skirt, 2], [0.5, 0.86, L.chin, 3], [0.86, 0.98, L.body, 1], [0.98, 1.04, L.stripe, 1],
  [1.04, 1.22, L.body, 2], [1.22, YT, L.mask, 18],
]

function sectionSkin(len: number, bands: Band[], top: string, k = 1, yTop = YT) {
  const X = (t: number) => -len / 2 + t * len
  const patches: Patch[] = []
  for (const s of [-1, 1]) for (const [ya, yb, color, rows] of bands)
    patches.push({ f: (t, y) => [X(t), y, s * halfW(y) * k], a: [0, 1, 1], b: [ya, yb, rows], color, out: [0, 0, s] })
  patches.push({ f: (t, q) => [X(t), yTop, q * halfW(yTop) * k], a: [0, 1, 1], b: [-1, 1, 1], color: top, out: [0, 1, 0] })
  return buildPatches(patches)
}

function cabSkin() {
  const sq = (q: number) => Math.sin((q * Math.PI) / 2)
  const patches: Patch[] = []
  for (const s of [-1, 1]) for (const [ya, yb, color, rows] of CAB_SIDE)
    patches.push({ f: (t, y) => [t * SIDE_FR * noseX(y), y, s * halfW(y)], a: [0, 1, 1], b: [ya, yb, rows], color, out: [0, 0, s] })
  for (const [ya, yb, color, rows] of CAB_FRONT)
    patches.push({ f: (q, y) => { const s = sq(q); return [frontX(s, y), y, s * halfW(y)] }, a: [-1, 1, 30], b: [ya, yb, rows], color, out: [1, 0, 0] })
  patches.push({ f: (t, q) => { const s = sq(q); return [t * frontX(s, YT), YT, s * halfW(YT)] }, a: [0, 1, 2], b: [-1, 1, 16], color: L.mask, out: [0, 1, 0] })
  return buildPatches(patches)
}

const CAB_GEO = cabSkin()

function makeTramMats() {
  return {
    skin: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
    paint: new THREE.MeshPhysicalMaterial({ color: L.body, roughness: 0.32, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
    glass: new THREE.MeshPhysicalMaterial({ color: L.glass, roughness: 0.06, metalness: 0.1, clearcoat: 1 }),
    dark: std(L.frame, 0.55),
    yellow: std(L.doorEdge, 0.5),
    roof: std('#9aa3aa', 0.6, 0.3),
  }
}

const SECTIONS = [ // центр по x, длина, двери (по правому борту, +z), положение относительно центра
  { x: 11.1, len: 11.6, doors: [2.5, -3.6] },
  { x: 0, len: 9.6, doors: [0] },
  { x: -11.1, len: 11.6, doors: [3.6, -2.5] },
]
const CAB_X = SECTIONS[0].x + SECTIONS[0].len / 2
const FRONT_TIP = CAB_X + noseX(0.95)
const REAR_X = SECTIONS[2].x - SECTIONS[2].len / 2
const GAUGE = 0.762 // половина колеи 1524 мм
const BOGIES = [CAB_X - 2.5, 3.0, -3.0, REAR_X + 2.5]
const PANTO_X = SECTIONS[0].x - 0.6

interface TramState {
  braking: boolean; rail: boolean; wheelSpin: number; route: string; controller: string
}

function Section({ x, len, doors }: { x: number; len: number; doors: number[] }) {
  const geo = useMemo(() => sectionSkin(len, SIDE_BANDS, L.roof), [len])
  const m = useMemo(makeTramMats, [])
  const parts = useMemo(() => {
    const dark: Item[] = [], leaf: Item[] = [], glass: Item[] = [], yellow: Item[] = []
    const zf = W + 0.012
    // стойки окон: на правом борту не там, где двери
    for (let px = -len / 2 + 0.55; px <= len / 2 - 0.5; px += 1.48) {
      for (const s of [-1, 1]) {
        if (s > 0 && doors.some((d) => Math.abs(d - px) < 0.85)) continue
        dark.push({ p: [px, 1.83, s * (W + 0.004)], s: [0.075, 1.46, 0.02] })
      }
    }
    // двустворчатые двери с остеклением, уплотнителем и жёлтой окантовкой порога
    for (const d of doors) {
      dark.push({ p: [d, 1.41, W + 0.006], s: [1.46, 2.18, 0.02] })
      leaf.push({ p: [d, 1.4, zf], s: [1.34, 2.1, 0.02] })
      for (const o of [-0.335, 0.335]) glass.push({ p: [d + o, 1.62, zf + 0.012], s: [0.5, 1.5, 0.01] }, { p: [d + o, 0.78, zf + 0.012], s: [0.5, 0.42, 0.01] })
      dark.push({ p: [d, 1.4, zf + 0.014], s: [0.035, 2.1, 0.01] })
      yellow.push({ p: [d, 0.39, zf + 0.014], s: [1.34, 0.06, 0.012] }, { p: [d - 0.69, 1.4, zf + 0.004], s: [0.04, 2.14, 0.016] }, { p: [d + 0.69, 1.4, zf + 0.004], s: [0.04, 2.14, 0.016] })
    }
    return { dark, leaf, glass, yellow }
  }, [len, doors])
  const fair = x > 5 ? { c: -3.6, l: 3.0 } : { c: x < -5 ? -0.8 : 0, l: len * 0.55 }
  return (
    <group position={[x, 0, 0]}>
      <mesh geometry={geo} material={m.skin} castShadow receiveShadow />
      <Inst mat={m.dark} items={parts.dark} />
      <Inst mat={m.paint} items={parts.leaf} />
      <Inst mat={m.glass} items={parts.glass} />
      <Inst mat={m.yellow} items={parts.yellow} />
      {/* обтекатель оборудования на крыше в цвет кузова */}
      <RoundedBox args={[fair.l, 0.34, 1.7]} radius={0.14} smoothness={3} position={[fair.c, YT + 0.12, 0]} material={m.paint} castShadow />
    </group>
  )
}

function Bellows({ x }: { x: number }) {
  const geo = useMemo(() => sectionSkin(0.62, [[0.4, 3.22, '#ffffff', 10]], '#ffffff', 0.94, 3.22), [])
  const mat = useMemo(() => std('#3a3d40', 0.9, 0, {
    vertexColors: true,
    map: canvasTex(64, 8, (g) => {
      for (let i = 0; i < 64; i++) { const v = 40 + Math.round(Math.sin((i / 64) * Math.PI * 2) * 22 + 22); g.fillStyle = `rgb(${v},${v},${v + 3})`; g.fillRect(i, 0, 1, 8) }
    }, [7, 1]),
  }), [])
  return <mesh position={[x, 0, 0]} geometry={geo} material={mat} />
}

/** Стержень между двумя точками. */
function Rod({ a, b, r, mat }: { a: V3; b: V3; r: number; mat: THREE.Material }) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b)
  const d = B.clone().sub(A)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())
  return <mesh position={A.add(B).multiplyScalar(0.5)} quaternion={q} scale={[r, d.length(), r]} geometry={CYL} material={mat} castShadow />
}

function Cab({ rear, st, sign }: { rear?: boolean; st: TramState; sign: THREE.Texture }) {
  const m = useMemo(makeTramMats, [])
  const lights = useMemo(() => ({
    head: std('#fffdf2', 0.3, 0, { emissive: new THREE.Color('#fff4d6'), emissiveIntensity: 2.2 }),
    drl: std('#ffffff', 0.3, 0, { emissive: new THREE.Color('#e8f2ff'), emissiveIntensity: 1.4 }),
    tail: std('#5a1010', 0.4, 0, { emissive: new THREE.Color('#ff2a1a'), emissiveIntensity: 0.25 }),
  }), [])
  lights.tail.userData.noHover = true
  useEffect(() => { lights.tail.emissiveIntensity = st.braking ? 2.8 : 0.25 }, [st.braking, lights])
  const bort = useLabelTexture(BORT, { w: 256, h: 96, bg: 'transparent', fg: '#ffffff', font: '700 72px Golos Text, sans-serif' })
  const slope = Math.atan2(noseX(2.3) - noseX(2.8), 0.5) // наклон стекла
  const flipText: V3 = rear ? [-1, 1, 1] : [1, 1, 1]
  const ctrlColor = st.controller === 'auto' ? '#4aa3ff' : st.controller === 'driver' ? '#ffffff' : '#7c8890'
  const lamp = rear ? lights.tail : lights.head
  return (
    <group position={[rear ? REAR_X : CAB_X, 0, 0]} scale={[rear ? -1 : 1, 1, 1]}>
      <mesh geometry={CAB_GEO} material={m.skin} castShadow receiveShadow />
      {/* маршрутное табло над стеклом */}
      <group position={[frontX(0, 2.95) + 0.012, 2.95, 0]} rotation={[0, 0, slope]}>
        <mesh rotation={[0, Math.PI / 2, 0]} scale={flipText}>
          <planeGeometry args={[1.25, 0.28]} />
          <meshStandardMaterial map={sign} emissiveMap={sign} emissive="#ffffff" emissiveIntensity={1.1} toneMapped={false} />
        </mesh>
      </group>
      {/* фары / задние огни: горизонтальные полосы в чёрной маске низа */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[frontX(s * 0.55, 0.72) + 0.01, 0.72, s * 0.62]} rotation={[0, 0, 0]} material={lamp}>
            <boxGeometry args={[0.04, 0.09, 0.62]} />
          </mesh>
          <mesh position={[frontX(s * 0.55, 0.6) + 0.01, 0.6, s * 0.7]} material={rear ? lights.tail : lights.drl}>
            <boxGeometry args={[0.04, 0.04, 0.42]} />
          </mesh>
        </group>
      ))}
      {/* бортовой номер на лбу и на боках */}
      <mesh position={[frontX(-0.5, 1.13) + 0.012, 1.13, -0.62]} rotation={[0, Math.PI / 2, 0]} scale={flipText}>
        <planeGeometry args={[0.6, 0.22]} />
        <meshStandardMaterial map={bort} transparent alphaTest={0.4} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-1.2, 0.81, s * (W + 0.014)]} rotation={[0, s > 0 ? 0 : Math.PI, 0]} scale={flipText}>
          <planeGeometry args={[0.7, 0.26]} />
          <meshStandardMaterial map={bort} transparent alphaTest={0.4} />
        </mesh>
      ))}
      {!rear && (
        <>
          {/* стеклоочистители */}
          {[-0.45, 0.45].map((z) => (
            <mesh key={z} position={[frontX(z / W, 1.32) + 0.02, 1.32, z]} rotation={[0.5 * Math.sign(z), 0, 0]} material={m.dark}>
              <boxGeometry args={[0.03, 0.03, 0.8]} />
            </mesh>
          ))}
          {/* зеркала на изогнутых кронштейнах */}
          {[-1, 1].map((s) => (
            <group key={s}>
              <Rod a={[0.25, 2.62, s * 1.2]} b={[0.55, 2.82, s * 1.5]} r={0.025} mat={m.dark} />
              <Rod a={[0.55, 2.82, s * 1.5]} b={[0.95, 2.72, s * 1.6]} r={0.025} mat={m.dark} />
              <RoundedBox args={[0.12, 0.42, 0.22]} radius={0.04} smoothness={2} position={[0.98, 2.55, s * 1.6]} material={m.dark} castShadow />
            </group>
          ))}
          {/* индикатор режима управления */}
          <mesh position={[frontX(0.75, 3.12) + 0.02, 3.12, 0.82]}>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshStandardMaterial color={ctrlColor} emissive={ctrlColor} emissiveIntensity={1.6} userData={{ noHover: true }} />
          </mesh>
        </>
      )}
    </group>
  )
}

function Pantograph({ hovered, onHover, onPick }: PartHandlers) {
  const m = useMemo(() => ({
    arm: new THREE.MeshPhysicalMaterial({ color: L.panto, roughness: 0.35, metalness: 0.2, clearcoat: 0.5 }),
    dark: std('#2c3236', 0.45, 0.6), ins: std('#d9d3c4', 0.35),
  }), [])
  const x = PANTO_X, top = 5.96
  return (
    <Part id="pantograph" hovered={hovered} onHover={onHover} onPick={onPick}>
      <group position={[x, 0, 0]}>
        {[[-0.6, -0.45], [-0.6, 0.45], [0.6, -0.45], [0.6, 0.45]].map(([dx, dz]) => (
          <mesh key={`${dx}${dz}`} position={[dx, YT + 0.12, dz]} material={m.ins} scale={[0.07, 0.24, 0.07]} geometry={CYL} />
        ))}
        <mesh position={[0, YT + 0.27, 0]} material={m.dark} castShadow><boxGeometry args={[1.5, 0.08, 1.1]} /></mesh>
        <mesh position={[-0.5, YT + 0.38, 0]} material={m.arm}><boxGeometry args={[0.55, 0.14, 0.32]} /></mesh>
        <Rod a={[-0.7, YT + 0.38, 0]} b={[0.85, 4.92, 0]} r={0.05} mat={m.arm} />
        <Rod a={[-0.45, YT + 0.36, 0.14]} b={[0.78, 4.86, 0.14]} r={0.015} mat={m.dark} />
        {[-0.3, 0.3].map((z) => <Rod key={z} a={[0.85, 4.92, 0]} b={[-0.05, top - 0.05, z]} r={0.028} mat={m.arm} />)}
        <mesh position={[-0.05, top - 0.04, 0]} material={m.dark}><boxGeometry args={[0.24, 0.04, 0.7]} /></mesh>
        {[-0.14, 0.06].map((dx) => (
          <mesh key={dx} position={[dx, top, 0]} material={m.dark} castShadow><boxGeometry args={[0.07, 0.05, 1.3]} /></mesh>
        ))}
        {[-1, 1].map((s) => <Rod key={s} a={[-0.04, top, s * 0.65]} b={[-0.04, top - 0.16, s * 0.92]} r={0.018} mat={m.dark} />)}
      </group>
    </Part>
  )
}

/** Тележки с колёсами и магнитно-рельсовыми башмаками. */
function Bogies({ spin, rail }: { spin: number; rail: boolean }) {
  const m = useMemo(() => ({
    frame: std('#2a2f33', 0.7, 0.3), wheel: std('#5a6066', 0.35, 0.75), cover: std('#4d555c', 0.5, 0.3),
    shoe: std('#4a4f55', 0.6, 0.4),
  }), [])
  m.shoe.userData.noHover = true
  useEffect(() => {
    m.shoe.emissive.set(rail ? '#b44dff' : '#000000')
    m.shoe.emissiveIntensity = rail ? 1.8 : 0
  }, [rail, m])
  const frames = useMemo(() => BOGIES.flatMap((bx): Item[] => [
    { p: [bx, 0.42, 0.98], s: [2.2, 0.26, 0.14] }, { p: [bx, 0.42, -0.98], s: [2.2, 0.26, 0.14] },
    { p: [bx, 0.46, 0], s: [0.5, 0.2, 1.9] },
  ]), [])
  const covers = useMemo(() => BOGIES.flatMap((bx): Item[] => [-1, 1].map((s) => ({ p: [bx, 0.5, s * (W + 0.016)], s: [2.3, 0.3, 0.012] }))), [])
  const shoes = useMemo(() => BOGIES.flatMap((bx): Item[] => [-1, 1].map((s) => ({ p: [bx, 0.11, s * GAUGE], s: [1.0, 0.1, 0.13] }))), [])
  const wheels = useRef<THREE.InstancedMesh>(null)
  const spinRef = useRef(spin)
  spinRef.current = spin
  const last = useRef(NaN)
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), z: new THREE.Vector3(0, 0, 1) }), [])
  useFrame(() => {
    const w = wheels.current
    if (!w || last.current === spinRef.current) return
    last.current = spinRef.current
    tmp.q.setFromAxisAngle(tmp.z, -spinRef.current)
    let i = 0
    for (const bx of BOGIES) for (const dx of [-0.9, 0.9]) for (const z of [-GAUGE + 0.04, GAUGE - 0.04]) {
      tmp.p.set(bx + dx, 0.36, z)
      w.setMatrixAt(i++, tmp.m.compose(tmp.p, tmp.q, tmp.s))
    }
    w.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <Inst mat={m.frame} items={frames} cast />
      <Inst mat={m.cover} items={covers} />
      <Inst mat={m.shoe} items={shoes} />
      <instancedMesh ref={wheels} args={[WHEEL, m.wheel, BOGIES.length * 4]} castShadow frustumCulled={false} />
    </group>
  )
}

interface PartHandlers { hovered: PartId | null; onHover: (p: PartId | null) => void; onPick: (p: PartId, at: THREE.Vector3) => void }

function Tram({ st, ...h }: { st: TramState } & PartHandlers) {
  const sign = useLabelTexture(st.route ? st.route.split('.')[0] : 'ГЭТ', { w: 512, h: 112, bg: '#06080a', fg: '#ffb020', font: '700 84px Golos Text, sans-serif' })
  const sideSign = useLabelTexture(st.route ? st.route.split('.')[0] : 'ГЭТ', { w: 256, h: 128, bg: '#06080a', fg: '#ffb020', font: '700 96px Golos Text, sans-serif' })
  const m = useMemo(() => ({
    cam: std('#2b3136', 0.4, 0.4), lens: std('#2a6fd6', 0.2, 0, { emissive: new THREE.Color('#2a6fd6'), emissiveIntensity: 0.7 }),
    radar: std('#2a2f33', 0.5), nav: std('#eef1f3', 0.4), bvt: std('#26313a', 0.5, 0.3, { emissive: new THREE.Color('#00d18f'), emissiveIntensity: 0.2 }),
    led: std('#00d18f', 0.4, 0, { emissive: new THREE.Color('#00d18f'), emissiveIntensity: 2 }),
  }), [])
  const blob = useMemo(() => canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32)
    gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  }, [1, 1]), [])
  return (
    <group>
      {/* мягкая контактная тень под вагоном */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(FRONT_TIP + REAR_X - 1.2) / 2, 0.015, 0]} renderOrder={1}>
        <planeGeometry args={[FRONT_TIP - REAR_X + 3.5, 4.2]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} opacity={0.55} />
      </mesh>
      <Part id="cab" {...h}>
        <Section {...SECTIONS[0]} />
        <Cab st={st} sign={sign} />
        {/* боковой указатель маршрута у первой двери */}
        <mesh position={[CAB_X - 1.25, 2.3, W + 0.016]}>
          <planeGeometry args={[0.5, 0.25]} />
          <meshStandardMaterial map={sideSign} emissiveMap={sideSign} emissive="#ffffff" emissiveIntensity={0.9} toneMapped={false} />
        </mesh>
      </Part>
      <Section {...SECTIONS[1]} />
      <Part id="brakes" {...h}>
        <Section {...SECTIONS[2]} />
        <Cab rear st={st} sign={sign} />
      </Part>
      <Bellows x={(SECTIONS[0].x - SECTIONS[0].len / 2 + SECTIONS[1].x + SECTIONS[1].len / 2) / 2} />
      <Bellows x={(SECTIONS[1].x - SECTIONS[1].len / 2 + SECTIONS[2].x + SECTIONS[2].len / 2) / 2} />
      <Pantograph {...h} />

      {/* модули АБПВ */}
      <Part id="cameras" {...h}>
        {[-0.38, 0.38].map((z) => (
          <group key={z} position={[CAB_X + frontX(z / W, 2.62) + 0.03, 2.62, z]}>
            <mesh material={m.cam}><boxGeometry args={[0.16, 0.14, 0.24]} /></mesh>
            <mesh position={[0.09, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={m.lens}>
              <cylinderGeometry args={[0.05, 0.05, 0.04, 16]} />
            </mesh>
          </group>
        ))}
      </Part>
      <Part id="radar" {...h}>
        <mesh position={[CAB_X + frontX(0, 0.68) + 0.03, 0.68, 0]} material={m.radar}>
          <boxGeometry args={[0.08, 0.2, 0.44]} />
        </mesh>
      </Part>
      <Part id="nav" {...h}>
        <mesh position={[CAB_X - 0.7, YT + 0.06, 0]} material={m.nav}>
          <cylinderGeometry args={[0.15, 0.19, 0.12, 20]} />
        </mesh>
        <mesh position={[CAB_X - 0.7, YT + 0.13, 0]} material={m.nav}>
          <sphereGeometry args={[0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      </Part>
      <Part id="bvt" {...h}>
        <RoundedBox args={[0.9, 0.3, 0.7]} radius={0.05} smoothness={2} position={[CAB_X - 2.2, YT + 0.16, 0]} material={m.bvt} castShadow />
        <mesh position={[CAB_X - 1.74, YT + 0.2, 0]} material={m.led}><boxGeometry args={[0.02, 0.05, 0.3]} /></mesh>
      </Part>
      <Part id="rail_brake" {...h}>
        <Bogies spin={st.wheelSpin} rail={st.rail} />
      </Part>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Улица: двухпутная линия в брусчатке, контактная сеть, застройка     */
/* ------------------------------------------------------------------ */

const P = 240 // период повторения улицы, м
const FACADE = 15 // фасады в 15 м от оси: улица около 30 м, как Садовая или Литейный
const TRACK2 = -3.3 // ось встречного пути
const POLE_Z = 11.25

// палитра штукатурки петербургских доходных домов
const STUCCO = ['#dcb86a', '#e8d28e', '#d8a29a', '#c98a6e', '#a9c6ad', '#a8bccb', '#ddcdb3', '#e2ac8f', '#d3d0c8', '#c9b18f']
const ROOFS = ['#6c7176', '#7b5d52', '#5f6a63', '#80868a']

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex)
  return '#' + c.multiplyScalar(k).getHexString()
}

function buildRow(sgn: number, seed: number) {
  const r = rng(seed)
  const out = { wall: [] as Item[], plinth: [] as Item[], trim: [] as Item[], frame: [] as Item[], glass: [] as Item[], roof: [] as Item[], chim: [] as Item[], trunk: [] as Item[], crown: [] as Item[] }
  const blds: { x: number; w: number }[] = []
  let x = -P / 2
  while (x < P / 2 - 1) {
    let w = 15 + Math.floor(r() * 5) * 3
    if (P / 2 - (x + w) < 12) w = P / 2 - x
    blds.push({ x, w }); x += w
  }
  const D = 12, zc = sgn * (FACADE + D / 2)
  for (const copy of [0, P]) {
    const rr = rng(seed + 7) // вторая копия совпадает с первой: бесшовная прокрутка
    for (const b of blds) {
      const cx = b.x + b.w / 2 + copy
      const floors = 4 + Math.floor(rr() * 3)
      const h = 4.4 + floors * 3.5
      const col = STUCCO[Math.floor(rr() * STUCCO.length)]
      const white = shade('#f1ece2', 0.97 + rr() * 0.03)
      out.wall.push({ p: [cx, h / 2, zc], s: [b.w, h, D], c: col })
      out.plinth.push({ p: [cx, 2.1, zc], s: [b.w, 4.2, D + 0.16], c: shade(col, 0.78) })
      out.trim.push({ p: [cx, 4.35, zc], s: [b.w, 0.3, D + 0.3], c: white })
      out.trim.push({ p: [cx, h + 0.22, zc], s: [b.w + 0.2, 0.45, D + 0.8], c: white })
      out.trim.push({ p: [cx, h - 0.25, zc], s: [b.w, 0.18, D + 0.4], c: white })
      out.roof.push({ p: [cx, h + 0.44, zc], s: [b.w, 2.4 + rr() * 0.8, D + 0.4], c: ROOFS[Math.floor(rr() * ROOFS.length)] })
      for (const dx of [-b.w * 0.28, b.w * 0.22]) out.chim.push({ p: [cx + dx, h + 2.6, zc + sgn * (rr() - 0.5) * 3], s: [0.6, 1.6, 0.9] })
      // окна рядами: наличник, стекло, сандрики над окнами второго этажа
      const n = Math.max(2, Math.floor((b.w - 1.4) / 2.9))
      const step = (b.w - 1.4) / n
      for (let i = 0; i < n; i++) {
        const wx = b.x + 0.7 + step * (i + 0.5) + copy
        for (let f = 0; f < floors; f++) {
          const wy = 6.3 + f * 3.5
          out.frame.push({ p: [wx, wy, sgn * FACADE], s: [1.7, 2.45, 0.1], c: white })
          out.glass.push({ p: [wx, wy, sgn * FACADE], s: [1.25, 2.0, 0.12] })
          if (f === 0) out.trim.push({ p: [wx, wy + 1.42, sgn * FACADE], s: [1.95, 0.18, 0.36], c: white })
        }
      }
      // первый этаж: витрины, изредка подворотня
      const m = Math.max(1, Math.floor(b.w / 4.6))
      const arch = rr() < 0.35 ? Math.floor(rr() * m) : -1
      for (let i = 0; i < m; i++) {
        const wx = b.x + (b.w / m) * (i + 0.5) + copy
        if (i === arch) { out.glass.push({ p: [wx, 1.75, sgn * FACADE], s: [3.0, 3.5, 0.3] }); continue }
        out.frame.push({ p: [wx, 2.0, sgn * FACADE], s: [2.9, 3.0, 0.26], c: shade(col, 0.6) })
        out.glass.push({ p: [wx, 2.05, sgn * FACADE], s: [2.5, 2.6, 0.3] })
      }
    }
    // липы на тротуаре
    for (let tx = -P / 2 + 9; tx < P / 2; tx += 21) {
      if (rr() < 0.35) continue
      const px = tx + (rr() - 0.5) * 4 + copy, pz = sgn * 13.2
      const s = 0.85 + rr() * 0.35
      out.trunk.push({ p: [px, 1.7 * s, pz], s: [0.14, 3.4 * s, 0.14] })
      out.crown.push({ p: [px, 4.8 * s, pz], s: [2.1 * s, 2.5 * s, 2.1 * s], c: ['#5f7f45', '#6b8a4c', '#56743f'][Math.floor(rr() * 3)] })
    }
  }
  return out
}

const streetMats = () => ({
  wall: std('#ffffff', 0.92), plinth: std('#ffffff', 0.95), trim: std('#ffffff', 0.8), frame: std('#ffffff', 0.7),
  glass: std('#26313b', 0.12, 0.4, { envMapIntensity: 1.3 }), roof: std('#ffffff', 0.55, 0.4), chim: std('#8a6a5c', 0.9),
  trunk: std('#4a3b30', 0.9), crown: std('#ffffff', 0.85, 0, { flatShading: true }),
})

function Row({ sgn, seed, mats }: { sgn: number; seed: number; mats: ReturnType<typeof streetMats> }) {
  const d = useMemo(() => buildRow(sgn, seed), [sgn, seed])
  const g = useRef<THREE.Group>(null)
  // ряд домов между камерой и трамваем прячем: камера всегда видит улицу и дальнюю сторону
  useFrame(({ camera }) => {
    if (g.current) g.current.visible = sgn > 0 ? camera.position.z < FACADE - 0.3 : camera.position.z > -FACADE + 0.3
  })
  return (
    <group ref={g}>
      <Inst mat={mats.wall} items={d.wall} receive />
      <Inst mat={mats.plinth} items={d.plinth} receive />
      <Inst mat={mats.trim} items={d.trim} />
      <Inst mat={mats.frame} items={d.frame} />
      <Inst mat={mats.glass} items={d.glass} />
      <Inst geo={ROOF} mat={mats.roof} items={d.roof} />
      <Inst mat={mats.chim} items={d.chim} />
      <Inst geo={CYL} mat={mats.trunk} items={d.trunk} />
      <Inst geo={CROWN} mat={mats.crown} items={d.crown} />
    </group>
  )
}

function Street({ offset }: { offset: number }) {
  const shift = -((((offset % P) + P) % P))
  const t = useMemo(() => {
    const setts = canvasTex(256, 256, (g) => {
      g.fillStyle = '#4f4c48'; g.fillRect(0, 0, 256, 256)
      const r = rng(3)
      for (let row = 0; row < 16; row++) for (let c = -1; c < 16; c++) {
        const v = 104 + Math.floor(r() * 34), x = c * 16 + (row % 2 ? 8 : 0)
        g.fillStyle = `rgb(${v},${v - 3},${v - 7})`
        g.fillRect(x + 1.2, row * 16 + 1.2, 13.6, 13.6)
      }
    }, [2 * P / 1.6, 7.6 / 1.6])
    const asphalt = canvasTex(128, 128, (g) => {
      g.fillStyle = '#5a5f63'; g.fillRect(0, 0, 128, 128)
      const r = rng(5)
      for (let i = 0; i < 2200; i++) { const v = 70 + Math.floor(r() * 40); g.fillStyle = `rgb(${v},${v + 2},${v + 5})`; g.fillRect(r() * 128, r() * 128, 1, 1) }
    }, [160, 40])
    const tiles = canvasTex(128, 128, (g) => {
      g.fillStyle = '#b3ada3'; g.fillRect(0, 0, 128, 128)
      g.strokeStyle = '#9b958b'; g.lineWidth = 2
      for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke() }
    }, [600 / 2, 4 / 2])
    return { setts, asphalt, tiles }
  }, [])
  const mats = useMemo(() => ({
    ...streetMats(),
    asphalt: std('#ffffff', 0.95, 0, { map: t.asphalt }), setts: std('#ffffff', 0.85, 0, { map: t.setts }),
    walk: std('#ffffff', 0.9, 0, { map: t.tiles }), curb: std('#9c9890', 0.8),
    rail: std('#c9ced2', 0.22, 0.95), groove: std('#2b2d2f', 0.8), paint: std('#ecebe4', 0.7),
    pole: std('#55606a', 0.5, 0.5), wire: std('#2f3438', 0.5, 0.6), lamp: std('#e9ecee', 0.4, 0, { emissive: new THREE.Color('#fff2d0'), emissiveIntensity: 0.25 }),
  }), [t])
  const s = useMemo(() => {
    const rails: Item[] = [], grooves: Item[] = []
    for (const z0 of [0, TRACK2]) for (const z of [z0 - GAUGE, z0 + GAUGE]) {
      rails.push({ p: [0, 0.03, z], s: [600, 0.04, 0.075] })
      grooves.push({ p: [0, 0.012, z + (z > z0 ? -1 : 1) * 0.06], s: [600, 0.012, 0.05] })
    }
    const lines: Item[] = [{ p: [0, 0.008, 1.95], s: [600, 0.01, 0.14] }, { p: [0, 0.008, TRACK2 - 2.05], s: [600, 0.01, 0.14] }]
    const dashes: Item[] = [], poles: Item[] = [], spans: Item[] = [], drops: Item[] = [], arms: Item[] = [], heads: Item[] = []
    for (let x = -P / 2; x < 1.5 * P; x += 9) for (const z of [6.4, -8.2]) dashes.push({ p: [x, 0.008, z], s: [3, 0.01, 0.13] })
    for (let x = -P / 2 + 6; x < 1.5 * P; x += 30) {
      for (const sz of [-1, 1]) {
        poles.push({ p: [x, 4.5, sz * POLE_Z], s: [0.14, 9, 0.14] })
        arms.push({ p: [x, 8.55, sz * (POLE_Z - 0.9)], s: [0.03, 1.8, 0.03], r: [Math.PI / 2, 0, 0] })
        heads.push({ p: [x, 8.48, sz * (POLE_Z - 1.75)], s: [0.7, 0.14, 0.32] })
      }
      spans.push({ p: [x, 6.75, 0], s: [0.012, 2 * POLE_Z, 0.012], r: [Math.PI / 2, 0, 0] })
      for (const z of [0, TRACK2]) drops.push({ p: [x, 6.38, z], s: [0.012, 0.74, 0.012] })
    }
    return { rails, grooves, lines, dashes, poles, spans, drops, arms, heads }
  }, [])
  return (
    <group>
      {/* неподвижное вдоль улицы: асфальт, тротуары, рельсы, провода */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={mats.asphalt}><planeGeometry args={[640, 160]} /></mesh>
      {[-1, 1].map((sz) => (
        <group key={sz}>
          <mesh position={[0, 0.075, sz * (FACADE + 10.95) / 2]} receiveShadow material={mats.walk}><boxGeometry args={[600, 0.15, FACADE - 10.95]} /></mesh>
          <mesh position={[0, 0.085, sz * 10.88]} receiveShadow material={mats.curb}><boxGeometry args={[600, 0.17, 0.2]} /></mesh>
        </group>
      ))}
      <Inst mat={mats.rail} items={s.rails} receive />
      <Inst mat={mats.groove} items={s.grooves} />
      <Inst mat={mats.paint} items={s.lines} />
      {[0, TRACK2].map((z) => (
        <mesh key={z} position={[0, 6.0, z]} rotation={[0, 0, Math.PI / 2]} material={mats.wire}>
          <cylinderGeometry args={[0.014, 0.014, 600, 5]} />
        </mesh>
      ))}
      {/* повторяющееся: сдвигается вместе с пройденным путём */}
      <group position={[shift, 0, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[P / 2, 0.006, TRACK2 / 2]} receiveShadow material={mats.setts}>
          <planeGeometry args={[2 * P, 7.6]} />
        </mesh>
        <Inst mat={mats.paint} items={s.dashes} />
        <Inst geo={CYL} mat={mats.pole} items={s.poles} cast />
        <Inst geo={CYL} mat={mats.wire} items={s.spans} />
        <Inst geo={CYL} mat={mats.wire} items={s.drops} />
        <Inst geo={CYL} mat={mats.pole} items={s.arms} />
        <Inst mat={mats.lamp} items={s.heads} />
        <Row sgn={1} seed={11} mats={mats} />
        <Row sgn={-1} seed={29} mats={mats} />
      </group>
    </group>
  )
}

function SkyDome() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#86aed6') }, bot: { value: new THREE.Color('#dfe6eb') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h = clamp(vP.y * 2.4, 0.0, 1.0); gl_FragColor = vec4(mix(bot, top, pow(h, 0.7)), 1.0);\n#include <colorspace_fragment>\n}',
  }), [])
  return <mesh material={mat} scale={420} renderOrder={-1}><sphereGeometry args={[1, 32, 16]} /></mesh>
}

/* ------------------------------------------------------------------ */
/* Объекты эпизода (положение условное)                                */
/* ------------------------------------------------------------------ */

function Pedestrian({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0.3]}>
      {[-0.1, 0.1].map((z) => (
        <mesh key={z} position={[0, 0.45, z]} castShadow><capsuleGeometry args={[0.08, 0.75, 4, 8]} /><meshStandardMaterial color="#2c3440" /></mesh>
      ))}
      <mesh position={[0, 1.22, 0]} castShadow><capsuleGeometry args={[0.2, 0.5, 6, 12]} /><meshStandardMaterial color="#D55E00" /></mesh>
      <mesh position={[0, 1.75, 0]} castShadow><sphereGeometry args={[0.14, 16, 16]} /><meshStandardMaterial color="#f0c8a8" /></mesh>
    </group>
  )
}
function Car({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0.6]}>
      <RoundedBox args={[4.3, 0.7, 1.8]} radius={0.18} position={[0, 0.62, 0]} castShadow>
        <meshPhysicalMaterial color="#0072B2" roughness={0.3} clearcoat={0.8} />
      </RoundedBox>
      <RoundedBox args={[2.3, 0.6, 1.6]} radius={0.2} position={[-0.2, 1.18, 0]} castShadow>
        <meshPhysicalMaterial color={LIVERY.glass} roughness={0.08} clearcoat={1} />
      </RoundedBox>
      {[-1.35, 1.35].flatMap((dx) => [-0.82, 0.82].map((z) => (
        <mesh key={`${dx}${z}`} position={[dx, 0.33, z]} geometry={WHEEL} scale={[1.05, 1.05, 1.6]}><meshStandardMaterial color="#1c1e20" roughness={0.8} /></mesh>
      )))}
    </group>
  )
}
function OtherTram({ x }: { x: number }) {
  return (
    <group position={[x + 13, 0, 0]}>
      <RoundedBox args={[26, 2.9, 2.5]} radius={0.3} position={[0, 1.8, 0]} castShadow><meshPhysicalMaterial color="#B4447F" roughness={0.35} clearcoat={0.6} /></RoundedBox>
      <mesh position={[0, 2.05, 0]}><boxGeometry args={[25.2, 1.3, 2.53]} /><meshPhysicalMaterial color={LIVERY.glass} roughness={0.08} clearcoat={1} /></mesh>
    </group>
  )
}
function TrafficLight({ x, state }: { x: number; state: 'red' | 'amber' | 'off' }) {
  return (
    <group position={[x, 0, 2.2]}>
      <mesh position={[0, 2, 0]} castShadow><cylinderGeometry args={[0.07, 0.07, 4, 8]} /><meshStandardMaterial color="#2a2f33" /></mesh>
      <mesh position={[0, 4.4, 0]} castShadow><boxGeometry args={[0.35, 1.1, 0.35]} /><meshStandardMaterial color="#1b1f22" /></mesh>
      {(['red', 'amber', 'green'] as const).map((c, i) => {
        const on = state === c
        const col = c === 'red' ? '#ff3022' : c === 'amber' ? '#ffb020' : '#2fd17a'
        return (
          <mesh key={c} position={[-0.18, 4.75 - i * 0.34, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <circleGeometry args={[0.11, 16]} />
            <meshStandardMaterial color={on ? col : '#333'} emissive={on ? col : '#000'} emissiveIntensity={on ? 3 : 0} toneMapped={!on} />
          </mesh>
        )
      })}
    </group>
  )
}
function StopPlatform({ x, name }: { x: number; name: string }) {
  const tex = useLabelTexture(name.slice(0, 26), { w: 1024, h: 128, bg: '#1d4f91', fg: '#ffffff', font: '600 56px Golos Text, sans-serif' })
  // платформа справа по ходу, у дверей
  return (
    <group position={[x + 15, 0, 2.5]}>
      <mesh position={[0, 0.14, 0]} receiveShadow castShadow><boxGeometry args={[30, 0.28, 2.2]} /><meshStandardMaterial color="#c8c3b8" roughness={0.9} /></mesh>
      <mesh position={[0, 0.29, -1.0]}><boxGeometry args={[30, 0.02, 0.18]} /><meshStandardMaterial color="#ffd23a" /></mesh>
      <mesh position={[0, 2.65, 0.55]} castShadow><boxGeometry args={[6, 0.1, 1.5]} /><meshStandardMaterial color="#3a4a55" metalness={0.4} roughness={0.5} /></mesh>
      <mesh position={[0, 1.5, 1.18]}><boxGeometry args={[5.8, 2.2, 0.04]} /><meshStandardMaterial color="#a9c4d4" transparent opacity={0.35} roughness={0.1} /></mesh>
      <mesh position={[0, 3.05, 0.55]}><boxGeometry args={[5.4, 0.5, 0.06]} /><meshStandardMaterial map={tex} /></mesh>
      {[-2.9, 2.9].map((dx) => (
        <mesh key={dx} position={[dx, 1.45, 1.2]}><boxGeometry args={[0.08, 2.4, 0.08]} /><meshStandardMaterial color="#3a4a55" /></mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Сцена                                                               */
/* ------------------------------------------------------------------ */

function Ripple({ at, k }: { at: THREE.Vector3; k: number }) {
  const m = useRef<THREE.Mesh>(null)
  const t = useRef(0)
  useEffect(() => { t.current = 0 }, [k])
  useFrame((_, dt) => {
    t.current += dt
    if (!m.current) return
    const s = 0.2 + t.current * 5
    m.current.scale.setScalar(s)
    ;(m.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - t.current * 1.6)
  })
  return (
    <mesh ref={m} position={at}>
      <torusGeometry args={[0.5, 0.04, 8, 48]} />
      <meshBasicMaterial color="#ffb020" transparent />
    </mesh>
  )
}

function click() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC()
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = 'triangle'
    o.frequency.setValueAtTime(420, ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.12)
    g.gain.setValueAtTime(0.18, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16)
    o.connect(g).connect(ctx.destination)
    o.start(); o.stop(ctx.currentTime + 0.18)
    setTimeout(() => ctx.close(), 300)
  } catch { /* без звука */ }
}

interface Frame {
  speed: number; dist: number; obj: string; danger: boolean; dangerReq: boolean; tlReal: boolean; tlReq: boolean
  braking: boolean; rail: boolean; controller: string; route: string; stopDist: number | null; stopName: string | null
}

function frameAt(win: Series | null, dist: number[], cursor: number | null): Frame | null {
  if (!win || cursor == null || !dist.length) return null
  const i = indexAt(win.t, cursor)
  const j = Math.min(i + 1, win.t.length - 1)
  const f = j > i ? Math.min(1, Math.max(0, (cursor - win.t[i]) / (win.t[j] - win.t[i]))) : 0
  const near = (k: string, r = 1) => {
    for (let q = Math.max(0, i - r); q <= Math.min(win.t.length - 1, i + r); q++) if ((num(win, k, q) ?? 0) > 0.5) return true
    return false
  }
  return {
    speed: Math.min(num(win, 'speed', i) ?? 0, 100), dist: dist[i] + (dist[j] - dist[i]) * f,
    obj: str(win, 'goal_obj_type', i) ?? 'Unknown', danger: near('danger_real'), dangerReq: near('danger_act'),
    tlReal: near('tl_real'), tlReq: near('tl_act'),
    braking: ['brake_mech', 'brake_rail', 'brake_crash', 'brake_emergency'].some((c) => (num(win, c, i) ?? 0) > 0.5),
    rail: (num(win, 'brake_rail', i) ?? 0) > 0.5 || (num(win, 'brake_crash', i) ?? 0) > 0.5,
    controller: str(win, 'controller', i) ?? 'und', route: str(win, 'route', i) ?? '',
    stopDist: num(win, 'dist_to_stop', i), stopName: str(win, 'stop_name', i),
  }
}

export function useDistance(win: Series | null) {
  return useMemo(() => {
    if (!win) return []
    const d = [0]
    for (let i = 1; i < win.t.length; i++) {
      const v0 = Math.min(num(win, 'speed', i - 1) ?? 0, 100), v1 = Math.min(num(win, 'speed', i) ?? 0, 100)
      d.push(d[i - 1] + ((v0 + v1) / 2 / 3.6) * ((win.t[i] - win.t[i - 1]) / 1000))
    }
    return d
  }, [win])
}

export default function Tram3D({ mode, onPick }: { mode: 'showcase' | 'replay'; onPick?: (p: PartId) => void }) {
  const { win, cursor } = useStore()
  const { t, obj: objName, lang } = useT()
  const dist = useDistance(win)
  const fr = mode === 'replay' ? frameAt(win, dist, cursor) : null
  const [hovered, setHovered] = useState<PartId | null>(null)
  const [ripple, setRipple] = useState<{ at: THREE.Vector3; k: number } | null>(null)
  const [idle, setIdle] = useState(true)
  const front = FRONT_TIP

  const st: TramState = {
    braking: fr?.braking ?? false, rail: fr?.rail ?? false,
    wheelSpin: ((fr?.dist ?? 0) / 0.31) % (Math.PI * 2), route: fr?.route ?? '100.2', controller: fr?.controller ?? 'driver',
  }
  // объект и светофор стоят на улице: точка задаётся один раз на отрезок (как в 2D),
  // а на сцене сдвигается вместе с улицей, поэтому трамвай к ним подъезжает, а не тащит их за собой
  const anchors = useMemo(() => computeAnchors(win, dist), [win, dist])
  const ci = win && cursor != null ? indexAt(win.t, cursor) : -1
  const aObj = fr ? activeAnchor(anchors.obj, ci) : null
  const aTl = fr ? activeAnchor(anchors.tl, ci) : null
  const objX = aObj && fr ? front + (aObj.at - fr.dist) : 0
  const tlX = aTl && fr ? front + (aTl.at - fr.dist) + (aObj && Math.abs(aTl.at - aObj.at) < 8 ? 6 : 0) : 0
  const showObj = !!aObj && objX > front - 2
  const showTl = !!aTl && tlX > front - 2
  const dCond = Math.max(0, objX - front)

  const pick = (p: PartId, at: THREE.Vector3) => {
    click()
    setRipple({ at, k: Math.random() })
    onPick?.(p)
  }

  return (
    <div className="scene3d" onPointerDown={() => setIdle(false)}>
      <Canvas shadows dpr={[1, 1.75]} camera={{ position: mode === 'replay' ? [30, 11, 29] : [27, 8.5, 31], fov: 34, near: 0.5, far: 900 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
        <color attach="background" args={['#dfe6eb']} />
        <fog attach="fog" args={['#d9e1e7', 70, 210]} />
        <SkyDome />
        {/* окружение без внешних HDRI: мягкое небо сверху, светлый горизонт, тёплая земля */}
        <Environment resolution={128} frames={1} environmentIntensity={0.75}>
          <color attach="background" args={['#9aa6ae']} />
          <Lightformer form="rect" intensity={2.2} color="#eef4fa" scale={[60, 60, 1]} position={[0, 30, 0]} rotation={[Math.PI / 2, 0, 0]} />
          <Lightformer form="rect" intensity={1.1} color="#ffffff" scale={[60, 6, 1]} position={[0, 6, -30]} />
          <Lightformer form="rect" intensity={1.1} color="#ffffff" scale={[60, 6, 1]} position={[0, 6, 30]} rotation={[0, Math.PI, 0]} />
          <Lightformer form="rect" intensity={0.6} color="#d9c7a8" scale={[60, 60, 1]} position={[0, -10, 0]} rotation={[-Math.PI / 2, 0, 0]} />
        </Environment>
        <hemisphereLight args={['#eaf3ff', '#6b6458', 0.35]} />
        <directionalLight position={[22, 38, 24]} intensity={2.3} color="#fff6e8" castShadow shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004} shadow-normalBias={0.03}
          shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={26} shadow-camera-bottom={-26} shadow-camera-near={5} shadow-camera-far={120} />
        <Street offset={fr?.dist ?? 0} />
        <Tram st={st} hovered={hovered} onHover={setHovered} onPick={pick} />
        {fr && fr.stopDist != null && fr.stopName && fr.stopDist < 120 && <StopPlatform x={front + fr.stopDist} name={place(fr.stopName, lang)} />}
        {showObj && fr && (fr.obj === 'Vehicle' ? <Car x={objX} /> : fr.obj === 'Tram' ? <OtherTram x={objX} /> : <Pedestrian x={objX} />)}
        {showTl && fr && <TrafficLight x={tlX} state={fr.tlReal ? 'red' : fr.tlReq ? 'amber' : 'off'} />}
        {fr?.danger && showObj && (
          <mesh position={[front + dCond / 2, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[dCond, 2.6]} />
            <meshBasicMaterial color="#ff3b2f" transparent opacity={0.35} depthWrite={false} />
          </mesh>
        )}
        {ripple && <Ripple at={ripple.at} k={ripple.k} />}
        {hovered && (
          <Html position={[front - 4, 7.6, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="tip3d">{PARTS[hovered][lang]}</div>
          </Html>
        )}
        {showObj && fr && (
          <Html position={[objX, 3.2, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="tag3d danger">{objName(fr.obj === 'Unknown' ? 'Unknown' : fr.obj)}, {t('schematic')}</div>
          </Html>
        )}
        <OrbitControls target={[mode === 'replay' ? 9 : 0, 2.2, 0]} enableDamping dampingFactor={0.08}
          autoRotate={mode === 'showcase' && idle && !hovered} autoRotateSpeed={0.6}
          minDistance={12} maxDistance={58} maxPolarAngle={Math.PI / 2.06} />
      </Canvas>
    </div>
  )
}
