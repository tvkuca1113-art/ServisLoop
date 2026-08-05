/**
 * The static rendition of the lifecycle loop.
 *
 * This is not a placeholder image; it is the same diagram drawn with an SVG ring and
 * positioned DOM labels. It is what ships when the WebGL scene is still downloading, when
 * the visitor prefers reduced motion, when the browser has no WebGL context, and when the
 * scene throws. Because it is plain CSS it costs nothing, renders on the server and
 * inherits the theme tokens like everything else.
 *
 * Decorative by construction: the accessible description of the loop lives in the
 * `sr-only` list rendered by `LifecycleHero`, and the whole visual layer sits inside an
 * `aria-hidden` wrapper.
 */

import { cn } from '@/lib/utils';

import { LIFECYCLE_NODES, nodePhase, posterPoint } from './lifecycle-data';

/** Ring radius as a percentage of the square box. */
const RING = 29;
/** Radius the labels sit on, far enough out to clear the markers. */
const LABEL = 41;

const CIRCUMFERENCE = 2 * Math.PI * RING;
/** Length of the highlighted arc, roughly the gap between two nodes plus a little. */
const ARC = CIRCUMFERENCE * 0.26;

export function LifecyclePoster({ className }: { className?: string }) {
  return (
    <div className={cn('flex size-full items-center justify-center', className)}>
      <div className="relative aspect-square w-full max-w-[30rem]">
        <div className="absolute inset-[12%] rounded-full bg-brand-500/5 blur-2xl" />

        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full"
          aria-hidden="true"
          focusable="false"
        >
          {/* Inner guide, dashed, purely to give the ring some depth. */}
          <circle
            cx="50"
            cy="50"
            r={RING * 0.52}
            fill="none"
            strokeWidth="0.3"
            strokeDasharray="1.1 2.6"
            className="stroke-border-strong"
          />
          {/* The track. */}
          <circle
            cx="50"
            cy="50"
            r={RING}
            fill="none"
            strokeWidth="0.55"
            className="stroke-border-strong"
          />
          {/* The lit segment, standing in for the pulse that travels in the live scene. */}
          <circle
            cx="50"
            cy="50"
            r={RING}
            fill="none"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeDasharray={`${ARC.toFixed(2)} ${(CIRCUMFERENCE - ARC).toFixed(2)}`}
            transform="rotate(-90 50 50)"
            className="stroke-brand-500"
          />
        </svg>

        {LIFECYCLE_NODES.map((node, index) => {
          const phase = nodePhase(index);
          const marker = posterPoint(phase, RING);
          const label = posterPoint(phase, LABEL);
          const lit = index === 0 || index === 1;

          return (
            <div key={node.id}>
              <span
                className={cn(
                  'absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full',
                  lit
                    ? 'bg-brand-500 ring-4 ring-brand-500/20'
                    : 'bg-surface-raised ring-2 ring-brand-500/60',
                )}
                style={marker}
              />
              <span
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center whitespace-nowrap"
                style={label}
              >
                <span className="tabular text-[0.625rem] font-semibold tracking-[0.18em] text-ink-subtle">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-xs font-medium text-ink sm:text-sm">{node.label}</span>
              </span>
            </div>
          );
        })}

        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1">
          <span className="text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
            Service loop
          </span>
          <span className="text-xs text-ink-muted">One device, forever</span>
        </div>
      </div>
    </div>
  );
}
