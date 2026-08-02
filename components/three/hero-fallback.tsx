import { cn } from '@/lib/utils'
import { LIFECYCLE_STEPS } from '@/lib/site'

/**
 * Statička SVG vizualizacija servisne petlje.
 *
 * Ima tri uloge:
 *   1. Prikazuje se odmah, prije nego što se WebGL uopšte učita (nula JS-a).
 *   2. Trajna je zamjena kad WebGL nije dostupan.
 *   3. Koristi se kad korisnik traži manje animacija.
 *
 * Zato je čist SVG bez skripte — renderuje se na serveru i vidljiv je
 * i kad JavaScript ne radi.
 */
export function HeroFallback({
  className,
  animated = false,
  label = 'Dijagram servisne petlje: uređaj instaliran, servis dospijeva, kupac rezervisao, servis završen.',
}: {
  className?: string
  animated?: boolean
  label?: string
}) {
  const nodes = [
    { x: 260, y: 60, step: LIFECYCLE_STEPS[0] },
    { x: 460, y: 200, step: LIFECYCLE_STEPS[1] },
    { x: 260, y: 340, step: LIFECYCLE_STEPS[2] },
    { x: 60, y: 200, step: LIFECYCLE_STEPS[3] },
  ]

  return (
    <div className={cn('relative flex h-full w-full items-center justify-center', className)}>
      <svg viewBox="0 0 520 400" className="h-full w-full max-w-2xl" role="img" aria-label={label}>
        <defs>
          <linearGradient id="sl-fb-ring" x1="0" y1="0" x2="520" y2="400">
            <stop stopColor="#18C7B5" />
            <stop offset="0.5" stopColor="#5E8BFF" />
            <stop offset="1" stopColor="#18C7B5" />
          </linearGradient>
          <radialGradient id="sl-fb-core" cx="0.5" cy="0.4" r="0.6">
            <stop stopColor="#12253C" />
            <stop offset="1" stopColor="#0A1728" />
          </radialGradient>
          <filter id="sl-fb-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Putanja petlje */}
        <ellipse
          cx="260"
          cy="200"
          rx="200"
          ry="140"
          fill="none"
          stroke="url(#sl-fb-ring)"
          strokeWidth="1.5"
          strokeOpacity="0.45"
          strokeDasharray="6 8"
        />

        {/* Svjetlosna tačka koja putuje petljom */}
        {animated ? (
          <circle r="5" fill="#18C7B5" filter="url(#sl-fb-glow)">
            <animateMotion
              dur="12s"
              repeatCount="indefinite"
              path="M 460 200 A 200 140 0 1 1 459.9 199 Z"
            />
          </circle>
        ) : null}

        {/* Centralni uređaj */}
        <g>
          <rect
            x="196"
            y="146"
            width="128"
            height="108"
            rx="16"
            fill="url(#sl-fb-core)"
            stroke="#18C7B5"
            strokeOpacity="0.35"
            strokeWidth="1.5"
          />
          <circle
            cx="260"
            cy="200"
            r="34"
            fill="none"
            stroke="#5E8BFF"
            strokeOpacity="0.55"
            strokeWidth="2"
          />
          <circle
            cx="260"
            cy="200"
            r="22"
            fill="none"
            stroke="#18C7B5"
            strokeOpacity="0.7"
            strokeWidth="2"
          />
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <line
              key={angle}
              x1="260"
              y1="200"
              x2={260 + 22 * Math.cos((angle * Math.PI) / 180)}
              y2={200 + 22 * Math.sin((angle * Math.PI) / 180)}
              stroke="#18C7B5"
              strokeOpacity="0.4"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          ))}
          {/* Rebra kućišta */}
          {[162, 172, 182].map((y) => (
            <line
              key={y}
              x1="206"
              y1={y}
              x2="230"
              y2={y}
              stroke="#94A6BD"
              strokeOpacity="0.25"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ))}
        </g>

        {/* Četiri čvora petlje */}
        {nodes.map((node, index) => (
          <g key={node.step.id}>
            <rect
              x={node.x - 30}
              y={node.y - 22}
              width="60"
              height="44"
              rx="12"
              fill="#0C1B2E"
              stroke={index === 0 ? '#18C7B5' : '#5E8BFF'}
              strokeOpacity={index === 0 ? '0.7' : '0.35'}
              strokeWidth="1.5"
            />
            <text
              x={node.x}
              y={node.y + 4}
              textAnchor="middle"
              fontSize="13"
              fontWeight="600"
              fill={index === 0 ? '#18C7B5' : '#94A6BD'}
              fontFamily="var(--font-sans, sans-serif)"
            >
              {node.step.order}
            </text>
            <text
              x={node.x}
              y={node.y + 40}
              textAnchor="middle"
              fontSize="11"
              fill="#94A6BD"
              fontFamily="var(--font-sans, sans-serif)"
            >
              {node.step.short}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
