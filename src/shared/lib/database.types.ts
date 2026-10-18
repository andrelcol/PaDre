export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      friendships: {
        Row: {
          accepted_at: string | null
          addressee_id: string
          closed_at: string | null
          created_at: string
          id: string
          pair_high: string | null
          pair_low: string | null
          requester_id: string
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          accepted_at?: string | null
          addressee_id: string
          closed_at?: string | null
          created_at?: string
          id?: string
          pair_high?: never
          pair_low?: never
          requester_id: string
          status: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          addressee_id?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          pair_high?: never
          pair_low?: never
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'friendships_addressee_id_fkey'
            columns: ['addressee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'friendships_requester_id_fkey'
            columns: ['requester_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      meetup_invitations: {
        Row: {
          created_at: string
          id: string
          invitee_id: string
          inviter_id: string
          meetup_id: string
          responded_at: string | null
          status: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          invitee_id: string
          inviter_id: string
          meetup_id: string
          responded_at?: string | null
          status: string
        }
        Update: {
          created_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          meetup_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'meetup_invitations_invitee_id_fkey'
            columns: ['invitee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'meetup_invitations_inviter_id_fkey'
            columns: ['inviter_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'meetup_invitations_meetup_id_fkey'
            columns: ['meetup_id']
            isOneToOne: false
            referencedRelation: 'meetups'
            referencedColumns: ['id']
          },
        ]
      }
      meetup_participants: {
        Row: {
          id: string
          joined_at: string
          meetup_id: string
          status: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          id?: string
          joined_at?: string
          meetup_id: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          meetup_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'meetup_participants_meetup_id_fkey'
            columns: ['meetup_id']
            isOneToOne: false
            referencedRelation: 'meetups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'meetup_participants_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      meetups: {
        Row: {
          created_at: string
          description: string | null
          ends_at: string
          id: string
          location_address: string | null
          location_name: string
          max_participants: number
          organizer_id: string
          scoring_rule_version_id: string
          sport_format_id: string
          starts_at: string
          status: string
          time_zone: string
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          description?: string | null
          ends_at: string
          id?: string
          location_address?: string | null
          location_name: string
          max_participants: number
          organizer_id: string
          scoring_rule_version_id: string
          sport_format_id: string
          starts_at: string
          status?: string
          time_zone: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_at?: string
          id?: string
          location_address?: string | null
          location_name?: string
          max_participants?: number
          organizer_id?: string
          scoring_rule_version_id?: string
          sport_format_id?: string
          starts_at?: string
          status?: string
          time_zone?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'meetups_organizer_id_fkey'
            columns: ['organizer_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'meetups_scoring_rule_version_id_fkey'
            columns: ['scoring_rule_version_id']
            isOneToOne: false
            referencedRelation: 'scoring_rule_versions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'meetups_sport_format_id_fkey'
            columns: ['sport_format_id']
            isOneToOne: false
            referencedRelation: 'sport_formats'
            referencedColumns: ['id']
          },
        ]
      }
      profile_preferences: {
        Row: {
          timezone: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'profile_preferences_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          updated_at: string
          username: string
          visibility: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          display_name: string
          id: string
          updated_at?: string
          username: string
          visibility?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
          username?: string
          visibility?: string
        }
        Relationships: []
      }
      scoring_rule_versions: {
        Row: {
          active: boolean
          config: NonNullable<Json>
          created_at: string
          format_id: string
          id: string
          origin: string
          rule_type: string
          version: number
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          config: NonNullable<Json>
          created_at?: string
          format_id: string
          id: string
          origin: string
          rule_type: string
          version: number
        }
        Update: {
          active?: boolean
          config?: NonNullable<Json>
          created_at?: string
          format_id?: string
          id?: string
          origin?: string
          rule_type?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'scoring_rule_versions_format_id_fkey'
            columns: ['format_id']
            isOneToOne: false
            referencedRelation: 'sport_formats'
            referencedColumns: ['id']
          },
        ]
      }
      sport_formats: {
        Row: {
          active: boolean
          created_at: string
          display_order: number
          id: string
          name: string
          players_per_side_max: number
          players_per_side_min: number
          side_count: number
          slug: string
          sport_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          created_at?: string
          display_order: number
          id: string
          name: string
          players_per_side_max: number
          players_per_side_min: number
          side_count: number
          slug: string
          sport_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          players_per_side_max?: number
          players_per_side_min?: number
          side_count?: number
          slug?: string
          sport_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sport_formats_sport_id_fkey'
            columns: ['sport_id']
            isOneToOne: false
            referencedRelation: 'sports'
            referencedColumns: ['id']
          },
        ]
      }
      sports: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          display_order: number
          id: string
          name: string
          slug: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          display_order: number
          id: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_meetup: { Args: { meetup_id: string }; Returns: string }
      cancel_meetup_invitation: {
        Args: { invitation_id: string }
        Returns: string
      }
      create_meetup: {
        Args: {
          description: string
          ends_at: string
          location_address: string
          location_name: string
          max_participants: number
          scoring_rule_version_id: string
          sport_format_id: string
          starts_at: string
          time_zone: string
          title: string
        }
        Returns: string
      }
      get_meetup: { Args: { meetup_id: string }; Returns: Json }
      invite_to_meetup: {
        Args: { meetup_id: string; username: string }
        Returns: {
          id: string
          invitee_username: string
          status: string
        }[]
      }
      leave_meetup: { Args: { meetup_id: string }; Returns: string }
      list_my_friendships: {
        Args: Record<PropertyKey, never>
        Returns: {
          accepted_at: string
          created_at: string
          id: string
          other_username: string
          side: string
          status: string
          updated_at: string
        }[]
      }
      list_my_meetups: {
        Args: Record<PropertyKey, never>
        Returns: {
          confirmed_count: number
          ends_at: string
          format_name: string
          id: string
          invitation_id: string
          location_name: string
          max_participants: number
          relation: string
          sport_name: string
          starts_at: string
          status: string
          time_zone: string
          title: string
        }[]
      }
      request_friendship: {
        Args: { username: string }
        Returns: {
          id: string
          other_username: string
          status: string
        }[]
      }
      respond_to_friendship: {
        Args: { action: string; friendship_id: string }
        Returns: {
          id: string
          other_username: string
          status: string
        }[]
      }
      respond_to_meetup_invitation: {
        Args: { action: string; invitation_id: string }
        Returns: string
      }
      update_meetup: {
        Args: {
          description: string
          ends_at: string
          location_address: string
          location_name: string
          max_participants: number
          meetup_id: string
          scoring_rule_version_id: string
          sport_format_id: string
          starts_at: string
          time_zone: string
          title: string
        }
        Returns: string
      }
      username_is_available: { Args: { candidate: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
