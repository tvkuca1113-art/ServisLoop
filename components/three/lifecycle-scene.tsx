'use client'

import * as React from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, RoundedBox } from '@react-three/drei'
import { LIFECYCLE_STEPS } from '@/lib/site'
import { createLabelTexture, disposeLabelCache } from './label-texture'
import { maxPixelRatioFor, type DeviceTier } from '@/lib/webgl'

/* =============================================================================
   Vizualizacija ServisLoop petlje
   -----------------------------------------------------------------------------
   Cijelu animaciju vodi JEDNA svjetlosna tačka koja kruži petljom. Njena
   pozicija određuje sve ostalo: koji je čvor aktivan, koliko je popunjen tajmer
   servisa i kada kreće puls završenog servisa.

   Zbog toga u `useFrame` nema nijednog `setState` — sve se računa iz proteklog
   vremena i upisuje direktno u `ref`-ove. React se budi samo kad se promijeni
   faza (7 puta u 12 sekundi), radi teksta ispod scene.
   ========================================================================== */

const CYCLE_SECONDS = 12
const LOOP_RADIUS = 2.8
const NODE_COUNT = 4
const LOOP_TILT = -0.3

const ACCENT = {
  brand: '#18C7B5',
  electric: '#5E8BFF',
  service: '#FFB25B',
  success: '#35C982',
} as const

const NODE_ACCENTS = [ACCENT.brand, ACCENT.service, ACCENT.electric, ACCENT.success] as const

const MATERIAL_COLOR = {
  shell: '#132B45',
  fanRing: '#1E3A57',
  blade: '#A8BDD4',
  hub: '#0E9C8E',
  fin: '#5D7A99',
  foot: '#0D1F33',
  tile: '#0E2135',
  pathDot: '#2E5175',
  ground: '#050D18',
} as const

// ---------------------------------------------------------------------------
// Matematika petlje
// ---------------------------------------------------------------------------

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function nodeAngle(index: number): number {
  return (index / NODE_COUNT) * Math.PI * 2 - Math.PI / 2
}

/**
 * Ugao svjetlosne tačke u trenutku `t` (0–1 kroz ciklus).
 * Tačka se zadrži na svakom čvoru pa krene dalje — pokret je time čitljiv,
 * a ne ravnomjerno kruženje koje ništa ne naglašava.
 */
function loopAngle(t: number): number {
  const segment = t * NODE_COUNT
  const index = Math.floor(segment)
  const local = segment - index
  const dwell = 0.34
  const progress = local < dwell ? 0 : easeInOutCubic((local - dwell) / (1 - dwell))
  return ((index + progress) / NODE_COUNT) * Math.PI * 2 - Math.PI / 2
}

/** Najkraća ugaona razlika, u rasponu [0, π]. */
function angularDistance(a: number, b: number): number {
  let diff = (a - b) % (Math.PI * 2)
  if (diff > Math.PI) diff -= Math.PI * 2
  if (diff < -Math.PI) diff += Math.PI * 2
  return Math.abs(diff)
}

/** Koliko je čvor „vruć“: 1 kad je tačka na njemu, 0 kad je daleko. */
function nodeActivation(glowAngle: number, index: number): number {
  return Math.max(0, 1 - angularDistance(glowAngle, nodeAngle(index)) / 0.6)
}

const PHASE_BOUNDS = [0, 0.1, 0.26, 0.38, 0.52, 0.64, 0.82, 1] as const

export const SEQUENCE_PHASES = [
  { id: 'installed', caption: 'Uređaj je zaveden i dobio je QR kod.' },
  { id: 'due', caption: 'Pokrenuto je odbrojavanje do sljedećeg servisa.' },
  { id: 'reminder', caption: 'Podsjetnik putuje prema kupcu.' },
  { id: 'booked', caption: 'Kupac je potvrdio termin bez otvaranja naloga.' },
  { id: 'workorder', caption: 'Kreiran je radni nalog za tehničara.' },
  { id: 'completed', caption: 'Servis je završen i izvještaj je poslan.' },
  { id: 'next', caption: 'Upisan je novi rok — petlja počinje ponovo.' },
] as const

export type PhaseId = (typeof SEQUENCE_PHASES)[number]['id']

