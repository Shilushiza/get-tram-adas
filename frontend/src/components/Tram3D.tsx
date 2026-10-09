import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { Environment, Html, Lightformer, OrbitControls, RoundedBox } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { indexAt, num, str, type Series } from '../api'
import { useStore } from '../store'
import { activeAnchor, computeAnchors, type Anchor } from '../anchors'
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

/* ------------------------------------------------------------------ */
/* Общие помощники: сглаживание, слияние геометрии                     */
/* ------------------------------------------------------------------ */

const LN2 = Math.log(2)
/** FPS-независимое сглаживание к цели: half-life в секундах. */
const damp = (x: number, goal: number, half: number, dt: number) => goal + (x - goal) * Math.exp((-LN2 * dt) / half)
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3()
function at(geo: THREE.BufferGeometry, p: V3, r: V3 = [0, 0, 0], s: V3 = [1, 1, 1]) {
  return geo.clone().applyMatrix4(_m.compose(_p.set(...p), _q.setFromEuler(_e.set(...r)), _s.set(...s)))
}
/** Стержень между двумя точками, запечённый в геометрию. */
function rod(a: V3, b: V3, r: number) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b)
  const d = B.clone().sub(A)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())
  return CYL.clone().applyMatrix4(new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, new THREE.Vector3(r, d.length(), r)))
}
const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs) as THREE.BufferGeometry
const box = (p: V3, s: V3, r: V3 = [0, 0, 0]) => at(BOX, p, r, s)

/** Зеркальная по горизонтали копия текстуры: надписи на заднем (отражённом) торце читаются правильно. */
function flipTex(t: THREE.Texture) {
  const c = t.clone()
  c.wrapS = THREE.RepeatWrapping
  c.repeat.x = -1; c.offset.x = 1
  c.needsUpdate = true
  return c
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* ------------------------------------------------------------------ */
/* Состояние проигрывания: пишется в ref каждый кадр, React не трогает */
/* ------------------------------------------------------------------ */

type Phase = 'none' | 'approach' | 'stopped' | 'cleared'
interface StopA { at: number; name: string }
interface Sim {
  live: boolean; dist: number; v: number; a: number; t: number; trauma: number
  braking: boolean; rail: boolean; controller: string; danger: boolean; tlReal: boolean; tlReq: boolean
  objA: Anchor | null; phase: Phase; tlA: Anchor | null; tlOn: boolean; tlShift: number; stop: StopA | null
}
type SimRef = RefObject<Sim>
const newSim = (): Sim => ({
  live: false, dist: 0, v: 0, a: 0, t: 0, trauma: 0, braking: false, rail: false, controller: 'driver', danger: false,
  tlReal: false, tlReq: false, objA: null, phase: 'none', tlA: null, tlOn: false, tlShift: 0, stop: null,
})

/** Медленно меняющееся (то, что нужно React: тексты, текстуры). Обновляется только при изменении. */
interface Disc { route: string; stopName: string; objIdx: number; phase: Phase; gap: number }
const DISC0: Disc = { route: '100.2', stopName: '', objIdx: -1, phase: 'none', gap: 6 }

/* ------------------------------------------------------------------ */
/* Трамвай: 71-931М «Витязь-М» (ПК ТС), петербургский вариант          */
/* ------------------------------------------------------------------ */

function makeTramMats() {
  return {
    skin: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, clearcoat: 0.85, clearcoatRoughness: 0.08 }),
    paint: new THREE.MeshPhysicalMaterial({ color: L.body, roughness: 0.3, metalness: 0, clearcoat: 0.85, clearcoatRoughness: 0.08 }),
    glass: new THREE.MeshPhysicalMaterial({ color: L.glass, roughness: 0.05, metalness: 0, clearcoat: 1, envMapIntensity: 1.4 }),
    dark: std(L.frame, 0.55),
    yellow: std(L.doorEdge, 0.5),
  }
}

// Размеры по паспорту 71-931М: длина 27,5 м, ширина 2,5 м, три секции, три тележки (Bo-Bo-Bo),
// база между узлами сочленения 4,76 м, от крайней тележки до сочленения 6,61 м.
const TIP = 13.75
const JOINT = 2.38
const BELLOW = 0.6
const CAB_X = TIP - noseX(0.95)
const END_LEN = CAB_X - (JOINT + BELLOW / 2)
const END_C = (CAB_X + JOINT + BELLOW / 2) / 2
const FRONT_TIP = TIP
const REAR_X = -CAB_X
const GAUGE = 0.762 // половина колеи 1524 мм
const BOGIES = [JOINT + 6.614, 0, -(JOINT + 6.614)]

interface Door { x: number; w: number } // x от центра секции, w: проём 1,3 м (двустворчатая) или 0,73 м (одностворчатая)
interface SectionDef { x: number; len: number; doors: Door[]; fair: [number, number] | null }
// шесть дверей по правому борту: у кабины одностворчатая, ближе к середине по две двустворчатых в каждой концевой секции
const SECTIONS: SectionDef[] = [
  { x: END_C, len: END_LEN, doors: [{ x: CAB_X - 1.48 - END_C, w: 0.73 }, { x: 6.35 - END_C, w: 1.3 }, { x: 3.75 - END_C, w: 1.3 }], fair: [6.3 - END_C, 6.2] },
  { x: 0, len: 2 * JOINT - BELLOW, doors: [], fair: null },
  { x: -END_C, len: END_LEN, doors: [{ x: END_C - CAB_X + 1.48, w: 0.73 }, { x: END_C - 6.35, w: 1.3 }, { x: END_C - 3.75, w: 1.3 }], fair: [END_C - 6.55, 6.7] },
]

