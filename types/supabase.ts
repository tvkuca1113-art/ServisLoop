/* eslint-disable */
/**
 * GENERISANO AUTOMATSKI — NE MIJENJATI RUČNO.
 *
 * Izvor: šema baze podataka (public).
 * Ponovo generiši sa:  npm run gen:types
 *
 * Tabela: 46
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      analytics_events: {
        Row: {
          id: number
          organization_id: string | null
          user_id: string | null
          event: string
          properties: Json
          occurred_at: string
        }
        Insert: {
          organization_id?: string | null
          user_id?: string | null
          event: string
          properties?: Json
          occurred_at?: string
        }
        Update: {
          organization_id?: string | null
          user_id?: string | null
          event?: string
          properties?: Json
          occurred_at?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          id: number
          organization_id: string
          actor_user_id: string | null
          actor_label: string
          action: string
          entity_type: string
          entity_id: string | null
          summary: string
          metadata: Json
          ip_hash: string | null
          created_at: string
        }
        Insert: {
          organization_id: string
          actor_user_id?: string | null
          actor_label?: string
          action: string
          entity_type: string
          entity_id?: string | null
          summary: string
          metadata?: Json
          ip_hash?: string | null
          created_at?: string
        }
        Update: {
          organization_id?: string
          actor_user_id?: string | null
          actor_label?: string
          action?: string
          entity_type?: string
          entity_id?: string | null
          summary?: string
          metadata?: Json
          ip_hash?: string | null
          created_at?: string
        }
        Relationships: []
      }
      booking_settings: {
        Row: {
          organization_id: string
          business_days: number[]
          business_hours_start: string
          business_hours_end: string
          break_start: string | null
          break_end: string | null
          slot_duration_minutes: number
          buffer_minutes: number
          min_notice_hours: number
          max_horizon_days: number
          max_concurrent_bookings: number
          holidays: string[]
          booking_enabled: boolean
          booking_note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          organization_id: string
          business_days?: number[]
          business_hours_start?: string
          business_hours_end?: string
          break_start?: string | null
          break_end?: string | null
          slot_duration_minutes?: number
          buffer_minutes?: number
          min_notice_hours?: number
          max_horizon_days?: number
          max_concurrent_bookings?: number
          holidays?: string[]
          booking_enabled?: boolean
          booking_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          organization_id?: string
          business_days?: number[]
          business_hours_start?: string
          business_hours_end?: string
          break_start?: string | null
          break_end?: string | null
          slot_duration_minutes?: number
          buffer_minutes?: number
          min_notice_hours?: number
          max_horizon_days?: number
          max_concurrent_bookings?: number
          holidays?: string[]
          booking_enabled?: boolean
          booking_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      booking_tokens: {
        Row: {
          id: string
          organization_id: string
          device_id: string | null
          booking_id: string | null
          token_hash: string
          purpose: string
          expires_at: string
          used_at: string | null
          revoked_at: string | null
          last_accessed_at: string | null
          access_count: number
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          device_id?: string | null
          booking_id?: string | null
          token_hash: string
          purpose?: string
          expires_at: string
          used_at?: string | null
          revoked_at?: string | null
          last_accessed_at?: string | null
          access_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          device_id?: string | null
          booking_id?: string | null
          token_hash?: string
          purpose?: string
          expires_at?: string
          used_at?: string | null
          revoked_at?: string | null
          last_accessed_at?: string | null
          access_count?: number
          created_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          id: string
          organization_id: string
          customer_id: string
          device_id: string | null
          location_id: string | null
          code: string
          service_type: string
          starts_at: string
          ends_at: string
          slot_index: number
          status: string
          source: string
          reminder_event_id: string | null
          assigned_technician_id: string | null
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          customer_note: string | null
          internal_note: string | null
          confirmed_at: string | null
          cancelled_at: string | null
          cancel_reason: string | null
          rescheduled_from: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          customer_id: string
          device_id?: string | null
          location_id?: string | null
          code: string
          service_type?: string
          starts_at: string
          ends_at: string
          slot_index?: number
          status?: string
          source?: string
          reminder_event_id?: string | null
          assigned_technician_id?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          customer_note?: string | null
          internal_note?: string | null
          confirmed_at?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
          rescheduled_from?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          customer_id?: string
          device_id?: string | null
          location_id?: string | null
          code?: string
          service_type?: string
          starts_at?: string
          ends_at?: string
          slot_index?: number
          status?: string
          source?: string
          reminder_event_id?: string | null
          assigned_technician_id?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          customer_note?: string | null
          internal_note?: string | null
          confirmed_at?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
          rescheduled_from?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      checklist_template_items: {
        Row: {
          id: string
          organization_id: string
          template_id: string
          label: string
          help_text: string | null
          item_type: string
          unit: string | null
          is_required: boolean
          sort_order: number
          min_value: number | null
          max_value: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          template_id: string
          label: string
          help_text?: string | null
          item_type?: string
          unit?: string | null
          is_required?: boolean
          sort_order?: number
          min_value?: number | null
          max_value?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          template_id?: string
          label?: string
          help_text?: string | null
          item_type?: string
          unit?: string | null
          is_required?: boolean
          sort_order?: number
          min_value?: number | null
          max_value?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      checklist_templates: {
        Row: {
          id: string
          organization_id: string
          device_type_id: string | null
          name: string
          description: string | null
          is_default: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          device_type_id?: string | null
          name: string
          description?: string | null
          is_default?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          device_type_id?: string | null
          name?: string
          description?: string | null
          is_default?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      cron_runs: {
        Row: {
          id: string
          job: string
          run_date: string
          status: string
          started_at: string
          finished_at: string | null
          duration_ms: number | null
          summary: Json
          error_text: string | null
        }
        Insert: {
          id?: string
          job: string
          run_date: string
          status?: string
          started_at?: string
          finished_at?: string | null
          duration_ms?: number | null
          summary?: Json
          error_text?: string | null
        }
        Update: {
          id?: string
          job?: string
          run_date?: string
          status?: string
          started_at?: string
          finished_at?: string | null
          duration_ms?: number | null
          summary?: Json
          error_text?: string | null
        }
        Relationships: []
      }
      customer_contacts: {
        Row: {
          id: string
          organization_id: string
          customer_id: string
          name: string
          role_label: string | null
          email: string | null
          phone: string | null
          is_primary: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          customer_id: string
          name: string
          role_label?: string | null
          email?: string | null
          phone?: string | null
          is_primary?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          customer_id?: string
          name?: string
          role_label?: string | null
          email?: string | null
          phone?: string | null
          is_primary?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          id: string
          organization_id: string
          customer_type: string
          name: string
          company_name: string | null
          tax_id: string | null
          email: string | null
          phone: string | null
          phone_secondary: string | null
          phone_normalized: string | null
          preferred_language: string
          preferred_contact_method: string
          reminder_consent: boolean
          service_message_consent: boolean
          marketing_consent: boolean
          consent_source: string | null
          consent_recorded_at: string | null
          notes: string | null
          is_active: boolean
          external_ref: string | null
          search_text: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          customer_type?: string
          name: string
          company_name?: string | null
          tax_id?: string | null
          email?: string | null
          phone?: string | null
          phone_secondary?: string | null
          preferred_language?: string
          preferred_contact_method?: string
          reminder_consent?: boolean
          service_message_consent?: boolean
          marketing_consent?: boolean
          consent_source?: string | null
          consent_recorded_at?: string | null
          notes?: string | null
          is_active?: boolean
          external_ref?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          customer_type?: string
          name?: string
          company_name?: string | null
          tax_id?: string | null
          email?: string | null
          phone?: string | null
          phone_secondary?: string | null
          preferred_language?: string
          preferred_contact_method?: string
          reminder_consent?: boolean
          service_message_consent?: boolean
          marketing_consent?: boolean
          consent_source?: string | null
          consent_recorded_at?: string | null
          notes?: string | null
          is_active?: boolean
          external_ref?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      device_documents: {
        Row: {
          id: string
          organization_id: string
          device_id: string
          file_path: string
          file_name: string
          mime_type: string
          size_bytes: number
          kind: string
          is_public: boolean
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          device_id: string
          file_path: string
          file_name: string
          mime_type: string
          size_bytes: number
          kind?: string
          is_public?: boolean
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          device_id?: string
          file_path?: string
          file_name?: string
          mime_type?: string
          size_bytes?: number
          kind?: string
          is_public?: boolean
          uploaded_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      device_service_plans: {
        Row: {
          id: string
          organization_id: string
          device_id: string
          template_id: string | null
          interval_months: number
          price: number | null
          starts_on: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          device_id: string
          template_id?: string | null
          interval_months: number
          price?: number | null
          starts_on?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          device_id?: string
          template_id?: string | null
          interval_months?: number
          price?: number | null
          starts_on?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      device_types: {
        Row: {
          id: string
          organization_id: string
          code: string
          name: string
          default_interval_months: number
          default_price: number | null
          icon: string | null
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          code: string
          name: string
          default_interval_months?: number
          default_price?: number | null
          icon?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          code?: string
          name?: string
          default_interval_months?: number
          default_price?: number | null
          icon?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      devices: {
        Row: {
          id: string
          organization_id: string
          customer_id: string
          location_id: string | null
          device_type_id: string | null
          manufacturer: string | null
          model: string | null
          serial_number: string | null
          asset_number: string | null
          installed_at: string | null
          installer_name: string | null
          warranty_start: string | null
          warranty_end: string | null
          service_interval_months: number | null
          next_service_date: string | null
          last_service_date: string | null
          default_service_price: number | null
          currency: string
          status: string
          notes: string | null
          photo_path: string | null
          public_page_enabled: boolean
          reminders_enabled: boolean
          external_ref: string | null
          search_text: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          customer_id: string
          location_id?: string | null
          device_type_id?: string | null
          manufacturer?: string | null
          model?: string | null
          serial_number?: string | null
          asset_number?: string | null
          installed_at?: string | null
          installer_name?: string | null
          warranty_start?: string | null
          warranty_end?: string | null
          service_interval_months?: number | null
          next_service_date?: string | null
          last_service_date?: string | null
          default_service_price?: number | null
          currency?: string
          status?: string
          notes?: string | null
          photo_path?: string | null
          public_page_enabled?: boolean
          reminders_enabled?: boolean
          external_ref?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          customer_id?: string
          location_id?: string | null
          device_type_id?: string | null
          manufacturer?: string | null
          model?: string | null
          serial_number?: string | null
          asset_number?: string | null
          installed_at?: string | null
          installer_name?: string | null
          warranty_start?: string | null
          warranty_end?: string | null
          service_interval_months?: number | null
          next_service_date?: string | null
          last_service_date?: string | null
          default_service_price?: number | null
          currency?: string
          status?: string
          notes?: string | null
          photo_path?: string | null
          public_page_enabled?: boolean
          reminders_enabled?: boolean
          external_ref?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      document_counters: {
        Row: {
          organization_id: string
          counter_key: string
          period_year: number
          last_value: number
        }
        Insert: {
          organization_id: string
          counter_key: string
          period_year: number
          last_value?: number
        }
        Update: {
          organization_id?: string
          counter_key?: string
          period_year?: number
          last_value?: number
        }
        Relationships: []
      }
      email_messages: {
        Row: {
          id: string
          organization_id: string | null
          to_email: string
          from_email: string
          reply_to: string | null
          subject: string
          template_key: string
          status: string
          provider: string
          provider_message_id: string | null
          error_text: string | null
          preview_html: string | null
          preview_text: string | null
          entity_type: string | null
          entity_id: string | null
          created_at: string
          sent_at: string | null
        }
        Insert: {
          id?: string
          organization_id?: string | null
          to_email: string
          from_email: string
          reply_to?: string | null
          subject: string
          template_key: string
          status?: string
          provider?: string
          provider_message_id?: string | null
          error_text?: string | null
          preview_html?: string | null
          preview_text?: string | null
          entity_type?: string | null
          entity_id?: string | null
          created_at?: string
          sent_at?: string | null
        }
        Update: {
          id?: string
          organization_id?: string | null
          to_email?: string
          from_email?: string
          reply_to?: string | null
          subject?: string
          template_key?: string
          status?: string
          provider?: string
          provider_message_id?: string | null
          error_text?: string | null
          preview_html?: string | null
          preview_text?: string | null
          entity_type?: string | null
          entity_id?: string | null
          created_at?: string
          sent_at?: string | null
        }
        Relationships: []
      }
      import_jobs: {
        Row: {
          id: string
          organization_id: string
          created_by: string | null
          entity: string
          file_name: string
          file_size: number
          mime_type: string
          sheet_name: string | null
          delimiter: string | null
          encoding: string
          status: string
          total_rows: number
          valid_rows: number
          invalid_rows: number
          imported_rows: number
          updated_rows: number
          skipped_rows: number
          processed_rows: number
          mapping: Json
          options: Json
          error_text: string | null
          started_at: string | null
          finished_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          created_by?: string | null
          entity: string
          file_name: string
          file_size: number
          mime_type: string
          sheet_name?: string | null
          delimiter?: string | null
          encoding?: string
          status?: string
          total_rows?: number
          valid_rows?: number
          invalid_rows?: number
          imported_rows?: number
          updated_rows?: number
          skipped_rows?: number
          processed_rows?: number
          mapping?: Json
          options?: Json
          error_text?: string | null
          started_at?: string | null
          finished_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          created_by?: string | null
          entity?: string
          file_name?: string
          file_size?: number
          mime_type?: string
          sheet_name?: string | null
          delimiter?: string | null
          encoding?: string
          status?: string
          total_rows?: number
          valid_rows?: number
          invalid_rows?: number
          imported_rows?: number
          updated_rows?: number
          skipped_rows?: number
          processed_rows?: number
          mapping?: Json
          options?: Json
          error_text?: string | null
          started_at?: string | null
          finished_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      import_mappings: {
        Row: {
          id: string
          organization_id: string
          name: string
          entity: string
          mapping: Json
          options: Json
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          entity: string
          mapping: Json
          options?: Json
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          entity?: string
          mapping?: Json
          options?: Json
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      import_rows: {
        Row: {
          id: string
          organization_id: string
          import_job_id: string
          row_number: number
          raw: Json
          normalized: Json | null
          status: string
          errors: Json
          warnings: Json
          entity_id: string | null
          duplicate_of: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          import_job_id: string
          row_number: number
          raw: Json
          normalized?: Json | null
          status?: string
          errors?: Json
          warnings?: Json
          entity_id?: string | null
          duplicate_of?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          import_job_id?: string
          row_number?: number
          raw?: Json
          normalized?: Json | null
          status?: string
          errors?: Json
          warnings?: Json
          entity_id?: string | null
          duplicate_of?: string | null
          created_at?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          id: string
          organization_id: string
          email: string
          role: string
          token_hash: string
          invited_by: string | null
          expires_at: string
          accepted_at: string | null
          accepted_by: string | null
          revoked_at: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          email: string
          role: string
          token_hash: string
          invited_by?: string | null
          expires_at: string
          accepted_at?: string | null
          accepted_by?: string | null
          revoked_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          email?: string
          role?: string
          token_hash?: string
          invited_by?: string | null
          expires_at?: string
          accepted_at?: string | null
          accepted_by?: string | null
          revoked_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      issue_attachments: {
        Row: {
          id: string
          organization_id: string
          issue_report_id: string
          file_path: string
          file_name: string
          mime_type: string
          size_bytes: number
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          issue_report_id: string
          file_path: string
          file_name: string
          mime_type: string
          size_bytes: number
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          issue_report_id?: string
          file_path?: string
          file_name?: string
          mime_type?: string
          size_bytes?: number
          created_at?: string
        }
        Relationships: []
      }
      issue_reports: {
        Row: {
          id: string
          organization_id: string
          device_id: string | null
          customer_id: string | null
          location_id: string | null
          code: string
          category: string
          description: string
          error_code: string | null
          started_on: string | null
          still_operating: boolean | null
          preferred_contact_time: string | null
          is_urgent: boolean
          safety_risk: boolean
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          status: string
          source: string
          booking_id: string | null
          handled_by: string | null
          handled_at: string | null
          resolution_note: string | null
          ip_hash: string | null
          created_at: string
          updated_at: string
          closed_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          device_id?: string | null
          customer_id?: string | null
          location_id?: string | null
          code: string
          category?: string
          description: string
          error_code?: string | null
          started_on?: string | null
          still_operating?: boolean | null
          preferred_contact_time?: string | null
          is_urgent?: boolean
          safety_risk?: boolean
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          status?: string
          source?: string
          booking_id?: string | null
          handled_by?: string | null
          handled_at?: string | null
          resolution_note?: string | null
          ip_hash?: string | null
          created_at?: string
          updated_at?: string
          closed_at?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          device_id?: string | null
          customer_id?: string | null
          location_id?: string | null
          code?: string
          category?: string
          description?: string
          error_code?: string | null
          started_on?: string | null
          still_operating?: boolean | null
          preferred_contact_time?: string | null
          is_urgent?: boolean
          safety_risk?: boolean
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          status?: string
          source?: string
          booking_id?: string | null
          handled_by?: string | null
          handled_at?: string | null
          resolution_note?: string | null
          ip_hash?: string | null
          created_at?: string
          updated_at?: string
          closed_at?: string | null
        }
        Relationships: []
      }
      locations: {
        Row: {
          id: string
          organization_id: string
          customer_id: string
          label: string
          address: string | null
          city: string | null
          postal_code: string | null
          country: string
          latitude: number | null
          longitude: number | null
          access_notes: string | null
          parking_notes: string | null
          contact_person: string | null
          phone: string | null
          is_active: boolean
          external_ref: string | null
          search_text: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          customer_id: string
          label?: string
          address?: string | null
          city?: string | null
          postal_code?: string | null
          country?: string
          latitude?: number | null
          longitude?: number | null
          access_notes?: string | null
          parking_notes?: string | null
          contact_person?: string | null
          phone?: string | null
          is_active?: boolean
          external_ref?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          customer_id?: string
          label?: string
          address?: string | null
          city?: string | null
          postal_code?: string | null
          country?: string
          latitude?: number | null
          longitude?: number | null
          access_notes?: string | null
          parking_notes?: string | null
          contact_person?: string | null
          phone?: string | null
          is_active?: boolean
          external_ref?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      notification_events: {
        Row: {
          id: string
          organization_id: string
          user_id: string | null
          type: string
          title: string
          body: string | null
          link_path: string | null
          severity: string
          entity_type: string | null
          entity_id: string | null
          is_read: boolean
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id?: string | null
          type: string
          title: string
          body?: string | null
          link_path?: string | null
          severity?: string
          entity_type?: string | null
          entity_id?: string | null
          is_read?: boolean
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string | null
          type?: string
          title?: string
          body?: string | null
          link_path?: string | null
          severity?: string
          entity_type?: string | null
          entity_id?: string | null
          is_read?: boolean
          read_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          type: string
          in_app: boolean
          email: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          type: string
          in_app?: boolean
          email?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          type?: string
          in_app?: boolean
          email?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: string
          status: string
          invited_by: string | null
          joined_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role: string
          status?: string
          invited_by?: string | null
          joined_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          role?: string
          status?: string
          invited_by?: string | null
          joined_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_settings: {
        Row: {
          organization_id: string
          default_service_interval_months: number
          default_service_price: number | null
          reminder_send_hour: number
          reminder_from_name: string | null
          reminder_reply_to: string | null
          reminders_paused: boolean
          report_footer_text: string | null
          report_disclaimer: string | null
          require_customer_signature: boolean
          require_technician_signature: boolean
          require_completion_photos: boolean
          data_retention_months: number | null
          ai_features_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          organization_id: string
          default_service_interval_months?: number
          default_service_price?: number | null
          reminder_send_hour?: number
          reminder_from_name?: string | null
          reminder_reply_to?: string | null
          reminders_paused?: boolean
          report_footer_text?: string | null
          report_disclaimer?: string | null
          require_customer_signature?: boolean
          require_technician_signature?: boolean
          require_completion_photos?: boolean
          data_retention_months?: number | null
          ai_features_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          organization_id?: string
          default_service_interval_months?: number
          default_service_price?: number | null
          reminder_send_hour?: number
          reminder_from_name?: string | null
          reminder_reply_to?: string | null
          reminders_paused?: boolean
          report_footer_text?: string | null
          report_disclaimer?: string | null
          require_customer_signature?: boolean
          require_technician_signature?: boolean
          require_completion_photos?: boolean
          data_retention_months?: number | null
          ai_features_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_subscriptions: {
        Row: {
          id: string
          organization_id: string
          plan_code: string
          status: string
          trial_ends_on: string | null
          current_period_start: string
          current_period_end: string | null
          manual_override: boolean
          override_note: string | null
          set_by: string | null
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          plan_code: string
          status?: string
          trial_ends_on?: string | null
          current_period_start?: string
          current_period_end?: string | null
          manual_override?: boolean
          override_note?: string | null
          set_by?: string | null
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          plan_code?: string
          status?: string
          trial_ends_on?: string | null
          current_period_start?: string
          current_period_end?: string | null
          manual_override?: boolean
          override_note?: string | null
          set_by?: string | null
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          legal_name: string | null
          tax_id: string | null
          email: string | null
          phone: string | null
          website: string | null
          address: string | null
          city: string | null
          postal_code: string | null
          country: string
          logo_path: string | null
          timezone: string
          currency: string
          locale: string
          onboarding_step: number
          onboarding_completed_at: string | null
          is_demo: boolean
          created_by: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          name: string
          slug: string
          legal_name?: string | null
          tax_id?: string | null
          email?: string | null
          phone?: string | null
          website?: string | null
          address?: string | null
          city?: string | null
          postal_code?: string | null
          country?: string
          logo_path?: string | null
          timezone?: string
          currency?: string
          locale?: string
          onboarding_step?: number
          onboarding_completed_at?: string | null
          is_demo?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          legal_name?: string | null
          tax_id?: string | null
          email?: string | null
          phone?: string | null
          website?: string | null
          address?: string | null
          city?: string | null
          postal_code?: string | null
          country?: string
          logo_path?: string | null
          timezone?: string
          currency?: string
          locale?: string
          onboarding_step?: number
          onboarding_completed_at?: string | null
          is_demo?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      plan_definitions: {
        Row: {
          code: string
          name: string
          tagline: string | null
          monthly_price_km: number | null
          trial_days: number
          limits: Json
          features: Json
          is_public: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          name: string
          tagline?: string | null
          monthly_price_km?: number | null
          trial_days?: number
          limits: Json
          features: Json
          is_public?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          name?: string
          tagline?: string | null
          monthly_price_km?: number | null
          trial_days?: number
          limits?: Json
          features?: Json
          is_public?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          phone: string | null
          avatar_url: string | null
          locale: string
          last_seen_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          phone?: string | null
          avatar_url?: string | null
          locale?: string
          last_seen_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          phone?: string | null
          avatar_url?: string | null
          locale?: string
          last_seen_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      qr_tokens: {
        Row: {
          id: string
          organization_id: string
          device_id: string
          token_hash: string
          token_hint: string
          is_active: boolean
          rotated_at: string | null
          revoked_at: string | null
          last_accessed_at: string | null
          access_count: number
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          device_id: string
          token_hash: string
          token_hint: string
          is_active?: boolean
          rotated_at?: string | null
          revoked_at?: string | null
          last_accessed_at?: string | null
          access_count?: number
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          device_id?: string
          token_hash?: string
          token_hint?: string
          is_active?: boolean
          rotated_at?: string | null
          revoked_at?: string | null
          last_accessed_at?: string | null
          access_count?: number
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket_key: string
          window_start: string
          hit_count: number
          expires_at: string
        }
        Insert: {
          bucket_key: string
          window_start: string
          hit_count?: number
          expires_at: string
        }
        Update: {
          bucket_key?: string
          window_start?: string
          hit_count?: number
          expires_at?: string
        }
        Relationships: []
      }
      reminder_campaigns: {
        Row: {
          id: string
          organization_id: string
          run_date: string
          status: string
          devices_scanned: number
          events_created: number
          events_sent: number
          events_failed: number
          events_skipped: number
          started_at: string
          finished_at: string | null
          error_text: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          run_date: string
          status?: string
          devices_scanned?: number
          events_created?: number
          events_sent?: number
          events_failed?: number
          events_skipped?: number
          started_at?: string
          finished_at?: string | null
          error_text?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          run_date?: string
          status?: string
          devices_scanned?: number
          events_created?: number
          events_sent?: number
          events_failed?: number
          events_skipped?: number
          started_at?: string
          finished_at?: string | null
          error_text?: string | null
        }
        Relationships: []
      }
      reminder_events: {
        Row: {
          id: string
          organization_id: string
          campaign_id: string | null
          device_id: string
          customer_id: string
          rule_id: string
          due_date: string
          offset_days: number
          scheduled_for: string
          channel: string
          template_key: string
          status: string
          attempt_count: number
          last_error: string | null
          provider_message_id: string | null
          recipient_email: string | null
          subject: string | null
          booking_token_id: string | null
          created_at: string
          updated_at: string
          sent_at: string | null
          failed_at: string | null
          cancelled_at: string | null
          cancel_reason: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          campaign_id?: string | null
          device_id: string
          customer_id: string
          rule_id: string
          due_date: string
          offset_days: number
          scheduled_for: string
          channel?: string
          template_key: string
          status?: string
          attempt_count?: number
          last_error?: string | null
          provider_message_id?: string | null
          recipient_email?: string | null
          subject?: string | null
          booking_token_id?: string | null
          created_at?: string
          updated_at?: string
          sent_at?: string | null
          failed_at?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          campaign_id?: string | null
          device_id?: string
          customer_id?: string
          rule_id?: string
          due_date?: string
          offset_days?: number
          scheduled_for?: string
          channel?: string
          template_key?: string
          status?: string
          attempt_count?: number
          last_error?: string | null
          provider_message_id?: string | null
          recipient_email?: string | null
          subject?: string | null
          booking_token_id?: string | null
          created_at?: string
          updated_at?: string
          sent_at?: string | null
          failed_at?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
        }
        Relationships: []
      }
      reminder_rules: {
        Row: {
          id: string
          organization_id: string
          name: string
          offset_days: number
          channel: string
          template_key: string
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          offset_days: number
          channel?: string
          template_key?: string
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          offset_days?: number
          channel?: string
          template_key?: string
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_tokens: {
        Row: {
          id: string
          organization_id: string
          service_report_id: string
          token_hash: string
          expires_at: string | null
          revoked_at: string | null
          last_accessed_at: string | null
          access_count: number
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          service_report_id: string
          token_hash: string
          expires_at?: string | null
          revoked_at?: string | null
          last_accessed_at?: string | null
          access_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          service_report_id?: string
          token_hash?: string
          expires_at?: string | null
          revoked_at?: string | null
          last_accessed_at?: string | null
          access_count?: number
          created_at?: string
        }
        Relationships: []
      }
      service_plan_templates: {
        Row: {
          id: string
          organization_id: string
          device_type_id: string | null
          name: string
          description: string | null
          interval_months: number
          price: number | null
          estimated_minutes: number
          is_default: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          device_type_id?: string | null
          name: string
          description?: string | null
          interval_months: number
          price?: number | null
          estimated_minutes?: number
          is_default?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          device_type_id?: string | null
          name?: string
          description?: string | null
          interval_months?: number
          price?: number | null
          estimated_minutes?: number
          is_default?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_records: {
        Row: {
          id: string
          organization_id: string
          work_order_id: string
          device_id: string | null
          customer_id: string
          location_id: string | null
          technician_id: string | null
          service_date: string
          service_type: string
          summary: string | null
          work_performed: string | null
          observations: string | null
          recommendations: string | null
          labor_minutes: number | null
          materials_total: number
          service_price: number | null
          currency: string
          previous_service_date: string | null
          next_service_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          work_order_id: string
          device_id?: string | null
          customer_id: string
          location_id?: string | null
          technician_id?: string | null
          service_date: string
          service_type: string
          summary?: string | null
          work_performed?: string | null
          observations?: string | null
          recommendations?: string | null
          labor_minutes?: number | null
          materials_total?: number
          service_price?: number | null
          currency?: string
          previous_service_date?: string | null
          next_service_date?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          work_order_id?: string
          device_id?: string | null
          customer_id?: string
          location_id?: string | null
          technician_id?: string | null
          service_date?: string
          service_type?: string
          summary?: string | null
          work_performed?: string | null
          observations?: string | null
          recommendations?: string | null
          labor_minutes?: number | null
          materials_total?: number
          service_price?: number | null
          currency?: string
          previous_service_date?: string | null
          next_service_date?: string | null
          created_at?: string
        }
        Relationships: []
      }
      service_reports: {
        Row: {
          id: string
          organization_id: string
          service_record_id: string
          work_order_id: string
          report_number: string
          status: string
          file_path: string | null
          file_size: number | null
          generated_at: string | null
          error_text: string | null
          emailed_at: string | null
          email_message_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          service_record_id: string
          work_order_id: string
          report_number: string
          status?: string
          file_path?: string | null
          file_size?: number | null
          generated_at?: string | null
          error_text?: string | null
          emailed_at?: string | null
          email_message_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          service_record_id?: string
          work_order_id?: string
          report_number?: string
          status?: string
          file_path?: string | null
          file_size?: number | null
          generated_at?: string | null
          error_text?: string | null
          emailed_at?: string | null
          email_message_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      technicians: {
        Row: {
          id: string
          organization_id: string
          user_id: string | null
          full_name: string
          email: string | null
          phone: string | null
          color: string
          specialties: string[]
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id?: string | null
          full_name: string
          email?: string | null
          phone?: string | null
          color?: string
          specialties?: string[]
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string | null
          full_name?: string
          email?: string | null
          phone?: string | null
          color?: string
          specialties?: string[]
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          id: string
          organization_id: string
          period_month: string
          metric: string
          value: number
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          period_month: string
          metric: string
          value?: number
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          period_month?: string
          metric?: string
          value?: number
          updated_at?: string
        }
        Relationships: []
      }
      work_order_attachments: {
        Row: {
          id: string
          organization_id: string
          work_order_id: string
          file_path: string
          file_name: string
          mime_type: string
          size_bytes: number
          phase: string
          caption: string | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          work_order_id: string
          file_path: string
          file_name: string
          mime_type: string
          size_bytes: number
          phase?: string
          caption?: string | null
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          work_order_id?: string
          file_path?: string
          file_name?: string
          mime_type?: string
          size_bytes?: number
          phase?: string
          caption?: string | null
          uploaded_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      work_order_checklist_results: {
        Row: {
          id: string
          organization_id: string
          work_order_id: string
          template_item_id: string | null
          label: string
          item_type: string
          unit: string | null
          is_required: boolean
          sort_order: number
          value_bool: boolean | null
          value_number: number | null
          value_text: string | null
          photo_path: string | null
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          work_order_id: string
          template_item_id?: string | null
          label: string
          item_type: string
          unit?: string | null
          is_required?: boolean
          sort_order?: number
          value_bool?: boolean | null
          value_number?: number | null
          value_text?: string | null
          photo_path?: string | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          work_order_id?: string
          template_item_id?: string | null
          label?: string
          item_type?: string
          unit?: string | null
          is_required?: boolean
          sort_order?: number
          value_bool?: boolean | null
          value_number?: number | null
          value_text?: string | null
          photo_path?: string | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      work_order_materials: {
        Row: {
          id: string
          organization_id: string
          work_order_id: string
          name: string
          sku: string | null
          quantity: number
          unit: string
          unit_price: number
          total_price: number | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          work_order_id: string
          name: string
          sku?: string | null
          quantity?: number
          unit?: string
          unit_price?: number
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          work_order_id?: string
          name?: string
          sku?: string | null
          quantity?: number
          unit?: string
          unit_price?: number
          created_at?: string
        }
        Relationships: []
      }
      work_orders: {
        Row: {
          id: string
          organization_id: string
          code: string
          customer_id: string
          location_id: string | null
          device_id: string | null
          booking_id: string | null
          issue_report_id: string | null
          checklist_template_id: string | null
          assigned_technician_id: string | null
          priority: string
          status: string
          scheduled_start: string | null
          scheduled_end: string | null
          estimated_minutes: number | null
          service_type: string
          customer_description: string | null
          internal_notes: string | null
          recommendation: string | null
          travel_notes: string | null
          labor_minutes: number | null
          service_price: number | null
          materials_total: number
          currency: string
          customer_signature_path: string | null
          customer_signature_name: string | null
          customer_signed_at: string | null
          technician_signature_path: string | null
          technician_signature_name: string | null
          technician_signed_at: string | null
          next_service_date: string | null
          next_service_override_reason: string | null
          report_status: string
          started_at: string | null
          completed_at: string | null
          cancelled_at: string | null
          cancel_reason: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          code: string
          customer_id: string
          location_id?: string | null
          device_id?: string | null
          booking_id?: string | null
          issue_report_id?: string | null
          checklist_template_id?: string | null
          assigned_technician_id?: string | null
          priority?: string
          status?: string
          scheduled_start?: string | null
          scheduled_end?: string | null
          estimated_minutes?: number | null
          service_type?: string
          customer_description?: string | null
          internal_notes?: string | null
          recommendation?: string | null
          travel_notes?: string | null
          labor_minutes?: number | null
          service_price?: number | null
          materials_total?: number
          currency?: string
          customer_signature_path?: string | null
          customer_signature_name?: string | null
          customer_signed_at?: string | null
          technician_signature_path?: string | null
          technician_signature_name?: string | null
          technician_signed_at?: string | null
          next_service_date?: string | null
          next_service_override_reason?: string | null
          report_status?: string
          started_at?: string | null
          completed_at?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          code?: string
          customer_id?: string
          location_id?: string | null
          device_id?: string | null
          booking_id?: string | null
          issue_report_id?: string | null
          checklist_template_id?: string | null
          assigned_technician_id?: string | null
          priority?: string
          status?: string
          scheduled_start?: string | null
          scheduled_end?: string | null
          estimated_minutes?: number | null
          service_type?: string
          customer_description?: string | null
          internal_notes?: string | null
          recommendation?: string | null
          travel_notes?: string | null
          labor_minutes?: number | null
          service_price?: number | null
          materials_total?: number
          currency?: string
          customer_signature_path?: string | null
          customer_signature_name?: string | null
          customer_signed_at?: string | null
          technician_signature_path?: string | null
          technician_signature_name?: string | null
          technician_signed_at?: string | null
          next_service_date?: string | null
          next_service_override_reason?: string | null
          report_status?: string
          started_at?: string | null
          completed_at?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

/** Kraći pristup: `Tables<'devices'>` umjesto duge putanje. */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
