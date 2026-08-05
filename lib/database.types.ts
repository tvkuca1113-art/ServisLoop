/**
 * Hand-written `Database` type for the supabase-js generics.
 *
 * This is the shape `supabase gen types typescript` would produce, written by hand and
 * derived column-for-column from `supabase/migrations/`. It is the type safety behind
 * every query in `SupabaseRepository`: a column renamed in a migration and not here
 * becomes a compile error rather than a runtime `undefined`.
 *
 * Conventions, so that regenerating this file later produces the same thing:
 *
 * - `Row`    — every column, exactly as PostgREST returns it. `date` and `timestamptz`
 *              are strings; `numeric` is a JSON number; `text[]` is `string[]`.
 * - `Insert` — a column is optional when it is nullable or has a database default, and
 *              required otherwise. That is what makes `.insert()` reject a row missing
 *              a NOT NULL column with no default.
 * - `Update` — everything optional.
 * - `Relationships` — the real foreign keys. postgrest-js reads these to type embedded
 *              selects (`select('*, location:locations(*)')`), and infers nullability
 *              from the referencing column, so they must stay accurate.
 *
 * `__InternalSupabase.PostgrestVersion` is deliberately absent: it only switches on
 * PostgREST-13-specific typings, and this file should not assert a server version it
 * cannot verify.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/* ------------------------------------------------------------------ */
/* Enumerated types — 0002_core_tables.sql                             */
/*                                                                     */
/* Each mirrors a frozen tuple in `src/domain/types.ts` label for       */
/* label. Adding a value in one place without the other is what the    */
/* migration header warns about.                                       */
/* ------------------------------------------------------------------ */

type UserRole = 'owner' | 'admin' | 'technician' | 'viewer';
type DeviceStatus = 'active' | 'paused' | 'retired';
type WorkOrderStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
type WorkOrderKind = 'scheduled' | 'issue' | 'booking';
type Priority = 'low' | 'normal' | 'high' | 'urgent';
type BookingStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled';
type IssueStatus = 'open' | 'triaged' | 'converted' | 'closed';
type IssueSeverity = 'low' | 'normal' | 'high' | 'critical';
type ReminderStatus = 'pending' | 'sent' | 'skipped' | 'failed';
type ReminderStage = 'T_30' | 'T_7' | 'T_0' | 'OVERDUE';
type ChecklistItemKind = 'boolean' | 'number' | 'text' | 'select';
type IntervalAnchor = 'completion' | 'schedule';