function Section({ x, len, doors, fair }: SectionDef) {
  const geo = useMemo(() => sectionSkin(len, SIDE_BANDS, L.roof), [len])
  const m = useMemo(makeTramMats, [])
  const parts = useMemo(() => {
    const dark: Item[] = [], leaf: Item[] = [], glass: Item[] = [], yellow: Item[] = []
    const zf = W + 0.012
    // стойки окон: на правом борту не там, где двери
    for (let px = -len / 2 + 0.55; px <= len / 2 - 0.5; px += 1.48) {
      for (const s of [-1, 1]) {
        if (s > 0 && doors.some((d) => Math.abs(d.x - px) < d.w / 2 + 0.2)) continue
        dark.push({ p: [px, 1.83, s * (W + 0.004)], s: [0.075, 1.46, 0.02] })
      }
    }
    // двери прислонно-сдвижные: уплотнитель, створки с остеклением, жёлтая окантовка и порог
    for (const { x: d, w } of doors) {
      const dbl = w > 1
      dark.push({ p: [d, 1.41, W + 0.006], s: [w + 0.16, 2.18, 0.02] })
      leaf.push({ p: [d, 1.4, zf], s: [w + 0.04, 2.1, 0.02] })
      const panes = dbl ? [-w * 0.258, w * 0.258] : [0]
      const pw = dbl ? w * 0.385 : w - 0.2
      for (const o of panes) glass.push({ p: [d + o, 1.62, zf + 0.012], s: [pw, 1.5, 0.01] }, { p: [d + o, 0.78, zf + 0.012], s: [pw, 0.42, 0.01] })
      if (dbl) dark.push({ p: [d, 1.4, zf + 0.014], s: [0.035, 2.1, 0.01] })
      yellow.push({ p: [d, 0.39, zf + 0.014], s: [w + 0.04, 0.06, 0.012] }, { p: [d - w / 2 - 0.04, 1.4, zf + 0.004], s: [0.04, 2.14, 0.016] }, { p: [d + w / 2 + 0.04, 1.4, zf + 0.004], s: [0.04, 2.14, 0.016] })
    }
    return { dark, leaf, glass, yellow }
  }, [len, doors])
  return (
    <group position={[x, 0, 0]}>
      <mesh geometry={geo} material={m.skin} castShadow receiveShadow />
      <Inst mat={m.dark} items={parts.dark} />
      <Inst mat={m.paint} items={parts.leaf} />
      <Inst mat={m.glass} items={parts.glass} />
      <Inst mat={m.yellow} items={parts.yellow} />
      {/* обтекатель оборудования на крыше в цвет кузова */}
      {fair && <RoundedBox args={[fair[1], 0.34, 1.7]} radius={0.14} smoothness={3} position={[fair[0], YT + 0.12, 0]} material={m.paint} castShadow />}
    </group>
  )
}

const BELLOWS_GEO = sectionSkin(BELLOW + 0.02, [[0.4, 3.22, '#ffffff', 10]], '#ffffff', 0.94, 3.22)
function Bellows({ x }: { x: number }) {
  const mat = useMemo(() => std('#3a3d40', 0.9, 0, {
    vertexColors: true,
    map: canvasTex(64, 8, (g) => {
      for (let i = 0; i < 64; i++) { const v = 40 + Math.round(Math.sin((i / 64) * Math.PI * 2) * 22 + 22); g.fillStyle = `rgb(${v},${v},${v + 3})`; g.fillRect(i, 0, 1, 8) }
    }, [7, 1]),
  }), [])
  return <mesh position={[x, 0, 0]} geometry={BELLOWS_GEO} material={mat} />
}

// мелкие детали кабины слиты по материалу: меньше вызовов отрисовки
const CAB_DARK_GEO = merge([
  ...[-0.45, 0.45].map((z) => box([frontX(z / W, 1.32) + 0.02, 1.32, z], [0.03, 0.03, 0.8], [0.5 * Math.sign(z), 0, 0])),
  ...[-1, 1].flatMap((s) => [
    rod([0.25, 2.62, s * 1.2], [0.55, 2.82, s * 1.5], 0.025),
    rod([0.55, 2.82, s * 1.5], [0.95, 2.72, s * 1.6], 0.025),
    box([0.98, 2.55, s * 1.6], [0.12, 0.42, 0.22]),
  ]),
])
const HEAD_GEO = merge([-1, 1].map((s) => box([frontX(s * 0.55, 0.72) + 0.01, 0.72, s * 0.62], [0.04, 0.09, 0.62])))
const DRL_GEO = merge([-1, 1].map((s) => box([frontX(s * 0.55, 0.6) + 0.01, 0.6, s * 0.7], [0.04, 0.04, 0.42])))
const TAIL_GEO = merge([HEAD_GEO, DRL_GEO])
const PLANE = new THREE.PlaneGeometry(1, 1)
// бортовой номер: на лбу и на обоих бортах за кабиной
const BORT_GEO = merge([
  at(PLANE, [frontX(-0.5, 1.13) + 0.012, 1.13, -0.62], [0, Math.PI / 2, 0], [0.6, 0.22, 1]),
  at(PLANE, [-3.0, 0.81, W + 0.014], [0, 0, 0], [0.7, 0.26, 1]),
  at(PLANE, [-3.0, 0.81, -(W + 0.014)], [0, Math.PI, 0], [0.7, 0.26, 1]),
])
const SLOPE = Math.atan2(noseX(2.3) - noseX(2.8), 0.5) // наклон лобового стекла

function Cab({ rear, sim, sign }: { rear?: boolean; sim: SimRef; sign: THREE.Texture }) {
  const m = useMemo(makeTramMats, [])
  const lights = useMemo(() => {
    const l = {
      head: std('#fffdf2', 0.3, 0, { emissive: new THREE.Color('#fff4d6'), emissiveIntensity: 2.2 }),
      drl: std('#ffffff', 0.3, 0, { emissive: new THREE.Color('#e8f2ff'), emissiveIntensity: 1.4 }),
      tail: std('#5a1010', 0.4, 0, { emissive: new THREE.Color('#ff2a1a'), emissiveIntensity: 0.25 }),
      ctrl: std('#ffffff', 0.4, 0, { emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.6 }),
    }
    l.tail.userData.noHover = true
    l.ctrl.userData.noHover = true
    return l
  }, [])
  const bortSrc = useLabelTexture(BORT, { w: 256, h: 96, bg: 'transparent', fg: '#ffffff', font: '700 72px Golos Text, sans-serif' })
  const bort = useMemo(() => (rear ? flipTex(bortSrc) : bortSrc), [bortSrc, rear])
  const signT = useMemo(() => (rear ? flipTex(sign) : sign), [sign, rear])
  const ctrlKey = useRef('')
  useFrame(() => {
    const s = sim.current
    if (rear) {
      const k = s.braking ? 2.8 : 0.25
      if (lights.tail.emissiveIntensity !== k) lights.tail.emissiveIntensity = k
    } else if (ctrlKey.current !== s.controller) {
      ctrlKey.current = s.controller
      const c = s.controller === 'auto' ? '#4aa3ff' : s.controller === 'driver' ? '#ffffff' : '#7c8890'
      lights.ctrl.color.set(c); lights.ctrl.emissive.set(c)
    }
  })
  return (
    <group position={[rear ? REAR_X : CAB_X, 0, 0]} scale={[rear ? -1 : 1, 1, 1]}>
      <mesh geometry={CAB_GEO} material={m.skin} castShadow receiveShadow />
      {/* маршрутное табло над стеклом в чёрной маске */}
      <group position={[frontX(0, 2.95) + 0.012, 2.95, 0]} rotation={[0, 0, SLOPE]}>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[1.25, 0.28]} />
          <meshStandardMaterial map={signT} emissiveMap={signT} emissive="#ffffff" emissiveIntensity={1.1} toneMapped={false} />
        </mesh>
      </group>
      {/* светодиодные фары и ходовые огни (сзади: габариты и стоп-сигналы) */}
      {rear ? <mesh geometry={TAIL_GEO} material={lights.tail} /> : (
        <>
          <mesh geometry={HEAD_GEO} material={lights.head} />
          <mesh geometry={DRL_GEO} material={lights.drl} />
        </>
      )}
      <mesh geometry={BORT_GEO}>
        <meshStandardMaterial map={bort} transparent alphaTest={0.4} />
      </mesh>
      {!rear && (
        <>
          {/* стеклоочистители и зеркала на кронштейнах */}
          <mesh geometry={CAB_DARK_GEO} material={m.dark} castShadow />
          {/* индикатор режима управления */}
          <mesh position={[frontX(0.75, 3.12) + 0.02, 3.12, 0.82]} material={lights.ctrl}>
            <sphereGeometry args={[0.05, 12, 12]} />
          </mesh>
        </>
      )}
    </group>
  )
}

