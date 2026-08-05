/**
 * Layout scaffolding shared by every marketing section.
 *
 * `Section` owns the vertical rhythm and the optional full-bleed background; `Container`
 * owns the horizontal gutter and the measure. Keeping them separate means a section can
 * paint edge to edge while its content still lines up with the header and the footer.
 *
 * Server-renderable. The only client code it reaches for is `Reveal`, which is where the
 * scroll animation (and its reduced-motion opt-out) lives.
 */

import { cn } from '@/lib/utils';

import { Reveal } from './reveal';

export function Container({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8', className)} {...props} />;
}

export interface SectionProps extends React.ComponentProps<'section'> {
  /** `muted` paints the full-bleed band behind the container. */
  tone?: 'default' | 'muted';
  spacing?: 'default' | 'compact' | 'none';
  /** Skip the built-in container when the section lays out its own full-bleed content. */
  bare?: boolean;
}

const SPACING: Record<NonNullable<SectionProps['spacing']>, string> = {
  default: 'py-20 sm:py-24',
  compact: 'py-12 sm:py-16',
  none: '',
};

export function Section({
  tone = 'default',
  spacing = 'default',
  bare = false,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(
        'w-full',
        tone === 'muted' && 'bg-surface-muted',
        SPACING[spacing],
        className,
      )}
      {...props}
    >
      {bare ? children : <Container>{children}</Container>}
    </section>
  );
}

export interface SectionHeaderProps {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Heading level. Every page has exactly one `h1`, so sections default to `h2`. */
  as?: 'h1' | 'h2' | 'h3';
  align?: 'left' | 'center';
  className?: string;
  /** Anchor target, so footer and nav links can deep-link to a section. */
  headingId?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  as: Heading = 'h2',
  align = 'left',
  className,
  headingId,
}: SectionHeaderProps) {
  return (
    <Reveal
      className={cn(
        'flex max-w-2xl flex-col gap-4',
        align === 'center' && 'mx-auto items-center text-center',
        className,
      )}
    >
      {eyebrow ? (
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">
          {eyebrow}
        </span>
      ) : null}
      <Heading
        id={headingId}
        className={cn(
          'text-balance font-semibold tracking-tight text-ink',
          Heading === 'h1'
            ? 'text-4xl leading-[1.08] sm:text-5xl lg:text-6xl'
            : 'text-3xl leading-tight sm:text-4xl',
        )}
      >
        {title}
      </Heading>
      {description ? (
        <p className="text-pretty text-base leading-relaxed text-ink-muted sm:text-lg">
          {description}
        </p>
      ) : null}
    </Reveal>
  );
}