function phaseIndexFor(t: number): number {
  for (let i = 0; i < PHASE_BOUNDS.length - 1; i++) {
    if (t >= (PHASE_BOUNDS[i] ?? 0) && t < (PHASE_BOUNDS[i + 1] ?? 1)) {
      return Math.min(i, SEQUENCE_PHASES.length - 1)
    }
  }
  return SEQUENCE_PHASES.length - 1
}

/** Popunjenost tajmera servisa: raste kroz ciklus, nuluje se kad nastupi novi rok. */
function timerProgress(t: number): number {
  if (t < 0.06) return 0
  if (t < 0.52) return easeInOutCubic((t - 0.06) / 0.46)
  if (t < 0.86) return 1
  return 1 - easeInOutCubic((t - 0.86) / 0.14)
}

// ---------------------------------------------------------------------------
// Centralni uređaj — apstraktna vanjska jedinica
// ---------------------------------------------------------------------------

function ServiceDevice({ animate, highDetail }: { animate: boolean; highDetail: boolean }) {
  const fanRef = React.useRef<THREE.Group>(null)
  const bodyRef = React.useRef<THREE.Group>(null)
  const shellRef = React.useRef<THREE.MeshStandardMaterial>(null)

  useFrame((state, delta) => {
    if (!animate) return
    const t = (state.clock.elapsedTime % CYCLE_SECONDS) / CYCLE_SECONDS

    if (fanRef.current) {
      const boost = t > 0.52 && t < 0.82 ? 3.4 : 1
      fanRef.current.rotation.z -= delta * 1.15 * boost
    }

    if (bodyRef.current) {
      bodyRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.55) * 0.04
      bodyRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.22) * 0.14
    }

    if (shellRef.current) {
      const pulse = t > 0.64 && t < 0.86 ? Math.sin(((t - 0.64) / 0.22) * Math.PI) : 0
      shellRef.current.emissiveIntensity = 0.14 + pulse * 0.55
    }
  })

  const fins = highDetail ? [0.36, 0.2, 0.04, -0.12, -0.28] : [0.28, 0, -0.28]
  const smoothness = highDetail ? 4 : 2

  return (
    <group ref={bodyRef}>
      <RoundedBox args={[1.95, 1.4, 0.98]} radius={0.12} smoothness={smoothness}>
        <meshStandardMaterial
          ref={shellRef}
          color={MATERIAL_COLOR.shell}
          metalness={0.7}
          roughness={0.35}
          emissive={ACCENT.brand}
          emissiveIntensity={0.14}
        />
      </RoundedBox>

      <mesh position={[0, 0, 0.5]}>
        <torusGeometry args={[0.47, 0.036, 10, highDetail ? 48 : 24]} />
        <meshStandardMaterial
          color={MATERIAL_COLOR.fanRing}
          metalness={0.85}
          roughness={0.24}
          emissive={ACCENT.electric}
          emissiveIntensity={0.4}
        />
      </mesh>

      <group ref={fanRef} position={[0, 0, 0.52]}>
        {[0, 1, 2].map((index) => (
          <mesh key={index} rotation={[0, 0, (index * Math.PI * 2) / 3]}>
            <boxGeometry args={[0.8, 0.09, 0.022]} />
            <meshStandardMaterial
              color={MATERIAL_COLOR.blade}
              metalness={0.55}
              roughness={0.42}
              emissive={ACCENT.brand}
              emissiveIntensity={0.2}
            />
          </mesh>
        ))}
        <mesh>
          <sphereGeometry args={[0.11, 12, 10]} />
          <meshStandardMaterial color={MATERIAL_COLOR.hub} metalness={0.5} roughness={0.3} />
        </mesh>
      </group>

      {fins.map((y) => (
        <mesh key={y} position={[-1.0, y, 0]}>
          <boxGeometry args={[0.035, 0.055, 0.8]} />
          <meshStandardMaterial color={MATERIAL_COLOR.fin} metalness={0.6} roughness={0.5} />
        </mesh>
      ))}

      {[-0.62, 0.62].map((x) => (
        <mesh key={x} position={[x, -0.8, 0]}>
          <boxGeometry args={[0.26, 0.16, 0.7]} />
          <meshStandardMaterial color={MATERIAL_COLOR.foot} metalness={0.4} roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Tajmer servisa — prsten tačaka oko uređaja
// ---------------------------------------------------------------------------

const TIMER_DOTS = 44
const TIMER_RADIUS = 1.55

function ServiceTimerRing({ animate }: { animate: boolean }) {
  const meshRef = React.useRef<THREE.InstancedMesh>(null)
  const dummy = React.useMemo(() => new THREE.Object3D(), [])
  const litColor = React.useMemo(() => new THREE.Color(ACCENT.brand), [])
  const dimColor = React.useMemo(() => new THREE.Color(MATERIAL_COLOR.pathDot), [])
  const scratch = React.useMemo(() => new THREE.Color(), [])

  const applyProgress = React.useCallback(
    (progress: number) => {
      const mesh = meshRef.current
      if (!mesh) return

      for (let i = 0; i < TIMER_DOTS; i++) {
        const angle = (i / TIMER_DOTS) * Math.PI * 2 - Math.PI / 2
        const lit = i / TIMER_DOTS <= progress
        const scale = lit ? 1.35 : 0.75

        dummy.position.set(Math.cos(angle) * TIMER_RADIUS, 0, Math.sin(angle) * TIMER_RADIUS)
        dummy.scale.setScalar(scale)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        mesh.setColorAt(i, scratch.copy(lit ? litColor : dimColor))
      }

      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    },
    [dummy, litColor, dimColor, scratch],
  )

  // Prvi crtež — potreban i kad je animacija isključena.
  React.useLayoutEffect(() => {
    applyProgress(animate ? 0 : 0.65)
  }, [applyProgress, animate])

  useFrame((state) => {
    if (!animate) return
    const t = (state.clock.elapsedTime % CYCLE_SECONDS) / CYCLE_SECONDS
    applyProgress(timerProgress(t))
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, TIMER_DOTS]}
      frustumCulled={false}
    >
      <sphereGeometry args={[0.035, 8, 6]} />
      <meshBasicMaterial toneMapped={false} transparent opacity={0.95} />
    </instancedMesh>
  )
}

// ---------------------------------------------------------------------------
// Putanja petlje — isprekidani prsten kroz sva četiri čvora
// ---------------------------------------------------------------------------

const PATH_DOTS = 84

function LoopPath() {
  const meshRef = React.useRef<THREE.InstancedMesh>(null)
  const dummy = React.useMemo(() => new THREE.Object3D(), [])

  React.useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    for (let i = 0; i < PATH_DOTS; i++) {
      const angle = (i / PATH_DOTS) * Math.PI * 2
      dummy.position.set(Math.cos(angle) * LOOP_RADIUS, 0, Math.sin(angle) * LOOP_RADIUS)
      // Svaka treća tačka je krupnija — daje ritam isprekidane linije.
      dummy.scale.setScalar(i % 3 === 0 ? 1 : 0.55)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [dummy])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PATH_DOTS]} frustumCulled={false}>
      <sphereGeometry args={[0.028, 6, 5]} />
      <meshBasicMaterial color={MATERIAL_COLOR.pathDot} toneMapped={false} transparent opacity={0.75} />
    </instancedMesh>
  )
}

