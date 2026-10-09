import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { indexAt, num, str, type Series } from '../api'
import { useStore } from '../store'
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

function Part({ id, children, hovered, onHover, onPick }: {
  id: PartId; children: ReactNode; hovered: PartId | null
  onHover: (p: PartId | null) => void; onPick: (p: PartId, at: THREE.Vector3) => void
}) {
  const g = useRef<THREE.Group>(null)
  const pulse = useRef(0)
  const on = hovered === id
  useEffect(() => {
    g.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (!m || !('emissive' in m)) return
      if (m.userData.base === undefined) m.userData.base = { c: m.emissive.clone(), i: m.emissiveIntensity }
      if (on) { m.emissive.copy(ACCENT); m.emissiveIntensity = 0.55 }
      else { m.emissive.copy(m.userData.base.c); m.emissiveIntensity = m.userData.base.i }
    })
  }, [on])
  useFrame((_, dt) => {
    if (!g.current) return
    pulse.current = Math.max(0, pulse.current - dt * 3.2)
    const s = 1 + Math.sin(pulse.current * Math.PI) * 0.18
    g.current.scale.setScalar(s)
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
/* Текстуры из canvas: табло маршрута, вывески                         */
/* ------------------------------------------------------------------ */

function useLabelTexture(text: string, opts: { w?: number; h?: number; bg?: string; fg?: string; font?: string } = {}) {
  return useMemo(() => {
    const { w = 512, h = 128, bg = '#111', fg = '#ffb020', font = '600 78px Golos Text, sans-serif' } = opts
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')!
    g.fillStyle = bg; g.fillRect(0, 0, w, h)
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(text, w / 2, h / 2 + 4)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps
}

/* ------------------------------------------------------------------ */
/* Трамвай                                                            */
/* ------------------------------------------------------------------ */

const RED = '#c4262e', WHITE = '#f3f1ec', GLASS = '#1d2a33', ROOF = '#cfd4d6', DARK = '#2a2f33'
const SECTIONS = [ // центр по x, длина
  { x: 9.35, len: 9.2, front: true },
  { x: 0, len: 8.6 },
  { x: -9.35, len: 9.2, rear: true },
]
const GAUGE = 0.762 // половина колеи 1524 мм

interface TramState {
  braking: boolean; rail: boolean; wheelSpin: number; route: string; controller: string
}

function Bogie({ x, spin, rail }: { x: number; spin: number; rail: boolean }) {
  const wheels = useRef<THREE.Group>(null)
  useFrame(() => { wheels.current?.children.forEach((w) => { w.rotation.z = -spin }) })
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[2.6, 0.32, 2.0]} />
        <meshStandardMaterial color={DARK} roughness={0.8} />
      </mesh>
      <group ref={wheels}>
        {[-0.95, 0.95].flatMap((dx) => [-GAUGE, GAUGE].map((z) => (
          <group key={`${dx}${z}`} position={[dx, 0.33, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.33, 0.33, 0.12, 20]} />
              <meshStandardMaterial color="#3b4045" metalness={0.6} roughness={0.4} />
            </mesh>
            <mesh position={[0.2, 0, z > 0 ? 0.065 : -0.065]}>
              <boxGeometry args={[0.12, 0.08, 0.01]} />
              <meshStandardMaterial color="#9aa3a8" />
            </mesh>
          </group>
        )))}
      </group>
      {[-GAUGE, GAUGE].map((z) => (
        <mesh key={z} position={[0, 0.12, z]}>
          <boxGeometry args={[1.15, 0.12, 0.16]} />
          <meshStandardMaterial color="#4a4f55" emissive={rail ? '#b44dff' : '#000000'} emissiveIntensity={rail ? 1.6 : 0} />
        </mesh>
      ))}
    </group>
  )
}

function Section({ x, len, front, rear, st }: { x: number; len: number; front?: boolean; rear?: boolean; st: TramState }) {
  const doors = front || rear ? [-len / 2 + 2.6, len / 2 - 3.2] : [-1.6, 1.6]
  return (
    <group position={[x, 0, 0]}>
      {/* низ кузова: красный */}
      <RoundedBox args={[len, 1.05, 2.5]} radius={0.12} position={[0, 0.98, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={RED} roughness={0.45} metalness={0.15} />
      </RoundedBox>
      {/* оконная лента */}
      <RoundedBox args={[len - 0.05, 1.25, 2.46]} radius={0.08} position={[0, 2.1, 0]} castShadow>
        <meshStandardMaterial color={GLASS} roughness={0.15} metalness={0.5} />
      </RoundedBox>
      {/* верхний пояс и крыша */}
      <RoundedBox args={[len, 0.55, 2.5]} radius={0.14} position={[0, 2.98, 0]} castShadow>
        <meshStandardMaterial color={WHITE} roughness={0.5} />
      </RoundedBox>
      <mesh position={[0, 3.3, 0]} castShadow>
        <boxGeometry args={[len - 0.6, 0.1, 2.1]} />
        <meshStandardMaterial color={ROOF} roughness={0.7} />
      </mesh>
      {/* стойки между окнами */}
      {Array.from({ length: Math.floor(len / 1.45) }, (_, i) => -len / 2 + 0.9 + i * 1.45).map((px) => (
        [-1.235, 1.235].map((z) => (
          <mesh key={`${px}${z}`} position={[px, 2.1, z]}>
            <boxGeometry args={[0.09, 1.25, 0.02]} />
            <meshStandardMaterial color={WHITE} />
          </mesh>
        ))
      ))}
      {/* двери с двух сторон */}
      {doors.map((dx) => [-1.256, 1.256].map((z) => (
        <group key={`${dx}${z}`} position={[dx, 1.45, z]}>
          <mesh>
            <boxGeometry args={[1.3, 2.1, 0.02]} />
            <meshStandardMaterial color="#9ea7ab" metalness={0.3} roughness={0.4} />
          </mesh>
          {[-0.33, 0.33].map((ox) => (
            <mesh key={ox} position={[ox, 0.25, z > 0 ? 0.012 : -0.012]}>
              <boxGeometry args={[0.5, 1.2, 0.01]} />
              <meshStandardMaterial color={GLASS} metalness={0.4} roughness={0.2} />
            </mesh>
          ))}
        </group>
      )))}
      {/* оборудование на крыше */}
      <mesh position={[front ? -1.5 : rear ? 1.5 : 2.6, 3.55, 0]} castShadow>
        <boxGeometry args={[2.6, 0.42, 1.5]} />
        <meshStandardMaterial color="#aeb5b8" roughness={0.6} />
      </mesh>
      {(front || rear) && <Bogie x={front ? 2.2 : -2.2} spin={st.wheelSpin} rail={st.rail} />}
      {!front && !rear && <Bogie x={0} spin={st.wheelSpin} rail={st.rail} />}
    </group>
  )
}

function Bellows({ x }: { x: number }) {
  return (
    <mesh position={[x, 1.85, 0]} castShadow>
      <boxGeometry args={[0.55, 2.9, 2.3]} />
      <meshStandardMaterial color="#2b2b2b" roughness={0.95} />
    </mesh>
  )
}

function Pantograph({ hovered, onHover, onPick }: PartHandlers) {
  // полупантограф: нижнее плечо, верхнее плечо, полоз у провода (y = 6.0)
  const arm = (a: [number, number], b: [number, number], w = 0.07) => {
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    return (
      <mesh position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0]} rotation={[0, 0, Math.atan2(dy, dx)]} castShadow>
        <boxGeometry args={[len, w, w]} />
        <meshStandardMaterial color="#5b6369" metalness={0.6} roughness={0.35} />
      </mesh>
    )
  }
  return (
    <Part id="pantograph" hovered={hovered} onHover={onHover} onPick={onPick}>
      <group position={[0, 0, 0]}>
        <mesh position={[0, 3.45, 0]}>
          <boxGeometry args={[1.6, 0.2, 1.2]} />
          <meshStandardMaterial color="#6f777c" />
        </mesh>
        {[-0.35, 0.35].map((z) => (
          <group key={z} position={[0, 0, z]}>
            {arm([-0.7, 3.55], [0.75, 4.85])}
            {arm([0.75, 4.85], [-0.2, 5.92], 0.05)}
          </group>
        ))}
        <mesh position={[-0.2, 5.95, 0]} castShadow>
          <boxGeometry args={[0.12, 0.06, 1.7]} />
          <meshStandardMaterial color="#30363a" metalness={0.5} />
        </mesh>
      </group>
    </Part>
  )
}

interface PartHandlers { hovered: PartId | null; onHover: (p: PartId | null) => void; onPick: (p: PartId, at: THREE.Vector3) => void }

function Tram({ st, ...h }: { st: TramState } & PartHandlers) {
  const sign = useLabelTexture(st.route ? st.route.split('.')[0] : 'ГЭТ')
  const front = SECTIONS[0].x + SECTIONS[0].len / 2
  const rearX = SECTIONS[2].x - SECTIONS[2].len / 2
  const ctrlColor = st.controller === 'auto' ? '#4aa3ff' : st.controller === 'driver' ? '#ffffff' : '#7c8890'
  return (
    <group>
      <Part id="cab" {...h}>
        <Section {...SECTIONS[0]} st={st} />
        {/* лобовое стекло и маска кабины */}
        <mesh position={[front + 0.02, 2.05, 0]} rotation={[0, 0, -0.12]}>
          <boxGeometry args={[0.08, 1.5, 2.3]} />
          <meshStandardMaterial color={GLASS} metalness={0.6} roughness={0.08} />
        </mesh>
        <mesh position={[front + 0.05, 2.95, 0]}>
          <boxGeometry args={[0.06, 0.32, 1.5]} />
          <meshStandardMaterial map={sign} emissiveMap={sign} emissive="#ffffff" emissiveIntensity={0.9} />
        </mesh>
        <mesh position={[front + 0.04, 3.2, 0.95]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshStandardMaterial color={ctrlColor} emissive={ctrlColor} emissiveIntensity={1.5} />
        </mesh>
        {[-0.85, 0.85].map((z) => (
          <mesh key={z} position={[front + 0.03, 0.85, z]} rotation={[0, Math.PI / 2, 0]}>
            <circleGeometry args={[0.13, 20]} />
            <meshStandardMaterial color="#fff8e0" emissive="#fff3c4" emissiveIntensity={1.4} />
          </mesh>
        ))}
      </Part>
      <Section {...SECTIONS[1]} st={st} />
      <Part id="brakes" {...h}>
        <Section {...SECTIONS[2]} st={st} />
        {[-0.85, 0.85].map((z) => (
          <mesh key={z} position={[rearX - 0.03, 0.9, z]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[0.32, 0.18]} />
            <meshStandardMaterial color="#5a1010" emissive="#ff2a1a" emissiveIntensity={st.braking ? 2.4 : 0.15} />
          </mesh>
        ))}
      </Part>
      <Bellows x={(SECTIONS[0].x - SECTIONS[0].len / 2 + SECTIONS[1].x + SECTIONS[1].len / 2) / 2} />
      <Bellows x={(SECTIONS[1].x - SECTIONS[1].len / 2 + SECTIONS[2].x + SECTIONS[2].len / 2) / 2} />
      <Pantograph {...h} />

      {/* модули АБПВ */}
      <Part id="cameras" {...h}>
        {[-0.35, 0.35].map((z) => (
          <group key={z} position={[front - 0.25, 2.62, z]}>
            <mesh><boxGeometry args={[0.22, 0.16, 0.26]} /><meshStandardMaterial color="#111" /></mesh>
            <mesh position={[0.12, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.055, 0.055, 0.05, 16]} />
              <meshStandardMaterial color="#2a6fd6" emissive="#2a6fd6" emissiveIntensity={0.6} />
            </mesh>
          </group>
        ))}
      </Part>
      <Part id="radar" {...h}>
        <mesh position={[front + 0.08, 0.62, 0]}>
          <boxGeometry args={[0.1, 0.22, 0.42]} />
          <meshStandardMaterial color="#1f2326" />
        </mesh>
      </Part>
      <Part id="nav" {...h}>
        <mesh position={[front - 2.2, 3.42, 0]}>
          <cylinderGeometry args={[0.16, 0.2, 0.12, 20]} />
          <meshStandardMaterial color="#e9ecee" />
        </mesh>
      </Part>
      <Part id="bvt" {...h}>
        <mesh position={[front - 1.3, 1.75, -0.7]}>
          <boxGeometry args={[0.45, 0.32, 0.4]} />
          <meshStandardMaterial color="#26313a" emissive="#00d18f" emissiveIntensity={0.25} />
        </mesh>
      </Part>
      <Part id="rail_brake" {...h}>
        {[SECTIONS[0].x + 2.2, 0, SECTIONS[2].x - 2.2].map((bx) => [-GAUGE, GAUGE].map((z) => (
          <mesh key={`${bx}${z}`} position={[bx, 0.12, z]}>
            <boxGeometry args={[1.2, 0.14, 0.2]} />
            <meshStandardMaterial transparent opacity={0.01} color="#000" />
          </mesh>
        )))}
      </Part>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Улица: колея в мостовой, контактная сеть, застройка                 */
/* ------------------------------------------------------------------ */

const FACADES = ['#e9c874', '#dca7a2', '#a9c7a6', '#e8ddc9', '#c9d6e3', '#e3b07c']

function Street({ offset }: { offset: number }) {
  const L = 240
  const wrap = (x: number) => ((((x - offset) % L) + L) % L) - L / 2
  const poles = useMemo(() => Array.from({ length: 8 }, (_, i) => i * 30), [])
  const houses = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    x: i * 17, w: 14 + (i % 3) * 2, h: 13 + ((i * 7) % 4) * 2.2, c: FACADES[i % FACADES.length], side: i % 2 ? 1 : -1,
  })), [])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[L, 90]} />
        <meshStandardMaterial color="#5b6165" roughness={0.95} />
      </mesh>
      {/* полоса трамвайного пути */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[L, 3.2]} />
        <meshStandardMaterial color="#7d8079" roughness={1} />
      </mesh>
      {/* рельсы */}
      {[-GAUGE, GAUGE].map((z) => (
        <mesh key={z} position={[0, 0.04, z]} receiveShadow>
          <boxGeometry args={[L, 0.06, 0.08]} />
          <meshStandardMaterial color="#b8c0c4" metalness={0.8} roughness={0.25} />
        </mesh>
      ))}
      {/* тротуары */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0.08, s * 9]} receiveShadow>
          <boxGeometry args={[L, 0.16, 5]} />
          <meshStandardMaterial color="#b9b4aa" roughness={0.9} />
        </mesh>
      ))}
      {/* разметка проезжей части */}
      {Array.from({ length: 24 }, (_, i) => i * 10).map((x) => [-1, 1].map((s) => (
        <mesh key={`${x}${s}`} position={[wrap(x), 0.02, s * 3.6]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[3, 0.15]} />
          <meshStandardMaterial color="#e8e8e2" />
        </mesh>
      )))}
      {/* контактная сеть: провод, несущий трос, опоры с консолями */}
      <mesh position={[0, 6.0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, L, 6]} />
        <meshStandardMaterial color="#3a3f42" metalness={0.7} />
      </mesh>
      <mesh position={[0, 6.7, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.014, 0.014, L, 6]} />
        <meshStandardMaterial color="#4a5054" />
      </mesh>
      {poles.map((x) => (
        <group key={x} position={[wrap(x), 0, -6.6]}>
          <mesh position={[0, 4, 0]} castShadow>
            <cylinderGeometry args={[0.13, 0.17, 8, 10]} />
            <meshStandardMaterial color="#6f787d" metalness={0.4} />
          </mesh>
          <mesh position={[0, 6.8, 3.3]}>
            <boxGeometry args={[0.08, 0.08, 6.6]} />
            <meshStandardMaterial color="#6f787d" />
          </mesh>
          <mesh position={[0, 6.35, 6.6]}>
            <boxGeometry args={[0.04, 0.7, 0.04]} />
            <meshStandardMaterial color="#6f787d" />
          </mesh>
        </group>
      ))}
      {/* петербургская застройка */}
      {houses.map((hh, i) => (
        <group key={i} position={[wrap(hh.x), 0, hh.side * 32]}>
          <mesh position={[0, hh.h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[hh.w, hh.h, 6]} />
            <meshStandardMaterial color={hh.c} roughness={0.9} />
          </mesh>
          {Array.from({ length: Math.floor(hh.h / 3.4) }, (_, r) => (
            <mesh key={r} position={[0, 2.6 + r * 3.4, -hh.side * 3.01]} rotation={[0, hh.side > 0 ? Math.PI : 0, 0]}>
              <planeGeometry args={[hh.w - 2, 1.4]} />
              <meshStandardMaterial color="#3d4a54" roughness={0.3} />
            </mesh>
          ))}
          <mesh position={[0, hh.h + 0.25, 0]}>
            <boxGeometry args={[hh.w + 0.4, 0.5, 6.4]} />
            <meshStandardMaterial color="#8a8f91" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Объекты эпизода (положение условное)                                */
/* ------------------------------------------------------------------ */

function Pedestrian({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0.3]}>
      <mesh position={[0, 0.95, 0]} castShadow><capsuleGeometry args={[0.22, 0.9, 6, 12]} /><meshStandardMaterial color="#d1352b" /></mesh>
      <mesh position={[0, 1.75, 0]} castShadow><sphereGeometry args={[0.17, 16, 16]} /><meshStandardMaterial color="#f0c8a8" /></mesh>
    </group>
  )
}
function Car({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0.6]}>
      <RoundedBox args={[4.3, 0.75, 1.8]} radius={0.15} position={[0, 0.65, 0]} castShadow><meshStandardMaterial color="#2f6fd6" /></RoundedBox>
      <RoundedBox args={[2.3, 0.6, 1.6]} radius={0.15} position={[-0.2, 1.25, 0]} castShadow><meshStandardMaterial color={GLASS} /></RoundedBox>
    </group>
  )
}
function OtherTram({ x }: { x: number }) {
  return (
    <group position={[x + 13, 0, 0]}>
      <RoundedBox args={[26, 2.7, 2.5]} radius={0.2} position={[0, 1.8, 0]} castShadow><meshStandardMaterial color="#6d2c91" /></RoundedBox>
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
            <meshStandardMaterial color={on ? col : '#333'} emissive={on ? col : '#000'} emissiveIntensity={on ? 3 : 0} />
          </mesh>
        )
      })}
    </group>
  )
}
function StopPlatform({ x, name }: { x: number; name: string }) {
  const tex = useLabelTexture(name.slice(0, 26), { w: 1024, h: 128, bg: '#1d4f91', fg: '#ffffff', font: '600 56px Golos Text, sans-serif' })
  return (
    <group position={[x + 15, 0, -2.6]}>
      <mesh position={[0, 0.14, 0]} receiveShadow><boxGeometry args={[30, 0.28, 2.2]} /><meshStandardMaterial color="#c8c3b8" /></mesh>
      <mesh position={[0, 1.6, -0.7]} castShadow><boxGeometry args={[6, 0.08, 1.4]} /><meshStandardMaterial color="#3a4a55" /></mesh>
      <mesh position={[0, 2.25, -0.7]}><boxGeometry args={[5.4, 0.5, 0.06]} /><meshStandardMaterial map={tex} /></mesh>
      {[-2.8, 2.8].map((dx) => (
        <mesh key={dx} position={[dx, 0.9, -1.3]}><boxGeometry args={[0.08, 1.5, 0.08]} /><meshStandardMaterial color="#3a4a55" /></mesh>
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
  const front = SECTIONS[0].x + SECTIONS[0].len / 2

  const st: TramState = {
    braking: fr?.braking ?? false, rail: fr?.rail ?? false,
    wheelSpin: ((fr?.dist ?? 0) / 0.33) % (Math.PI * 2), route: fr?.route ?? '100.2', controller: fr?.controller ?? 'driver',
  }
  const dCond = fr ? Math.min(70, Math.max(12, (fr.speed / 3.6) ** 2 / 2 + 8)) : 0
  const showObj = fr && (['Ped', 'Vehicle', 'Tram', 'Obstacle'].includes(fr.obj) || fr.danger || fr.dangerReq)
  const showTl = fr && (fr.obj === 'TrafficLightSignal' || fr.tlReq || fr.tlReal)

  const pick = (p: PartId, at: THREE.Vector3) => {
    click()
    setRipple({ at, k: Math.random() })
    onPick?.(p)
  }

  return (
    <div className="scene3d" onPointerDown={() => setIdle(false)}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [24, 9, 22], fov: 34, near: 0.5, far: 500 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
        <color attach="background" args={['#cfdde6']} />
        <fog attach="fog" args={['#cfdde6', 70, 170]} />
        <hemisphereLight args={['#eaf3ff', '#6b6458', 0.85]} />
        <directionalLight position={[25, 40, 18]} intensity={1.9} castShadow shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={30} shadow-camera-bottom={-30} />
        <Street offset={fr?.dist ?? 0} />
        <Tram st={st} hovered={hovered} onHover={setHovered} onPick={pick} />
        {fr && fr.stopDist != null && fr.stopName && fr.stopDist < 120 && <StopPlatform x={front + fr.stopDist} name={place(fr.stopName, lang)} />}
        {showObj && fr && (fr.obj === 'Vehicle' ? <Car x={front + dCond} /> : fr.obj === 'Tram' ? <OtherTram x={front + dCond} /> : <Pedestrian x={front + dCond} />)}
        {showTl && fr && <TrafficLight x={front + dCond + (showObj ? 12 : 0)} state={fr.tlReal ? 'red' : fr.tlReq ? 'amber' : 'off'} />}
        {fr?.danger && (
          <mesh position={[front + dCond / 2, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[dCond, 2.6]} />
            <meshBasicMaterial color="#ff3b2f" transparent opacity={0.35} />
          </mesh>
        )}
        {ripple && <Ripple at={ripple.at} k={ripple.k} />}
        {hovered && (
          <Html position={[front - 4, 7.6, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="tip3d">{PARTS[hovered][lang]}</div>
          </Html>
        )}
        {showObj && fr && (
          <Html position={[front + dCond, 3.2, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="tag3d danger">{objName(fr.obj === 'Unknown' ? 'Unknown' : fr.obj)}, {t('schematic')}</div>
          </Html>
        )}
        <OrbitControls target={[mode === 'replay' ? 6 : 0, 2.2, 0]} enableDamping dampingFactor={0.08}
          autoRotate={mode === 'showcase' && idle && !hovered} autoRotateSpeed={0.7}
          minDistance={12} maxDistance={42} maxPolarAngle={Math.PI / 2.08} />
      </Canvas>
    </div>
  )
}