// пантограф на средней секции, слит в три геометрии по материалу
const PTOP = 5.96
const PANTO = {
  arm: merge([
    box([-0.5, YT + 0.38, 0], [0.55, 0.14, 0.32]),
    rod([-0.7, YT + 0.38, 0], [0.85, 4.92, 0], 0.05),
    ...[-0.3, 0.3].map((z) => rod([0.85, 4.92, 0], [-0.05, PTOP - 0.05, z], 0.028)),
  ]),
  dark: merge([
    box([0, YT + 0.27, 0], [1.5, 0.08, 1.1]),
    rod([-0.45, YT + 0.36, 0.14], [0.78, 4.86, 0.14], 0.015),
    box([-0.05, PTOP - 0.04, 0], [0.24, 0.04, 0.7]),
    ...[-0.14, 0.06].map((dx) => box([dx, PTOP, 0], [0.07, 0.05, 1.3])),
    ...[-1, 1].map((s) => rod([-0.04, PTOP, s * 0.65], [-0.04, PTOP - 0.16, s * 0.92], 0.018)),
  ]),
  ins: merge([[-0.6, -0.45], [-0.6, 0.45], [0.6, -0.45], [0.6, 0.45]].map(([dx, dz]) => at(CYL, [dx, YT + 0.12, dz], [0, 0, 0], [0.07, 0.24, 0.07]))),
}

function Pantograph({ hovered, onHover, onPick }: PartHandlers) {
  const m = useMemo(() => ({
    arm: new THREE.MeshPhysicalMaterial({ color: L.panto, roughness: 0.35, metalness: 0, clearcoat: 0.5 }),
    dark: std('#2c3236', 0.45, 0), ins: std('#d9d3c4', 0.35),
  }), [])
  return (
    <Part id="pantograph" hovered={hovered} onHover={onHover} onPick={onPick}>
      <mesh geometry={PANTO.ins} material={m.ins} />
      <mesh geometry={PANTO.arm} material={m.arm} castShadow />
      <mesh geometry={PANTO.dark} material={m.dark} castShadow />
    </Part>
  )
}

