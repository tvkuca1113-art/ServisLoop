'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { validateTemplateItems } from '@/domain/checklist';
import { CHECKLIST_ITEM_KINDS, type ChecklistItem, type UUID } from '@/domain/types';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';

import { guard } from './errors';
import { fail, ok, type ActionResult } from './result';

/**
 * Checklist template actions.
 *
 * A template is the shape of the evidence behind every service report, so all three
 * actions are gated on `checklist:manage` — a technician runs checklists, they do not
 * redefine them mid-job.
 *
 * The rules for what makes a template valid live in `validateTemplateItems` in the domain
 * layer, and are asked *before* anything is written: a select with no options or two items
 * fighting over the same position would produce a checklist a technician cannot complete,
 * and the first anybody would hear of it is a job that will not close.
 *
 * Templates are versioned rather than rewritten in place (PLAN.md R10). Editing items is
 * therefore safe for history: every recorded result carries its own label and kind
 * snapshot, so a template changed today cannot alter a report signed last year.
 */

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

const createSchema = z.object({
  name: z.string().trim().min(2, 'Give the checklist a name.').max(160),
  version: z.coerce
    .number()
    .int('Use a whole number.')
    .min(1, 'Versions start at 1.')
    .max(999, 'That is a lot of versions.')
    .optional(),
});

export async function createTemplate(formData: FormData): Promise<ActionResult<{ id: UUID }>> {
  return guard('Could not create that checklist.', async () => {
    const session = await requirePermission('checklist:manage');

    const rawVersion = text(formData, 'version');
    const parsed = createSchema.safeParse({
      name: text(formData, 'name'),
      ...(rawVersion === '' ? {} : { version: rawVersion }),
    });
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const orgId = session.organization.id;

    const existing = await repo.listChecklistTemplates(orgId);
    const version = parsed.data.version ?? 1;
    if (
      existing.some(
        (t) => t.name.toLowerCase() === parsed.data.name.toLowerCase() && t.version === version,
      )
    ) {
      return fail(`“${parsed.data.name}” version ${version} already exists.`, {
        name: ['Use a different name, or bump the version.'],
      });
    }

    const template = await repo.createChecklistTemplate({
      orgId,
      name: parsed.data.name,
      version,
      archivedAt: null,
    });

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'checklist.create',
      entity: 'checklist_template',
      entityId: template.id,
      meta: { name: template.name, version: template.version },
    });

    revalidatePath('/app/checklists');

    return ok({ id: template.id }, `“${template.name}” created. Add its checks next.`);
  });
}

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

/**
 * The item payload.
 *
 * Sent as JSON rather than as flat form fields because the editor adds, removes and
 * reorders rows client-side: encoding a variable-length ordered list in `name` attributes
 * means reindexing every field on every drag, and one missed rename silently drops a
 * check from the template.
 */
const itemSchema = z.object({
  label: z.string().trim().min(1, 'Every check needs a label.').max(200),
  kind: z.enum(CHECKLIST_ITEM_KINDS),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(80)).max(20).nullable(),
  unit: z.string().trim().max(24).nullable(),
  minValue: z.number().finite().nullable(),
  maxValue: z.number().finite().nullable(),
  expectedBoolean: z.boolean().nullable(),
});

const itemsSchema = z.object({
  templateId: z.uuid('Pick a checklist.'),
  items: z.array(itemSchema).max(200, 'A checklist longer than 200 checks is not a checklist.'),
});

/**
 * Replace a template's items wholesale.
 *
 * Whole-list replacement rather than per-item patches, because position is a property of
 * the list: a reorder is a change to every row at once, and applying it as a sequence of
 * individual updates would pass through states where two checks share a position.
 */
