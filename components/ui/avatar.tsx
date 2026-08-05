'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const avatarVariants = cva(
  'relative flex shrink-0 overflow-hidden rounded-full border border-border-base bg-surface-muted',
  {
    variants: {
      size: {
        sm: 'size-6 text-[0.625rem]',
        md: 'size-8 text-xs',
        lg: 'size-10 text-sm',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

export interface AvatarProps
  extends React.ComponentProps<typeof AvatarPrimitive.Root>,
    VariantProps<typeof avatarVariants> {}

export function Avatar({ className, size, ...props }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(avatarVariants({ size }), className)}
      {...props}
    />
  );
}

export interface AvatarImageProps
  extends React.ComponentProps<typeof AvatarPrimitive.Image> {
  /** Required: describe the person, or pass `alt=""` when the fallback already names them. */
  alt: string;
}

export function AvatarImage({ className, ...props }: AvatarImageProps) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('aspect-square size-full object-cover', className)}
      {...props}
    />
  );
}

/** Initials shown while the image loads or when it fails. Use `initials()` from `@/lib/utils`. */
export function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        'flex size-full items-center justify-center rounded-full bg-surface-muted font-medium uppercase text-ink-muted',
        className,
      )}
      {...props}
    />
  );
}

export { avatarVariants };