/** Тележки с колёсами и магнитно-рельсовыми башмаками. Угол колеса = путь / радиус. */
function Bogies({ sim }: { sim: SimRef }) {
  const m = useMemo(() => ({
    frame: std('#2a2f33', 0.7, 0), wheel: std('#b8bdc2', 0.35, 1), cover: std('#4d555c', 0.5, 0),
    shoe: std('#4a4f55', 0.6, 0),
  }), [])
  m.shoe.userData.noHover = true
  const frames = useMemo(() => BOGIES.flatMap((bx): Item[] => [
    { p: [bx, 0.42, 0.98], s: [2.2, 0.26, 0.14] }, { p: [bx, 0.42, -0.98], s: [2.2, 0.26, 0.14] },
    { p: [bx, 0.46, 0], s: [0.5, 0.2, 1.9] },
  ]), [])
  const covers = useMemo(() => BOGIES.flatMap((bx): Item[] => [-1, 1].map((s) => ({ p: [bx, 0.5, s * (W + 0.016)], s: [2.3, 0.3, 0.012] }))), [])
  const shoes = useMemo(() => BOGIES.flatMap((bx): Item[] => [-1, 1].map((s) => ({ p: [bx, 0.11, s * GAUGE], s: [1.0, 0.1, 0.13] }))), [])
  const wheels = useRef<THREE.InstancedMesh>(null)
  const last = useRef(NaN)
  const railOn = useRef(false)
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), z: new THREE.Vector3(0, 0, 1) }), [])
  useFrame(() => {
    const s = sim.current
    if (railOn.current !== s.rail) {
      railOn.current = s.rail
      m.shoe.emissive.set(s.rail ? '#b44dff' : '#000000')
      m.shoe.emissiveIntensity = s.rail ? 1.8 : 0
    }
    const spin = (s.dist / 0.31) % (Math.PI * 2)
    const w = wheels.current
    if (!w || last.current === spin) return
    last.current = spin
    tmp.q.setFromAxisAngle(tmp.z, -spin)
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

/** Секция качается вокруг своей тележки (ось на высоте 0,5 м). */
function Pivot({ x, g, children }: { x: number; g: RefObject<THREE.Group | null>; children: ReactNode }) {
  return (
    <group position={[x, 0.5, 0]}>
      <group ref={g}><group position={[-x, -0.5, 0]}>{children}</group></group>
    </group>
  )
}

const STEP = 1 / 60
function Tram({ sim, route, ...h }: { sim: SimRef; route: string } & PartHandlers) {
  const label = route ? route.split('.')[0] : 'ГЭТ'
  const sign = useLabelTexture(label, { w: 512, h: 112, bg: '#06080a', fg: '#ffb020', font: '700 84px Golos Text, sans-serif' })
  const sideSign = useLabelTexture(label, { w: 256, h: 128, bg: '#06080a', fg: '#ffb020', font: '700 96px Golos Text, sans-serif' })
  const m = useMemo(() => ({
    cam: std('#2b3136', 0.4, 0), lens: std('#2a6fd6', 0.2, 0, { emissive: new THREE.Color('#2a6fd6'), emissiveIntensity: 0.7 }),
    radar: std('#2a2f33', 0.5), nav: std('#eef1f3', 0.4), bvt: std('#26313a', 0.5, 0, { emissive: new THREE.Color('#00d18f'), emissiveIntensity: 0.2 }),
    led: std('#00d18f', 0.4, 0, { emissive: new THREE.Color('#00d18f'), emissiveIntensity: 2 }),
  }), [])
  const blob = useMemo(() => canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32)
    gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  }, [1, 1]), [])

  // наклон кузова при торможении/разгоне: недодемпфированная пружина (1,2 Гц, ζ 0,4) с фиксированным шагом,
  // средняя и задняя секции догоняют переднюю с задержкой (overlapping action)
  const gF = useRef<THREE.Group>(null), gM = useRef<THREE.Group>(null), gR = useRef<THREE.Group>(null)
  const spr = useRef({ x: [0, 0, 0], v: [0, 0, 0], acc: 0 })
  useFrame((_, dt) => {
    const S = spr.current, s = sim.current
    const goal = clamp(-0.006 * s.a, -0.018, 0.018)
    S.acc += Math.min(dt, 0.25)
    const W0 = [2 * Math.PI * 1.2, 2 * Math.PI * 1.05, 2 * Math.PI * 0.95], Z = 0.4
    while (S.acc >= STEP) {
      const tg = [goal, S.x[0] * 0.8, S.x[1] * 0.85]
      for (let k = 0; k < 3; k++) {
        const w = W0[k]
        S.v[k] += (w * w * (tg[k] - S.x[k]) - 2 * Z * w * S.v[k]) * STEP
        S.x[k] += S.v[k] * STEP
      }
      S.acc -= STEP
    }
    if (gF.current) gF.current.rotation.z = -S.x[0]
    if (gM.current) gM.current.rotation.z = -S.x[1]
    if (gR.current) gR.current.rotation.z = -S.x[2]
  })

  return (
    <group>
      {/* мягкая контактная тень под вагоном */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} renderOrder={1}>
        <planeGeometry args={[2 * TIP + 2.5, 4.2]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} opacity={0.55} />
      </mesh>
      <Pivot x={BOGIES[0]} g={gF}>
        <Part id="cab" {...h}>
          <Section {...SECTIONS[0]} />
          <Cab sim={sim} sign={sign} />
          {/* боковой указатель маршрута у кабины */}
          <mesh position={[CAB_X - 0.55, 2.3, W + 0.016]}>
            <planeGeometry args={[0.5, 0.25]} />
            <meshStandardMaterial map={sideSign} emissiveMap={sideSign} emissive="#ffffff" emissiveIntensity={0.9} toneMapped={false} />
          </mesh>
        </Part>
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
      </Pivot>
      <Pivot x={BOGIES[1]} g={gM}>
        <Section {...SECTIONS[1]} />
        <Bellows x={JOINT} />
        <Bellows x={-JOINT} />
        <Pantograph {...h} />
      </Pivot>
      <Pivot x={BOGIES[2]} g={gR}>
        <Part id="brakes" {...h}>
          <Section {...SECTIONS[2]} />
          <Cab rear sim={sim} sign={sign} />
        </Part>
      </Pivot>
      <Part id="rail_brake" {...h}>
        <Bogies sim={sim} />
      </Part>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Улица: двухпутная линия в брусчатке, контактная сеть, застройка     */
/* ------------------------------------------------------------------ */

const P = 240 // период повторения улицы, м; шаги разметки (10), опор (30), плитки (2, 1,6, 4) его делят
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
  for (const copy of [-P, 0, P]) {
    const rr = rng(seed + 7) // копии совпадают: бесшовная прокрутка, улица видна на 240 м в обе стороны
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
      const m = Math.max(1, Math.floor(b.w / 4.6))
      const arch = rr() < 0.35 ? Math.floor(rr() * m) : -1
      for (let i = 0; i < m; i++) {
        const wx = b.x + (b.w / m) * (i + 0.5) + copy
        if (i === arch) { out.glass.push({ p: [wx, 1.75, sgn * FACADE], s: [3.0, 3.5, 0.3] }); continue }
        out.frame.push({ p: [wx, 2.0, sgn * FACADE], s: [2.9, 3.0, 0.26], c: shade(col, 0.6) })
        out.glass.push({ p: [wx, 2.05, sgn * FACADE], s: [2.5, 2.6, 0.3] })
      }
    }
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
  glass: std('#26313b', 0.1, 0, { envMapIntensity: 1.6 }), roof: std('#ffffff', 0.55, 0), chim: std('#8a6a5c', 0.9),
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

/** Всё, что стоит на земле, смещается ровно на пройденный путь: повторяющиеся объекты группой, покрытия сдвигом текстуры. */
function Street({ sim }: { sim: SimRef }) {
  const t = useMemo(() => {
    const setts = canvasTex(256, 256, (g) => {
      g.fillStyle = '#4f4c48'; g.fillRect(0, 0, 256, 256)
      const r = rng(3)
      for (let row = 0; row < 16; row++) for (let c = -1; c < 16; c++) {
        const v = 104 + Math.floor(r() * 34), x = c * 16 + (row % 2 ? 8 : 0)
        g.fillStyle = `rgb(${v},${v - 3},${v - 7})`
        g.fillRect(x + 1.2, row * 16 + 1.2, 13.6, 13.6)
      }
    }, [600 / 1.6, 7.6 / 1.6])
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
    rail: std('#c9ced2', 0.22, 1), groove: std('#2b2d2f', 0.8), paint: std('#ecebe4', 0.7),
    pole: std('#55606a', 0.5, 0), wire: std('#2f3438', 0.5, 0), lamp: std('#e9ecee', 0.4, 0, { emissive: new THREE.Color('#fff2d0'), emissiveIntensity: 0.25 }),
  }), [t])
  const s = useMemo(() => {
    const rails: Item[] = [], grooves: Item[] = []
    for (const z0 of [0, TRACK2]) for (const z of [z0 - GAUGE, z0 + GAUGE]) {
      rails.push({ p: [0, 0.03, z], s: [600, 0.04, 0.075] })
      grooves.push({ p: [0, 0.012, z + (z > z0 ? -1 : 1) * 0.06], s: [600, 0.012, 0.05] })
    }
    const lines: Item[] = [{ p: [0, 0.008, 1.95], s: [600, 0.01, 0.14] }, { p: [0, 0.008, TRACK2 - 2.05], s: [600, 0.01, 0.14] }]
    const dashes: Item[] = [], poles: Item[] = [], spans: Item[] = [], drops: Item[] = [], arms: Item[] = [], heads: Item[] = []
    // штрих 3 м + промежуток 7 м = 10 м, делитель периода 240 м: без скачка разметки
    for (let x = -1.5 * P; x < 1.5 * P; x += 10) for (const z of [6.4, -8.2]) dashes.push({ p: [x, 0.008, z], s: [3, 0.01, 0.13] })
    for (let x = -1.5 * P + 6; x < 1.5 * P; x += 30) {
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
  const shiftG = useRef<THREE.Group>(null)
  useFrame(() => {
    const d = sim.current.dist
    const m = (((d + P / 2) % P) + P) % P - P / 2 // сдвиг в (-P/2, P/2]: копии рядов закрывают ±240 м
    if (shiftG.current) shiftG.current.position.x = -m
    // плитка тротуара 2 м, асфальт 4 м, брусчатка 1,6 м: смещение текстуры = путь / размер плитки
    t.tiles.offset.x = (d / 2) % 1
    t.asphalt.offset.x = (d / 4) % 1
    t.setts.offset.x = (d / 1.6) % 1
  })
  return (
    <group>
      {/* однородное вдоль улицы (рельсы, провода, сплошные линии) можно не двигать; покрытия едут текстурой */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={mats.asphalt}><planeGeometry args={[640, 160]} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, TRACK2 / 2]} receiveShadow material={mats.setts}>
        <planeGeometry args={[600, 7.6]} />
      </mesh>
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
      <group ref={shiftG}>
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
/* Объект опасности: светящийся маркер на улице (положение условное)   */
/* ------------------------------------------------------------------ */

const HAZ = '#ff5a1f'
const OK = '#16a36b'

function glowTex() {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
  }, [1, 1])
}

/** Значок типа объекта: белый круг с силуэтом. */
function iconTex(type: string) {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill()
    g.lineWidth = 6; g.strokeStyle = HAZ; g.stroke()
    g.fillStyle = '#c2410c'; g.strokeStyle = '#c2410c'; g.lineCap = 'round'; g.lineJoin = 'round'
    if (type === 'Ped') {
      g.beginPath(); g.arc(68, 30, 10, 0, Math.PI * 2); g.fill()
      g.lineWidth = 11
      g.beginPath(); g.moveTo(64, 46); g.lineTo(58, 76); g.lineTo(44, 102); g.moveTo(58, 76); g.lineTo(74, 100); g.stroke()
      g.lineWidth = 8
      g.beginPath(); g.moveTo(44, 64); g.lineTo(62, 50); g.lineTo(82, 66); g.stroke()
    } else if (type === 'Vehicle') {
      g.beginPath(); g.roundRect(22, 56, 84, 26, 8); g.fill()
      g.beginPath(); g.moveTo(38, 57); g.lineTo(48, 40); g.lineTo(82, 40); g.lineTo(92, 57); g.fill()
      g.fillStyle = '#ffffff'; for (const x of [42, 86]) { g.beginPath(); g.arc(x, 84, 11, 0, Math.PI * 2); g.fill() }
      g.fillStyle = '#c2410c'; for (const x of [42, 86]) { g.beginPath(); g.arc(x, 84, 8, 0, Math.PI * 2); g.fill() }
    } else if (type === 'Tram') {
      g.beginPath(); g.roundRect(24, 44, 80, 44, 8); g.fill()
      g.lineWidth = 5; g.beginPath(); g.moveTo(50, 44); g.lineTo(66, 26); g.lineTo(80, 26); g.moveTo(58, 26); g.lineTo(88, 26); g.stroke()
      g.fillStyle = '#ffffff'; for (const x of [32, 56, 80]) g.fillRect(x, 52, 16, 14)
    } else {
      g.beginPath(); g.moveTo(64, 22); g.lineTo(104, 96); g.lineTo(24, 96); g.closePath(); g.fill()
      g.fillStyle = '#ffffff'; g.fillRect(59, 46, 10, 28); g.beginPath(); g.arc(64, 85, 6, 0, Math.PI * 2); g.fill()
    }
  }, [1, 1])
}

