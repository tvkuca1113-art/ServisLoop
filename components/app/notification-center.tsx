'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menu'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { formatRelativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { markAllNotificationsRead, markNotificationRead } from '@/app/app/actions'

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string | null
  linkPath: string | null
  severity: 'info' | 'success' | 'warning' | 'critical'
  isRead: boolean
  createdAt: string
}

const SEVERITY_DOT: Record<NotificationItem['severity'], string> = {
  info: 'bg-electric-500',
  success: 'bg-positive',
  warning: 'bg-caution',
  critical: 'bg-critical',
}

export function NotificationCenter({ notifications }: { notifications: NotificationItem[] }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const unreadCount = notifications.filter((notification) => !notification.isRead).length

  function handleOpen(notification: NotificationItem) {
    setOpen(false)
    if (!notification.isRead) {
      startTransition(async () => {
        await markNotificationRead(notification.id)
        router.refresh()
      })
    }
    if (notification.linkPath) router.push(notification.linkPath)
  }

  function handleMarkAll() {
    startTransition(async () => {
      await markAllNotificationsRead()
      router.refresh()
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unreadCount > 0 ? `Obavijesti (${unreadCount} nepročitanih)` : 'Obavijesti'
          }
          className={cn(
            'relative flex size-10 items-center justify-center rounded-lg text-fg-muted',
            'transition-colors hover:bg-surface-muted hover:text-fg',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          )}
        >
          <Bell className="size-5" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="absolute top-1.5 right-1.5 flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-critical opacity-70" />
              <span className="relative inline-flex size-2 rounded-full bg-critical" />
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-88 p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">Obavijesti</h2>
          {unreadCount > 0 ? (
            <Button
              variant="link"
              size="sm"
              onClick={handleMarkAll}
              loading={pending}
              className="text-xs"
            >
              <Check className="size-3.5" aria-hidden="true" />
              Označi sve pročitanim
            </Button>
          ) : null}
        </div>

        <div className="max-h-96 overflow-y-auto scroll-slim">
          {notifications.length === 0 ? (
            <EmptyState
              compact
              title="Nema obavijesti"
              description="Ovdje će se pojaviti neuspjeli podsjetnici, nove rezervacije i prijave kvara."
              className="m-3 border-0 bg-transparent"
            />
          ) : (
            <ul className="divide-y divide-line">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => handleOpen(notification)}
                    className={cn(
                      'flex w-full gap-3 px-4 py-3 text-left transition-colors',
                      'hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none',
                      !notification.isRead && 'bg-primary-soft/40',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        notification.isRead ? 'bg-line-strong' : SEVERITY_DOT[notification.severity],
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-sm leading-snug',
                          notification.isRead ? 'text-fg-muted' : 'font-medium text-fg',
                        )}
                      >
                        {notification.title}
                      </span>
                      {notification.body ? (
                        <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">
                          {notification.body}
                        </span>
                      ) : null}
                      <span className="mt-1 block text-[0.6875rem] text-fg-subtle">
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-line px-4 py-2.5">
          <Link
            href="/app/postavke/obavijesti"
            className="text-xs text-fg-muted transition-colors hover:text-fg"
            onClick={() => setOpen(false)}
          >
            Postavke obavijesti
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
