'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useState } from 'react';

import { FieldError, FormAlert, SubmitButton } from '@/components/app/forms/form-feedback';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  useToast,
} from '@/components/ui';
import { CHECKLIST_ITEM_KINDS, type ChecklistItemKind } from '@/domain/types';
import { cn } from '@/lib/utils';
import { archiveTemplate, createTemplate, saveTemplateItems } from '@/server/actions/checklists';
import { fieldError, type ActionResult } from '@/server/actions/result';

/**
 * The checklist template editor.
 *
 * A template is the shape of the evidence behind every service report, so this screen is
 * built around one idea: **what you see is the order a technician will be asked in.**
 * Position is never typed — it is the position in the list, and the up/down controls move
 * a check within it. The server then assigns `position` from the submitted order, so the
 * list on screen and the list in the database cannot disagree.
 *
 * The whole list is submitted as one JSON field rather than as flat form inputs. Encoding
 * a variable-length, reorderable list in `name` attributes means reindexing every field on
 * every move, and one missed rename silently drops a check from the template — the sort of
 * bug that is only discovered when a technician cannot close a job.
 *
 * Validation is the domain's: `validateTemplateItems` runs server-side before anything is
 * written, and its messages come back keyed to the row they belong to.
 */

const KIND_COPY: Readonly<Record<ChecklistItemKind, { label: string; detail: string }>> =
  Object.freeze({
    boolean: { label: 'Yes / no', detail: 'Pick which answer counts as a pass.' },
    number: { label: 'Measurement', detail: 'A reading, with a unit and an accepted range.' },
    select: { label: 'One of a list', detail: 'The technician picks from options you set.' },
    text: { label: 'Free text', detail: 'Anything typed counts as answered.' },
  });

export interface EditorItem {
  /** Client-side key only. The repository assigns real ids on save. */
  key: string;
  label: string;
  kind: ChecklistItemKind;
  required: boolean;
  options: string[];
  unit: string;
  minValue: string;
  maxValue: string;
  expectedBoolean: boolean;
}

export interface TemplateEditorItem {
  id: string;
  position: number;
  label: string;
  kind: ChecklistItemKind;
  required: boolean;
  options: string[] | null;
  unit: string | null;
  minValue: number | null;
  maxValue: number | null;
  expectedBoolean: boolean | null;
}

export interface TemplateEditorProps {
  templateId: string;
  templateName: string;
  items: readonly TemplateEditorItem[];
  canManage: boolean;
}

function toEditorItem(item: TemplateEditorItem): EditorItem {
  return {
    key: item.id,
    label: item.label,
    kind: item.kind,
    required: item.required,
    options: item.options ?? [],
    unit: item.unit ?? '',
    minValue: item.minValue === null ? '' : String(item.minValue),
    maxValue: item.maxValue === null ? '' : String(item.maxValue),
    expectedBoolean: item.expectedBoolean ?? true,
  };
}

function blankItem(index: number): EditorItem {
  return {
    key: `new-${index}-${Math.random().toString(36).slice(2, 8)}`,
    label: '',
    kind: 'boolean',
    required: true,
    options: [],
    unit: '',
    minValue: '',
    maxValue: '',
    expectedBoolean: true,
  };
}

/** `''` is "no bound", not zero — the difference matters to `evaluateItem`. */
function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function TemplateEditor({
  templateId,
  templateName,
  items,
  canManage,
}: TemplateEditorProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<EditorItem[]>(() =>
    [...items].sort((a, b) => a.position - b.position).map(toEditorItem),
  );

  const [result, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    async (_previous, formData) => saveTemplateItems(formData),
    null,
  );

  useEffect(() => {
    if (!result?.ok) return;
    toast({ title: result.message ?? 'Checklist saved.', variant: 'success' });
  }, [result, toast]);

  const update = (key: string, patch: Partial<EditorItem>): void => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const move = (index: number, direction: -1 | 1): void => {
    setRows((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const a = next[index];
      const b = next[target];
      if (!a || !b) return current;
      next[index] = b;
      next[target] = a;
      return next;
    });
  };

  const remove = (key: string): void => {
    setRows((current) => current.filter((row) => row.key !== key));
  };

  // The payload the server validates. Position is implied by array order, so it is not
  // sent — the server assigns it, and cannot be lied to about it.
  const payload = JSON.stringify(
    rows.map((row) => ({
      label: row.label,
      kind: row.kind,
      required: row.required,
      options: row.kind === 'select' ? row.options.filter((o) => o.trim() !== '') : null,
      unit: row.kind === 'number' && row.unit.trim() !== '' ? row.unit.trim() : null,
      minValue: row.kind === 'number' ? numberOrNull(row.minValue) : null,
      maxValue: row.kind === 'number' ? numberOrNull(row.maxValue) : null,
      expectedBoolean: row.kind === 'boolean' ? row.expectedBoolean : null,
    })),
  );

  if (!canManage) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">
          Your role can run this checklist but not change it. Ask an owner or administrator.
        </p>
        <ReadOnlyList items={rows} />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="items" value={payload} />

      <FormAlert result={result} />

      {rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-base bg-surface-muted px-4 py-8 text-center text-sm text-ink-muted">
          No checks yet. A job running this template will close without recording anything.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <ItemRow
              key={row.key}
              row={row}
              index={index}
              total={rows.length}
              // Errors come back keyed by the placeholder id the server built from the
              // submitted order, so a message lands on the row it is about.
              error={fieldError(result, `item-${index}`)}
              onChange={(patch) => {
                update(row.key, patch);
              }}
              onMove={(direction) => {
                move(index, direction);
              }}
              onRemove={() => {
                remove(row.key);
              }}
            />
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setRows((current) => [...current, blankItem(current.length)]);
          }}
        >
          <Plus aria-hidden="true" />
          Add a check
        </Button>

        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-muted">
            {rows.length} {rows.length === 1 ? 'check' : 'checks'} in “{templateName}”
          </span>
          <SubmitButton pending={pending} pendingLabel="Saving…">
            Save checklist
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

