'use client';

/**
 * The WebGL lifecycle loop.
 *
 * Five nodes sit on a ring that lies flat in the xz plane; a parent group tilts it toward
 * the camera, which is what turns it into an ellipse on screen without any camera aiming.
 * A pulse laps the ring, the arc behind it lights up, and the node the pulse is passing
 * highlights and names itself. Pointing at a node takes that highlight over.
 *
 * Notes for whoever touches this next:
 *
 * - It is loaded through `next/dynamic` with `ssr: false` from `lifecycle-hero.tsx`.
 *   `three` reads `window` at import time, so this module must never be imported from a
 *   server component or from anything on the server render path.
 * - Colours are read from the CSS custom properties in `globals.css` at mount, so the
 *   scene stays on the brand ramp and there are no hard-coded hex values here. They are
 *   sampled once: flipping the theme afterwards does not restyle the running scene.
 * - Nothing calls `setState` per frame. The travelling pulse writes straight to object
 *   transforms; React only re-renders when the highlighted node actually changes, which
 *   is roughly three times per lap.
 * - `three` imports are named, not `import * as THREE`, to keep the dynamic chunk small.
 */

import { Html, useCursor } from '@react-three/drei';
import { Canvas, useFrame, type RootState, type ThreeEvent } from '@react-three/fiber';
import { useCallback, useMemo, useRef, useState } from 'react';
import { MathUtils } from 'three';
import type { Group, Mesh } from 'three';

import {
  LIFECYCLE_NODES,
  RING_RADIUS,
  START_PHASE,
  activeNodeIndex,
  nodePhase,
  scenePoint,
  type LifecycleNode,
} from './lifecycle-data';

const TAU = Math.PI * 2;
/** Seconds for the pulse to travel the loop once. Slow enough to read every label. */
const LAP_SECONDS = 15;
/** How much of the ring the lit trail covers, in radians. */
const TRAIL_ARC = Math.PI * 0.42;
/** Tilt of the whole loop toward the camera. `sin` of this is the on-screen squash. */
const BASE_TILT = 0.52;
/** Largest frame step we integrate. Guards against a huge delta after a background tab. */
const MAX_DELTA = 0.05;

/**
 * Rotation tuples for the objects whose rotation is also written every frame.
 *
 * These are module constants rather than inline literals on purpose. A fresh array on
 * each render looks like a changed prop to the reconciler, which would re-apply the
 * static rotation and stamp on whatever `useFrame` had just animated. Sharing one frozen
 * reference means the props are applied once, at mount, and never fight the animation.
 */
const LIE_FLAT: [number, number, number] = [-Math.PI / 2, 0, 0];
const BASE_ROTATION: [number, number, number] = [BASE_TILT, 0, 0];

/**
 * Material colours, sampled from the design tokens.
 *
 * The fallbacks are CSS colour keywords rather than hex so this file stays free of raw
 * colour literals; they only apply if the stylesheet has not been parsed yet, which
 * should not happen once the page has painted.
 */
interface Palette {
  track: string;
  node: string;
  highlight: string;
  pulse: string;
  glow: string;
}

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string): string => {
    const value = style.getPropertyValue(name).trim();
    return value.length > 0 ? value : fallback;
  };

  return {
    track: token('--color-brand-400', 'lightsteelblue'),
    node: token('--color-brand-500', 'cornflowerblue'),
    highlight: token('--color-brand-300', 'lightskyblue'),
    pulse: token('--color-brand-500', 'royalblue'),
    glow: token('--color-brand-400', 'cornflowerblue'),
  };
}

interface NodeMarkerProps {
  node: LifecycleNode;
  index: number;
  palette: Palette;
  highlighted: boolean;
  onHoverChange: (index: number, hovered: boolean) => void;
}

