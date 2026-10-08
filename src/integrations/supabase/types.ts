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
      categories: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      event_documents: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          sections: Json
          server_group: string
          servers: string
          source: string
          source_file: string | null
          start_date: string | null
          status: string
          template_version: string | null
          theme: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          sections?: Json
          server_group?: string
          servers?: string
          source?: string
          source_file?: string | null
          start_date?: string | null
          status?: string
          template_version?: string | null
          theme?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          sections?: Json
          server_group?: string
          servers?: string
          source?: string
          source_file?: string | null
          start_date?: string | null
          status?: string
          template_version?: string | null
          theme?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      code_requests: {
        Row: {
          channel: string
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          needed_by: string | null
          notes: string
          purpose: string
          quantity: number
          requested_by: string
          requester_email: string
          response: string
          reward: string
          servers: string
          status: string
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          needed_by?: string | null
          notes?: string
          purpose: string
          quantity?: number
          requested_by?: string
          requester_email?: string
          response?: string
          reward?: string
          servers?: string
          status?: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          needed_by?: string | null
          notes?: string
          purpose?: string
          quantity?: number
          requested_by?: string
          requester_email?: string
          response?: string
          reward?: string
          servers?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_item_categories: {
        Row: {
          allowed: string[]
          created_at: string
          created_by: string | null
          forbidden: string[]
          id: string
          item_id: string
          item_name: string
          note: string | null
          server_group: string
          updated_at: string
        }
        Insert: {
          allowed?: string[]
          created_at?: string
          created_by?: string | null
          forbidden?: string[]
          id?: string
          item_id: string
          item_name?: string
          note?: string | null
          server_group?: string
          updated_at?: string
        }
        Update: {
          allowed?: string[]
          created_at?: string
          created_by?: string | null
          forbidden?: string[]
          id?: string
          item_id?: string
          item_name?: string
          note?: string | null
          server_group?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_presets: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          name: string
          server_group: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          name: string
          server_group?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          name?: string
          server_group?: string
          updated_at?: string
        }
        Relationships: []
      }
      item_categories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          item_id: number
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          item_id: number
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          item_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_categories_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          agility: number | null
          attack: number | null
          attribute1: string | null
          attribute2: string | null
          attribute3: string | null
          attribute4: string | null
          attribute5: string | null
          attribute6: string | null
          attribute7: string | null
          attribute8: string | null
          beset: string | null
          bind_type: number | null
          can_send: boolean | null
          can_transfer: boolean | null
          color: number | null
          created_at: string
          data: string | null
          defence: number | null
          desc: string | null
          floor_price: number | null
          id: number
          image_url: string | null
          is_callback: boolean | null
          is_compose: boolean | null
          is_delete: boolean | null
          is_equip: boolean | null
          is_strengthen: boolean | null
          is_throw: boolean | null
          is_use: boolean | null
          item_grade: number | null
          luck: number | null
          melt_grade: number | null
          melt_type: number | null
          name: string | null
          need_grade: number | null
          need_sex: number | null
          pic_path: string | null
          pile_count: number | null
          price: number | null
          price_type: number | null
          profile: string | null
          remark: string | null
          script: string | null
          success_modulus: number | null
          success_rate: number | null
          suit_id: number | null
          type: number | null
          updated_at: string
        }
        Insert: {
          agility?: number | null
          attack?: number | null
          attribute1?: string | null
          attribute2?: string | null
          attribute3?: string | null
          attribute4?: string | null
          attribute5?: string | null
          attribute6?: string | null
          attribute7?: string | null
          attribute8?: string | null
          beset?: string | null
          bind_type?: number | null
          can_send?: boolean | null
          can_transfer?: boolean | null
          color?: number | null
          created_at?: string
          data?: string | null
          defence?: number | null
          desc?: string | null
          floor_price?: number | null
          id: number
          image_url?: string | null
          is_callback?: boolean | null
          is_compose?: boolean | null
          is_delete?: boolean | null
          is_equip?: boolean | null
          is_strengthen?: boolean | null
          is_throw?: boolean | null
          is_use?: boolean | null
          item_grade?: number | null
          luck?: number | null
          melt_grade?: number | null
          melt_type?: number | null
          name?: string | null
          need_grade?: number | null
          need_sex?: number | null
          pic_path?: string | null
          pile_count?: number | null
          price?: number | null
          price_type?: number | null
          profile?: string | null
          remark?: string | null
          script?: string | null
          success_modulus?: number | null
          success_rate?: number | null
          suit_id?: number | null
          type?: number | null
          updated_at?: string
        }
        Update: {
          agility?: number | null
          attack?: number | null
          attribute1?: string | null
          attribute2?: string | null
          attribute3?: string | null
          attribute4?: string | null
          attribute5?: string | null
          attribute6?: string | null
          attribute7?: string | null
          attribute8?: string | null
          beset?: string | null
          bind_type?: number | null
          can_send?: boolean | null
          can_transfer?: boolean | null
          color?: number | null
          created_at?: string
          data?: string | null
          defence?: number | null
          desc?: string | null
          floor_price?: number | null
          id?: number
          image_url?: string | null
          is_callback?: boolean | null
          is_compose?: boolean | null
          is_delete?: boolean | null
          is_equip?: boolean | null
          is_strengthen?: boolean | null
          is_throw?: boolean | null
          is_use?: boolean | null
          item_grade?: number | null
          luck?: number | null
          melt_grade?: number | null
          melt_type?: number | null
          name?: string | null
          need_grade?: number | null
          need_sex?: number | null
          pic_path?: string | null
          pile_count?: number | null
          price?: number | null
          price_type?: number | null
          profile?: string | null
          remark?: string | null
          script?: string | null
          success_modulus?: number | null
          success_rate?: number | null
          suit_id?: number | null
          type?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      items_turco: {
        Row: {
          agility: number | null
          attack: number | null
          attribute1: string | null
          attribute2: string | null
          attribute3: string | null
          attribute4: string | null
          attribute5: string | null
          attribute6: string | null
          attribute7: string | null
          attribute8: string | null
          beset: string | null
          bind_type: number | null
          can_send: boolean | null
          can_transfer: boolean | null
          color: number | null
          created_at: string
          data: string | null
          defence: number | null
          desc: string | null
          floor_price: number | null
          id: number
          image_url: string | null
          is_callback: boolean | null
          is_compose: boolean | null
          is_delete: boolean | null
          is_equip: boolean | null
          is_strengthen: boolean | null
          is_throw: boolean | null
          is_use: boolean | null
          item_grade: number | null
          luck: number | null
          melt_grade: number | null
          melt_type: number | null
          name: string | null
          need_grade: number | null
          need_sex: number | null
          pic_path: string | null
          pile_count: number | null
          price: number | null
          price_type: number | null
          profile: string | null
          remark: string | null
          script: string | null
          success_modulus: number | null
          success_rate: number | null
          suit_id: number | null
          type: number | null
          updated_at: string
        }
        Insert: {
          agility?: number | null
          attack?: number | null
          attribute1?: string | null
          attribute2?: string | null
          attribute3?: string | null
          attribute4?: string | null
          attribute5?: string | null
          attribute6?: string | null
          attribute7?: string | null
          attribute8?: string | null
          beset?: string | null
          bind_type?: number | null
          can_send?: boolean | null
          can_transfer?: boolean | null
          color?: number | null
          created_at?: string
          data?: string | null
          defence?: number | null
          desc?: string | null
          floor_price?: number | null
          id: number
          image_url?: string | null
          is_callback?: boolean | null
          is_compose?: boolean | null
          is_delete?: boolean | null
          is_equip?: boolean | null
          is_strengthen?: boolean | null
          is_throw?: boolean | null
          is_use?: boolean | null
          item_grade?: number | null
          luck?: number | null
          melt_grade?: number | null
          melt_type?: number | null
          name?: string | null
          need_grade?: number | null
          need_sex?: number | null
          pic_path?: string | null
          pile_count?: number | null
          price?: number | null
          price_type?: number | null
          profile?: string | null
          remark?: string | null
          script?: string | null
          success_modulus?: number | null
          success_rate?: number | null
          suit_id?: number | null
          type?: number | null
          updated_at?: string
        }
        Update: {
          agility?: number | null
          attack?: number | null
          attribute1?: string | null
          attribute2?: string | null
          attribute3?: string | null
          attribute4?: string | null
          attribute5?: string | null
          attribute6?: string | null
          attribute7?: string | null
          attribute8?: string | null
          beset?: string | null
          bind_type?: number | null
          can_send?: boolean | null
          can_transfer?: boolean | null
          color?: number | null
          created_at?: string
          data?: string | null
          defence?: number | null
          desc?: string | null
          floor_price?: number | null
          id?: number
          image_url?: string | null
          is_callback?: boolean | null
          is_compose?: boolean | null
          is_delete?: boolean | null
          is_equip?: boolean | null
          is_strengthen?: boolean | null
          is_throw?: boolean | null
          is_use?: boolean | null
          item_grade?: number | null
          luck?: number | null
          melt_grade?: number | null
          melt_type?: number | null
          name?: string | null
          need_grade?: number | null
          need_sex?: number | null
          pic_path?: string | null
          pile_count?: number | null
          price?: number | null
          price_type?: number | null
          profile?: string | null
          remark?: string | null
          script?: string | null
          success_modulus?: number | null
          success_rate?: number | null
          suit_id?: number | null
          type?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      package_contents: {
        Row: {
          content_item_id: number
          created_at: string
          id: string
          package_id: number
          probability: string | null
          quantity: number
          realm: string
          updated_at: string
        }
        Insert: {
          content_item_id: number
          created_at?: string
          id?: string
          package_id: number
          probability?: string | null
          quantity?: number
          realm?: string
          updated_at?: string
        }
        Update: {
          content_item_id?: number
          created_at?: string
          id?: string
          package_id?: number
          probability?: string | null
          quantity?: number
          realm?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_weeks: {
        Row: {
          created_at: string
          economica: Json
          eventos: Json
          id: string
          periodo: string
          start_date: string
          tema: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          economica?: Json
          eventos?: Json
          id?: string
          periodo?: string
          start_date: string
          tema?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          economica?: Json
          eventos?: Json
          id?: string
          periodo?: string
          start_date?: string
          tema?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      event_document_history: {
        Args: { _server_group: string }
        Returns: {
          created_at: string
          created_by_email: string
          id: string
          source: string
          title: string
          updated_at: string
          updated_by_email: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "moderador" | "analista" | "super_admin" | "midia"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user", "moderador", "analista", "super_admin", "midia"],
    },
  },
} as const