function Hazard({ sim, type, caption, phase }: { sim: SimRef; type: string; caption: { title: string; sub: string } | null; phase: Phase }) {
  const reduced = useMemo(reducedMotion, [])
  const glow = useMemo(glowTex, [])
  const icon = useMemo(() => iconTex(type), [type])
  const mats = useMemo(() => ({
    core: new THREE.MeshStandardMaterial({ color: '#ff8a4c', emissive: new THREE.Color(HAZ), emissiveIntensity: 1.3, roughness: 0.4, transparent: true, toneMapped: false }),
    halo: new THREE.SpriteMaterial({ map: glow, color: HAZ, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    pool: new THREE.MeshBasicMaterial({ map: glow, color: HAZ, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    ring: new THREE.MeshBasicMaterial({ color: HAZ, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    icon: new THREE.SpriteMaterial({ map: icon, transparent: true, depthWrite: false }),
    zone: new THREE.MeshBasicMaterial({ color: '#ff3b2f', transparent: true, opacity: 0, depthWrite: false }),
    line: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }),
    dim: new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0, depthWrite: false }),
  }), [glow, icon])
  const g = useRef<THREE.Group>(null), ring = useRef<THREE.Mesh>(null), light = useRef<THREE.PointLight>(null)
  const zone = useRef<THREE.Mesh>(null), stopG = useRef<THREE.Group>(null), dimBar = useRef<THREE.Mesh>(null)
  const capG = useRef<THREE.Group>(null), capDiv = useRef<HTMLDivElement>(null)
  const st = useRef({ op: 0, zone: 0, stop: 0, cap: 0, x: 0 })
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.25), s = sim.current, k = st.current
    const a = s.objA
    if (a) k.x = FRONT_TIP + (a.at - s.dist)
    const on = !!a && s.live && (s.phase === 'approach' || s.phase === 'stopped')
    // плавно проявляется, а при снятом признаке плавно гаснет; вплотную к носу не рисуется (наезда в данных нет)
    const near = clamp((k.x - FRONT_TIP - 0.5) / 2, 0, 1)
    k.op = Math.min(damp(k.op, on ? 1 : 0, on ? 0.12 : 0.25, dt), near)
    k.zone = damp(k.zone, on && s.danger && s.phase === 'approach' ? 1 : 0, 0.15, dt)
    k.stop = damp(k.stop, s.live && s.phase === 'stopped' ? 1 : 0, 0.2, dt)
    k.cap = damp(k.cap, s.live && s.phase !== 'none' ? 1 : 0, 0.15, dt)
    const pulse = reduced ? 1 : 0.85 + 0.15 * Math.sin(s.t * 2 * Math.PI * 0.9)
    if (g.current) { g.current.position.x = k.x; g.current.visible = k.op > 0.01 }
    mats.core.opacity = k.op
    mats.halo.opacity = 0.9 * k.op * pulse
    mats.pool.opacity = 0.75 * k.op * pulse
    mats.icon.opacity = k.op
    if (ring.current) {
      const r = reduced ? 0.4 : (s.t * 0.7) % 1
      ring.current.scale.setScalar(1 + 1.8 * r)
      mats.ring.opacity = k.op * (1 - r) * 0.7
    }
    if (light.current) { light.current.position.x = k.x; light.current.intensity = 22 * k.op * pulse }
    // красная зона между носом и объектом, пока признак опасности действует
    if (zone.current) {
      const d = Math.max(0.01, k.x - FRONT_TIP)
      zone.current.position.x = FRONT_TIP + d / 2
      zone.current.scale.x = d
      zone.current.visible = k.zone > 0.01
      mats.zone.opacity = 0.3 * k.zone
    }
    // линия остановки (где встал нос) и размер до объекта
    if (stopG.current && a) {
      const xl = FRONT_TIP + (a.at - a.gap - s.dist)
      stopG.current.position.x = xl
      stopG.current.visible = k.stop > 0.01
      mats.line.opacity = 0.95 * k.stop
      mats.dim.opacity = 0.9 * k.stop
      if (dimBar.current) { dimBar.current.scale.x = a.gap; dimBar.current.position.x = a.gap / 2 }
    }
    if (capG.current) capG.current.position.x = s.phase === 'stopped' && a ? k.x - a.gap / 2 : k.x
    if (capDiv.current) {
      const o = k.cap.toFixed(2)
      if (capDiv.current.style.opacity !== o) capDiv.current.style.opacity = o
    }
  })
  const accent = phase === 'stopped' ? OK : phase === 'cleared' ? '#5b7a99' : HAZ
  return (
    <>
      <pointLight ref={light} position={[0, 1.4, 0]} color={HAZ} intensity={0} distance={16} decay={2} />
      <group ref={g} visible={false}>
        <mesh position={[0, 1.05, 0]} material={mats.core}><sphereGeometry args={[0.55, 32, 16]} /></mesh>
        <sprite position={[0, 1.05, 0]} scale={[4.2, 4.2, 1]} material={mats.halo} />
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.pool}><planeGeometry args={[5.5, 5.5]} /></mesh>
        <mesh ref={ring} position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.ring}><ringGeometry args={[0.95, 1.05, 48]} /></mesh>
        <sprite position={[0, 2.55, 0]} scale={[1.1, 1.1, 1]} material={mats.icon} />
      </group>
      <mesh ref={zone} position={[FRONT_TIP, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.zone} visible={false}>
        <planeGeometry args={[1, 2.6]} />
      </mesh>
      <group ref={stopG} visible={false}>
        {/* стоп-линия поперёк пути */}
        <mesh position={[0, 0.045, 0]} material={mats.line}><boxGeometry args={[0.32, 0.02, 3.2]} /></mesh>
        {/* размерная линия от стоп-линии до объекта сбоку от пути */}
        <mesh ref={dimBar} position={[3, 0.05, -1.85]} material={mats.dim}><boxGeometry args={[1, 0.02, 0.08]} /></mesh>
        <mesh position={[0, 0.05, -1.85]} material={mats.dim}><boxGeometry args={[0.08, 0.02, 0.5]} /></mesh>
      </group>
      <group ref={capG} position={[0, 3.4, 0]}>
        {caption && (
          <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div ref={capDiv} style={{
              opacity: 0, background: 'rgba(255,255,255,.95)', borderLeft: `4px solid ${accent}`, borderRadius: 6,
              padding: '5px 10px', font: "12px 'Golos Text', sans-serif", color: '#1c2a36', whiteSpace: 'nowrap',
              boxShadow: '0 4px 14px rgba(10,20,30,.22)', lineHeight: 1.35,
            }}>
              <div style={{ fontWeight: 600 }}>{caption.title}</div>
              <div style={{ color: '#5b6874' }}>{caption.sub}</div>
            </div>
          </Html>
        )}
      </group>
    </>
  )
}