// ---------------------------------------------------------------------------
// Ikone čvorova — sve od proceduralne geometrije, bez vanjskih datoteka
// ---------------------------------------------------------------------------

/** Raspored modula QR koda (5×5). Nije stvarni QR — samo prepoznatljiv simbol. */
const QR_PATTERN = [
  [1, 1, 1, 0, 1],
  [1, 0, 1, 0, 0],
  [1, 1, 1, 0, 1],
  [0, 0, 0, 1, 1],
  [1, 0, 1, 1, 0],
] as const

function QrIcon({ color }: { color: string }) {
  const cells: React.ReactElement[] = []
  const step = 0.062
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (!QR_PATTERN[row]?.[col]) continue
      cells.push(
        <mesh key={`${row}-${col}`} position={[(col - 2) * step, (2 - row) * step, 0.03]}>
          <boxGeometry args={[step * 0.82, step * 0.82, 0.018]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>,
      )
    }
  }
  return <group>{cells}</group>
}

function CalendarIcon({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, -0.01, 0.03]}>
        <boxGeometry args={[0.3, 0.27, 0.018]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.28} />
      </mesh>
      <mesh position={[0, 0.1, 0.036]}>
        <boxGeometry args={[0.3, 0.06, 0.018]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {[-0.08, 0.02, 0.12].map((x) =>
        [-0.06, -0.14].map((y) => (
          <mesh key={`${x}-${y}`} position={[x - 0.02, y + 0.02, 0.04]}>
            <boxGeometry args={[0.045, 0.045, 0.016]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        )),
      )}
    </group>
  )
}

