/**
 * The lifecycle loop, described once and rendered twice.
 *
 * Both the WebGL scene and the static poster read their node order, their copy and their
 * angles from here, so the fallback is genuinely the same diagram rather than a lookalike
 * that drifts out of sync the first time someone edits a label.
 *
 * Angles use a maths convention: phase grows counter-clockwise from the positive x axis,
 * and node 0 sits at the top. Each renderer converts that into its own space —
 * {@link scenePoint} for three.js (y up, ring lying in the xz plane) and
 * {@link posterPoint} for SVG/CSS (y down).
 */

export interface LifecycleNode {
  readonly id: string;
  readonly label: string;
  readonly caption: string;
}

/**
 * Five stages. The fifth hands back to the second: once a device is installed, the loop
 * that repeats for the rest of its life is scan, service, report, next due.
 */
export const LIFECYCLE_NODES: readonly LifecycleNode[] = [
  {
    id: 'install',
    label: 'Install',
    caption: 'Register the device, set its service interval, stick the QR code on it.',
  },
  {
    id: 'scan',
    label: 'Scan QR',
    caption: 'The customer scans, reads the history, books a visit or reports a fault.',
  },
  {
    id: 'service',
    label: 'Service',
    caption: 'The assigned technician works through the checklist on site.',
  },
  {
    id: 'report',
    label: 'Report',
    caption: 'A signed PDF is generated and filed against the device.',
  },
  {
    id: 'next-due',
    label: 'Next due',
    caption: 'The next date is computed and the reminder ladder regenerates.',
  },
];

export const NODE_COUNT = LIFECYCLE_NODES.length;

const TAU = Math.PI * 2;

/** Phase of node 0. `Math.PI / 2` puts it at the top of the loop in both renderers. */
export const START_PHASE = Math.PI / 2;

/** Angular gap between neighbouring nodes. */
export const NODE_STEP = TAU / NODE_COUNT;

/** Radius of the ring in three.js world units. */
export const RING_RADIUS = 1.95;

export function nodePhase(index: number): number {
  return START_PHASE + index * NODE_STEP;
}

/** Which node a travelling pulse at `phase` is currently closest to. */
export function activeNodeIndex(phase: number): number {
  const raw = Math.round((phase - START_PHASE) / NODE_STEP);
  return ((raw % NODE_COUNT) + NODE_COUNT) % NODE_COUNT;
}

/**
 * Position on the ring in three.js world space. The ring lies flat in the xz plane and a
 * parent group tilts it toward the camera, which is what turns it into an ellipse on
 * screen without any camera aiming.
 */
export function scenePoint(phase: number, radius: number = RING_RADIUS): [number, number, number] {
  return [Math.cos(phase) * radius, 0, -Math.sin(phase) * radius];
}

/**
 * Position on the ring as percentages of a square box, for the CSS poster. `y` is
 * negated because SVG and CSS both grow downward.
 */
export function posterPoint(phase: number, radiusPercent: number): { left: string; top: string } {
  return {
    left: `${50 + Math.cos(phase) * radiusPercent}%`,
    top: `${50 - Math.sin(phase) * radiusPercent}%`,
  };
}