/** Светофор у пути: стоит на улице, плавно появляется и гаснет. */
function TrafficLight({ sim }: { sim: SimRef }) {
  const g = useRef<THREE.Group>(null)
  const k = useRef({ s: 0, x: 0, key: '' })
  const lamps = useMemo(() => (['red', 'amber', 'green'] as const).map((c) =>
    new THREE.MeshBasicMaterial({ color: '#333333', toneMapped: false, userData: { on: c === 'red' ? '#ff3022' : c === 'amber' ? '#ffb020' : '#2fd17a' } })), [])
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.25), s = sim.current, q = k.current
    if (s.tlA) q.x = FRONT_TIP + (s.tlA.at - s.dist) + s.tlShift
    q.s = damp(q.s, s.live && s.tlOn ? 1 : 0, 0.15, dt)
    if (g.current) {
      g.current.position.x = q.x
      g.current.scale.setScalar(Math.max(0.001, q.s))
      g.current.visible = q.s > 0.01
    }
    const state = s.tlReal ? 0 : s.tlReq ? 1 : -1
    const key = String(state)
    if (key !== q.key) {
      q.key = key
      lamps.forEach((m, i) => m.color.set(i === state ? m.userData.on : '#333333'))
    }
  })
  return (
    <group ref={g} position={[0, 0, 2.2]} visible={false}>
      <mesh position={[0, 2, 0]} castShadow><cylinderGeometry args={[0.07, 0.07, 4, 8]} /><meshStandardMaterial color="#2a2f33" /></mesh>
      <mesh position={[0, 4.4, 0]} castShadow><boxGeometry args={[0.35, 1.1, 0.35]} /><meshStandardMaterial color="#1b1f22" /></mesh>
      {lamps.map((m, i) => (
        <mesh key={i} position={[-0.18, 4.75 - i * 0.34, 0]} rotation={[0, -Math.PI / 2, 0]} material={m}>
          <circleGeometry args={[0.11, 16]} />
        </mesh>
      ))}
    </group>
  )
}