function ToolIcon({ color }: { color: string }) {
  return (
    <group rotation={[0, 0, Math.PI / 4]}>
      <mesh position={[0, -0.04, 0.035]}>
        <boxGeometry args={[0.055, 0.26, 0.02]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.12, 0.035]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.075, 0.026, 8, 20, Math.PI * 1.45]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  )
}

function CheckIcon({ color }: { color: string }) {
  return (
    <group position={[0, 0, 0.035]}>
      <mesh position={[-0.07, -0.035, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.055, 0.13, 0.02]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0.025, 0.015, 0]} rotation={[0, 0, -Math.PI / 3.4]}>
        <boxGeometry args={[0.055, 0.26, 0.02]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  )
}

const NODE_ICONS = [QrIcon, CalendarIcon, ToolIcon, CheckIcon] as const

// ---------------------------------------------------------------------------
// Čvor petlje
// ---------------------------------------------------------------------------

interface LifecycleNodeProps {
  index: number
  animate: boolean
  selected: boolean
  hovered: boolean
  onHover: (index: number | null) => void
  onSelect: (index: number) => void
  showLabel: boolean
}

function LifecycleNode({
  index,
  animate,
  selected,
  hovered,
  onHover,
  onSelect,
  showLabel,
}: LifecycleNodeProps) {
  const groupRef = React.useRef<THREE.Group>(null)
  const haloRef = React.useRef<THREE.Mesh>(null)
  const tileMaterialRef = React.useRef<THREE.MeshStandardMaterial>(null)

  const accent = NODE_ACCENTS[index] ?? ACCENT.brand
  const step = LIFECYCLE_STEPS[index]
  const Icon = NODE_ICONS[index] ?? QrIcon
  const angle = nodeAngle(index)
  const position = React.useMemo<[number, number, number]>(
    () => [Math.cos(angle) * LOOP_RADIUS, 0, Math.sin(angle) * LOOP_RADIUS],
    [angle],
  )

  const label = React.useMemo(() => {
    if (!showLabel || !step) return null
    return createLabelTexture({
      text: step.label,
      eyebrow: `KORAK ${step.order}`,
      accent,
    })
  }, [showLabel, step, accent])

  useFrame((state) => {
    const group = groupRef.current
    if (!group) return

    const t = (state.clock.elapsedTime % CYCLE_SECONDS) / CYCLE_SECONDS
    const activation = animate ? nodeActivation(loopAngle(t), index) : index === 0 ? 1 : 0.25
    const emphasis = Math.max(activation, hovered ? 0.9 : 0, selected ? 0.75 : 0)

    const targetScale = 1 + emphasis * 0.16
    group.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.12)
    group.position.y = emphasis * 0.16

    if (tileMaterialRef.current) {
      tileMaterialRef.current.emissiveIntensity = 0.1 + emphasis * 0.85
    }

    if (haloRef.current) {
      const halo = 0.9 + emphasis * 0.55
      haloRef.current.scale.setScalar(halo)
      const material = haloRef.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.06 + emphasis * 0.3
    }
  })

  return (
    <group position={position}>
      <Billboard>
        <group
          ref={groupRef}
          onPointerOver={(event) => {
            event.stopPropagation()
            onHover(index)
          }}
          onPointerOut={(event) => {
            event.stopPropagation()
            onHover(null)
          }}
          onClick={(event) => {
            event.stopPropagation()
            onSelect(index)
          }}
        >
          {/* Oreol */}
          <mesh ref={haloRef} position={[0, 0, -0.02]}>
            <circleGeometry args={[0.52, 28]} />
            <meshBasicMaterial color={accent} transparent opacity={0.1} toneMapped={false} />
          </mesh>

          {/* Pločica */}
          <RoundedBox args={[0.66, 0.66, 0.09]} radius={0.13} smoothness={3}>
            <meshStandardMaterial
              ref={tileMaterialRef}
              color={MATERIAL_COLOR.tile}
              metalness={0.55}
              roughness={0.4}
              emissive={accent}
              emissiveIntensity={0.1}
            />
          </RoundedBox>

          <Icon color={accent} />
        </group>

        {label ? (
          <mesh position={[0, 0.72, 0]}>
            <planeGeometry args={[0.36 * label.aspect, 0.36]} />
            <meshBasicMaterial map={label.texture} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        ) : null}
      </Billboard>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Svjetlosna tačka koja kruži petljom
// ---------------------------------------------------------------------------

function TravelingPulse({ animate }: { animate: boolean }) {
  const coreRef = React.useRef<THREE.Mesh>(null)
  const glowRef = React.useRef<THREE.Mesh>(null)
  const lightRef = React.useRef<THREE.PointLight>(null)
  const colorScratch = React.useMemo(() => new THREE.Color(), [])

  useFrame((state) => {
    if (!animate) return
    const t = (state.clock.elapsedTime % CYCLE_SECONDS) / CYCLE_SECONDS
    const angle = loopAngle(t)
    const x = Math.cos(angle) * LOOP_RADIUS
    const z = Math.sin(angle) * LOOP_RADIUS

    // Boja tačke prelazi u boju čvora kojem se približava.
    const segment = Math.min(NODE_COUNT - 1, Math.floor(t * NODE_COUNT))
    colorScratch.set(NODE_ACCENTS[segment] ?? ACCENT.brand)

    if (coreRef.current) {
      coreRef.current.position.set(x, 0, z)
      const material = coreRef.current.material as THREE.MeshBasicMaterial
      material.color.lerp(colorScratch, 0.08)
    }

    if (glowRef.current) {
      glowRef.current.position.set(x, 0, z)
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.12
      glowRef.current.scale.setScalar(pulse)
      const material = glowRef.current.material as THREE.MeshBasicMaterial
      material.color.lerp(colorScratch, 0.08)
    }

    if (lightRef.current) {
      lightRef.current.position.set(x, 0.2, z)
      lightRef.current.color.lerp(colorScratch, 0.08)
    }
  })

  if (!animate) return null

  return (
    <group>
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.075, 14, 12]} />
        <meshBasicMaterial color={ACCENT.brand} toneMapped={false} />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.19, 14, 12]} />
        <meshBasicMaterial color={ACCENT.brand} transparent opacity={0.22} toneMapped={false} />
      </mesh>
      <pointLight ref={lightRef} intensity={5} distance={3.2} color={ACCENT.brand} />
    </group>
  )
}

