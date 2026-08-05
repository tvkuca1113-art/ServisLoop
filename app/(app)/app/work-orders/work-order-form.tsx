'use client';

import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useState } from 'react';

import { FieldError, FormAlert, SubmitButton } from '@/components/app/forms/form-feedback';
import {
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
  Textarea,
  useToast,
  type ButtonProps,
} from '@/components/ui';
import { ROLE_LABELS } from '@/domain/permissions';
import { KIND_LABELS, PRIORITY_LABELS } from '@/domain/work-order';
import {
  PRIORITIES,
  WORK_ORDER_KINDS,
  type Priority,
  type Role,
  type WorkOrderKind,
} from '@/domain/types';
import { createWorkOrder, updateWorkOrder } from '@/server/actions/work-orders';
import { fieldError, type ActionResult } from '@/server/actions/result';

/**
 * Open a job, or edit a live one.
 *
 * The device is the only thing this form really asks for. Everything else about a job —
 * which site it is at, which customer it belongs to, which checklist it runs — is derived
 * from the device on the server, so there is no way to file a job against the wrong
 * customer by picking the wrong option here.
 *
 * The date field carries more weight than it looks: putting a date on a draft is what
 * schedules it. That is a real status transition and goes through the machine, not a
 * field write — which is why the form says so plainly rather than hiding it.
 */

/** Radix forbids an empty `SelectItem` value, so "nobody" needs a sentinel. */
const UNASSIGNED = 'unassigned';

export interface WorkOrderDeviceOption {
  id: string;
  name: string;
  customerName: string;
  locationName: string;
  serialNumber: string | null;
}

export interface WorkOrderMemberOption {
  id: string;
  name: string;
  role: Role;
}

