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
          id: string;
          mentor_id: string | null;
          paid_at: string | null;
          payout_id: string | null;
          price: number;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
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
          id?: string;
          mentor_id?: string | null;
          paid_at?: string | null;
          payout_id?: string | null;
          price?: number;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
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
          id?: string;
          mentor_id?: string | null;
          paid_at?: string | null;
          payout_id?: string | null;
          price?: number;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
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
          topics: string[];
          university: string;
          verification_notes: string | null;
          verified_at: string | null;
          verified_by: string | null;
          year: string;
        };
        Insert: {
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
          topics?: string[];
          university: string;
          verification_notes?: string | null;
          verified_at?: string | null;
          verified_by?: string | null;
          year: string;
        };
        Update: {
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
        };
        Insert: {
          created_at?: string;
          file_name: string;
          id?: string;
          size_bytes?: number | null;
          storage_path: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          id?: string;
          size_bytes?: number | null;
          storage_path?: string;
          student_id?: string;
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
          phone: string;
          photo_url: string | null;
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
          phone: string;
          photo_url?: string | null;
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
          phone?: string;
          photo_url?: string | null;
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
          course: string;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          status: string;
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
          _mentor_id: string;
          _subject_id?: string;
          _time_slot: string;
        };
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
          bio: string;
          countries: string[];
          course: string;
          full_name: string;
          id: string;
          photo_url: string;
          price_inr: number;
          topics: string[];
          university: string;
          verified_at: string;
          year: string;
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
      is_approved_mentor: { Args: { _mentor_id: string }; Returns: boolean };
      list_approved_mentor_profiles: {
        Args: never;
        Returns: {
          countries: string[];
          course: string;
          full_name: string;
          id: string;
          price_inr: number;
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
    };
    Enums: {
      mentor_status: "pending" | "approved" | "rejected";
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
      session_status: ["upcoming", "completed", "cancelled"],
    },
  },
} as const;
