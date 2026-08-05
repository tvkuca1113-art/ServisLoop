import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { can } from '@/domain/permissions';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';

import { ArchiveTemplateButton, TemplateEditor } from '../template-editor';

/**
 * One checklist template, and its checks.
 *
 * The editor below is the whole page. What sits above it is the context needed to edit
 * safely: which device types run this template — and therefore whose jobs a change lands
 * on tomorrow — and the reminder that a change never reaches a report already signed.
 */

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await requirePermission('checklist:read');
  const template = await getRepository().getChecklistTemplate(session.organization.id, id);

  return { title: template?.name ?? 'Checklist' };
}

export default async function ChecklistTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePermission('checklist:read');

  const repo = getRepository();
  const orgId = session.organization.id;

  const template = await repo.getChecklistTemplate(orgId, id);
  if (!template) notFound();

  const [items, deviceTypes] = await Promise.all([
    repo.listChecklistItems(orgId, template.id),
    repo.listDeviceTypes(orgId),
  ]);

  const usedBy = deviceTypes.filter((type) => type.checklistTemplateId === template.id);
  const canManage = can(session.role, 'checklist:manage');

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="-ml-3 w-fit">
        <Link href="/app/checklists">
          <ArrowLeft aria-hidden="true" />
          All checklists
        </Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{template.name}</h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="neutral">Version {template.version}</Badge>
            {template.archivedAt ? <Badge variant="soon">Archived</Badge> : null}
            <span className="text-sm text-ink-muted">
              {usedBy.length === 0
                ? 'No device type points at this checklist, so nothing runs it yet.'
                : `Run by every job on: ${usedBy.map((t) => t.name).join(', ')}.`}
            </span>
          </div>
        </div>

        {canManage && !template.archivedAt ? (
          <ArchiveTemplateButton
            templateId={template.id}
            templateName={template.name}
            inUseCount={usedBy.length}
          />
        ) : null}
      </header>

      {template.archivedAt ? (
        <Alert variant="warning">
          <AlertTitle>This checklist is archived</AlertTitle>
          <AlertDescription>
            It no longer appears in the pickers, and its checks cannot be edited. Everything
            it has already recorded is untouched.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2">Checks</CardTitle>
          <CardDescription>
            In the order a technician will be asked. Move a check to change that order — the
            position is the list, not a number you type.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <TemplateEditor
            templateId={template.id}
            templateName={template.name}
            items={items.map((item) => ({
              id: item.id,
              position: item.position,
              label: item.label,
              kind: item.kind,
              required: item.required,
              options: item.options,
              unit: item.unit,
              minValue: item.minValue,
              maxValue: item.maxValue,
              expectedBoolean: item.expectedBoolean,
            }))}
            canManage={canManage && template.archivedAt === null}
          />
        </CardContent>
      </Card>

      <div className="flex max-w-prose flex-col gap-2 text-sm text-ink-muted">
        <p>
          A failed check must carry a note. That is enforced when a job is closed, not here —
          a report that records a red cross without saying what was wrong documents nothing.
        </p>
        <p>
          Changing these checks does not touch a report that has already been signed. Every
          completed run stores the label and kind of each check as it read on the day.
        </p>
      </div>
    </div>
  );
}
