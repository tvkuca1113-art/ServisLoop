'use client';

/**
 * Scroll-reveal primitives.
 *
 * Two shapes: `Reveal` animates one block as it scrolls into view, and
 * `RevealGroup` + `RevealItem` stagger a list. The group orchestrates through Framer
 * variants, so the items carry no `whileInView` of their own and can therefore be
 * composed from a server component without a client boundary per card.
 *
 * Reduced motion is honoured twice over:
 *   1. `useReducedMotion()` swaps the motion elements for plain `div`s, so nothing
 *      transforms and nothing is ever left mid-animation.
 *   2. Every animated node carries `data-reveal`, which the `<noscript>` rule in the
 *      marketing layout resets to a visible state. Without that, a page whose JavaScript
 *      never arrives would render its sections at `opacity: 0`.
 */

import { motion, useReducedMotion, type Variants } from 'framer-motion';

const RISE = { duration: 0.5, ease: [0.22, 1, 0.36, 1] } as const;
const HIDDEN = { opacity: 0, y: 18 } as const;

/**
 * Variants for a staggered child. Deliberately carries no `delay`: the parent's
 * `staggerChildren` supplies one, and an explicit `delay: 0` here would cancel it.
 */
const item: Variants = {
  hidden: HIDDEN,
  visible: { opacity: 1, y: 0, transition: RISE },
};

/**
 * Variants for a standalone block, where the delay is ours to set.
 *
 * It has to be a function of `custom` rather than a `transition` prop on the element: a
 * variant that declares its own transition wins outright, so a `transition={{ delay }}`
 * alongside these variants would silently do nothing.
 */
const delayedItem: Variants = {
  hidden: HIDDEN,
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { ...RISE, delay },
  }),
};

const group: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const VIEWPORT = { once: true, amount: 0.25 } as const;

export interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Seconds to hold before the block animates. Used to cascade the hero copy. */
  delay?: number;
}

export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      data-reveal=""
      className={className}
      variants={delayedItem}
      custom={delay}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
    >
      {children}
    </motion.div>
  );
}

export interface RevealGroupProps {
  children: React.ReactNode;
  className?: string;
}

/** Parent of a staggered list. Put the grid classes here so the items stay direct children. */
export function RevealGroup({ children, className }: RevealGroupProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={group}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
    >
      {children}
    </motion.div>
  );
}

/** One staggered child. Inherits its animation state from the enclosing `RevealGroup`. */
export function RevealItem({ children, className }: RevealGroupProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div data-reveal="" className={className} variants={item}>
      {children}
    </motion.div>
  );
}

/** `RevealGroup` as an ordered list, for content whose sequence is part of the meaning. */
export function RevealList({ children, className }: RevealGroupProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <ol className={className}>{children}</ol>;
  }

  return (
    <motion.ol
      className={className}
      variants={group}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
    >
      {children}
    </motion.ol>
  );
}

/** `RevealItem` as a list item. Must sit inside a `RevealList`. */
export function RevealListItem({ children, className }: RevealGroupProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <li className={className}>{children}</li>;
  }

  return (
    <motion.li data-reveal="" className={className} variants={item}>
      {children}
    </motion.li>
  );
}