// ---------------------------------------------------------------------------
// Talas završenog servisa
// ---------------------------------------------------------------------------

function CompletionWave({ animate }: { animate: boolean }) {
  const meshRef = React.useRef<THREE.Mesh>(null)

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    if (!animate) {
      mesh.visible = false
      return
    }

    const t = (state.clock.elapsedTime % CYCLE_SECONDS) / CYCLE_SECONDS
    const start = 0.64
    const span = 0.22

    if (t < start || t > start + span) {
      mesh.visible = false
      return
    }

    const progress = (t - start) / span
    mesh.visible = true
    const scale = 0.6 + progress * 3.6
    mesh.scale.set(scale, scale, scale)
    const material = mesh.material as THREE.MeshBasicMaterial
    material.opacity = (1 - progress) * 0.5
  })

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.86, 1, 48]} />
      <meshBasicMaterial
        color={ACCENT.success}
        transparent
        opacity={0}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Ambijentalne tačke
// ---------------------------------------------------------------------------

function AmbientPoints({ count, animate }: { count: number; animate: boolean }) {
  const pointsRef = React.useRef<THREE.Points>(null)

  const positions = React.useMemo(() => {
    const array = new Float32Array(count * 3)
    // Deterministički raspored (bez Math.random) da scena izgleda isto pri
    // svakom učitavanju i da se snimci u testovima poklapaju.
    for (let i = 0; i < count; i++) {
      const golden = Math.PI * (3 - Math.sqrt(5))
      const angle = i * golden
      const radius = 3.2 + ((i * 37) % 100) / 100 * 2.6
      array[i * 3] = Math.cos(angle) * radius
      array[i * 3 + 1] = (((i * 61) % 100) / 100 - 0.5) * 3.4
      array[i * 3 + 2] = Math.sin(angle) * radius
    }
    return array
  }, [count])

  useFrame((state, delta) => {
    if (!animate || !pointsRef.current) return
    pointsRef.current.rotation.y += delta * 0.014
  })

  if (count === 0) return null

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        color={ACCENT.electric}
        transparent
        opacity={0.4}
        sizeAttenuation
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  )
}

