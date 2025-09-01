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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          created_at: string | null
          entity: string
          entity_id: string
          id: string
          meta: Json | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          entity: string
          entity_id: string
          id?: string
          meta?: Json | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          entity?: string
          entity_id?: string
          id?: string
          meta?: Json | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      build_logs: {
        Row: {
          changes: Json | null
          created_at: string | null
          deck_id: string | null
          id: string
          seed: string | null
          user_id: string
        }
        Insert: {
          changes?: Json | null
          created_at?: string | null
          deck_id?: string | null
          id?: string
          seed?: string | null
          user_id: string
        }
        Update: {
          changes?: Json | null
          created_at?: string | null
          deck_id?: string | null
          id?: string
          seed?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_logs_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "user_decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_build_logs_deck_id"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "user_decks"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          cmc: number | null
          collector_number: string | null
          color_identity: string[] | null
          colors: string[] | null
          created_at: string | null
          faces: Json | null
          id: string
          image_uris: Json | null
          is_legendary: boolean | null
          is_reserved: boolean | null
          keywords: string[] | null
          layout: string | null
          legalities: Json | null
          loyalty: string | null
          mana_cost: string | null
          name: string
          oracle_id: string
          oracle_text: string | null
          power: string | null
          prices: Json | null
          rarity: string | null
          set_code: string
          tags: string[] | null
          toughness: string | null
          type_line: string
          updated_at: string | null
        }
        Insert: {
          cmc?: number | null
          collector_number?: string | null
          color_identity?: string[] | null
          colors?: string[] | null
          created_at?: string | null
          faces?: Json | null
          id: string
          image_uris?: Json | null
          is_legendary?: boolean | null
          is_reserved?: boolean | null
          keywords?: string[] | null
          layout?: string | null
          legalities?: Json | null
          loyalty?: string | null
          mana_cost?: string | null
          name: string
          oracle_id: string
          oracle_text?: string | null
          power?: string | null
          prices?: Json | null
          rarity?: string | null
          set_code: string
          tags?: string[] | null
          toughness?: string | null
          type_line: string
          updated_at?: string | null
        }
        Update: {
          cmc?: number | null
          collector_number?: string | null
          color_identity?: string[] | null
          colors?: string[] | null
          created_at?: string | null
          faces?: Json | null
          id?: string
          image_uris?: Json | null
          is_legendary?: boolean | null
          is_reserved?: boolean | null
          keywords?: string[] | null
          layout?: string | null
          legalities?: Json | null
          loyalty?: string | null
          mana_cost?: string | null
          name?: string
          oracle_id?: string
          oracle_text?: string | null
          power?: string | null
          prices?: Json | null
          rarity?: string | null
          set_code?: string
          tags?: string[] | null
          toughness?: string | null
          type_line?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      deck_cards: {
        Row: {
          card_id: string
          card_name: string
          created_at: string
          deck_id: string
          id: string
          is_commander: boolean
          is_sideboard: boolean
          quantity: number
        }
        Insert: {
          card_id: string
          card_name: string
          created_at?: string
          deck_id: string
          id?: string
          is_commander?: boolean
          is_sideboard?: boolean
          quantity?: number
        }
        Update: {
          card_id?: string
          card_name?: string
          created_at?: string
          deck_id?: string
          id?: string
          is_commander?: boolean
          is_sideboard?: boolean
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "deck_cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "user_decks"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_decks: {
        Row: {
          created_at: string | null
          deck_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          deck_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          deck_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_decks_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "user_decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_favorite_decks_deck_id"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "user_decks"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          card_id: string
          condition: string | null
          created_at: string | null
          currency: string | null
          foil: boolean | null
          id: string
          note: string | null
          price_usd: number
          qty: number
          status: string | null
          updated_at: string | null
          user_id: string
          visibility: string | null
        }
        Insert: {
          card_id: string
          condition?: string | null
          created_at?: string | null
          currency?: string | null
          foil?: boolean | null
          id?: string
          note?: string | null
          price_usd: number
          qty: number
          status?: string | null
          updated_at?: string | null
          user_id: string
          visibility?: string | null
        }
        Update: {
          card_id?: string
          condition?: string | null
          created_at?: string | null
          currency?: string | null
          foil?: boolean | null
          id?: string
          note?: string | null
          price_usd?: number
          qty?: number
          status?: string | null
          updated_at?: string | null
          user_id?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          is_admin: boolean | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          is_admin?: boolean | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_admin?: boolean | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      sales: {
        Row: {
          buyer_info: string | null
          card_id: string
          condition: string
          created_at: string | null
          foil: boolean | null
          id: string
          listing_id: string
          notes: string | null
          platform: string | null
          qty: number
          sale_price_usd: number
          shipped: boolean | null
          shipped_at: string | null
          tracking_number: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          buyer_info?: string | null
          card_id: string
          condition: string
          created_at?: string | null
          foil?: boolean | null
          id?: string
          listing_id: string
          notes?: string | null
          platform?: string | null
          qty: number
          sale_price_usd: number
          shipped?: boolean | null
          shipped_at?: string | null
          tracking_number?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          buyer_info?: string | null
          card_id?: string
          condition?: string
          created_at?: string | null
          foil?: boolean | null
          id?: string
          listing_id?: string
          notes?: string | null
          platform?: string | null
          qty?: number
          sale_price_usd?: number
          shipped?: boolean | null
          shipped_at?: string | null
          tracking_number?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_containers: {
        Row: {
          color: string | null
          created_at: string | null
          deck_id: string | null
          icon: string | null
          id: string
          is_default: boolean | null
          name: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          deck_id?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          deck_id?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      storage_items: {
        Row: {
          card_id: string
          container_id: string
          created_at: string | null
          foil: boolean | null
          id: string
          qty: number
          slot_id: string | null
          updated_at: string | null
        }
        Insert: {
          card_id: string
          container_id: string
          created_at?: string | null
          foil?: boolean | null
          id?: string
          qty: number
          slot_id?: string | null
          updated_at?: string | null
        }
        Update: {
          card_id?: string
          container_id?: string
          created_at?: string | null
          foil?: boolean | null
          id?: string
          qty?: number
          slot_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storage_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_items_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "storage_containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_items_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "storage_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_slots: {
        Row: {
          container_id: string
          id: string
          name: string
          position: number | null
        }
        Insert: {
          container_id: string
          id?: string
          name: string
          position?: number | null
        }
        Update: {
          container_id?: string
          id?: string
          name?: string
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "storage_slots_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "storage_containers"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_status: {
        Row: {
          current_step: string | null
          error_message: string | null
          id: string
          last_sync: string | null
          records_processed: number | null
          status: string | null
          step_progress: number | null
          total_records: number | null
        }
        Insert: {
          current_step?: string | null
          error_message?: string | null
          id: string
          last_sync?: string | null
          records_processed?: number | null
          status?: string | null
          step_progress?: number | null
          total_records?: number | null
        }
        Update: {
          current_step?: string | null
          error_message?: string | null
          id?: string
          last_sync?: string | null
          records_processed?: number | null
          status?: string | null
          step_progress?: number | null
          total_records?: number | null
        }
        Relationships: []
      }
      tag_overrides: {
        Row: {
          oracle_id: string
          tags: string[] | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          oracle_id: string
          tags?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          oracle_id?: string
          tags?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      user_collections: {
        Row: {
          card_id: string
          card_name: string
          condition: string
          created_at: string
          foil: number
          id: string
          price_usd: number | null
          quantity: number
          set_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          card_id: string
          card_name: string
          condition?: string
          created_at?: string
          foil?: number
          id?: string
          price_usd?: number | null
          quantity?: number
          set_code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          card_id?: string
          card_name?: string
          condition?: string
          created_at?: string
          foil?: number
          id?: string
          price_usd?: number | null
          quantity?: number
          set_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_collections_card_id"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      user_decks: {
        Row: {
          colors: string[]
          created_at: string
          description: string | null
          format: string
          id: string
          is_public: boolean
          name: string
          power_level: number
          updated_at: string
          user_id: string
        }
        Insert: {
          colors?: string[]
          created_at?: string
          description?: string | null
          format?: string
          id?: string
          is_public?: boolean
          name: string
          power_level?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          colors?: string[]
          created_at?: string
          description?: string | null
          format?: string
          id?: string
          is_public?: boolean
          name?: string
          power_level?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wishlist: {
        Row: {
          card_id: string
          card_name: string
          created_at: string
          id: string
          note: string | null
          priority: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          card_id: string
          card_name: string
          created_at?: string
          id?: string
          note?: string | null
          priority?: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          card_id?: string
          card_name?: string
          created_at?: string
          id?: string
          note?: string | null
          priority?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
