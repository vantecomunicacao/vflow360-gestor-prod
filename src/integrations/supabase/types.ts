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
      ai_config: {
        Row: {
          action_type: string
          auto_approve: boolean
          created_at: string
          enabled: boolean
          id: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          action_type: string
          auto_approve?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          action_type?: string
          auto_approve?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_config: {
        Row: {
          api_key: string | null
          created_at: string
          id: string
          model: string | null
          provider: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          id?: string
          model?: string | null
          provider?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          api_key?: string | null
          created_at?: string
          id?: string
          model?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_log: {
        Row: {
          completion_tokens: number
          conversation_id: string | null
          cost_usd: number
          created_at: string
          id: string
          model: string
          prompt_tokens: number
          provider: string
          total_tokens: number
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          completion_tokens?: number
          conversation_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          model: string
          prompt_tokens?: number
          provider: string
          total_tokens?: number
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          completion_tokens?: number
          conversation_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          model?: string
          prompt_tokens?: number
          provider?: string
          total_tokens?: number
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          analyze_after: string | null
          analyze_started_at: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          ghl_user_id: string | null
          id: string
          integration_label: string | null
          integration_type: string | null
          last_message: string | null
          last_message_at: string | null
          unread_count: number
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          analyze_after?: string | null
          analyze_started_at?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          ghl_user_id?: string | null
          id?: string
          integration_label?: string | null
          integration_type?: string | null
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          analyze_after?: string | null
          analyze_started_at?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          ghl_user_id?: string | null
          id?: string
          integration_label?: string | null
          integration_type?: string | null
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      disabled_contacts: {
        Row: {
          contact_phone: string
          created_at: string
          id: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          contact_phone: string
          created_at?: string
          id?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          contact_phone?: string
          created_at?: string
          id?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disabled_contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_custom_fields: {
        Row: {
          created_at: string
          data_type: string | null
          field_key: string | null
          ghl_id: string
          id: string
          model: string | null
          name: string
          picklist_options: Json | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          data_type?: string | null
          field_key?: string | null
          ghl_id: string
          id?: string
          model?: string | null
          name: string
          picklist_options?: Json | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          data_type?: string | null
          field_key?: string | null
          ghl_id?: string
          id?: string
          model?: string | null
          name?: string
          picklist_options?: Json | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_custom_fields_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_dashboard_settings: {
        Row: {
          additional_date_field: string | null
          ai_allowed_pipeline_ids: string[]
          business_hours_end: string
          business_hours_start: string
          chart_custom_fields: string[]
          created_at: string
          default_pipeline_ids: string[] | null
          funnel_stage_mapping: Json | null
          origin_field_name: string | null
          updated_at: string
          utm_campaign_field_id: string | null
          utm_content_field_id: string | null
          utm_medium_field_id: string | null
          utm_source_field_id: string | null
          utm_term_field_id: string | null
          visible_custom_fields: string[] | null
          won_stage_keys: string[] | null
          workspace_id: string
        }
        Insert: {
          additional_date_field?: string | null
          ai_allowed_pipeline_ids?: string[]
          business_hours_end?: string
          business_hours_start?: string
          chart_custom_fields?: string[]
          created_at?: string
          default_pipeline_ids?: string[] | null
          funnel_stage_mapping?: Json | null
          origin_field_name?: string | null
          updated_at?: string
          utm_campaign_field_id?: string | null
          utm_content_field_id?: string | null
          utm_medium_field_id?: string | null
          utm_source_field_id?: string | null
          utm_term_field_id?: string | null
          visible_custom_fields?: string[] | null
          won_stage_keys?: string[] | null
          workspace_id: string
        }
        Update: {
          additional_date_field?: string | null
          ai_allowed_pipeline_ids?: string[]
          business_hours_end?: string
          business_hours_start?: string
          chart_custom_fields?: string[]
          created_at?: string
          default_pipeline_ids?: string[] | null
          funnel_stage_mapping?: Json | null
          origin_field_name?: string | null
          updated_at?: string
          utm_campaign_field_id?: string | null
          utm_content_field_id?: string | null
          utm_medium_field_id?: string | null
          utm_source_field_id?: string | null
          utm_term_field_id?: string | null
          visible_custom_fields?: string[] | null
          won_stage_keys?: string[] | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_dashboard_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_loss_reasons: {
        Row: {
          created_at: string
          ghl_id: string
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          ghl_id: string
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          ghl_id?: string
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_loss_reasons_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_opportunities: {
        Row: {
          assigned_to: string | null
          contact_email: string | null
          contact_id: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          custom_fields: Json | null
          ghl_created_at: string | null
          ghl_id: string
          ghl_updated_at: string | null
          id: string
          last_status_change_at: string | null
          lost_reason_id: string | null
          monetary_value: number | null
          name: string | null
          pipeline_id: string | null
          source: string | null
          stage_id: string | null
          status: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          contact_email?: string | null
          contact_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          custom_fields?: Json | null
          ghl_created_at?: string | null
          ghl_id: string
          ghl_updated_at?: string | null
          id?: string
          last_status_change_at?: string | null
          lost_reason_id?: string | null
          monetary_value?: number | null
          name?: string | null
          pipeline_id?: string | null
          source?: string | null
          stage_id?: string | null
          status?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          contact_email?: string | null
          contact_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          custom_fields?: Json | null
          ghl_created_at?: string | null
          ghl_id?: string
          ghl_updated_at?: string | null
          id?: string
          last_status_change_at?: string | null
          lost_reason_id?: string | null
          monetary_value?: number | null
          name?: string | null
          pipeline_id?: string | null
          source?: string | null
          stage_id?: string | null
          status?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_opportunities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_pipelines: {
        Row: {
          created_at: string
          ghl_id: string
          id: string
          name: string
          stages: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          ghl_id: string
          id?: string
          name: string
          stages?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          ghl_id?: string
          id?: string
          name?: string
          stages?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_pipelines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_sync_status: {
        Row: {
          created_at: string
          is_running: boolean
          last_sync_at: string | null
          last_sync_duration_ms: number | null
          last_sync_error: string | null
          last_sync_status: string | null
          opportunities_count: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          is_running?: boolean
          last_sync_at?: string | null
          last_sync_duration_ms?: number | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          opportunities_count?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          is_running?: boolean
          last_sync_at?: string | null
          last_sync_duration_ms?: number | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          opportunities_count?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_sync_status_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_users: {
        Row: {
          created_at: string
          email: string | null
          ghl_id: string
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          ghl_id: string
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          ghl_id?: string
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_users_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_pairing_tokens: {
        Row: {
          created_at: string
          created_by_user_id: string
          id: string
          integration_id: string
          last_paired_at: string | null
          last_seen_at: string | null
          revoked_at: string | null
          token_hash: string
          token_prefix: string
          updated_at: string
          use_count: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          id?: string
          integration_id: string
          last_paired_at?: string | null
          last_seen_at?: string | null
          revoked_at?: string | null
          token_hash: string
          token_prefix: string
          updated_at?: string
          use_count?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          id?: string
          integration_id?: string
          last_paired_at?: string | null
          last_seen_at?: string | null
          revoked_at?: string | null
          token_hash?: string
          token_prefix?: string
          updated_at?: string
          use_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_pairing_tokens_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_pairing_tokens_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          id: string
          status: string
          type: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          status?: string
          type: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          direction: string
          id: string
          media_url: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          media_url?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          media_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suggestions: {
        Row: {
          action_data: Json
          ai_provider: string | null
          conversation_id: string | null
          created_at: string
          description: string | null
          id: string
          status: string
          title: string
          type: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          action_data?: Json
          ai_provider?: string | null
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          title: string
          type: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          action_data?: Json
          ai_provider?: string | null
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          context: Json
          created_at: string
          env: string | null
          id: string
          level: string
          message: string
          source: string
          stack: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          env?: string | null
          id?: string
          level: string
          message: string
          source: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          env?: string | null
          id?: string
          level?: string
          message?: string
          source?: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          created_at: string
          updated_at: string
          user_id: string
          view_integrations: boolean
          view_settings: boolean
          view_suggestions: boolean
        }
        Insert: {
          created_at?: string
          updated_at?: string
          user_id: string
          view_integrations?: boolean
          view_settings?: boolean
          view_suggestions?: boolean
        }
        Update: {
          created_at?: string
          updated_at?: string
          user_id?: string
          view_integrations?: boolean
          view_settings?: boolean
          view_suggestions?: boolean
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
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_workspace_member: {
        Args: { _email: string; _workspace_id: string }
        Returns: string
      }
      can_manage_workspace: {
        Args: { _workspace_id: string }
        Returns: boolean
      }
      cleanup_old_system_logs: { Args: never; Returns: undefined }
      create_workspace: { Args: { _name: string }; Returns: string }
      get_my_permissions: {
        Args: never
        Returns: {
          is_admin: boolean
          view_integrations: boolean
          view_settings: boolean
          view_suggestions: boolean
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      list_workspace_members: {
        Args: { _workspace_id: string }
        Returns: {
          email: string
          full_name: string
          is_owner: boolean
          role: string
          user_id: string
        }[]
      }
      remove_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: undefined
      }
      trigger_ghl_sync_all: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
