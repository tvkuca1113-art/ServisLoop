'use client';

/**
 * Loader and degradation strategy for the 3D hero.
 *
 * There are four ways the WebGL scene does not run, and all four land on the same static
 * poster rather than on an empty box:
 *
 *   1. **Server render and first paint.** The scene is a `next/dynamic` import with
 *      `ssr: false` because `three` touches `window` at import time. Until the chunk
 *      arrives, `loading` renders the poster.
 *   2. **Reduced motion.** `window.matchMedia('(prefers-reduced-motion: reduce)')` is read
 *      in an effect and subscribed to, so toggling the OS setting swaps the hero live. A
 *      visitor who asks for less motion never downloads the three.js chunk at all.
 *   3. **No WebGL.** Probed by trying to allocate a context before we mount the scene, and
 *      `<Canvas fallback>` catches anything that slips past that probe.
 *   4. **A crash or a lost context.** Render-phase throws are caught by `WebGLBoundary`;
 *      a GPU context loss is not a React error, so the scene reports it through
 *      `onContextLost` and we pin the poster for the rest of the session.
 *
 * The visual layer is `aria-hidden` in every state. The accessible version of the diagram
 * is the ordered list below it, which is always in the DOM.
 */

import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { LIFECYCLE_NODES } from './lifecycle-data';
import { LifecyclePoster } from './lifecycle-poster';
import { WebGLBoundary } from './webgl-boundary';

const LifecycleScene = dynamic(() => import('./lifecycle-scene'), {
  ssr: false,
  loading: () => <LifecyclePoster />,
});

/** Can this browser actually give us a context? Cheaper to ask than to catch a throw. */
function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')),
    );
  } catch {
    return false;
  }
}

type HeroMode = 'poster' | 'scene';

export function LifecycleHero({ className }: { className?: string }) {
  // Starts on the poster so the server render and the first client render agree.
  const [mode, setMode] = useState<HeroMode>('poster');
  const [onScreen, setOnScreen] = useState(true);
  const container = useRef<HTMLDivElement>(null);
  const failed = useRef(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');

    const decide = (): void => {
      setMode(!failed.current && !query.matches && supportsWebGL() ? 'scene' : 'poster');
    };

    decide();
    query.addEventListener('change', decide);
    return () => query.removeEventListener('change', decide);
  }, []);

  // Park the render loop once the hero has scrolled well clear. The context stays alive,
  // so coming back is instant, but a page parked at the FAQ is not spinning a GPU.
  useEffect(() => {
    const element = container.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setOnScreen(entry.isIntersecting);
        }
      },
      { rootMargin: '250px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleFailure = useCallback(() => {
    failed.current = true;
    setMode('poster');
  }, []);

  return (
    <div ref={container} className={cn('relative', className)}>
      <div aria-hidden="true" className="size-full">
        {mode === 'scene' ? (
          <WebGLBoundary fallback={<LifecyclePoster />} onError={handleFailure}>
            <motion.div
              className="size-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <LifecycleScene
                onContextLost={handleFailure}
                fallback={<LifecyclePoster />}
                frameloop={onScreen ? 'always' : 'never'}
              />
            </motion.div>
          </WebGLBoundary>
        ) : (
          <LifecyclePoster />
        )}
      </div>

      {/*
        The same diagram, as text. Present in every state, which is why the visual layer
        above can be hidden from assistive technology unconditionally.
      */}
      <div className="sr-only">
        <h2>The ServisLoop service loop</h2>
        <ol>
          {LIFECYCLE_NODES.map((node) => (
            <li key={node.id}>
              {node.label}. {node.caption}
            </li>
          ))}
        </ol>
        <p>After the next due date is set, the loop returns to the customer scanning the QR code.</p>
      </div>
    </div>
  );
}