export async function saveTemplateItems(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not save those checks.', async () => {
    const session = await requirePermission('checklist:manage');

    let payload: unknown;
    try {
      payload = JSON.parse(text(formData, 'items') || '[]');
    } catch {
      return fail('The checklist could not be read. Reload the page and try again.');
    }

    const parsed = itemsSchema.safeParse({
      templateId: text(formData, 'templateId'),
      items: payload,
    });
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const orgId = session.organization.id;

    const template = await repo.getChecklistTemplate(orgId, parsed.data.templateId);
    if (!template) return fail('That checklist no longer exists.');
    if (template.archivedAt) {
      return fail('That checklist is archived. Restore it before editing its checks.');
    }

    // Position is assigned from the submitted order, so the list the person sees is the
    // list that gets stored — the client never sends a position to be trusted.
    const items: ChecklistItem[] = parsed.data.items.map((item, index) => ({
      // The repository assigns real ids on insert; these are placeholders so the domain
      // validator can name the offending row back to the editor.
      id: `item-${index}`,
      orgId,
      templateId: template.id,
      position: index + 1,
      label: item.label,
      kind: item.kind,
      required: item.required,
      options: item.kind === 'select' ? (item.options ?? []) : null,
      unit: item.kind === 'number' ? item.unit : null,
      minValue: item.kind === 'number' ? item.minValue : null,
      maxValue: item.kind === 'number' ? item.maxValue : null,
      expectedBoolean: item.kind === 'boolean' ? (item.expectedBoolean ?? true) : null,
    }));

    // The domain decides what a usable template is — not this action.
    const problems = validateTemplateItems(items);
    if (problems.length > 0) {
      const fieldErrors: Record<string, string[]> = {};
      for (const problem of problems) {
        const existing = fieldErrors[problem.itemId];
        if (existing) existing.push(problem.message);
        else fieldErrors[problem.itemId] = [problem.message];
      }
      return fail(
        problems.length === 1
          ? (problems[0]?.message ?? 'One check is not valid.')
          : `${problems.length} checks need attention before this can be saved.`,
        fieldErrors,
      );
    }

    await repo.replaceChecklistItems(
      orgId,
      template.id,
      items.map(({ id: _id, ...rest }) => rest),
    );

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'checklist.save_items',
      entity: 'checklist_template',
      entityId: template.id,
      meta: { name: template.name, items: items.length },
    });

    revalidatePath('/app/checklists');
    revalidatePath(`/app/checklists/${template.id}`);

    return ok(
      null,
      items.length === 0
        ? `“${template.name}” has no checks. Jobs using it will close without a checklist.`
        : `${items.length} ${items.length === 1 ? 'check' : 'checks'} saved to “${template.name}”.`,
    );
  });
}

/* ------------------------------------------------------------------ */
/* Archive                                                            */
/* ------------------------------------------------------------------ */

const archiveSchema = z.object({ id: z.uuid('Pick a checklist.') });

/**
 * Retire a template.
 *
 * A soft delete on purpose. Work orders reference the template they were opened with, and
 * every completed run holds snapshots of the checks as they read on the day — deleting the
 * row would break the first and prove nothing about the second. Archiving takes it out of
 * the pickers and leaves the history intact.
 */
export async function archiveTemplate(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not archive that checklist.', async () => {
    const session = await requirePermission('checklist:manage');

    const parsed = archiveSchema.safeParse({ id: text(formData, 'id') });
    if (!parsed.success) return fail('Pick a checklist to archive.');

    const repo = getRepository();
    const orgId = session.organization.id;

    const template = await repo.getChecklistTemplate(orgId, parsed.data.id);
    if (!template) return fail('That checklist no longer exists.');
    if (template.archivedAt) return ok(null, `“${template.name}” is already archived.`);

    await repo.updateChecklistTemplate(orgId, template.id, {
      archivedAt: new Date().toISOString(),
    });

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'checklist.archive',
      entity: 'checklist_template',
      entityId: template.id,
      meta: { name: template.name, version: template.version },
    });

    revalidatePath('/app/checklists');
    revalidatePath(`/app/checklists/${template.id}`);

    return ok(
      null,
      `“${template.name}” archived. Jobs already using it keep it; new device types cannot pick it.`,
    );
  });
}