function NodeMarker({ node, index, palette, highlighted, onHoverChange }: NodeMarkerProps) {
  const bob = useRef<Group>(null);
  const gem = useRef<Mesh>(null);
  const halo = useRef<Mesh>(null);
  const position = useMemo(() => scenePoint(nodePhase(index)), [index]);

  useFrame((state, delta) => {
    const step = Math.min(delta, MAX_DELTA);
    const elapsed = state.clock.elapsedTime;

    // Out of phase with its neighbours, so the ring undulates instead of pumping.
    if (bob.current) {
      bob.current.position.y = Math.sin(elapsed * 0.8 + index * 1.35) * 0.085;
      bob.current.rotation.y = elapsed * 0.25 + index;
    }
    if (gem.current) {
      const target = highlighted ? 1.5 : 1;
      gem.current.scale.setScalar(MathUtils.damp(gem.current.scale.x, target, 7, step));
    }
    if (halo.current) {
      const target = highlighted ? 1.35 : 1;
      halo.current.scale.setScalar(MathUtils.damp(halo.current.scale.x, target, 7, step));
    }
  });

  const handleOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      onHoverChange(index, true);
    },
    [index, onHoverChange],
  );

  const handleOut = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      onHoverChange(index, false);
    },
    [index, onHoverChange],
  );

  return (
    <group position={position}>
      <group ref={bob}>
        <mesh ref={gem}>
          <icosahedronGeometry args={[0.15, 1]} />
          <meshStandardMaterial
            color={highlighted ? palette.highlight : palette.node}
            emissive={highlighted ? palette.highlight : palette.node}
            emissiveIntensity={highlighted ? 1.15 : 0.55}
            roughness={0.32}
            metalness={0.15}
          />
        </mesh>

        <mesh ref={halo}>
          <sphereGeometry args={[0.3, 20, 20]} />
          <meshBasicMaterial
            color={palette.glow}
            transparent
            opacity={highlighted ? 0.26 : 0.1}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>

        {/*
          A generous, fully transparent hit sphere. Pointing at a 0.15-unit gem on a
          touch-adjacent trackpad is not realistic; this makes the target forgiving
          without changing what is drawn.
        */}
        <mesh onPointerOver={handleOver} onPointerOut={handleOut}>
          <sphereGeometry args={[0.44, 12, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        {highlighted ? (
          <Html center position={[0, 0.62, 0]} pointerEvents="none" zIndexRange={[10, 0]}>
            {/*
              Kept narrow on purpose. The label is a DOM node projected from a point that
              can sit near the edge of the canvas, so a wide card would reach past the
              hero column on a narrow desktop window.
            */}
            <div className="w-max max-w-[12rem] rounded-lg border border-border-base bg-surface-raised/95 px-3 py-2 shadow-lg">
              <p className="flex items-baseline gap-2 text-xs font-semibold text-ink">
                <span className="tabular text-[0.625rem] tracking-[0.18em] text-brand-600">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {node.label}
              </p>
              <p className="mt-1 text-xs leading-snug text-ink-muted">{node.caption}</p>
            </div>
          </Html>
        ) : null}
      </group>
    </group>
  );
}

function LifecycleLoop({ palette }: { palette: Palette }) {
  const tilt = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const trail = useRef<Mesh>(null);
  const pulse = useRef<Group>(null);
  const inner = useRef<Mesh>(null);

  const [hovered, setHovered] = useState<number | null>(null);
  const [passing, setPassing] = useState(0);
  const passingRef = useRef(0);

  useCursor(hovered !== null);

  const handleHoverChange = useCallback((index: number, isHovered: boolean) => {
    setHovered((current) => (isHovered ? index : current === index ? null : current));
  }, []);

  useFrame((state, delta) => {
    const step = Math.min(delta, MAX_DELTA);
    const elapsed = state.clock.elapsedTime;

    // Where the pulse is, in the ring's own frame. Node phases are static in that frame,
    // so the auto-rotation below never has to be compensated for.
    const lead = START_PHASE + (elapsed / LAP_SECONDS) * TAU;

    if (pulse.current) {
      const [x, y, z] = scenePoint(lead);
      pulse.current.position.set(x, y, z);
    }
    if (trail.current) {
      // Euler order XYZ composes as Rx · Ry · Rz, so the z term advances the arc inside
      // its own plane and the x term then lays that plane flat into xz.
      trail.current.rotation.set(-Math.PI / 2, 0, lead - TRAIL_ARC);
    }
    if (inner.current) {
      inner.current.rotation.z = -elapsed * 0.12;
    }
    if (spin.current) {
      spin.current.rotation.y = elapsed * 0.06;
    }
    if (tilt.current) {
      // Parallax: a small, damped lean toward the pointer. `state.pointer` is already
      // normalised to -1..1 and sits at the origin until the visitor moves the mouse.
      tilt.current.rotation.x = MathUtils.damp(
        tilt.current.rotation.x,
        BASE_TILT + state.pointer.y * 0.1,
        3,
        step,
      );
      tilt.current.rotation.y = MathUtils.damp(
        tilt.current.rotation.y,
        state.pointer.x * 0.2,
        3,
        step,
      );
    }

    const next = activeNodeIndex(lead);
    if (next !== passingRef.current) {
      passingRef.current = next;
      setPassing(next);
    }
  });

  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 5, 4]} intensity={1.35} />
      <directionalLight position={[-4, -2, -3]} intensity={0.4} />

      <group ref={tilt} rotation={BASE_ROTATION}>
        <group ref={spin}>
          {/* The track. */}
          <mesh rotation={LIE_FLAT}>
            <torusGeometry args={[RING_RADIUS, 0.011, 8, 180]} />
            <meshBasicMaterial
              color={palette.track}
              transparent
              opacity={0.55}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>

          {/* The lit arc trailing the pulse. */}
          <mesh ref={trail} rotation={LIE_FLAT}>
            <torusGeometry args={[RING_RADIUS, 0.028, 10, 110, TRAIL_ARC]} />
            <meshBasicMaterial
              color={palette.pulse}
              transparent
              opacity={0.5}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>

          {/* A slow counter-rotating inner ring, for depth. */}
          <mesh ref={inner} rotation={LIE_FLAT}>
            <torusGeometry args={[RING_RADIUS * 0.52, 0.004, 6, 120, Math.PI * 1.35]} />
            <meshBasicMaterial
              color={palette.track}
              transparent
              opacity={0.35}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>

          <group ref={pulse}>
            <mesh>
              <sphereGeometry args={[0.075, 20, 20]} />
              <meshBasicMaterial color={palette.pulse} toneMapped={false} />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.2, 20, 20]} />
              <meshBasicMaterial
                color={palette.pulse}
                transparent
                opacity={0.2}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </group>

          {LIFECYCLE_NODES.map((node, index) => (
            <NodeMarker
              key={node.id}
              node={node}
              index={index}
              palette={palette}
              highlighted={hovered === null ? passing === index : hovered === index}
              onHoverChange={handleHoverChange}
            />
          ))}
        </group>
      </group>
    </>
  );
}