function ReadOnlyList({ items }: { items: readonly EditorItem[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {items.map((item, index) => (
        <li
          key={item.key}
          className="flex items-center justify-between gap-3 rounded-card border border-border-base bg-surface-raised px-4 py-3"
        >
          <span className="text-sm text-ink">
            <span className="mr-2 text-ink-subtle tabular-nums">{index + 1}.</span>
            {item.label}
          </span>
          <Badge variant="neutral">{KIND_COPY[item.kind].label}</Badge>
        </li>
      ))}
    </ol>
  );
}

function ItemRow({
  row,
  index,
  total,
  error,
  onChange,
  onMove,
  onRemove,
}: {
  row: EditorItem;
  index: number;
  total: number;
  error: string | undefined;
  onChange: (patch: Partial<EditorItem>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const labelId = useId();
  const kindId = useId();
  const unitId = useId();
  const minId = useId();
  const maxId = useId();
  const optionsId = useId();
  const errorId = `${labelId}-error`;

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-card border p-4',
        error ? 'border-state-overdue bg-state-overdue/5' : 'border-border-base bg-surface-raised',
      )}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor={labelId} required>
            <span className="text-ink-subtle tabular-nums">{index + 1}.</span> Check
          </Label>
          <Input
            id={labelId}
            value={row.label}
            maxLength={200}
            placeholder="Flue and combustion gases visually inspected"
            onChange={(event) => {
              onChange({ label: event.target.value });
            }}
            aria-invalid={error !== undefined}
            aria-describedby={errorId}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={kindId}>Answer</Label>
          <Select
            value={row.kind}
            onValueChange={(value) => {
              onChange({ kind: value as ChecklistItemKind });
            }}
          >
            <SelectTrigger id={kindId} className="min-w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHECKLIST_ITEM_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {KIND_COPY[kind].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pb-2">
          <Switch
            id={`${labelId}-required`}
            checked={row.required}
            onCheckedChange={(checked) => {
              onChange({ required: checked });
            }}
          />
          <Label htmlFor={`${labelId}-required`}>Required</Label>
        </div>

        <div className="flex items-center gap-1 pb-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={index === 0}
            onClick={() => {
              onMove(-1);
            }}
          >
            <ArrowUp aria-hidden="true" />
            <span className="sr-only">Move “{row.label || 'this check'}” up</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={index === total - 1}
            onClick={() => {
              onMove(1);
            }}
          >
            <ArrowDown aria-hidden="true" />
            <span className="sr-only">Move “{row.label || 'this check'}” down</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-state-overdue"
            onClick={onRemove}
          >
            <Trash2 aria-hidden="true" />
            <span className="sr-only">Remove “{row.label || 'this check'}”</span>
          </Button>
        </div>
      </div>

      {row.kind === 'boolean' ? (
        <div className="flex items-center gap-2">
          <Switch
            id={`${labelId}-expected`}
            checked={row.expectedBoolean}
            onCheckedChange={(checked) => {
              onChange({ expectedBoolean: checked });
            }}
          />
          <Label htmlFor={`${labelId}-expected`}>
            “{row.expectedBoolean ? 'Yes' : 'No'}” is the pass
          </Label>
          <span className="text-xs text-ink-subtle">
            Turn it off for a check like “gas leak detected”, where No is what you want.
          </span>
        </div>
      ) : null}

      {row.kind === 'number' ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={unitId}>Unit</Label>
            <Input
              id={unitId}
              value={row.unit}
              maxLength={24}
              placeholder="bar"
              onChange={(event) => {
                onChange({ unit: event.target.value });
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={minId}>Minimum</Label>
            <Input
              id={minId}
              type="number"
              inputMode="decimal"
              step="any"
              value={row.minValue}
              placeholder="No minimum"
              onChange={(event) => {
                onChange({ minValue: event.target.value });
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={maxId}>Maximum</Label>
            <Input
              id={maxId}
              type="number"
              inputMode="decimal"
              step="any"
              value={row.maxValue}
              placeholder="No maximum"
              onChange={(event) => {
                onChange({ maxValue: event.target.value });
              }}
            />
          </div>
          <p className="text-xs text-ink-subtle sm:col-span-3">
            A reading outside the range is recorded as a failed check — and the technician
            must then explain it. Leave a bound blank for no limit on that side.
          </p>
        </div>
      ) : null}

      {row.kind === 'select' ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={optionsId}>Options</Label>
          <Input
            id={optionsId}
            value={row.options.join(', ')}
            placeholder="good, worn, replace"
            onChange={(event) => {
              onChange({
                options: event.target.value
                  .split(',')
                  .map((option) => option.trim())
                  .filter((option) => option !== ''),
              });
            }}
          />
          <p className="text-xs text-ink-subtle">
            Comma-separated. Answering with anything on the list counts as a pass.
          </p>
        </div>
      ) : (
        <p className="text-xs text-ink-subtle">{KIND_COPY[row.kind].detail}</p>
      )}

      <FieldError id={errorId} message={error} />
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export function CreateTemplateDialog() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const nameId = useId();
  const versionId = useId();

  const [result, formAction, pending] = useActionState<
    ActionResult<{ id: string }> | null,
    FormData
  >(async (_previous, formData) => createTemplate(formData), null);

  useEffect(() => {
    if (!result?.ok) return;
    toast({ title: result.message ?? 'Checklist created.', variant: 'success' });
    setOpen(false);
    router.push(`/app/checklists/${result.data.id}`);
  }, [result, toast, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        <Plus aria-hidden="true" />
        New checklist
      </Button>

      <DialogContent
        title="New checklist"
        description="Name it after the work, not the machine — “Annual gas boiler service” rather than “Boiler”. Device types point at a checklist, and every job of that type runs it."
      >
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          <FormAlert result={result} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={nameId} required>
              Name
            </Label>
            <Input
              id={nameId}
              name="name"
              required
              maxLength={160}
              placeholder="Annual gas boiler service"
              aria-invalid={fieldError(result, 'name') !== undefined}
              aria-describedby={`${nameId}-error`}
            />
            <FieldError id={`${nameId}-error`} message={fieldError(result, 'name')} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={versionId}>Version</Label>
            <Input
              id={versionId}
              name="version"
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              defaultValue={1}
              aria-invalid={fieldError(result, 'version') !== undefined}
              aria-describedby={`${versionId}-error`}
            />
            <FieldError id={`${versionId}-error`} message={fieldError(result, 'version')} />
            <p className="text-xs text-ink-subtle">
              When the rules change, add a new version rather than editing the old one — the
              reports it produced stay readable exactly as they were signed.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton pending={pending} pendingLabel="Creating…">
              Create
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Archive                                                             */
/* ------------------------------------------------------------------ */

export function ArchiveTemplateButton({
  templateId,
  templateName,
  inUseCount,
}: {
  templateId: string;
  templateName: string;
  /** Device types pointing at this template. */
  inUseCount: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const [result, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    async (_previous, formData) => archiveTemplate(formData),
    null,
  );

  useEffect(() => {
    if (!result?.ok) return;
    toast({ title: result.message ?? 'Checklist archived.', variant: 'default' });
    setOpen(false);
    router.push('/app/checklists');
  }, [result, toast, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        className="text-state-overdue"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Trash2 aria-hidden="true" />
        Archive
      </Button>

      <DialogContent
        title={`Archive “${templateName}”?`}
        description={
          inUseCount > 0
            ? `${inUseCount} device ${inUseCount === 1 ? 'type points' : 'types point'} at this checklist. Jobs already open keep it; new ones will have no checklist until those types are pointed somewhere else.`
            : 'It disappears from the pickers. Nothing that has already used it changes — every completed run keeps its own snapshot of the checks.'
        }
      >
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={templateId} />

          <FormAlert result={result} />

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
              }}
              disabled={pending}
            >
              Keep it
            </Button>
            <SubmitButton pending={pending} pendingLabel="Archiving…" variant="destructive">
              Archive
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