export interface WorkOrderFormValues {
  id: string;
  priority: Priority;
  scheduledDate: string;
  scheduledTime: string;
  scheduledMinutes: number | null;
  summary: string | null;
  internalNotes: string | null;
  /** A draft with no date; the form explains that saving a date schedules it. */
  isDraft: boolean;
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export interface NewWorkOrderFormProps {
  devices: readonly WorkOrderDeviceOption[];
  members: readonly WorkOrderMemberOption[];
  /** Pre-selected when arriving from a device page. */
  defaultDeviceId?: string;
  /** Today in the organisation's timezone. */
  today: string;
}

export function NewWorkOrderForm({
  devices,
  members,
  defaultDeviceId,
  today,
}: NewWorkOrderFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const deviceId = useId();
  const kindId = useId();
  const priorityId = useId();
  const dateId = useId();
  const timeId = useId();
  const assigneeId = useId();
  const summaryId = useId();

  const [assignee, setAssignee] = useState(UNASSIGNED);
  const [device, setDevice] = useState(defaultDeviceId ?? devices[0]?.id ?? '');
  const [scheduledDate, setScheduledDate] = useState('');

  const [result, formAction, pending] = useActionState<
    ActionResult<{ id: string }> | null,
    FormData
  >(async (_previous, formData) => createWorkOrder(formData), null);

  useEffect(() => {
    if (!result?.ok) return;
    toast({ title: result.message ?? 'Job opened.', variant: 'success' });
    router.push(`/app/work-orders/${result.data.id}`);
  }, [result, toast, router]);

  const selected = devices.find((d) => d.id === device);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {/* Sentinels never reach the server: "nobody" is submitted as an empty field. */}
      <input type="hidden" name="assignedTo" value={assignee === UNASSIGNED ? '' : assignee} />
      <input type="hidden" name="deviceId" value={device} />

      <FormAlert result={result} />

      <fieldset disabled={pending} className="flex flex-col gap-4 border-0 p-0">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={deviceId} required>
            Device
          </Label>
          <Select value={device} onValueChange={setDevice}>
            <SelectTrigger id={deviceId}>
              <SelectValue placeholder="Choose the equipment" />
            </SelectTrigger>
            <SelectContent>
              {devices.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name} · {option.customerName} — {option.locationName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id={`${deviceId}-error`} message={fieldError(result, 'deviceId')} />
          <p className="text-sm text-ink-muted">
            {selected
              ? `The site, the customer and the checklist all come from this device.${
                  selected.serialNumber ? ` Serial ${selected.serialNumber}.` : ''
                }`
              : 'The site, the customer and the checklist all come from the device.'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={kindId} required>
              Kind of job
            </Label>
            <Select name="kind" defaultValue="scheduled" required>
              <SelectTrigger id={kindId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORK_ORDER_KINDS.map((kind: WorkOrderKind) => (
                  <SelectItem key={kind} value={kind}>
                    {KIND_LABELS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={priorityId} required>
              Priority
            </Label>
            <Select name="priority" defaultValue="normal" required>
              <SelectTrigger id={priorityId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-ink-muted">Urgent jobs sort to the top of every board.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={dateId}>Scheduled date</Label>
            <Input
              id={dateId}
              name="scheduledDate"
              type="date"
              min={today}
              value={scheduledDate}
              onChange={(event) => {
                setScheduledDate(event.target.value);
              }}
              aria-invalid={fieldError(result, 'scheduledDate') !== undefined}
              aria-describedby={`${dateId}-error`}
            />
            <FieldError id={`${dateId}-error`} message={fieldError(result, 'scheduledDate')} />
            <p className="text-sm text-ink-muted">
              {scheduledDate === ''
                ? 'Leave it blank to open a draft you can schedule later.'
                : 'With a date, the job opens ready to work — status Scheduled.'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={timeId}>Start time</Label>
            <Input
              id={timeId}
              name="scheduledTime"
              type="time"
              defaultValue="08:00"
              disabled={scheduledDate === ''}
              aria-describedby={`${timeId}-error`}
            />
            <FieldError id={`${timeId}-error`} message={fieldError(result, 'scheduledTime')} />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={assigneeId}>Assign to</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger id={assigneeId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Nobody yet</SelectItem>
                {members.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name} · {ROLE_LABELS[member.role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id={`${assigneeId}-error`} message={fieldError(result, 'assignedTo')} />
            <p className="text-sm text-ink-muted">
              A job cannot be started until somebody owns it, but it can wait unassigned.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={summaryId}>Summary</Label>
            <Input
              id={summaryId}
              name="summary"
              maxLength={280}
              placeholder="Annual service. Customer reports knocking on cold start."
              aria-invalid={fieldError(result, 'summary') !== undefined}
              aria-describedby={`${summaryId}-error`}
            />
            <FieldError id={`${summaryId}-error`} message={fieldError(result, 'summary')} />
          </div>
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            router.push('/app/work-orders');
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        <SubmitButton pending={pending} pendingLabel="Opening…" disabled={device === ''}>
          Open the job
        </SubmitButton>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Edit                                                                */
/* ------------------------------------------------------------------ */

export interface EditWorkOrderFormProps {
  workOrder: WorkOrderFormValues;
  code: string;
  triggerLabel?: string;
  triggerVariant?: ButtonProps['variant'];
  triggerSize?: ButtonProps['size'];
}

export function EditWorkOrderForm({
  workOrder,
  code,
  triggerLabel,
  triggerVariant,
  triggerSize,
}: EditWorkOrderFormProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant={triggerVariant ?? 'secondary'}
        size={triggerSize}
        onClick={() => {
          setOpen(true);
        }}
      >
        <Pencil aria-hidden="true" />
        {triggerLabel ?? 'Edit job'}
      </Button>

      <DialogContent
        title={`Edit ${code}`}
        description={
          workOrder.isDraft
            ? 'This job is a draft. Giving it a date puts it on the calendar — that is a status change, not just a field.'
            : 'Change the schedule, the priority or the notes. Assignment and status have their own controls.'
        }
        className="max-w-xl"
      >
        <EditFields
          workOrder={workOrder}
          onClose={() => {
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditFields({
  workOrder,
  onClose,
}: {
  workOrder: WorkOrderFormValues;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const priorityId = useId();
  const dateId = useId();
  const timeId = useId();
  const minutesId = useId();
  const summaryId = useId();
  const notesId = useId();

  const [result, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    async (_previous, formData) => updateWorkOrder(formData),
    null,
  );

  useEffect(() => {
    if (!result?.ok) return;
    toast({ title: result.message ?? 'Job saved.', variant: 'success' });
    onClose();
  }, [result, toast, onClose]);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="id" value={workOrder.id} />

      <FormAlert result={result} />

      <fieldset disabled={pending} className="flex flex-col gap-4 border-0 p-0">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={priorityId} required>
              Priority
            </Label>
            <Select name="priority" defaultValue={workOrder.priority} required>
              <SelectTrigger id={priorityId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={dateId} required={!workOrder.isDraft}>
              Scheduled date
            </Label>
            <Input
              id={dateId}
              name="scheduledDate"
              type="date"
              defaultValue={workOrder.scheduledDate}
              aria-invalid={fieldError(result, 'scheduledDate') !== undefined}
              aria-describedby={`${dateId}-error`}
            />
            <FieldError id={`${dateId}-error`} message={fieldError(result, 'scheduledDate')} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={timeId}>Start time</Label>
            <Input
              id={timeId}
              name="scheduledTime"
              type="time"
              defaultValue={workOrder.scheduledTime || '08:00'}
              aria-describedby={`${timeId}-error`}
            />
            <FieldError id={`${timeId}-error`} message={fieldError(result, 'scheduledTime')} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={minutesId}>Expected duration (minutes)</Label>
            <Input
              id={minutesId}
              name="scheduledMinutes"
              type="number"
              inputMode="numeric"
              min={15}
              max={600}
              defaultValue={workOrder.scheduledMinutes ?? ''}
              aria-invalid={fieldError(result, 'scheduledMinutes') !== undefined}
              aria-describedby={`${minutesId}-error`}
            />
            <FieldError
              id={`${minutesId}-error`}
              message={fieldError(result, 'scheduledMinutes')}
            />
            <p className="text-sm text-ink-muted">Blocks the slot against customer bookings.</p>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={summaryId}>Summary</Label>
            <Input
              id={summaryId}
              name="summary"
              defaultValue={workOrder.summary ?? ''}
              maxLength={280}
              aria-invalid={fieldError(result, 'summary') !== undefined}
              aria-describedby={`${summaryId}-error`}
            />
            <FieldError id={`${summaryId}-error`} message={fieldError(result, 'summary')} />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={notesId}>Internal notes</Label>
            <Textarea
              id={notesId}
              name="internalNotes"
              defaultValue={workOrder.internalNotes ?? ''}
              rows={3}
              maxLength={4000}
              placeholder="Gate code, who holds the plant-room key, parts to bring."
            />
            <p className="text-sm text-ink-muted">
              Never shown to the customer and never printed on the report.
            </p>
          </div>
        </div>
      </fieldset>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save changes
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}
