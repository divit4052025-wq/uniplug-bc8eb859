export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      action_point_completions: {
        Row: {
          action_point_index: number
          completed: boolean
          id: string
          session_note_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          action_point_index: number
          completed?: boolean
          id?: string
          session_note_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          action_point_index?: number
          completed?: boolean
          id?: string
          session_note_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_point_completions_session_note_id_fkey"
            columns: ["session_note_id"]
            isOneToOne: false
            referencedRelation: "session_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          created_at: string
          date: string
          duration: number
          id: string
          mentor_id: string
          price: number
          status: string
          student_id: string
          time_slot: string
        }
        Insert: {
          created_at?: string
          date: string
          duration?: number
          id?: string
          mentor_id: string
          price?: number
          status?: string
          student_id: string
          time_slot: string
        }
        Update: {
          created_at?: string
          date?: string
          duration?: number
          id?: string
          mentor_id?: string
          price?: number
          status?: string
          student_id?: string
          time_slot?: string
        }
        Relationships: []
      }
      mentor_availability: {
        Row: {
          created_at: string
          day_of_week: number
          id: string
          mentor_id: string
          start_hour: number
        }
        Insert: {
          created_at?: string
          day_of_week: number
          id?: string
          mentor_id: string
          start_hour: number
        }
        Update: {
          created_at?: string
          day_of_week?: number
          id?: string
          mentor_id?: string
          start_hour?: number
        }
        Relationships: []
      }
      mentor_payouts: {
        Row: {
          amount_inr: number
          created_at: string
          id: string
          mentor_id: string
          payout_date: string
          status: string
        }
        Insert: {
          amount_inr: number
          created_at?: string
          id?: string
          mentor_id: string
          payout_date: string
          status?: string
        }
        Update: {
          amount_inr?: number
          created_at?: string
          id?: string
          mentor_id?: string
          payout_date?: string
          status?: string
        }
        Relationships: []
      }
      mentors: {
        Row: {
          countries: string[]
          course: string
          created_at: string
          email: string
          full_name: string
          id: string
          price_inr: number
          status: Database["public"]["Enums"]["mentor_status"]
          university: string
          year: string
        }
        Insert: {
          countries?: string[]
          course: string
          created_at?: string
          email: string
          full_name: string
          id: string
          price_inr?: number
          status?: Database["public"]["Enums"]["mentor_status"]
          university: string
          year: string
        }
        Update: {
          countries?: string[]
          course?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          price_inr?: number
          status?: Database["public"]["Enums"]["mentor_status"]
          university?: string
          year?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          created_at: string
          id: string
          mentor_id: string
          rating: number
          review: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mentor_id: string
          rating: number
          review?: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mentor_id?: string
          rating?: number
          review?: string
          student_id?: string
        }
        Relationships: []
      }
      session_action_points: {
        Row: {
          content: string
          created_at: string
          id: string
          mentor_id: string
          note_id: string
          position: number
          student_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          mentor_id: string
          note_id: string
          position?: number
          student_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          mentor_id?: string
          note_id?: string
          position?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_action_points_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "session_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      session_notes: {
        Row: {
          action_points: Json
          booking_id: string | null
          created_at: string
          id: string
          mentor_id: string
          session_id: string | null
          student_id: string
          summary: string
          updated_at: string
        }
        Insert: {
          action_points?: Json
          booking_id?: string | null
          created_at?: string
          id?: string
          mentor_id: string
          session_id?: string | null
          student_id: string
          summary?: string
          updated_at?: string
        }
        Update: {
          action_points?: Json
          booking_id?: string | null
          created_at?: string
          id?: string
          mentor_id?: string
          session_id?: string | null
          student_id?: string
          summary?: string
          updated_at?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          amount_inr: number
          call_url: string | null
          created_at: string
          duration_minutes: number
          id: string
          mentor_id: string
          scheduled_at: string
          status: Database["public"]["Enums"]["session_status"]
          student_id: string
        }
        Insert: {
          amount_inr?: number
          call_url?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          mentor_id: string
          scheduled_at: string
          status?: Database["public"]["Enums"]["session_status"]
          student_id: string
        }
        Update: {
          amount_inr?: number
          call_url?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          mentor_id?: string
          scheduled_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          student_id?: string
        }
        Relationships: []
      }
      student_documents: {
        Row: {
          created_at: string
          file_name: string
          id: string
          size_bytes: number | null
          storage_path: string
          student_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          size_bytes?: number | null
          storage_path: string
          student_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          size_bytes?: number | null
          storage_path?: string
          student_id?: string
        }
        Relationships: []
      }
      student_schools: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          student_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          name: string
          student_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          student_id?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          countries: string[]
          created_at: string
          email: string
          full_name: string
          grade: string
          id: string
          phone: string
          school: string
        }
        Insert: {
          countries?: string[]
          created_at?: string
          email: string
          full_name: string
          grade: string
          id: string
          phone: string
          school: string
        }
        Update: {
          countries?: string[]
          created_at?: string
          email?: string
          full_name?: string
          grade?: string
          id?: string
          phone?: string
          school?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_bookings: {
        Args: never
        Returns: {
          created_at: string
          date: string
          id: string
          mentor_id: string
          mentor_name: string
          price: number
          status: string
          student_id: string
          student_name: string
          time_slot: string
        }[]
      }
      admin_list_mentors: {
        Args: { _status?: string }
        Returns: {
          course: string
          created_at: string
          email: string
          full_name: string
          id: string
          status: string
          university: string
          year: string
        }[]
      }
      admin_list_students: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          grade: string
          id: string
          school: string
        }[]
      }
      admin_set_mentor_status: {
        Args: { _mentor_id: string; _status: string }
        Returns: undefined
      }
      admin_stats: {
        Args: never
        Returns: {
          revenue_this_month: number
          sessions_this_month: number
          total_mentors: number
          total_revenue_all_time: number
          total_sessions_all_time: number
          total_students: number
        }[]
      }
      get_mentor_booking_names: {
        Args: { _ids: string[] }
        Returns: {
          full_name: string
          id: string
          university: string
        }[]
      }
      get_mentor_public_profile: {
        Args: { _mentor_id: string }
        Returns: {
          countries: string[]
          course: string
          full_name: string
          id: string
          price_inr: number
          university: string
          year: string
        }[]
      }
      get_review_student_names: {
        Args: { _ids: string[] }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      get_student_booking_names: {
        Args: { _ids: string[] }
        Returns: {
          full_name: string
          grade: string
          id: string
          school: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      list_approved_mentor_profiles: {
        Args: never
        Returns: {
          countries: string[]
          course: string
          full_name: string
          id: string
          price_inr: number
          university: string
          year: string
        }[]
      }
    }
    Enums: {
      mentor_status: "pending" | "approved" | "rejected"
      session_status: "upcoming" | "completed" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      mentor_status: ["pending", "approved", "rejected"],
      session_status: ["upcoming", "completed", "cancelled"],
    },
  },
} as const
