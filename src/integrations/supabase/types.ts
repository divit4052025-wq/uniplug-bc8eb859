export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      action_point_completions: {
        Row: {
          action_point_index: number;
          completed: boolean;
          id: string;
          session_note_id: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          action_point_index: number;
          completed?: boolean;
          id?: string;
          session_note_id: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          action_point_index?: number;
          completed?: boolean;
          id?: string;
          session_note_id?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_point_completions_session_note_id_fkey";
            columns: ["session_note_id"];
            isOneToOne: false;
            referencedRelation: "session_notes";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_audit_log: {
        Row: {
          action: string;
          actor_id: string;
          created_at: string;
          detail: Json | null;
          id: string;
          justification: string | null;
          target_id: string | null;
          target_label: string | null;
          target_type: string | null;
        };
        Insert: {
          action: string;
          actor_id: string;
          created_at?: string;
          detail?: Json | null;
          id?: string;
          justification?: string | null;
          target_id?: string | null;
          target_label?: string | null;
          target_type?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string;
          created_at?: string;
          detail?: Json | null;
          id?: string;
          justification?: string | null;
          target_id?: string | null;
          target_label?: string | null;
          target_type?: string | null;
        };
        Relationships: [];
      };
      admin_roles: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          revoked_at: string | null;
          role: string;
          user_id: string;
        };
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          revoked_at?: string | null;
          role: string;
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          revoked_at?: string | null;
          role?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      account_moderation: {
        Row: {
          user_id: string;
          state: string;
          reason: string | null;
          actor_id: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          state?: string;
          reason?: string | null;
          actor_id?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          state?: string;
          reason?: string | null;
          actor_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      report_triage: {
        Row: {
          source: string;
          report_id: string;
          status: string;
          severity: string | null;
          notes: string | null;
          assigned_to: string | null;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          source: string;
          report_id: string;
          status?: string;
          severity?: string | null;
          notes?: string | null;
          assigned_to?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          source?: string;
          report_id?: string;
          status?: string;
          severity?: string | null;
          notes?: string | null;
          assigned_to?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_warnings: {
        Row: { id: string; user_id: string; reason: string; actor_id: string; created_at: string };
        Insert: {
          id?: string;
          user_id: string;
          reason: string;
          actor_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          reason?: string;
          actor_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      escalation_records: {
        Row: {
          id: string;
          source: string | null;
          report_id: string | null;
          subject_user_id: string | null;
          channel: string;
          reference_note: string | null;
          actor_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          source?: string | null;
          report_id?: string | null;
          subject_user_id?: string | null;
          channel: string;
          reference_note?: string | null;
          actor_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          source?: string | null;
          report_id?: string | null;
          subject_user_id?: string | null;
          channel?: string;
          reference_note?: string | null;
          actor_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      ai_rate_limit_events: {
        Row: {
          created_at: string;
          feature: string;
          id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          feature: string;
          id?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          feature?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          created_at: string;
          date: string;
          description: string | null;
          duration: number;
          frozen_at: string | null;
          id: string;
          mentor_id: string | null;
          paid_at: string | null;
          payout_id: string | null;
          price: number;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          reschedule_count: number;
          status: string;
          student_id: string | null;
          subject_id: string | null;
          time_slot: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          description?: string | null;
          duration?: number;
          frozen_at?: string | null;
          id?: string;
          mentor_id?: string | null;
          paid_at?: string | null;
          payout_id?: string | null;
          price?: number;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          reschedule_count?: number;
          status?: string;
          student_id?: string | null;
          subject_id?: string | null;
          time_slot: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          description?: string | null;
          duration?: number;
          frozen_at?: string | null;
          id?: string;
          mentor_id?: string | null;
          paid_at?: string | null;
          payout_id?: string | null;
          price?: number;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          reschedule_count?: number;
          status?: string;
          student_id?: string | null;
          subject_id?: string | null;
          time_slot?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_mentor_id_fkey";
            columns: ["mentor_id"];
            isOneToOne: false;
            referencedRelation: "mentors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_payout_id_fkey";
            columns: ["payout_id"];
            isOneToOne: false;
            referencedRelation: "mentor_payouts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "ref_subjects";
            referencedColumns: ["id"];
          },
        ];
      };
      consent_revocation_events: {
        Row: {
          action: string;
          booking_id: string | null;
          id: string;
          revoked_at: string;
          student_id: string;
        };
        Insert: {
          action: string;
          booking_id?: string | null;
          id?: string;
          revoked_at?: string;
          student_id: string;
        };
        Update: {
          action?: string;
          booking_id?: string | null;
          id?: string;
          revoked_at?: string;
          student_id?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          blocked_at: string | null;
          blocked_by: string | null;
          created_at: string;
          id: string;
          last_message_at: string | null;
          mentor_id: string;
          student_id: string;
        };
        Insert: {
          blocked_at?: string | null;
          blocked_by?: string | null;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          mentor_id: string;
          student_id: string;
        };
        Update: {
          blocked_at?: string | null;
          blocked_by?: string | null;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          mentor_id?: string;
          student_id?: string;
        };
        Relationships: [];
      };
      disputes: {
        Row: {
          admin_notes: string | null;
          booking_id: string | null;
          created_at: string;
          id: string;
          opened_by: string;
          reason: string;
          resolved_at: string | null;
          status: string;
        };
        Insert: {
          admin_notes?: string | null;
          booking_id?: string | null;
          created_at?: string;
          id?: string;
          opened_by: string;
          reason: string;
          resolved_at?: string | null;
          status?: string;
        };
        Update: {
          admin_notes?: string | null;
          booking_id?: string | null;
          created_at?: string;
          id?: string;
          opened_by?: string;
          reason?: string;
          resolved_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "disputes_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      mentor_admits: {
        Row: {
          created_at: string;
          id: string;
          mentor_id: string;
          proof_path: string | null;
          ref_university_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mentor_id: string;
          proof_path?: string | null;
          ref_university_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mentor_id?: string;
          proof_path?: string | null;
          ref_university_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mentor_admits_mentor_id_fkey";
            columns: ["mentor_id"];
            isOneToOne: false;
            referencedRelation: "mentors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mentor_admits_ref_university_id_fkey";
            columns: ["ref_university_id"];
            isOneToOne: false;
            referencedRelation: "ref_universities";
            referencedColumns: ["id"];
          },
        ];
      };
      mentor_availability: {
        Row: {
          created_at: string;
          day_of_week: number;
          id: string;
          mentor_id: string;
          start_hour: number;
        };
        Insert: {
          created_at?: string;
          day_of_week: number;
          id?: string;
          mentor_id: string;
          start_hour: number;
        };
        Update: {
          created_at?: string;
          day_of_week?: number;
          id?: string;
          mentor_id?: string;
          start_hour?: number;
        };
        Relationships: [
          {
            foreignKeyName: "mentor_availability_mentor_id_fkey";
            columns: ["mentor_id"];
            isOneToOne: false;
            referencedRelation: "mentors";
            referencedColumns: ["id"];
          },
        ];
      };
      mentor_match_suggestions: {
        Row: {
          generated_at: string;
          generated_on: string;
          id: string;
          student_id: string;
          suggestions: Json;
        };
        Insert: {
          generated_at?: string;
          generated_on?: string;
          id?: string;
          student_id: string;
          suggestions: Json;
        };
        Update: {
          generated_at?: string;
          generated_on?: string;
          id?: string;
          student_id?: string;
          suggestions?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "mentor_match_suggestions_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      legal_acceptances: {
        Row: {
          accepted_at: string;
          doc_type: string;
          id: string;
          user_id: string;
          version: string;
        };
        Insert: {
          accepted_at?: string;
          doc_type: string;
          id?: string;
          user_id: string;
          version: string;
        };
        Update: {
          accepted_at?: string;
          doc_type?: string;
          id?: string;
          user_id?: string;
          version?: string;
        };
        Relationships: [];
      };
      mentor_payouts: {
        Row: {
          amount_inr: number;
          batch_id: string | null;
          created_at: string;
          id: string;
          mentor_id: string;
          payout_date: string;
          period_end: string | null;
          status: string;
        };
        Insert: {
          amount_inr: number;
          batch_id?: string | null;
          created_at?: string;
          id?: string;
          mentor_id: string;
          payout_date: string;
          period_end?: string | null;
          status?: string;
        };
        Update: {
          amount_inr?: number;
          batch_id?: string | null;
          created_at?: string;
          id?: string;
          mentor_id?: string;
          payout_date?: string;
          period_end?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mentor_payouts_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "payout_batches";
            referencedColumns: ["id"];
          },
        ];
      };
      mentor_private_notes: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          mentor_id: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          body?: string;
          created_at?: string;
          id?: string;
          mentor_id: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          mentor_id?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mentor_private_notes_mentor_id_fkey";
            columns: ["mentor_id"];
            isOneToOne: false;
            referencedRelation: "mentors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mentor_private_notes_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      mentor_training_completions: {
        Row: {
          completed_at: string;
          mentor_id: string;
          section_key: string;
        };
        Insert: {
          completed_at?: string;
          mentor_id: string;
          section_key: string;
        };
        Update: {
          completed_at?: string;
          mentor_id?: string;
          section_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mentor_training_completions_mentor_id_fkey";
            columns: ["mentor_id"];
            isOneToOne: false;
            referencedRelation: "mentors";
            referencedColumns: ["id"];
          },
        ];
      };
      mentors: {
        Row: {
          application_submitted_at: string | null;
          bio: string | null;
          code_of_conduct_accepted_at: string | null;
          college_email: string | null;
          countries: string[];
          course: string;
          created_at: string;
          date_of_birth: string | null;
          email: string;
          enrollment_letter_path: string | null;
          full_name: string;
          id: string;
          id_document_path: string | null;
          max_active_mentees: number | null;
          phone: string | null;
          photo_url: string | null;
          price_inr: number;
          re_review_pending: boolean;
          ref_course_id: string | null;
          ref_university_id: string | null;
          specialty_id: string | null;
          status: Database["public"]["Enums"]["mentor_status"];
          tier: Database["public"]["Enums"]["mentor_tier"];
          topics: string[];
          university: string;
          verification_notes: string | null;
          verified_at: string | null;
          verified_by: string | null;
          year: string;
        };
        Insert: {
          application_submitted_at?: string | null;
          bio?: string | null;
          code_of_conduct_accepted_at?: string | null;
          college_email?: string | null;
          countries?: string[];
          course: string;
          created_at?: string;
          date_of_birth?: string | null;
          email: string;
          enrollment_letter_path?: string | null;
          full_name: string;
          id: string;
          id_document_path?: string | null;
          max_active_mentees?: number | null;
          phone?: string | null;
          photo_url?: string | null;
          price_inr?: number;
          re_review_pending?: boolean;
          ref_course_id?: string | null;
          ref_university_id?: string | null;
          specialty_id?: string | null;
          status?: Database["public"]["Enums"]["mentor_status"];
          tier?: Database["public"]["Enums"]["mentor_tier"];
          topics?: string[];
          university: string;
          verification_notes?: string | null;
          verified_at?: string | null;
          verified_by?: string | null;
          year: string;
        };
        Update: {
          application_submitted_at?: string | null;
          bio?: string | null;
          code_of_conduct_accepted_at?: string | null;
          college_email?: string | null;
          countries?: string[];
          course?: string;
          created_at?: string;
          date_of_birth?: string | null;
          email?: string;
          enrollment_letter_path?: string | null;
          full_name?: string;
          id?: string;
          id_document_path?: string | null;
          max_active_mentees?: number | null;
          phone?: string | null;
          photo_url?: string | null;
          price_inr?: number;
          re_review_pending?: boolean;
          ref_course_id?: string | null;
          ref_university_id?: string | null;
          specialty_id?: string | null;
          status?: Database["public"]["Enums"]["mentor_status"];
          tier?: Database["public"]["Enums"]["mentor_tier"];
          topics?: string[];
          university?: string;
          verification_notes?: string | null;
          verified_at?: string | null;
          verified_by?: string | null;
          year?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mentors_ref_course_id_fkey";
            columns: ["ref_course_id"];
            isOneToOne: false;
            referencedRelation: "ref_courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mentors_ref_university_id_fkey";
            columns: ["ref_university_id"];
            isOneToOne: false;
            referencedRelation: "ref_universities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mentors_specialty_id_fkey";
            columns: ["specialty_id"];
            isOneToOne: false;
            referencedRelation: "ref_specialties";
            referencedColumns: ["id"];
          },
        ];
      };
      message_reports: {
        Row: {
          conversation_id: string;
          created_at: string;
          id: string;
          reason: string;
          reported_message_id: string | null;
          reported_user_id: string;
          reporter_id: string;
        };
        Insert: {
          conversation_id: string;
          created_at?: string;
          id?: string;
          reason: string;
          reported_message_id?: string | null;
          reported_user_id: string;
          reporter_id: string;
        };
        Update: {
          conversation_id?: string;
          created_at?: string;
          id?: string;
          reason?: string;
          reported_message_id?: string | null;
          reported_user_id?: string;
          reporter_id?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          body: string;
          conversation_id: string;
          created_at: string;
          id: string;
          recipient_id: string;
          reported: boolean;
          sender_id: string;
          soft_deleted: boolean;
        };
        Insert: {
          body: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          recipient_id: string;
          reported?: boolean;
          sender_id: string;
          soft_deleted?: boolean;
        };
        Update: {
          body?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          recipient_id?: string;
          reported?: boolean;
          sender_id?: string;
          soft_deleted?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          booking_date: string | null;
          booking_id: string | null;
          booking_time_slot: string | null;
          conversation_id: string | null;
          created_at: string;
          id: string;
          kind: string;
          mentor_name: string | null;
          read_at: string | null;
          recipient_id: string;
          sender_name: string | null;
          student_name: string | null;
        };
        Insert: {
          booking_date?: string | null;
          booking_id?: string | null;
          booking_time_slot?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          mentor_name?: string | null;
          read_at?: string | null;
          recipient_id: string;
          sender_name?: string | null;
          student_name?: string | null;
        };
        Update: {
          booking_date?: string | null;
          booking_id?: string | null;
          booking_time_slot?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          mentor_name?: string | null;
          read_at?: string | null;
          recipient_id?: string;
          sender_name?: string | null;
          student_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      parental_consent_records: {
        Row: {
          consent_scope: string[];
          consent_version: string;
          consented_at: string;
          id: string;
          parent_email: string | null;
          student_id: string;
        };
        Insert: {
          consent_scope: string[];
          consent_version: string;
          consented_at?: string;
          id?: string;
          parent_email?: string | null;
          student_id: string;
        };
        Update: {
          consent_scope?: string[];
          consent_version?: string;
          consented_at?: string;
          id?: string;
          parent_email?: string | null;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "parental_consent_records_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_ledger: {
        Row: {
          amount_inr: number | null;
          booking_id: string | null;
          created_at: string;
          event_type: string;
          id: string;
          idempotency_key: string;
          mentor_share_inr: number | null;
          payload: Json | null;
          platform_fee_inr: number | null;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          razorpay_refund_id: string | null;
        };
        Insert: {
          amount_inr?: number | null;
          booking_id?: string | null;
          created_at?: string;
          event_type: string;
          id?: string;
          idempotency_key: string;
          mentor_share_inr?: number | null;
          payload?: Json | null;
          platform_fee_inr?: number | null;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_refund_id?: string | null;
        };
        Update: {
          amount_inr?: number | null;
          booking_id?: string | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          idempotency_key?: string;
          mentor_share_inr?: number | null;
          payload?: Json | null;
          platform_fee_inr?: number | null;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_refund_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payment_ledger_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      payout_batches: {
        Row: {
          cutoff_at: string;
          id: string;
          run_at: string;
          status: string;
        };
        Insert: {
          cutoff_at: string;
          id?: string;
          run_at?: string;
          status?: string;
        };
        Update: {
          cutoff_at?: string;
          id?: string;
          run_at?: string;
          status?: string;
        };
        Relationships: [];
      };
      ref_academic_domains: {
        Row: {
          created_at: string;
          domain: string;
        };
        Insert: {
          created_at?: string;
          domain: string;
        };
        Update: {
          created_at?: string;
          domain?: string;
        };
        Relationships: [];
      };
      ref_add_requests: {
        Row: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_reason: string | null;
          id: string;
          kind: string;
          proposed_name: string;
          requested_by: string | null;
          status: string;
        };
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_reason?: string | null;
          id?: string;
          kind: string;
          proposed_name: string;
          requested_by?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_reason?: string | null;
          id?: string;
          kind?: string;
          proposed_name?: string;
          requested_by?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      ref_cocurriculars: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      ref_courses: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      ref_project_categories: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      ref_schools: {
        Row: {
          aliases: string[];
          created_at: string;
          id: string;
          name: string;
          source: string | null;
        };
        Insert: {
          aliases?: string[];
          created_at?: string;
          id?: string;
          name: string;
          source?: string | null;
        };
        Update: {
          aliases?: string[];
          created_at?: string;
          id?: string;
          name?: string;
          source?: string | null;
        };
        Relationships: [];
      };
      ref_specialties: {
        Row: {
          created_at: string;
          id: string;
          key: string;
          label: string;
          mascot_key: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          key: string;
          label: string;
          mascot_key: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          key?: string;
          label?: string;
          mascot_key?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      ref_sports: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      ref_subjects: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      ref_universities: {
        Row: {
          aliases: string[];
          country: string | null;
          created_at: string;
          id: string;
          name: string;
          source: string | null;
        };
        Insert: {
          aliases?: string[];
          country?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          source?: string | null;
        };
        Update: {
          aliases?: string[];
          country?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          source?: string | null;
        };
        Relationships: [];
      };
      referral_codes: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          owner_id: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          owner_id: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          owner_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "referral_codes_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: true;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      referral_credits: {
        Row: {
          amount_inr: number;
          created_at: string;
          id: string;
          referee_id: string;
          referrer_id: string;
          status: string;
        };
        Insert: {
          amount_inr: number;
          created_at?: string;
          id?: string;
          referee_id: string;
          referrer_id: string;
          status?: string;
        };
        Update: {
          amount_inr?: number;
          created_at?: string;
          id?: string;
          referee_id?: string;
          referrer_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "referral_credits_referee_id_fkey";
            columns: ["referee_id"];
            isOneToOne: true;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "referral_credits_referrer_id_fkey";
            columns: ["referrer_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          created_at: string;
          id: string;
          mentor_id: string;
          rating: number;
          review: string;
          student_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mentor_id: string;
          rating: number;
          review?: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mentor_id?: string;
          rating?: number;
          review?: string;
          student_id?: string;
        };
        Relationships: [];
      };
      safeguarding_events: {
        Row: {
          actor_id: string;
          conversation_id: string | null;
          created_at: string;
          detail: string | null;
          event_type: string;
          id: string;
        };
        Insert: {
          actor_id: string;
          conversation_id?: string | null;
          created_at?: string;
          detail?: string | null;
          event_type: string;
          id?: string;
        };
        Update: {
          actor_id?: string;
          conversation_id?: string | null;
          created_at?: string;
          detail?: string | null;
          event_type?: string;
          id?: string;
        };
        Relationships: [];
      };
      safety_reports: {
        Row: {
          admin_notes: string | null;
          body: string;
          booking_id: string | null;
          category: string;
          created_at: string;
          handled_at: string | null;
          handled_by: string | null;
          id: string;
          reporter_id: string;
          status: string;
          subject_user_id: string | null;
        };
        Insert: {
          admin_notes?: string | null;
          body: string;
          booking_id?: string | null;
          category: string;
          created_at?: string;
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          reporter_id: string;
          status?: string;
          subject_user_id?: string | null;
        };
        Update: {
          admin_notes?: string | null;
          body?: string;
          booking_id?: string | null;
          category?: string;
          created_at?: string;
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          reporter_id?: string;
          status?: string;
          subject_user_id?: string | null;
        };
        Relationships: [];
      };
      session_action_points: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          mentor_id: string;
          note_id: string;
          position: number;
          student_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          mentor_id: string;
          note_id: string;
          position?: number;
          student_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          mentor_id?: string;
          note_id?: string;
          position?: number;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_action_points_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "session_notes";
            referencedColumns: ["id"];
          },
        ];
      };
      session_notes: {
        Row: {
          action_points: Json;
          booking_id: string | null;
          created_at: string;
          id: string;
          mentor_id: string;
          session_id: string | null;
          student_id: string;
          summary: string;
          updated_at: string;
        };
        Insert: {
          action_points?: Json;
          booking_id?: string | null;
          created_at?: string;
          id?: string;
          mentor_id: string;
          session_id?: string | null;
          student_id: string;
          summary?: string;
          updated_at?: string;
        };
        Update: {
          action_points?: Json;
          booking_id?: string | null;
          created_at?: string;
          id?: string;
          mentor_id?: string;
          session_id?: string | null;
          student_id?: string;
          summary?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      session_prep_questions: {
        Row: {
          booking_id: string;
          generated_at: string;
          id: string;
          questions: Json;
          source: string;
        };
        Insert: {
          booking_id: string;
          generated_at?: string;
          id?: string;
          questions: Json;
          source?: string;
        };
        Update: {
          booking_id?: string;
          generated_at?: string;
          id?: string;
          questions?: Json;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_prep_questions_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: true;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: {
          amount_inr: number;
          call_url: string | null;
          created_at: string;
          duration_minutes: number;
          id: string;
          mentor_id: string;
          scheduled_at: string;
          status: Database["public"]["Enums"]["session_status"];
          student_id: string;
        };
        Insert: {
          amount_inr?: number;
          call_url?: string | null;
          created_at?: string;
          duration_minutes?: number;
          id?: string;
          mentor_id: string;
          scheduled_at: string;
          status?: Database["public"]["Enums"]["session_status"];
          student_id: string;
        };
        Update: {
          amount_inr?: number;
          call_url?: string | null;
          created_at?: string;
          duration_minutes?: number;
          id?: string;
          mentor_id?: string;
          scheduled_at?: string;
          status?: Database["public"]["Enums"]["session_status"];
          student_id?: string;
        };
        Relationships: [];
      };
      student_cocurriculars: {
        Row: {
          cocurricular_id: string;
          created_at: string;
          id: string;
          student_id: string;
        };
        Insert: {
          cocurricular_id: string;
          created_at?: string;
          id?: string;
          student_id: string;
        };
        Update: {
          cocurricular_id?: string;
          created_at?: string;
          id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_cocurriculars_cocurricular_id_fkey";
            columns: ["cocurricular_id"];
            isOneToOne: false;
            referencedRelation: "ref_cocurriculars";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_cocurriculars_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      student_courses: {
        Row: {
          course_id: string;
          created_at: string;
          id: string;
          student_id: string;
        };
        Insert: {
          course_id: string;
          created_at?: string;
          id?: string;
          student_id: string;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_courses_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "ref_courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_courses_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      student_project_categories: {
        Row: {
          created_at: string;
          detail: string | null;
          id: string;
          project_category_id: string;
          student_id: string;
        };
        Insert: {
          created_at?: string;
          detail?: string | null;
          id?: string;
          project_category_id: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          detail?: string | null;
          id?: string;
          project_category_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_project_categories_project_category_id_fkey";
            columns: ["project_category_id"];
            isOneToOne: false;
            referencedRelation: "ref_project_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_project_categories_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      student_sports: {
        Row: {
          created_at: string;
          id: string;
          sport_id: string;
          student_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          sport_id: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          sport_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_sports_sport_id_fkey";
            columns: ["sport_id"];
            isOneToOne: false;
            referencedRelation: "ref_sports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_sports_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      student_subjects: {
        Row: {
          created_at: string;
          id: string;
          student_id: string;
          subject_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          student_id: string;
          subject_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          student_id?: string;
          subject_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_subjects_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_subjects_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "ref_subjects";
            referencedColumns: ["id"];
          },
        ];
      };
      student_documents: {
        Row: {
          created_at: string;
          file_name: string;
          id: string;
          size_bytes: number | null;
          storage_path: string;
          student_id: string;
          visibility: string;
        };
        Insert: {
          created_at?: string;
          file_name: string;
          id?: string;
          size_bytes?: number | null;
          storage_path: string;
          student_id: string;
          visibility?: string;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          id?: string;
          size_bytes?: number | null;
          storage_path?: string;
          student_id?: string;
          visibility?: string;
        };
        Relationships: [];
      };
      student_schools: {
        Row: {
          category: string;
          created_at: string;
          id: string;
          name: string;
          ref_university_id: string | null;
          student_id: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          id?: string;
          name: string;
          ref_university_id?: string | null;
          student_id: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          id?: string;
          name?: string;
          ref_university_id?: string | null;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_schools_ref_university_id_fkey";
            columns: ["ref_university_id"];
            isOneToOne: false;
            referencedRelation: "ref_universities";
            referencedColumns: ["id"];
          },
        ];
      };
      students: {
        Row: {
          bio: string | null;
          board: string | null;
          code_of_conduct_accepted_at: string | null;
          countries: string[];
          created_at: string;
          date_of_birth: string | null;
          email: string;
          first_session_used: boolean;
          full_name: string;
          grade: string;
          id: string;
          parent_phone: string | null;
          parental_consent_at: string | null;
          parental_consent_email: string | null;
          parental_consent_token: string | null;
          parental_consent_token_issued_at: string | null;
          phone: string;
          photo_url: string | null;
          profile_completed_at: string | null;
          school: string;
        };
        Insert: {
          bio?: string | null;
          board?: string | null;
          code_of_conduct_accepted_at?: string | null;
          countries?: string[];
          created_at?: string;
          date_of_birth?: string | null;
          email: string;
          first_session_used?: boolean;
          full_name: string;
          grade: string;
          id: string;
          parent_phone?: string | null;
          parental_consent_at?: string | null;
          parental_consent_email?: string | null;
          parental_consent_token?: string | null;
          parental_consent_token_issued_at?: string | null;
          phone: string;
          photo_url?: string | null;
          profile_completed_at?: string | null;
          school: string;
        };
        Update: {
          bio?: string | null;
          board?: string | null;
          code_of_conduct_accepted_at?: string | null;
          countries?: string[];
          created_at?: string;
          date_of_birth?: string | null;
          email?: string;
          first_session_used?: boolean;
          full_name?: string;
          grade?: string;
          id?: string;
          parent_phone?: string | null;
          parental_consent_at?: string | null;
          parental_consent_email?: string | null;
          parental_consent_token?: string | null;
          parental_consent_token_issued_at?: string | null;
          phone?: string;
          photo_url?: string | null;
          profile_completed_at?: string | null;
          school?: string;
        };
        Relationships: [];
      };
      video_join_audit: {
        Row: {
          booking_id: string;
          id: string;
          issued_at: string;
          role: string;
          token_exp: string;
          user_id: string;
        };
        Insert: {
          booking_id: string;
          id?: string;
          issued_at?: string;
          role: string;
          token_exp: string;
          user_id: string;
        };
        Update: {
          booking_id?: string;
          id?: string;
          issued_at?: string;
          role?: string;
          token_exp?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      video_rooms: {
        Row: {
          booking_id: string;
          created_at: string;
          created_by: string | null;
          daily_room_name: string;
          daily_room_url: string;
        };
        Insert: {
          booking_id: string;
          created_at?: string;
          created_by?: string | null;
          daily_room_name: string;
          daily_room_url: string;
        };
        Update: {
          booking_id?: string;
          created_at?: string;
          created_by?: string | null;
          daily_room_name?: string;
          daily_room_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "video_rooms_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: true;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_mentor_rating_summary: {
        Args: { _mentor_id: string };
        Returns: {
          avg_rating: number | null;
          review_count: number;
          star1: number;
          star2: number;
          star3: number;
          star4: number;
          star5: number;
        }[];
      };
      open_dispute: {
        Args: { _booking_id: string; _reason: string };
        Returns: string;
      };
      admin_list_disputes: {
        Args: never;
        Returns: {
          id: string;
          booking_id: string | null;
          opened_by: string;
          reason: string;
          status: string;
          admin_notes: string | null;
          created_at: string;
          resolved_at: string | null;
        }[];
      };
      submit_safety_report: {
        Args: {
          _category: string;
          _body: string;
          _subject_user_id?: string;
          _booking_id?: string;
        };
        Returns: string;
      };
      admin_list_safety_reports: {
        Args: never;
        Returns: {
          id: string;
          reporter_id: string;
          subject_user_id: string | null;
          booking_id: string | null;
          category: string;
          body: string;
          status: string;
          created_at: string;
          handled_by: string | null;
          handled_at: string | null;
          admin_notes: string | null;
        }[];
      };
      can_mentor_access_document: { Args: { _document_id: string }; Returns: boolean };
      student_has_consent: { Args: { _student_id: string }; Returns: boolean };
      admin_promote_ref_add_request: {
        Args: { _id: string };
        Returns: undefined;
      };
      admin_reject_ref_add_request: {
        Args: { _id: string; _reason: string };
        Returns: undefined;
      };
      create_ref_add_request: {
        Args: { _kind: string; _proposed_name: string };
        Returns: string;
      };
      finalize_student_profile: {
        Args: never;
        Returns: string;
      };
      search_reference: {
        Args: { _kind: string; _limit?: number; _q: string };
        Returns: { id: string; name: string }[];
      };
      search_schools: {
        Args: { _limit?: number; _q: string };
        Returns: { id: string; name: string }[];
      };
      admin_list_bookings: {
        Args: never;
        Returns: {
          created_at: string;
          date: string;
          id: string;
          mentor_id: string;
          mentor_name: string;
          price: number;
          status: string;
          student_id: string;
          student_name: string;
          time_slot: string;
        }[];
      };
      admin_list_mentors: {
        Args: { _status?: string };
        Returns: {
          application_submitted_at: string | null;
          course: string;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          status: string;
          tier: string;
          university: string;
          year: string;
        }[];
      };
      admin_list_students: {
        Args: never;
        Returns: {
          created_at: string;
          email: string;
          full_name: string;
          grade: string;
          id: string;
          school: string;
        }[];
      };
      admin_set_mentor_status: {
        Args: { _mentor_id: string; _status: string };
        Returns: undefined;
      };
      approve_mentor: {
        Args: { _mentor_id: string };
        Returns: undefined;
      };
      reject_mentor: {
        Args: { _mentor_id: string; _reason?: string | null };
        Returns: undefined;
      };
      submit_mentor_application: {
        Args: never;
        Returns: string;
      };
      resubmit_mentor_application: {
        Args: never;
        Returns: string;
      };
      admin_clear_re_review: {
        Args: { _mentor_id: string };
        Returns: undefined;
      };
      admin_list_add_requests: {
        Args: { _status?: string };
        Returns: {
          id: string;
          kind: string;
          proposed_name: string;
          requested_by: string;
          status: string;
          decision_reason: string | null;
          created_at: string;
        }[];
      };
      cancel_booking_as_student: {
        Args: { _booking_id: string };
        Returns: Json;
      };
      cancel_booking_as_mentor: {
        Args: { _booking_id: string };
        Returns: Json;
      };
      // P10a (2026-06-11): per-party bookings accessor. Mentor reads OWN bookings
      // (auth.uid()=mentor_id) with payout_id restored, razorpay_* omitted.
      get_my_bookings_as_mentor: {
        Args: never;
        Returns: {
          created_at: string;
          date: string;
          description: string | null;
          duration: number;
          id: string;
          paid_at: string | null;
          payout_id: string | null;
          price: number;
          reschedule_count: number;
          status: string;
          student_id: string;
          subject_id: string | null;
          time_slot: string;
        }[];
      };
      // P10c (2026-06-11): authoritative read-only mentor earnings (ledger-sourced).
      // Returns jsonb { currency, summary{...}, next_payout_date, sessions[] }.
      get_mentor_earnings: {
        Args: never;
        Returns: Json;
      };
      admin_stats: {
        Args: never;
        Returns: {
          revenue_this_month: number;
          sessions_this_month: number;
          total_mentors: number;
          total_revenue_all_time: number;
          total_sessions_all_time: number;
          total_students: number;
        }[];
      };
      apply_refund: {
        Args: { _booking_id: string; _payload?: Json; _refund_id?: string };
        Returns: Json;
      };
      authorize_video_join: {
        Args: { _booking_id: string };
        Returns: {
          role: string;
          window_end: string;
        }[];
      };
      block_conversation: {
        Args: { _conversation_id: string };
        Returns: undefined;
      };
      book_session: {
        Args: {
          _date: string;
          _description?: string;
          _duration?: number;
          _mentor_id: string;
          _subject_id?: string;
          _time_slot: string;
        };
        Returns: string;
      };
      reschedule_booking: {
        Args: { _booking_id: string; _new_date: string; _new_time_slot: string };
        Returns: string;
      };
      reserve_slot: {
        Args: { _date: string; _duration?: number; _student_id: string; _time_slot: string };
        Returns: string;
      };
      claim_reserved_booking: {
        Args: { _booking_id: string };
        Returns: string;
      };
      release_reserved_booking: {
        Args: { _booking_id: string };
        Returns: string;
      };
      chat_contains_pii: { Args: { _body: string }; Returns: boolean };
      confirm_refund_processed: {
        Args: { _booking_id: string; _payload?: Json; _refund_id: string };
        Returns: boolean;
      };
      fail_booking_order: {
        Args: { _booking_id: string };
        Returns: boolean;
      };
      get_conversation: {
        Args: { _conversation_id: string };
        Returns: {
          conversation_id: string;
          has_session: boolean;
          i_blocked: boolean;
          is_blocked: boolean;
          peer_id: string;
          peer_name: string;
          peer_photo_url: string;
          peer_subtitle: string;
        }[];
      };
      get_mentor_booking_names: {
        Args: { _ids: string[] };
        Returns: {
          full_name: string;
          id: string;
          university: string;
        }[];
      };
      get_mentor_calendar: {
        Args: { _days_ahead?: number; _from_date?: string; _mentor_id: string };
        Returns: {
          date: string;
          state: string;
          time_slot: string;
        }[];
      };
      get_mentor_public_profile: {
        Args: { _mentor_id: string };
        Returns: {
          // B (2026-06-04): full_name = first-name pre-booking, REAL full name
          // only when an active booking links caller↔mentor; photo_url NULL
          // until then. first_name/mascot_key/specialty_label/avg_rating added.
          avg_rating: number | null;
          bio: string;
          countries: string[];
          course: string;
          first_name: string;
          full_name: string;
          id: string;
          mascot_key: string | null;
          photo_url: string | null;
          price_inr: number;
          review_count: number;
          specialty_label: string | null;
          topics: string[];
          university: string;
          verified_at: string;
          year: string;
        }[];
      };
      get_mentor_reviews: {
        // A4 (2026-06-30): public per-mentor review list, approved mentors only.
        // Reviewer first name only — never returns student_id.
        Args: { _mentor_id: string };
        Returns: {
          created_at: string;
          id: string;
          rating: number;
          review: string;
          reviewer_first_name: string;
        }[];
      };
      get_my_conversations: {
        Args: never;
        Returns: {
          conversation_id: string;
          has_session: boolean;
          i_blocked: boolean;
          is_blocked: boolean;
          last_message: string;
          last_message_at: string;
          peer_id: string;
          peer_name: string;
          peer_photo_url: string;
          peer_subtitle: string;
          unread_count: number;
        }[];
      };
      get_review_student_names: {
        Args: { _ids: string[] };
        Returns: {
          full_name: string;
          id: string;
        }[];
      };
      get_student_booking_names: {
        Args: { _ids: string[] };
        Returns: {
          full_name: string;
          grade: string;
          id: string;
          school: string;
        }[];
      };
      get_student_overview_for_mentor: {
        Args: { _student_id: string };
        Returns: {
          documents: Json;
          full_name: string;
          grade: string;
          school: string;
          schools: Json;
          student_id: string;
        }[];
      };
      is_admin: { Args: never; Returns: boolean };
      is_super_admin: { Args: never; Returns: boolean };
      current_admin_role: { Args: never; Returns: string | null };
      log_admin_action: {
        Args: {
          _action: string;
          _target_type?: string;
          _target_id?: string;
          _target_label?: string;
          _justification?: string;
          _detail?: Json;
        };
        Returns: string;
      };
      admin_grant_role: { Args: { _user_id: string; _role: string }; Returns: undefined };
      admin_revoke_role: { Args: { _user_id: string; _role: string }; Returns: undefined };
      admin_list_audit_log: {
        Args: {
          _limit?: number;
          _offset?: number;
          _actor?: string;
          _action?: string;
        };
        Returns: {
          id: string;
          actor_id: string;
          actor_email: string | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          target_label: string | null;
          justification: string | null;
          created_at: string;
        }[];
      };
      admin_list_safeguarding_queue: {
        Args: { _status?: string; _limit?: number; _offset?: number };
        Returns: {
          source: string;
          report_id: string;
          created_at: string;
          category: string;
          reporter_id: string | null;
          reporter_label: string | null;
          subject_user_id: string | null;
          subject_label: string | null;
          status: string;
          severity: string | null;
        }[];
      };
      admin_get_report_case: {
        Args: { _source: string; _report_id: string };
        Returns: {
          source: string;
          report_id: string;
          created_at: string;
          category: string;
          content: string | null;
          reporter_id: string | null;
          reporter_label: string | null;
          subject_user_id: string | null;
          subject_label: string | null;
          conversation_id: string | null;
          reported_message_id: string | null;
          booking_id: string | null;
          status: string;
          severity: string | null;
          notes: string | null;
        }[];
      };
      admin_set_report_triage: {
        Args: {
          _source: string;
          _report_id: string;
          _status?: string;
          _severity?: string;
          _notes?: string;
        };
        Returns: undefined;
      };
      admin_list_escalations: {
        Args: { _source: string; _report_id: string };
        Returns: {
          id: string;
          channel: string;
          reference_note: string | null;
          actor_id: string;
          created_at: string;
        }[];
      };
      admin_set_account_state: {
        Args: { _user_id: string; _state: string; _reason?: string };
        Returns: undefined;
      };
      admin_warn_user: { Args: { _user_id: string; _reason: string }; Returns: string };
      admin_freeze_or_cancel_booking: {
        Args: { _booking_id: string; _reason?: string };
        Returns: string;
      };
      admin_record_escalation: {
        Args: {
          _channel: string;
          _subject_user_id?: string;
          _source?: string;
          _report_id?: string;
          _note?: string;
        };
        Returns: string;
      };
      admin_reveal_contact: {
        Args: { _user_id: string; _justification?: string };
        Returns: {
          user_id: string;
          role: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          parent_phone: string | null;
          parent_email: string | null;
        }[];
      };
      admin_list_mentor_applications: {
        Args: { _status?: string; _mentor_id?: string };
        Returns: {
          id: string;
          full_name: string | null;
          email: string | null;
          university: string | null;
          course: string | null;
          year: string | null;
          college_email: string | null;
          status: string;
          tier: string;
          date_of_birth: string | null;
          is_adult: boolean;
          verified_at: string | null;
          verification_notes: string | null;
          application_submitted_at: string | null;
          has_id_doc: boolean;
          has_enrollment_doc: boolean;
          created_at: string;
        }[];
      };
      admin_approve_mentor: { Args: { _mentor_id: string }; Returns: undefined };
      admin_reject_mentor: { Args: { _mentor_id: string; _reason: string }; Returns: undefined };
      admin_search_users: {
        Args: { _query?: string; _role?: string; _limit?: number };
        Returns: {
          user_id: string;
          role: string;
          full_name: string | null;
          sub_label: string | null;
          account_state: string;
          created_at: string;
        }[];
      };
      admin_get_user_profile: {
        Args: { _user_id: string };
        Returns: {
          user_id: string;
          role: string;
          full_name: string | null;
          created_at: string;
          account_state: string;
          account_reason: string | null;
          grade: string | null;
          school: string | null;
          requires_consent: boolean | null;
          dob_known: boolean | null;
          has_consent: boolean | null;
          parental_consent_at: string | null;
          university: string | null;
          course: string | null;
          year: string | null;
          mentor_status: string | null;
          tier: string | null;
          is_adult: boolean | null;
        }[];
      };
      admin_list_user_bookings: {
        Args: { _user_id: string };
        Returns: {
          id: string;
          role_in: string;
          counterpart_label: string | null;
          date: string;
          time_slot: string;
          status: string;
          price: number;
          frozen: boolean;
        }[];
      };
      admin_list_user_reports: {
        Args: { _user_id: string };
        Returns: {
          source: string;
          report_id: string;
          role_in: string;
          category: string;
          status: string;
          created_at: string;
        }[];
      };
      admin_list_user_warnings: {
        Args: { _user_id: string };
        Returns: {
          id: string;
          reason: string;
          actor_id: string;
          created_at: string;
        }[];
      };
      is_approved_mentor: { Args: { _mentor_id: string }; Returns: boolean };
      list_approved_mentor_profiles: {
        // B (2026-06-04): optional specialty/university/min-rating filters.
        Args: { _specialty_id?: string; _university?: string; _min_rating?: number };
        Returns: {
          avg_rating: number | null;
          countries: string[];
          course: string;
          first_name: string;
          full_name: string; // first-name only (browse is pre-booking)
          id: string;
          mascot_key: string | null;
          price_inr: number;
          review_count: number;
          specialty_label: string | null;
          university: string;
          verified_at: string;
          year: string;
        }[];
      };
      mark_booking_failed: {
        Args: { _booking_id: string; _payload?: Json; _payment_id: string };
        Returns: boolean;
      };
      mark_booking_paid: {
        Args: {
          _amount_inr: number;
          _booking_id: string;
          _order_id: string;
          _payment_id: string;
          _payload?: Json;
        };
        Returns: { booking_status: string; newly_confirmed: boolean }[];
      };
      mark_consent_revoked: {
        Args: { _student_id: string };
        Returns: undefined;
      };
      mark_conversation_read: {
        Args: { _conversation_id: string };
        Returns: undefined;
      };
      mentor_training_complete: {
        Args: { _mentor_id: string };
        Returns: boolean;
      };
      notify_event_email: { Args: { _payload: Json }; Returns: undefined };
      record_parental_consent: { Args: { _token: string }; Returns: string };
      request_parental_consent: {
        Args: { _student_id: string };
        Returns: undefined;
      };
      requires_consent_base: {
        Args: { _dob: string; _grade: string };
        Returns: boolean;
      };
      run_weekly_payout_batch: {
        Args: { _buffer_hours?: number };
        Returns: string;
      };
      send_message: {
        Args: { _body: string; _recipient_id: string };
        Returns: Json;
      };
      soft_delete_message: { Args: { _message_id: string }; Returns: undefined };
      submit_report: {
        Args: { _conversation_id: string; _message_id: string; _reason: string };
        Returns: undefined;
      };
      unblock_conversation: {
        Args: { _conversation_id: string };
        Returns: undefined;
      };
      update_booking_status_as_mentor: {
        Args: { _booking_id: string; _new_status: string };
        Returns: undefined;
      };
      validate_college_email: {
        Args: { _email: string };
        Returns: Database["public"]["Enums"]["mentor_tier"];
      };
    };
    Enums: {
      mentor_status: "pending" | "approved" | "rejected";
      mentor_tier: "standard" | "enhanced";
      session_status: "upcoming" | "completed" | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      mentor_status: ["pending", "approved", "rejected"],
      mentor_tier: ["standard", "enhanced"],
      session_status: ["upcoming", "completed", "cancelled"],
    },
  },
} as const;
