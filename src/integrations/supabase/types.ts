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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      counters: {
        Row: {
          created_at: string
          current_ticket_id: string | null
          id: string
          is_active: boolean
          name: string
          service_id: string | null
        }
        Insert: {
          created_at?: string
          current_ticket_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          service_id?: string | null
        }
        Update: {
          created_at?: string
          current_ticket_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "counters_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      document_uploads: {
        Row: {
          created_at: string
          document_name: string
          file_path: string
          id: string
          notes: string | null
          service_id: string
          status: string
          ticket_id: string | null
          updated_at: string
          user_id: string
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          document_name: string
          file_path: string
          id?: string
          notes?: string | null
          service_id: string
          status?: string
          ticket_id?: string | null
          updated_at?: string
          user_id: string
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          document_name?: string
          file_path?: string
          id?: string
          notes?: string | null
          service_id?: string
          status?: string
          ticket_id?: string | null
          updated_at?: string
          user_id?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_uploads_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_uploads_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "queue_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          ticket_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          ticket_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          ticket_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "queue_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          date_of_birth: string | null
          full_name: string
          id: string
          is_disabled: boolean
          is_pregnant: boolean
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          id?: string
          is_disabled?: boolean
          is_pregnant?: boolean
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          id?: string
          is_disabled?: boolean
          is_pregnant?: boolean
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      queue_tickets: {
        Row: {
          called_at: string | null
          completed_at: string | null
          counter_id: string | null
          created_at: string
          estimated_wait_minutes: number | null
          id: string
          notes: string | null
          position: number | null
          priority: Database["public"]["Enums"]["priority_type"]
          qr_code_data: string | null
          served_at: string | null
          service_id: string
          status: Database["public"]["Enums"]["queue_status"]
          ticket_number: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          called_at?: string | null
          completed_at?: string | null
          counter_id?: string | null
          created_at?: string
          estimated_wait_minutes?: number | null
          id?: string
          notes?: string | null
          position?: number | null
          priority?: Database["public"]["Enums"]["priority_type"]
          qr_code_data?: string | null
          served_at?: string | null
          service_id: string
          status?: Database["public"]["Enums"]["queue_status"]
          ticket_number: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          called_at?: string | null
          completed_at?: string | null
          counter_id?: string | null
          created_at?: string
          estimated_wait_minutes?: number | null
          id?: string
          notes?: string | null
          position?: number | null
          priority?: Database["public"]["Enums"]["priority_type"]
          qr_code_data?: string | null
          served_at?: string | null
          service_id?: string
          status?: Database["public"]["Enums"]["queue_status"]
          ticket_number?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "queue_tickets_counter_id_fkey"
            columns: ["counter_id"]
            isOneToOne: false
            referencedRelation: "counters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_tickets_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_slots: {
        Row: {
          booked_count: number
          created_at: string
          id: string
          is_active: boolean
          max_tokens: number
          service_id: string
          slot_date: string
          slot_time: string
          updated_at: string
        }
        Insert: {
          booked_count?: number
          created_at?: string
          id?: string
          is_active?: boolean
          max_tokens?: number
          service_id: string
          slot_date: string
          slot_time: string
          updated_at?: string
        }
        Update: {
          booked_count?: number
          created_at?: string
          id?: string
          is_active?: boolean
          max_tokens?: number
          service_id?: string
          slot_date?: string
          slot_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_slots_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          created_at: string
          description: string | null
          estimated_time_minutes: number
          id: string
          is_active: boolean
          max_queue_capacity: number | null
          name: string
          required_documents: Json | null
          slots_enabled: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_time_minutes?: number
          id?: string
          is_active?: boolean
          max_queue_capacity?: number | null
          name: string
          required_documents?: Json | null
          slots_enabled?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_time_minutes?: number
          id?: string
          is_active?: boolean
          max_queue_capacity?: number | null
          name?: string
          required_documents?: Json | null
          slots_enabled?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      slot_bookings: {
        Row: {
          created_at: string
          id: string
          slot_id: string
          status: string
          ticket_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          slot_id: string
          status?: string
          ticket_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          slot_id?: string
          status?: string
          ticket_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slot_bookings_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "service_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_bookings_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "queue_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          staff_id: string
          ticket_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          staff_id: string
          ticket_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          staff_id?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_activity_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "queue_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "staff"
      priority_type: "normal" | "senior" | "pregnant" | "disabled" | "emergency"
      queue_status:
        | "waiting"
        | "called"
        | "serving"
        | "completed"
        | "cancelled"
        | "no_show"
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
      app_role: ["admin", "user", "staff"],
      priority_type: ["normal", "senior", "pregnant", "disabled", "emergency"],
      queue_status: [
        "waiting",
        "called",
        "serving",
        "completed",
        "cancelled",
        "no_show",
      ],
    },
  },
} as const