/** Остановочная платформа: якорь на пути (точка остановки), вагон встаёт вдоль неё. */
function StopPlatform({ sim, name }: { sim: SimRef; name: string }) {
  const tex = useLabelTexture(name.slice(0, 26), { w: 1024, h: 128, bg: '#1d4f91', fg: '#ffffff', font: '600 56px Golos Text, sans-serif' })
  const g = useRef<THREE.Group>(null)
  const k = useRef({ s: 0, x: 0 })
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.25), s = sim.current, q = k.current
    if (s.stop) q.x = FRONT_TIP + (s.stop.at - s.dist)
    q.s = damp(q.s, s.live && s.stop ? 1 : 0, 0.15, dt)
    if (g.current) {
      g.current.position.x = q.x - 13
      g.current.scale.y = Math.max(0.001, q.s)
      g.current.visible = q.s > 0.01
    }
  })
  return (
    <group ref={g} position={[0, 0, 2.6]} visible={false}>
      <mesh position={[0, 0.14, 0]} receiveShadow castShadow><boxGeometry args={[30, 0.28, 2.2]} /><meshStandardMaterial color="#c8c3b8" roughness={0.9} /></mesh>
      <mesh position={[0, 0.29, -1.0]}><boxGeometry args={[30, 0.02, 0.18]} /><meshStandardMaterial color="#ffd23a" /></mesh>
      <mesh position={[0, 2.65, 0.55]} castShadow><boxGeometry args={[6, 0.1, 1.5]} /><meshStandardMaterial color="#3a4a55" roughness={0.5} /></mesh>
      <mesh position={[0, 1.5, 1.18]}><boxGeometry args={[5.8, 2.2, 0.04]} /><meshStandardMaterial color="#a9c4d4" transparent opacity={0.35} roughness={0.1} /></mesh>
      <mesh position={[0, 3.05, 0.55]}><boxGeometry args={[5.4, 0.5, 0.06]} /><meshStandardMaterial map={tex} /></mesh>
      {[-2.9, 2.9].map((dx) => (
        <mesh key={dx} position={[dx, 1.45, 1.2]}><boxGeometry args={[0.08, 2.4, 0.08]} /><meshStandardMaterial color="#3a4a55" /></mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Проигрывание: курсор читается в кадре, без перерисовки React         */
/* ------------------------------------------------------------------ */

interface Prepared {
  win: Series; dist: number[]; v: number[]; acc: number[]
  obj: Anchor[]; tl: Anchor[]; stops: StopA[]
}

function prepare(win: Series | null, dist: number[]): Prepared | null {
  if (!win || !dist.length) return null
  const n = win.t.length
  const v = win.t.map((_, i) => Math.min(num(win, 'speed', i) ?? 0, 100) / 3.6)
  const acc = v.map((_, i) => {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1)
    const dt = (win.t[b] - win.t[a]) / 1000
    return dt > 0 ? clamp((v[b] - v[a]) / dt, -4, 3) : 0
  })
  const { obj, tl } = computeAnchors(win, dist)
  // остановка: для каждого отрезка с одним stop_name точка = путь + dist_to_stop в записи, где до остановки ближе всего
  const stops: StopA[] = []
  let i = 0
  while (i < n) {
    const name = str(win, 'stop_name', i)
    let j = i, best = -1, bd = Infinity
    while (j < n && str(win, 'stop_name', j) === name) {
      const d = num(win, 'dist_to_stop', j)
      if (d != null && d >= 0 && d < bd) { bd = d; best = j }
      j++
    }
    if (name && best >= 0) stops.push({ at: dist[best] + bd, name })
    i = j
  }
  return { win, dist, v, acc, obj, tl, stops }
}

function objTypeOf(win: Series, a: Anchor) {
  for (let i = a.from; i <= a.to; i++) {
    const s = str(win, 'goal_obj_type', i)
    if (s && ['Ped', 'Vehicle', 'Tram', 'Obstacle'].includes(s)) return s
  }
  return 'Obstacle'
}

const anyFlag = (win: Series, k: string, i: number, r = 1) => {
  for (let q = Math.max(0, i - r); q <= Math.min(win.t.length - 1, i + r); q++) if ((num(win, k, q) ?? 0) > 0.5) return true
  return false
}

function Driver({ sim, mode, data, onDisc }: { sim: SimRef; mode: 'showcase' | 'replay'; data: Prepared | null; onDisc: (d: Disc) => void }) {
  const prev = useRef({ cursor: NaN, emerg: false, hard: false })
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.25), s = sim.current
    s.t += dt
    s.trauma = Math.max(0, s.trauma - dt * 1.8)
    const { cursor, playing } = useStore.getState()
    if (mode !== 'replay' || !data || cursor == null) {
      s.live = false; s.dist = 0; s.v = 0; s.a = damp(s.a, 0, 0.2, dt); s.braking = false; s.rail = false
      s.phase = 'none'; s.tlOn = false; s.stop = null; s.danger = false; s.controller = 'driver'
      onDisc(DISC0)
      return
    }
    const { win, dist, v, acc } = data
    const n = win.t.length
    const i = indexAt(win.t, cursor), j = Math.min(i + 1, n - 1)
    const f = j > i ? clamp((cursor - win.t[i]) / (win.t[j] - win.t[i]), 0, 1) : 0
    s.live = true
    s.dist = dist[i] + (dist[j] - dist[i]) * f
    s.v = v[i] + (v[j] - v[i]) * f
    s.a = damp(s.a, acc[i] + (acc[j] - acc[i]) * f, 0.2, dt)
    const flag = (k: string) => (num(win, k, i) ?? 0) > 0.5
    s.braking = ['brake_mech', 'brake_rail', 'brake_crash', 'brake_emergency'].some(flag)
    s.rail = flag('brake_rail') || flag('brake_crash')
    s.controller = str(win, 'controller', i) ?? 'und'
    s.danger = anyFlag(win, 'danger_real', i)
    s.tlReal = anyFlag(win, 'tl_real', i)
    s.tlReq = anyFlag(win, 'tl_act', i)

    // тряска камеры: только на событии (начало экстренного торможения или замедление сильнее 2 м/с²) и при обычном проигрывании
    const pv = prev.current
    const emerg = flag('brake_emergency') || s.rail
    const hard = s.a < -2
    const cont = playing && Math.abs(cursor - pv.cursor) < 1500
    if (cont && emerg && !pv.emerg) s.trauma = Math.min(1, s.trauma + 0.55)
    if (cont && hard && !pv.hard) s.trauma = Math.min(1, s.trauma + 0.35)
    pv.cursor = cursor; pv.emerg = emerg; pv.hard = hard

    // объект: активный якорь или недавно снятый (для подписи «сигнал снят»)
    let a = activeAnchor(data.obj, i)
    let objIdx = a ? data.obj.indexOf(a) : -1
    if (!a) {
      for (let q = data.obj.length - 1; q >= 0; q--) {
        const c = data.obj[q]
        if (c.to < i && c.outcome === 'passed' && cursor - win.t[Math.min(c.to + 1, n - 1)] < 4000) { a = c; objIdx = q; break }
        if (c.to < i) break
      }
    }
    let phase: Phase = 'none'
    if (a) {
      if (a.outcome === 'stopped' && a.stopIdx != null && i >= a.stopIdx) phase = 'stopped'
      else if (a.outcome === 'passed' && i > a.to) phase = 'cleared'
      else phase = 'approach'
      s.objA = a
    }
    s.phase = phase

    const t = activeAnchor(data.tl, i)
    s.tlOn = !!t
    if (t) {
      s.tlA = t
      s.tlShift = a && Math.abs(t.at - a.at) < 8 ? 6 : 0
    }

    // ближайшая остановка в зоне видимости (за туманом появляется, позади уходит в туман)
    let best: StopA | null = null, bd = Infinity
    for (const st of data.stops) {
      const rel = st.at - s.dist
      if (rel < -170 || rel > 230) continue
      const d = Math.abs(rel + 10)
      if (d < bd) { bd = d; best = st }
    }
    s.stop = best

    onDisc({ route: str(win, 'route', i) ?? '', stopName: best?.name ?? '', objIdx, phase, gap: a?.gap ?? 6 })
  }, -2)
  return null
}