// ---------------------------------------------------------------------------
// Kamera: blagi parallax na pomjeraj pokazivača
// ---------------------------------------------------------------------------

function CameraRig({ enabled }: { enabled: boolean }) {
  const { camera } = useThree()
  const target = React.useMemo(() => new THREE.Vector3(0, 0, 0), [])

  useFrame((state) => {
    if (!enabled) return
    // `state.pointer` je normalizovan na [-1, 1] — pomak je namjerno mali.
    const targetX = state.pointer.x * 0.55
    const targetY = 1.75 + state.pointer.y * 0.3
    camera.position.x += (targetX - camera.position.x) * 0.045
    camera.position.y += (targetY - camera.position.y) * 0.045
    camera.lookAt(target)
  })

  return null
}

// ---------------------------------------------------------------------------
// Ograničena rotacija povlačenjem
// ---------------------------------------------------------------------------

/**
 * Dozvoljava blago okretanje scene povlačenjem, ali unutar tvrdih granica.
 * Puna slobodna orbita bi korisnika dezorijentisala i pokvarila kompoziciju,
 * pa je namjerno nema.
 */
function useDragRotation(enabled: boolean) {
  const groupRef = React.useRef<THREE.Group>(null)
  const stateRef = React.useRef({ dragging: false, lastX: 0, lastY: 0, yaw: 0, pitch: 0 })

  const MAX_YAW = 0.42
  const MAX_PITCH = 0.16

  const handlers = React.useMemo(() => {
    if (!enabled) return {}
    return {
      onPointerDown: (event: { clientX: number; clientY: number }) => {
        stateRef.current.dragging = true
        stateRef.current.lastX = event.clientX
        stateRef.current.lastY = event.clientY
      },
      onPointerUp: () => {
        stateRef.current.dragging = false
      },
      onPointerLeave: () => {
        stateRef.current.dragging = false
      },
      onPointerMove: (event: { clientX: number; clientY: number }) => {
        const state = stateRef.current
        if (!state.dragging) return
        const deltaX = event.clientX - state.lastX
        const deltaY = event.clientY - state.lastY
        state.lastX = event.clientX
        state.lastY = event.clientY
        state.yaw = THREE.MathUtils.clamp(state.yaw + deltaX * 0.004, -MAX_YAW, MAX_YAW)
        state.pitch = THREE.MathUtils.clamp(state.pitch + deltaY * 0.002, -MAX_PITCH, MAX_PITCH)
      },
    }
  }, [enabled])

  return { groupRef, stateRef, handlers }
}

