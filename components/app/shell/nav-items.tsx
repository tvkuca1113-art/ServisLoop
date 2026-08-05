import {
  BellRing,
  Building2,
  CalendarClock,
  Cpu,
  FileText,
  LayoutDashboard,
  ListChecks,
  Settings,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import { can, type Action } from '@/domain/permissions';
import type { Role } from '@/domain/types';

/**
 * The product navigation, in one list.
 *
 * Each destination declares the permission that makes it worth visiting, and
 * {@link visibleNavItems} filters the list through `can()` from the domain layer. Nothing
 * here re-implements an access rule: if the matrix stops granting `booking:read` to
 * viewers, the Bookings link disappears for them the same day, with no edit to this file.
 *
 * A note on what that currently means in practice: every role in the shipped matrix —
 * including `viewer` — holds the read action for all ten destinations, because a viewer is
 * defined as read-only *access to everything*, not partial access. So today the filter
 * removes nothing. It is still the right mechanism rather than a hardcoded list, and it is
 * the reason a future `dispatcher` or `contractor` role needs no change here at all. What
 * a viewer cannot do is hidden one level down, on the pages themselves, where the create,
 * edit and invite controls live.
 *
 * Icons are referenced by name rather than passed as components, so the item list stays a
 * plain serialisable value that a Server Component can hand to a Client Component.
 */

export type NavIconName =
  | 'dashboard'
  | 'work-orders'
  | 'devices'
  | 'customers'
  | 'bookings'
  | 'issues'
  | 'reminders'
  | 'checklists'
  | 'reports'
  | 'settings';

export interface NavItem {
  href: string;
  label: string;
  /** One line for the mobile menu and the collapsed sidebar's tooltip. */
  hint: string;
  icon: NavIconName;
  action: Action;
  /** Match the path exactly. Only the dashboard needs it — `/app` prefixes everything. */
  exact?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = Object.freeze([
  {
    href: '/app',
    label: 'Dashboard',
    hint: 'What is overdue, due soon and in progress today',
    icon: 'dashboard',
    action: 'org:read',
    exact: true,
  },
  {
    href: '/app/work-orders',
    label: 'Work orders',
    hint: 'Schedule, assign and complete jobs',
    icon: 'work-orders',
    action: 'work_order:read',
  },
  {
    href: '/app/devices',
    label: 'Devices',
    hint: 'Every serviced asset and its next due date',
    icon: 'devices',
    action: 'device:read',
  },
  {
    href: '/app/customers',
    label: 'Customers',
    hint: 'Companies, sites and contacts',
    icon: 'customers',
    action: 'customer:read',
  },
  {
    href: '/app/bookings',
    label: 'Bookings',
    hint: 'Appointment requests from customers',
    icon: 'bookings',
    action: 'booking:read',
  },
  {
    href: '/app/issues',
    label: 'Issues',
    hint: 'Faults reported from the QR device pages',
    icon: 'issues',
    action: 'issue:read',
  },
  {
    href: '/app/reminders',
    label: 'Reminders',
    hint: 'The service reminder ladder and its send log',
    icon: 'reminders',
    action: 'reminder:read',
  },
  {
    href: '/app/checklists',
    label: 'Checklists',
    hint: 'Templates technicians complete in the field',
    icon: 'checklists',
    action: 'checklist:read',
  },
  {
    href: '/app/reports',
    label: 'Reports',
    hint: 'Compliance, throughput and CSV export',
    icon: 'reports',
    action: 'report:read',
  },
  {
    href: '/app/settings',
    label: 'Settings',
    hint: 'Organisation, members, hours and data source',
    icon: 'settings',
    action: 'org:read',
  },
]);

/** The destinations this role has any business visiting. */
export function visibleNavItems(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => can(role, item.action));
}

const ICONS: Readonly<Record<NavIconName, LucideIcon>> = Object.freeze({
  dashboard: LayoutDashboard,
  'work-orders': Wrench,
  devices: Cpu,
  customers: Building2,
  bookings: CalendarClock,
  issues: TriangleAlert,
  reminders: BellRing,
  checklists: ListChecks,
  reports: FileText,
  settings: Settings,
});

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" className={className} />;
}

/**
 * Is this nav item the one the visitor is looking at?
 *
 * Prefix matching so `/app/devices/9f2…` still highlights Devices, with an exact opt-out
 * for the dashboard — `/app` is a prefix of every other route in the product.
 */
export function isActiveNav(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
