import { ListChecks } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import {
  Badge,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { can } from '@/domain/permissions';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';

import { CreateTemplateDialog } from './template-editor';

/**
 * The checklist templates.
 *
 * The column that matters here is "Used by". A template nothing points at is a template
 * nobody will ever run, and that is the most common way a carefully written checklist
 * quietly does nothing: it was created, and then no device type was pointed at it. Showing
 * the link — or its absence — on the list makes that visible without having to open each
 * one.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Checklists',
  description: 'The checks technicians complete in the field.',
};

export default async function ChecklistsPage() {
  const session = await requirePermission('checklist:read');

  const repo = getRepository();
  const orgId = session.organization.id;

  const [templates, deviceTypes] = await Promise.all([
    repo.listChecklistTemplates(orgId),
    repo.listDeviceTypes(orgId),
  ]);

  const counts = await Promise.all(
    templates.map(async (template) => ({
      template,
      items: (await repo.listChecklistItems(orgId, template.id)).length,
      usedBy: deviceTypes.filter((type) => type.checklistTemplateId === template.id),
    })),
  );

  const canManage = can(session.role, 'checklist:manage');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Checklists</h1>
          <p className="text-sm text-ink-muted">
            What a technician is asked on site, and what the service report proves afterwards.
          </p>
        </div>

        {canManage ? <CreateTemplateDialog /> : null}
      </header>

      {counts.length === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title="No checklists yet"
          description="A checklist turns a visit into evidence: what was checked, what it read, and what failed. Point a device type at one and every job of that type runs it."
          action={canManage ? <CreateTemplateDialog /> : null}
        />
      ) : (
        <div className="rounded-card border border-border-base bg-surface-raised">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Checklist</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Checks</TableHead>
                <TableHead>Used by</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {counts.map(({ template, items, usedBy }) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <Link
                      href={`/app/checklists/${template.id}`}
                      className="font-medium text-ink hover:text-brand-600 hover:underline"
                    >
                      {template.name}
                    </Link>
                  </TableCell>

                  <TableCell className="text-sm text-ink-muted tabular-nums">
                    v{template.version}
                  </TableCell>

                  <TableCell className="text-sm">
                    {items === 0 ? (
                      <Badge variant="soon">No checks yet</Badge>
                    ) : (
                      <span className="text-ink">
                        {items} {items === 1 ? 'check' : 'checks'}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-sm">
                    {usedBy.length === 0 ? (
                      <span className="text-ink-subtle">
                        No device type — nothing will run it
                      </span>
                    ) : (
                      <span className="text-ink">{usedBy.map((t) => t.name).join(', ')}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="max-w-prose text-sm text-ink-muted">
        Editing a checklist never changes a report that has already been signed. Every
        completed run stores its own snapshot of each check — the label and the kind as they
        read on the day — so history is fixed even when the template moves on.
      </p>

      {canManage ? null : (
        <p className="text-sm text-ink-subtle">
          Your role can read and run these checklists but not change them. Ask an owner or
          administrator.
        </p>
      )}
    </div>
  );
}