export type Database = {
  public: {
    Tables: {
      /* -- organisations, people, access ---------------------------- */

      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          timezone: string;
          reminder_lead_days: number;
          default_interval_anchor: IntervalAnchor;
          slot_minutes: number;
          booking_lead_hours: number;
          booking_horizon_days: number;
          is_demo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          timezone?: string;
          reminder_lead_days?: number;
          default_interval_anchor?: IntervalAnchor;
          slot_minutes?: number;
          booking_lead_hours?: number;
          booking_horizon_days?: number;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          timezone?: string;
          reminder_lead_days?: number;
          default_interval_anchor?: IntervalAnchor;
          slot_minutes?: number;
          booking_lead_hours?: number;
          booking_horizon_days?: number;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      /**
       * The `id` foreign key points at `auth.users`, which is outside the exposed
       * schema, so it has no entry here — PostgREST cannot embed across it either.
       */
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      memberships: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          role: UserRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id: string;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          user_id?: string;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'memberships_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'memberships_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      /* -- directory ------------------------------------------------ */

      customers: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          contact_name: string | null;
          email: string | null;
          phone: string | null;
          external_ref: string | null;
          notes: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          contact_name?: string | null;
          email?: string | null;
          phone?: string | null;
          external_ref?: string | null;
          notes?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          contact_name?: string | null;
          email?: string | null;
          phone?: string | null;
          external_ref?: string | null;
          notes?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customers_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };

      locations: {
        Row: {
          id: string;
          org_id: string;
          customer_id: string;
          name: string;
          address_line: string | null;
          city: string | null;
          postal_code: string | null;
          country: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          customer_id: string;
          name: string;
          address_line?: string | null;
          city?: string | null;
          postal_code?: string | null;
          country?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          customer_id?: string;
          name?: string;
          address_line?: string | null;
          city?: string | null;
          postal_code?: string | null;
          country?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'locations_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'locations_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };

      device_types: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          default_interval_days: number;
          checklist_template_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          default_interval_days?: number;
          checklist_template_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          default_interval_days?: number;
          checklist_template_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'device_types_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'device_types_checklist_template_id_fkey';
            columns: ['checklist_template_id'];
            isOneToOne: false;
            referencedRelation: 'checklist_templates';
            referencedColumns: ['id'];
          },
        ];
      };

      devices: {
        Row: {
          id: string;
          org_id: string;
          location_id: string;
          device_type_id: string | null;
          name: string;
          manufacturer: string | null;
          model: string | null;
          serial_number: string | null;
          installed_on: string | null;
          service_interval_days: number | null;
          interval_anchor: IntervalAnchor | null;
          last_service_at: string | null;
          next_service_due: string | null;
          status: DeviceStatus;
          public_token: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          location_id: string;
          device_type_id?: string | null;
          name: string;
          manufacturer?: string | null;
          model?: string | null;
          serial_number?: string | null;
          installed_on?: string | null;
          service_interval_days?: number | null;
          interval_anchor?: IntervalAnchor | null;
          last_service_at?: string | null;
          next_service_due?: string | null;
          status?: DeviceStatus;
          public_token: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          location_id?: string;
          device_type_id?: string | null;
          name?: string;
          manufacturer?: string | null;
          model?: string | null;
          serial_number?: string | null;
          installed_on?: string | null;
          service_interval_days?: number | null;
          interval_anchor?: IntervalAnchor | null;
          last_service_at?: string | null;
          next_service_due?: string | null;
          status?: DeviceStatus;
          public_token?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'devices_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'devices_location_id_fkey';
            columns: ['location_id'];
            isOneToOne: false;
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'devices_device_type_id_fkey';
            columns: ['device_type_id'];
            isOneToOne: false;
            referencedRelation: 'device_types';
            referencedColumns: ['id'];
          },
        ];
      };

      /* -- checklists ----------------------------------------------- */

      checklist_templates: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          version: number;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          version?: number;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          version?: number;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'checklist_templates_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };

      checklist_items: {
        Row: {
          id: string;
          org_id: string;
          template_id: string;
          position: number;
          label: string;
          kind: ChecklistItemKind;
          required: boolean;
          options: string[] | null;
          unit: string | null;
          min_value: number | null;
          max_value: number | null;
          expected_boolean: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          template_id: string;
          position: number;
          label: string;
          kind: ChecklistItemKind;
          required?: boolean;
          options?: string[] | null;
          unit?: string | null;
          min_value?: number | null;
          max_value?: number | null;
          expected_boolean?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          template_id?: string;
          position?: number;
          label?: string;
          kind?: ChecklistItemKind;
          required?: boolean;
          options?: string[] | null;
          unit?: string | null;
          min_value?: number | null;
          max_value?: number | null;
          expected_boolean?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'checklist_items_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'checklist_items_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'checklist_templates';
            referencedColumns: ['id'];
          },
        ];
      };

      work_order_checklist_results: {
        Row: {
          id: string;
          org_id: string;
          work_order_id: string;
          item_id: string;
          label_snapshot: string;
          kind_snapshot: ChecklistItemKind;
          position: number;
          value_bool: boolean | null;
          value_num: number | null;
          value_text: string | null;
          passed: boolean;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          work_order_id: string;
          item_id: string;
          label_snapshot: string;
          kind_snapshot: ChecklistItemKind;
          position: number;
          value_bool?: boolean | null;
          value_num?: number | null;
          value_text?: string | null;
          passed?: boolean;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          work_order_id?: string;
          item_id?: string;
          label_snapshot?: string;
          kind_snapshot?: ChecklistItemKind;
          position?: number;
          value_bool?: boolean | null;
          value_num?: number | null;
          value_text?: string | null;
          passed?: boolean;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'work_order_checklist_results_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_order_checklist_results_work_order_id_fkey';
            columns: ['work_order_id'];
            isOneToOne: false;
            referencedRelation: 'work_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_order_checklist_results_item_id_fkey';
            columns: ['item_id'];
            isOneToOne: false;
            referencedRelation: 'checklist_items';
            referencedColumns: ['id'];
          },
        ];
      };

      /* -- work orders ---------------------------------------------- */

      work_orders: {
        Row: {
          id: string;
          org_id: string;
          code: string;
          device_id: string;
          location_id: string;
          customer_id: string;
          kind: WorkOrderKind;
          status: WorkOrderStatus;
          priority: Priority;
          scheduled_for: string | null;
          scheduled_minutes: number | null;
          assigned_to: string | null;
          checklist_template_id: string | null;
          source_booking_id: string | null;
          source_issue_id: string | null;
          summary: string | null;
          internal_notes: string | null;
          opened_at: string;
          started_at: string | null;
          completed_at: string | null;
          completed_on: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          code: string;
          device_id: string;
          location_id: string;
          customer_id: string;
          kind: WorkOrderKind;
          status?: WorkOrderStatus;
          priority?: Priority;
          scheduled_for?: string | null;
          scheduled_minutes?: number | null;
          assigned_to?: string | null;
          checklist_template_id?: string | null;
          source_booking_id?: string | null;
          source_issue_id?: string | null;
          summary?: string | null;
          internal_notes?: string | null;
          opened_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          completed_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          code?: string;
          device_id?: string;
          location_id?: string;
          customer_id?: string;
          kind?: WorkOrderKind;
          status?: WorkOrderStatus;
          priority?: Priority;
          scheduled_for?: string | null;
          scheduled_minutes?: number | null;
          assigned_to?: string | null;
          checklist_template_id?: string | null;
          source_booking_id?: string | null;
          source_issue_id?: string | null;
          summary?: string | null;
          internal_notes?: string | null;
          opened_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          completed_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'work_orders_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_orders_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_orders_location_id_fkey';
            columns: ['location_id'];
            isOneToOne: false;
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_orders_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_orders_assigned_to_fkey';
            columns: ['assigned_to'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_orders_checklist_template_id_fkey';
            columns: ['checklist_template_id'];
            isOneToOne: false;
            referencedRelation: 'checklist_templates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_orders_source_booking_id_fkey';
            columns: ['source_booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_orders_source_issue_id_fkey';
            columns: ['source_issue_id'];
            isOneToOne: false;
            referencedRelation: 'issues';
            referencedColumns: ['id'];
          },
        ];
      };

      work_order_counters: {
        Row: {
          org_id: string;
          year: number;
          last_value: number;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          year: number;
          last_value?: number;
          updated_at?: string;
        };
        Update: {
          org_id?: string;
          year?: number;
          last_value?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'work_order_counters_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };

      /* -- customer intake ------------------------------------------ */

      bookings: {
        Row: {
          id: string;
          org_id: string;
          device_id: string;
          requested_date: string;
          requested_start_minute: number;
          requested_end_minute: number;
          status: BookingStatus;
          contact_name: string;
          contact_email: string | null;
          contact_phone: string | null;
          note: string | null;
          work_order_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          device_id: string;
          requested_date: string;
          requested_start_minute: number;
          requested_end_minute: number;
          status?: BookingStatus;
          contact_name: string;
          contact_email?: string | null;
          contact_phone?: string | null;
          note?: string | null;
          work_order_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          device_id?: string;
          requested_date?: string;
          requested_start_minute?: number;
          requested_end_minute?: number;
          status?: BookingStatus;
          contact_name?: string;
          contact_email?: string | null;
          contact_phone?: string | null;
          note?: string | null;
          work_order_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bookings_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_work_order_id_fkey';
            columns: ['work_order_id'];
            isOneToOne: false;
            referencedRelation: 'work_orders';
            referencedColumns: ['id'];
          },
        ];
      };

      issues: {
        Row: {
          id: string;
          org_id: string;
          device_id: string;
          severity: IssueSeverity;
          title: string;
          description: string | null;
          reporter_name: string | null;
          reporter_email: string | null;
          reporter_phone: string | null;
          status: IssueStatus;
          work_order_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          device_id: string;
          severity?: IssueSeverity;
          title: string;
          description?: string | null;
          reporter_name?: string | null;
          reporter_email?: string | null;
          reporter_phone?: string | null;
          status?: IssueStatus;
          work_order_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          device_id?: string;
          severity?: IssueSeverity;
          title?: string;
          description?: string | null;
          reporter_name?: string | null;
          reporter_email?: string | null;
          reporter_phone?: string | null;
          status?: IssueStatus;
          work_order_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'issues_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'issues_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'issues_work_order_id_fkey';
            columns: ['work_order_id'];
            isOneToOne: false;
            referencedRelation: 'work_orders';
            referencedColumns: ['id'];
          },
        ];
      };

      /* -- reminders, reports, scheduling, audit --------------------- */

      reminders: {
        Row: {
          id: string;
          org_id: string;
          device_id: string;
          due_date: string;
          stage: ReminderStage;
          scheduled_for: string;
          status: ReminderStatus;
          sent_at: string | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          device_id: string;
          due_date: string;
          stage: ReminderStage;
          scheduled_for: string;
          status?: ReminderStatus;
          sent_at?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          device_id?: string;
          due_date?: string;
          stage?: ReminderStage;
          scheduled_for?: string;
          status?: ReminderStatus;
          sent_at?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reminders_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reminders_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
        ];
      };

      service_reports: {
        Row: {
          id: string;
          org_id: string;
          work_order_id: string;
          number: string;
          generated_at: string;
          signed_by_name: string | null;
          total_minutes: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          work_order_id: string;
          number: string;
          generated_at?: string;
          signed_by_name?: string | null;
          total_minutes?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          work_order_id?: string;
          number?: string;
          generated_at?: string;
          signed_by_name?: string | null;
          total_minutes?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_reports_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_reports_work_order_id_fkey';
            columns: ['work_order_id'];
            isOneToOne: false;
            referencedRelation: 'work_orders';
            referencedColumns: ['id'];
          },
        ];
      };

      business_hours: {
        Row: {
          id: string;
          org_id: string;
          weekday: number;
          is_open: boolean;
          open_minute: number;
          close_minute: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          weekday: number;
          is_open?: boolean;
          open_minute?: number;
          close_minute?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          weekday?: number;
          is_open?: boolean;
          open_minute?: number;
          close_minute?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'business_hours_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };

      blackout_dates: {
        Row: {
          id: string;
          org_id: string;
          date: string;
          reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          date: string;
          reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          date?: string;
          reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blackout_dates_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };

      /** Append-only: no `updated_at`, and no write policy for any API role. */
      audit_log: {
        Row: {
          id: string;
          org_id: string;
          actor_id: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          meta: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          actor_id?: string | null;
          action: string;
          entity: string;
          entity_id?: string | null;
          meta?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          actor_id?: string | null;
          action?: string;
          entity?: string;
          entity_id?: string | null;
          meta?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_log_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_log_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };

    Views: {
      [_ in never]: never;
    };

    Functions: {
      /** 0005 — the RLS helpers. Exposed to `authenticated`, so they are callable. */
      auth_user_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      role_rank: {
        Args: { p_role: UserRole };
        Returns: number;
      };
      is_org_member: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
      org_role: {
        Args: { p_org_id: string };
        Returns: UserRole;
      };
      has_role_at_least: {
        Args: { p_org_id: string; p_min: UserRole };
        Returns: boolean;
      };
      is_assigned_technician: {
        Args: { p_work_order_id: string };
        Returns: boolean;
      };
      org_has_members: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
      shares_org_with: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      /**
       * 0003 — allocates and returns the *formatted* code (`WO-2026-0042`), not the
       * bare sequence. `SupabaseRepository.nextWorkOrderSequence` parses it back.
       */
      next_work_order_code: {
        Args: { p_org_id: string; p_year: number };
        Returns: string;
      };
    };

    Enums: {
      user_role: UserRole;
      device_status: DeviceStatus;
      work_order_status: WorkOrderStatus;
      work_order_kind: WorkOrderKind;
      priority: Priority;
      booking_status: BookingStatus;
      issue_status: IssueStatus;
      issue_severity: IssueSeverity;
      reminder_status: ReminderStatus;
      reminder_stage: ReminderStage;
      checklist_item_kind: ChecklistItemKind;
      interval_anchor: IntervalAnchor;
    };

    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

/* ------------------------------------------------------------------ */
/* Convenience aliases, matching the generated-types conventions       */
/* ------------------------------------------------------------------ */

export type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];