/** Камера: инерция при торможении (цель уходит вперёд на -0,3·a м) и короткая тряска trauma² на событиях. */
function CameraRig({ sim, controls, mode }: { sim: SimRef; controls: RefObject<OrbitControlsImpl | null>; mode: 'showcase' | 'replay' }) {
  const reduced = useMemo(reducedMotion, [])
  const lean = useRef(0)
  const nz = (t: number) => (Math.sin(t) + 0.6 * Math.sin(t * 1.73 + 1.3) + 0.3 * Math.sin(t * 2.9 + 4.1)) / 1.9
  useFrame(({ camera, clock }, dtRaw) => {
    const c = controls.current, s = sim.current
    if (!c || mode !== 'replay' || reduced) return
    const dt = Math.min(dtRaw, 0.25)
    const nl = damp(lean.current, s.live ? clamp(-0.3 * s.a, -0.9, 0.9) : 0, 0.3, dt)
    const d = nl - lean.current
    lean.current = nl
    if (d) { c.target.x += d; camera.position.x += d }
    if (s.trauma > 0.001) {
      const k = s.trauma * s.trauma, t = clock.elapsedTime * 22
      camera.rotateX(0.018 * k * nz(t))
      camera.rotateY(0.012 * k * nz(t + 17))
      camera.rotateZ(0.004 * k * nz(t + 41))
    }
  })
  return null
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
  // курсор сюда не подписан: он читается в кадре (Driver), React перерисовывается только при смене окна, языка или фазы
  const win = useStore((s) => s.win)
  const { t, obj: objName, lang } = useT()
  const dist = useDistance(win)
  const data = useMemo(() => (mode === 'replay' ? prepare(win, dist) : null), [mode, win, dist])
  const [hovered, setHovered] = useState<PartId | null>(null)
  const [ripple, setRipple] = useState<{ at: THREE.Vector3; k: number } | null>(null)
  const [idle, setIdle] = useState(true)
  const sim = useRef<Sim>(newSim())
  const controls = useRef<OrbitControlsImpl | null>(null)
  const [disc, setDisc] = useState<Disc>(DISC0)
  const discKey = useRef(JSON.stringify(DISC0))
  const onDisc = useCallback((d: Disc) => {
    const k = JSON.stringify(d)
    if (k !== discKey.current) { discKey.current = k; setDisc(d) }
  }, [])

  const anchor = data && disc.objIdx >= 0 ? data.obj[disc.objIdx] : null
  const type = data && anchor ? objTypeOf(data.win, anchor) : 'Obstacle'
  const caption = disc.phase === 'none' ? null
    : disc.phase === 'stopped'
      ? { title: lang === 'ru' ? `Остановился до объекта, ~${disc.gap} м (условно)` : `Stopped short of the object, ~${disc.gap} m (schematic)`,
          sub: lang === 'ru' ? `${objName(type)}: признак опасности снят не был` : `${objName(type)}: the hazard flag was still on` }
      : disc.phase === 'cleared'
        ? { title: lang === 'ru' ? 'Сигнал снят, трамвай продолжил движение' : 'Signal cleared, the tram drove on',
            sub: lang === 'ru' ? `${objName(type)}, ${t('schematic')}` : `${objName(type)}, ${t('schematic')}` }
        : { title: lang === 'ru' ? `Впереди ${objName(type)}` : `Ahead: ${objName(type)}`, sub: t('schematic') }

  const pick = (p: PartId, at: THREE.Vector3) => {
    click()
    setRipple({ at, k: Math.random() })
    onPick?.(p)
  }

  return (
    <div className="scene3d" onPointerDown={() => setIdle(false)}>
      <Canvas shadows="percentage" dpr={[1, 1.75]} camera={{ position: mode === 'replay' ? [27, 10, 27] : [24, 8, 28], fov: 34, near: 0.5, far: 900 }}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.0 }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.NeutralToneMapping; gl.toneMappingExposure = 1.0 }}>
        <Driver sim={sim} mode={mode} data={data} onDisc={onDisc} />
        <color attach="background" args={['#dfe6eb']} />
        <fog attach="fog" args={['#d9e1e7', 70, 210]} />
        <SkyDome />
        {/* окружение без внешних HDRI: мягкое небо сверху, светлый горизонт, тёплая земля */}
        <Environment resolution={128} frames={1} environmentIntensity={0.8}>
          <color attach="background" args={['#9aa6ae']} />
          <Lightformer form="rect" intensity={2.2} color="#eef4fa" scale={[60, 60, 1]} position={[0, 30, 0]} rotation={[Math.PI / 2, 0, 0]} />
          <Lightformer form="rect" intensity={1.2} color="#ffffff" scale={[60, 6, 1]} position={[0, 6, -30]} />
          <Lightformer form="rect" intensity={1.2} color="#ffffff" scale={[60, 6, 1]} position={[0, 6, 30]} rotation={[0, Math.PI, 0]} />
          <Lightformer form="rect" intensity={0.6} color="#d9c7a8" scale={[60, 60, 1]} position={[0, -10, 0]} rotation={[-Math.PI / 2, 0, 0]} />
        </Environment>
        <hemisphereLight args={['#eaf3ff', '#6b6458', 0.4]} />
        <directionalLight position={[22, 38, 24]} intensity={2.4} color="#fff6e8" castShadow shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0005} shadow-normalBias={0.03}
          shadow-camera-left={-26} shadow-camera-right={26} shadow-camera-top={22} shadow-camera-bottom={-22} shadow-camera-near={5} shadow-camera-far={120} />
        <Street sim={sim} />
        <Tram sim={sim} route={disc.route || '100.2'} hovered={hovered} onHover={setHovered} onPick={pick} />
        {mode === 'replay' && (
          <>
            <StopPlatform sim={sim} name={place(disc.stopName, lang)} />
            <TrafficLight sim={sim} />
            <Hazard sim={sim} type={type} caption={caption} phase={disc.phase} />
          </>
        )}
        {ripple && <Ripple at={ripple.at} k={ripple.k} />}
        {hovered && (
          <Html position={[FRONT_TIP - 4, 7.6, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div className="tip3d">{PARTS[hovered][lang]}</div>
          </Html>
        )}
        <OrbitControls ref={controls} target={[mode === 'replay' ? 6 : 0, 2.0, 0]} enableDamping dampingFactor={0.08}
          autoRotate={mode === 'showcase' && idle && !hovered} autoRotateSpeed={0.6}
          minDistance={12} maxDistance={58} maxPolarAngle={Math.PI / 2.06} />
        <CameraRig sim={sim} controls={controls} mode={mode} />
      </Canvas>
    </div>
  )
}