export interface LifecycleSceneProps {
  /** Called if the GPU drops the context, so the hero can swap in the poster for good. */
  onContextLost?: () => void;
  /** Rendered by `<Canvas>` itself when the browser cannot give it a context at all. */
  fallback?: React.ReactNode;
  /**
   * `never` parks the render loop without tearing the context down. The hero flips this
   * when the visual scrolls out of view, so a page left open further down does not keep
   * a GPU busy for nothing.
   */
  frameloop?: 'always' | 'never';
}

export default function LifecycleScene({
  onContextLost,
  fallback,
  frameloop = 'always',
}: LifecycleSceneProps) {
  const palette = useMemo(readPalette, []);

  const handleCreated = useCallback(
    ({ gl }: RootState) => {
      gl.domElement.addEventListener(
        'webglcontextlost',
        (event) => {
          // Stop the browser trying to restore a scene we are about to unmount.
          event.preventDefault();
          onContextLost?.();
        },
        { once: true },
      );
    },
    [onContextLost],
  );

  return (
    <Canvas
      className="size-full"
      camera={{ position: [0, 0, 7.4], fov: 40 }}
      dpr={[1, 1.8]}
      frameloop={frameloop}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={handleCreated}
      fallback={fallback}
    >
      <LifecycleLoop palette={palette} />
    </Canvas>
  );
}
