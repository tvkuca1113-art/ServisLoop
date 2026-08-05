/**
 * ServisLoop UI primitives — shadcn/ui pattern, hand-vendored (see PLAN.md §R11).
 *
 * Every component is styled exclusively with the semantic tokens from `globals.css`
 * (`surface`, `ink`, `border-base`, the `brand-*` ramp and the four `state-*` colours).
 * No raw hex, no `hsl(var(--background))` indirection, no `dark:` variants — the theme
 * flips through the CSS custom properties, which honours both the OS preference and the
 * explicit `data-theme` stamp.
 *
 * Client/server split: only modules that use Radix, hooks or context carry `'use client'`.
 * The purely presentational primitives (card, badge, table, alert, skeleton, empty-state,
 * spinner, input, textarea) stay server-renderable.
 */

export * from './alert';
export * from './avatar';
export * from './badge';
export * from './button';
export * from './card';
export * from './checkbox';
export * from './dialog';
export * from './dropdown-menu';
export * from './empty-state';
export * from './input';
export * from './label';
export * from './popover';
export * from './select';
export * from './separator';
export * from './skeleton';
export * from './spinner';
export * from './switch';
export * from './table';
export * from './tabs';
export * from './textarea';
export * from './toast';
export * from './tooltip';
export * from './use-toast';