function DragGroup({
  enabled,
  stateRef,
  children,
}: {
  enabled: boolean
  stateRef: React.RefObject<{ yaw: number; pitch: number }>
  children: React.ReactNode
}) {
  const groupRef = React.useRef<THREE.Group>(null)

  useFrame(() => {
    const group = groupRef.current
    if (!group || !enabled) return
    // Kad korisnik pusti, scena se polako vraća prema neutralnom uglu.
    stateRef.current.yaw *= 0.985
    stateRef.current.pitch *= 0.985
    group.rotation.y += (stateRef.current.yaw - group.rotation.y) * 0.08
    group.rotation.x += (LOOP_TILT + stateRef.current.pitch - group.rotation.x) * 0.08
  })

  return (
    <group ref={groupRef} rotation={[LOOP_TILT, 0, 0]}>
      {children}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Sadržaj scene
// ---------------------------------------------------------------------------

interface SceneProps {
  animate: boolean
  tier: DeviceTier
  selectedIndex: number | null
  hoveredIndex: number | null
  onHover: (index: number | null) => void
  onSelect: (index: number) => void
  onPhaseChange: (phaseIndex: number) => void
  interactive: boolean
  dragState: React.RefObject<{ yaw: number; pitch: number }>
}

function SceneContent({
  animate,
  tier,
  selectedIndex,
  hoveredIndex,
  onHover,
  onSelect,
  onPhaseChange,
  interactive,
  dragState,
}: SceneProps) {
  const lastPhase = React.useRef(-1)
  const highDetail = tier === 'high'
  const showLabels = tier !== 'low'
  const particleCount = tier === 'high' ? 70 : tier === 'medium' ? 40 : 0

  useFrame((state) => {
    if (!animate) return
    const t = (state.clock.elapsedTime % CYCLE_SECONDS) / CYCLE_SECONDS
    const phase = phaseIndexFor(t)
    if (phase !== lastPhase.current) {
      lastPhase.current = phase
      onPhaseChange(phase)
    }
  })

  React.useEffect(() => () => disposeLabelCache(), [])

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 4]} intensity={1.5} color="#DCEBFF" />
      <directionalLight position={[-5, 2, -3]} intensity={0.7} color={ACCENT.electric} />
      <pointLight position={[0, 1.4, 2.4]} intensity={2.4} color={ACCENT.brand} distance={9} />

      <CameraRig enabled={interactive} />

      <DragGroup enabled={interactive} stateRef={dragState}>
        <ServiceDevice animate={animate} highDetail={highDetail} />
        <ServiceTimerRing animate={animate} />
        <LoopPath />
        <TravelingPulse animate={animate} />
        <CompletionWave animate={animate} />

        {LIFECYCLE_STEPS.map((step, index) => (
          <LifecycleNode
            key={step.id}
            index={index}
            animate={animate}
            selected={selectedIndex === index}
            hovered={hoveredIndex === index}
            onHover={onHover}
            onSelect={onSelect}
            showLabel={showLabels}
          />
        ))}
      </DragGroup>

      <AmbientPoints count={particleCount} animate={animate} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Izvezena scena
// ---------------------------------------------------------------------------

export interface LifecycleSceneProps {
  /** Scena crta kadrove samo kad je `true` (vidljiva i kartica u prvom planu). */
  active: boolean
  /** Isključuje svu animaciju — `prefers-reduced-motion`. */
  reducedMotion: boolean
  tier: DeviceTier
  selectedIndex: number | null
  hoveredIndex: number | null
  onHover: (index: number | null) => void
  onSelect: (index: number) => void
  onPhaseChange: (phaseIndex: number) => void
  onReady?: () => void
}

export default function LifecycleScene({
  active,
  reducedMotion,
  tier,
  selectedIndex,
  hoveredIndex,
  onHover,
  onSelect,
  onPhaseChange,
  onReady,
}: LifecycleSceneProps) {
  const animate = active && !reducedMotion
  const interactive = !reducedMotion
  const { stateRef, handlers } = useDragRotation(interactive)

  // Kursor se mijenja kad je pokazivač nad čvorom — signal da je klik moguć.
  React.useEffect(() => {
    if (hoveredIndex === null) return
    const previous = document.body.style.cursor
    document.body.style.cursor = 'pointer'
    return () => {
      document.body.style.cursor = previous
    }
  }, [hoveredIndex])

  return (
    <Canvas
      // `never` potpuno zaustavlja petlju renderovanja izvan viewporta.
      frameloop={animate ? 'always' : 'demand'}
      dpr={[1, maxPixelRatioFor(tier)]}
      gl={{
        antialias: tier !== 'low',
        alpha: true,
        powerPreference: 'high-performance',
        // Bez `preserveDrawingBuffer` — štedi memoriju.
        preserveDrawingBuffer: false,
      }}
      camera={{ position: [0, 1.75, 6.2], fov: 40, near: 0.1, far: 40 }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0)
        onReady?.()
      }}
      style={{ touchAction: 'pan-y' }}
      {...handlers}
    >
      <SceneContent
        animate={animate}
        tier={tier}
        selectedIndex={selectedIndex}
        hoveredIndex={hoveredIndex}
        onHover={onHover}
        onSelect={onSelect}
        onPhaseChange={onPhaseChange}
        interactive={interactive}
        dragState={stateRef}
      />
    </Canvas>
  )
}
