export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      athlete_profiles: {
        Row: {
          birth_date: string | null
          created_at: string
          data_regime: Database["public"]["Enums"]["data_regime"]
          declared_weekly_hours: number | null
          declared_weekly_sessions: number | null
          dietary_constraints: string[]
          experience_level: string
          height_cm: number | null
          nutrition_habits: Json
          sex_at_birth: string | null
          training_history: Json
          training_years: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          data_regime?: Database["public"]["Enums"]["data_regime"]
          declared_weekly_hours?: number | null
          declared_weekly_sessions?: number | null
          dietary_constraints?: string[]
          experience_level: string
          height_cm?: number | null
          nutrition_habits?: Json
          sex_at_birth?: string | null
          training_history?: Json
          training_years?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          data_regime?: Database["public"]["Enums"]["data_regime"]
          declared_weekly_hours?: number | null
          declared_weekly_sessions?: number | null
          dietary_constraints?: string[]
          experience_level?: string
          height_cm?: number | null
          nutrition_habits?: Json
          sex_at_birth?: string | null
          training_history?: Json
          training_years?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      athlete_sports: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          level: string
          priority: number
          sport_id: string
          user_id: string
          weekly_sessions_declared: number | null
          years_practice: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          level: string
          priority?: number
          sport_id: string
          user_id: string
          weekly_sessions_declared?: number | null
          years_practice?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          level?: string
          priority?: number
          sport_id?: string
          user_id?: string
          weekly_sessions_declared?: number | null
          years_practice?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_sports_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_slots: {
        Row: {
          created_at: string
          id: string
          is_available: boolean
          max_minutes: number | null
          slot: Database["public"]["Enums"]["day_slot"]
          source: string
          user_id: string
          weekday: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_available?: boolean
          max_minutes?: number | null
          slot?: Database["public"]["Enums"]["day_slot"]
          source?: string
          user_id: string
          weekday: number
        }
        Update: {
          created_at?: string
          id?: string
          is_available?: boolean
          max_minutes?: number | null
          slot?: Database["public"]["Enums"]["day_slot"]
          source?: string
          user_id?: string
          weekday?: number
        }
        Relationships: []
      }
      body_metrics: {
        Row: {
          created_at: string
          hrv_ms: number | null
          id: string
          measured_on: string
          resting_hr: number | null
          sleep_hours: number | null
          source: Database["public"]["Enums"]["data_source"]
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          created_at?: string
          hrv_ms?: number | null
          id?: string
          measured_on: string
          resting_hr?: number | null
          sleep_hours?: number | null
          source?: Database["public"]["Enums"]["data_source"]
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          created_at?: string
          hrv_ms?: number | null
          id?: string
          measured_on?: string
          resting_hr?: number | null
          sleep_hours?: number | null
          source?: Database["public"]["Enums"]["data_source"]
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      consent_documents: {
        Row: {
          body_md: string
          checksum: string
          code: string
          is_current: boolean
          locale: string
          published_at: string
          title: string
          version: string
        }
        Insert: {
          body_md: string
          checksum: string
          code: string
          is_current?: boolean
          locale?: string
          published_at?: string
          title: string
          version: string
        }
        Update: {
          body_md?: string
          checksum?: string
          code?: string
          is_current?: boolean
          locale?: string
          published_at?: string
          title?: string
          version?: string
        }
        Relationships: []
      }
      consents: {
        Row: {
          created_at: string
          document_code: string
          document_version: string
          granted: boolean
          granted_at: string
          id: string
          ip_hash: string | null
          locale: string
          revoked_at: string | null
          subject_erased_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          document_code: string
          document_version: string
          granted: boolean
          granted_at?: string
          id?: string
          ip_hash?: string | null
          locale?: string
          revoked_at?: string | null
          subject_erased_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          document_code?: string
          document_version?: string
          granted?: boolean
          granted_at?: string
          id?: string
          ip_hash?: string | null
          locale?: string
          revoked_at?: string | null
          subject_erased_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_document_fk"
            columns: ["document_code", "document_version", "locale"]
            isOneToOne: false
            referencedRelation: "consent_documents"
            referencedColumns: ["code", "version", "locale"]
          },
        ]
      }
      data_connection_secrets: {
        Row: {
          access_token_enc: string
          access_token_expires_at: string
          created_at: string
          data_connection_id: string
          refresh_locked_until: string | null
          refresh_token_enc: string
          rotated_at: string
        }
        Insert: {
          access_token_enc: string
          access_token_expires_at: string
          created_at?: string
          data_connection_id: string
          refresh_locked_until?: string | null
          refresh_token_enc: string
          rotated_at?: string
        }
        Update: {
          access_token_enc?: string
          access_token_expires_at?: string
          created_at?: string
          data_connection_id?: string
          refresh_locked_until?: string | null
          refresh_token_enc?: string
          rotated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_connection_secrets_data_connection_id_fkey"
            columns: ["data_connection_id"]
            isOneToOne: true
            referencedRelation: "data_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      data_connections: {
        Row: {
          backfill_completed_at: string | null
          connected_at: string | null
          created_at: string
          external_account_id: string | null
          id: string
          last_error_code: string | null
          last_sync_status: Database["public"]["Enums"]["sync_status"] | null
          last_synced_at: string | null
          provider_code: string
          revoked_at: string | null
          revoked_reason: string | null
          scopes: string[]
          status: Database["public"]["Enums"]["data_connection_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          backfill_completed_at?: string | null
          connected_at?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          last_error_code?: string | null
          last_sync_status?: Database["public"]["Enums"]["sync_status"] | null
          last_synced_at?: string | null
          provider_code: string
          revoked_at?: string | null
          revoked_reason?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["data_connection_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          backfill_completed_at?: string | null
          connected_at?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          last_error_code?: string | null
          last_sync_status?: Database["public"]["Enums"]["sync_status"] | null
          last_synced_at?: string | null
          provider_code?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["data_connection_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_connections_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      data_providers: {
        Row: {
          code: string
          created_at: string
          description_fr: string
          display_order: number
          is_available: boolean
          kind: string
          label_fr: string
        }
        Insert: {
          code: string
          created_at?: string
          description_fr: string
          display_order?: number
          is_available?: boolean
          kind: string
          label_fr: string
        }
        Update: {
          code?: string
          created_at?: string
          description_fr?: string
          display_order?: number
          is_available?: boolean
          kind?: string
          label_fr?: string
        }
        Relationships: []
      }
      decision_traces: {
        Row: {
          category: string
          condition_expr: string
          created_at: string
          engine_run_id: string
          id: string
          inputs_used: Json
          is_hard_guardrail: boolean
          output: Json
          plan_version_id: string | null
          rule_id: string
          rule_version: string
          ruleset_version: string
          scope: string
          scope_ref_date: string | null
          scope_ref_id: string | null
          severity: string
          user_id: string
        }
        Insert: {
          category: string
          condition_expr: string
          created_at?: string
          engine_run_id: string
          id?: string
          inputs_used: Json
          is_hard_guardrail?: boolean
          output: Json
          plan_version_id?: string | null
          rule_id: string
          rule_version: string
          ruleset_version: string
          scope: string
          scope_ref_date?: string | null
          scope_ref_id?: string | null
          severity?: string
          user_id: string
        }
        Update: {
          category?: string
          condition_expr?: string
          created_at?: string
          engine_run_id?: string
          id?: string
          inputs_used?: Json
          is_hard_guardrail?: boolean
          output?: Json
          plan_version_id?: string | null
          rule_id?: string
          rule_version?: string
          ruleset_version?: string
          scope?: string
          scope_ref_date?: string | null
          scope_ref_id?: string | null
          severity?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_traces_engine_run_id_fkey"
            columns: ["engine_run_id"]
            isOneToOne: false
            referencedRelation: "engine_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_runs: {
        Row: {
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          input_snapshot_hash: string
          output_plan_version_id: string | null
          ruleset_version: string
          started_at: string
          status: string
          trigger: Database["public"]["Enums"]["plan_trigger"]
          user_id: string
        }
        Insert: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input_snapshot_hash: string
          output_plan_version_id?: string | null
          ruleset_version: string
          started_at?: string
          status?: string
          trigger: Database["public"]["Enums"]["plan_trigger"]
          user_id: string
        }
        Update: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input_snapshot_hash?: string
          output_plan_version_id?: string | null
          ruleset_version?: string
          started_at?: string
          status?: string
          trigger?: Database["public"]["Enums"]["plan_trigger"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_runs_ruleset_version_fkey"
            columns: ["ruleset_version"]
            isOneToOne: false
            referencedRelation: "rulesets"
            referencedColumns: ["version"]
          },
        ]
      }
      explanations: {
        Row: {
          confidence: Database["public"]["Enums"]["confidence_level"]
          created_at: string
          decision_trace_ids: string[]
          fallback_used: boolean
          generated_by: Database["public"]["Enums"]["explanation_source"]
          id: string
          llm_model: string | null
          llm_prompt_hash: string | null
          locale: string
          long_text: string | null
          numeric_integrity_ok: boolean
          short_text: string
          subject_id: string
          subject_type: string
          user_id: string
        }
        Insert: {
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          decision_trace_ids: string[]
          fallback_used?: boolean
          generated_by: Database["public"]["Enums"]["explanation_source"]
          id?: string
          llm_model?: string | null
          llm_prompt_hash?: string | null
          locale?: string
          long_text?: string | null
          numeric_integrity_ok?: boolean
          short_text: string
          subject_id: string
          subject_type: string
          user_id: string
        }
        Update: {
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          decision_trace_ids?: string[]
          fallback_used?: boolean
          generated_by?: Database["public"]["Enums"]["explanation_source"]
          id?: string
          llm_model?: string | null
          llm_prompt_hash?: string | null
          locale?: string
          long_text?: string | null
          numeric_integrity_ok?: boolean
          short_text?: string
          subject_id?: string
          subject_type?: string
          user_id?: string
        }
        Relationships: []
      }
      external_sport_mappings: {
        Row: {
          default_session_type: Database["public"]["Enums"]["session_type"]
          external_code: string
          provider_code: string
          sport_id: string | null
        }
        Insert: {
          default_session_type?: Database["public"]["Enums"]["session_type"]
          external_code: string
          provider_code: string
          sport_id?: string | null
        }
        Update: {
          default_session_type?: Database["public"]["Enums"]["session_type"]
          external_code?: string
          provider_code?: string
          sport_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_sport_mappings_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "external_sport_mappings_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      free_access_events: {
        Row: {
          accessed_on: string
          first_accessed_at: string
          id: string
          surface: string
          user_id: string
        }
        Insert: {
          accessed_on: string
          first_accessed_at?: string
          id?: string
          surface: string
          user_id: string
        }
        Update: {
          accessed_on?: string
          first_accessed_at?: string
          id?: string
          surface?: string
          user_id?: string
        }
        Relationships: []
      }
      hybrid_scores: {
        Row: {
          by_day: Json
          by_discipline: Json
          components: Json
          computed_for: string
          created_at: string
          disciplines_counted: number
          engine_run_id: string | null
          explanation_id: string | null
          id: string
          inputs_digest: string
          load_units_total: number
          provenance: Json
          ruleset_version: string
          score: number | null
          sessions_counted: number
          status: Database["public"]["Enums"]["hybrid_score_status"]
          user_id: string
          weeks_available: number
          window_end: string
          window_start: string
        }
        Insert: {
          by_day?: Json
          by_discipline?: Json
          components?: Json
          computed_for: string
          created_at?: string
          disciplines_counted: number
          engine_run_id?: string | null
          explanation_id?: string | null
          id?: string
          inputs_digest: string
          load_units_total: number
          provenance?: Json
          ruleset_version: string
          score?: number | null
          sessions_counted: number
          status: Database["public"]["Enums"]["hybrid_score_status"]
          user_id: string
          weeks_available: number
          window_end: string
          window_start: string
        }
        Update: {
          by_day?: Json
          by_discipline?: Json
          components?: Json
          computed_for?: string
          created_at?: string
          disciplines_counted?: number
          engine_run_id?: string | null
          explanation_id?: string | null
          id?: string
          inputs_digest?: string
          load_units_total?: number
          provenance?: Json
          ruleset_version?: string
          score?: number | null
          sessions_counted?: number
          status?: Database["public"]["Enums"]["hybrid_score_status"]
          user_id?: string
          weeks_available?: number
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "hybrid_scores_engine_run_id_fkey"
            columns: ["engine_run_id"]
            isOneToOne: false
            referencedRelation: "engine_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hybrid_scores_explanation_id_fkey"
            columns: ["explanation_id"]
            isOneToOne: false
            referencedRelation: "explanations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hybrid_scores_ruleset_version_fkey"
            columns: ["ruleset_version"]
            isOneToOne: false
            referencedRelation: "rulesets"
            referencedColumns: ["version"]
          },
        ]
      }
      job_queue: {
        Row: {
          attempts: number
          created_at: string
          finished_at: string | null
          id: string
          idempotency_key: string
          kind: string
          last_error: string | null
          locked_at: string | null
          payload: Json
          scheduled_for: string
          status: Database["public"]["Enums"]["job_status"]
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          idempotency_key: string
          kind: string
          last_error?: string | null
          locked_at?: string | null
          payload?: Json
          scheduled_for: string
          status?: Database["public"]["Enums"]["job_status"]
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          kind?: string
          last_error?: string | null
          locked_at?: string | null
          payload?: Json
          scheduled_for?: string
          status?: Database["public"]["Enums"]["job_status"]
          user_id?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          deep_link: string | null
          id: string
          payload: Json
          read_at: string | null
          sent_at: string | null
          status: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          deep_link?: string | null
          id?: string
          payload?: Json
          read_at?: string | null
          sent_at?: string | null
          status?: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          deep_link?: string | null
          id?: string
          payload?: Json
          read_at?: string | null
          sent_at?: string | null
          status?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_checkins: {
        Row: {
          adherence: Database["public"]["Enums"]["adherence_level"]
          comment: string | null
          created_at: string
          date: string
          energy: number
          id: string
          nutrition_day_id: string | null
          user_id: string
        }
        Insert: {
          adherence: Database["public"]["Enums"]["adherence_level"]
          comment?: string | null
          created_at?: string
          date: string
          energy: number
          id?: string
          nutrition_day_id?: string | null
          user_id: string
        }
        Update: {
          adherence?: Database["public"]["Enums"]["adherence_level"]
          comment?: string | null
          created_at?: string
          date?: string
          energy?: number
          id?: string
          nutrition_day_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_checkins_nutrition_day_id_fkey"
            columns: ["nutrition_day_id"]
            isOneToOne: false
            referencedRelation: "nutrition_days"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_days: {
        Row: {
          advice_during: string | null
          advice_post: string | null
          advice_pre: string | null
          carbs_g: number
          created_at: string
          date: string
          explanation_id: string | null
          fat_g: number
          hydration_ml: number | null
          id: string
          kcal_safety_floor: number
          kcal_target: number
          modulation_reason: string
          plan_version_id: string
          plan_week_id: string
          protein_g: number
          user_id: string
        }
        Insert: {
          advice_during?: string | null
          advice_post?: string | null
          advice_pre?: string | null
          carbs_g: number
          created_at?: string
          date: string
          explanation_id?: string | null
          fat_g: number
          hydration_ml?: number | null
          id?: string
          kcal_safety_floor: number
          kcal_target: number
          modulation_reason: string
          plan_version_id: string
          plan_week_id: string
          protein_g: number
          user_id: string
        }
        Update: {
          advice_during?: string | null
          advice_post?: string | null
          advice_pre?: string | null
          carbs_g?: number
          created_at?: string
          date?: string
          explanation_id?: string | null
          fat_g?: number
          hydration_ml?: number | null
          id?: string
          kcal_safety_floor?: number
          kcal_target?: number
          modulation_reason?: string
          plan_version_id?: string
          plan_week_id?: string
          protein_g?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_days_explanation_id_fkey"
            columns: ["explanation_id"]
            isOneToOne: false
            referencedRelation: "explanations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_days_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_days_plan_week_id_fkey"
            columns: ["plan_week_id"]
            isOneToOne: false
            referencedRelation: "plan_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      objectives: {
        Row: {
          created_at: string
          feasibility: Database["public"]["Enums"]["feasibility_status"] | null
          feasibility_trace_id: string | null
          id: string
          kind: string
          label: string
          parent_objective_id: string | null
          proposed_alternative: Json | null
          sport_id: string | null
          status: Database["public"]["Enums"]["objective_status"]
          target_date: string | null
          target_metric: Json
          updated_at: string
          user_decision: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          feasibility?: Database["public"]["Enums"]["feasibility_status"] | null
          feasibility_trace_id?: string | null
          id?: string
          kind: string
          label: string
          parent_objective_id?: string | null
          proposed_alternative?: Json | null
          sport_id?: string | null
          status?: Database["public"]["Enums"]["objective_status"]
          target_date?: string | null
          target_metric?: Json
          updated_at?: string
          user_decision?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          feasibility?: Database["public"]["Enums"]["feasibility_status"] | null
          feasibility_trace_id?: string | null
          id?: string
          kind?: string
          label?: string
          parent_objective_id?: string | null
          proposed_alternative?: Json | null
          sport_id?: string | null
          status?: Database["public"]["Enums"]["objective_status"]
          target_date?: string | null
          target_metric?: Json
          updated_at?: string
          user_decision?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "objectives_parent_objective_id_fkey"
            columns: ["parent_objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectives_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_messages: {
        Row: {
          contains_health_data: boolean
          content: string
          created_at: string
          extraction: Json | null
          id: string
          is_reformulation: boolean
          latency_ms: number | null
          role: string
          session_id: string
          step: Database["public"]["Enums"]["onboarding_step"] | null
          user_id: string
        }
        Insert: {
          contains_health_data?: boolean
          content: string
          created_at?: string
          extraction?: Json | null
          id?: string
          is_reformulation?: boolean
          latency_ms?: number | null
          role: string
          session_id: string
          step?: Database["public"]["Enums"]["onboarding_step"] | null
          user_id: string
        }
        Update: {
          contains_health_data?: boolean
          content?: string
          created_at?: string
          extraction?: Json | null
          id?: string
          is_reformulation?: boolean
          latency_ms?: number | null
          role?: string
          session_id?: string
          step?: Database["public"]["Enums"]["onboarding_step"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_sessions: {
        Row: {
          completed_at: string | null
          current_step: Database["public"]["Enums"]["onboarding_step"]
          id: string
          llm_model: string | null
          profile_draft: Json
          started_at: string
          status: string
          turn_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          current_step?: Database["public"]["Enums"]["onboarding_step"]
          id?: string
          llm_model?: string | null
          profile_draft?: Json
          started_at?: string
          status?: string
          turn_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          current_step?: Database["public"]["Enums"]["onboarding_step"]
          id?: string
          llm_model?: string | null
          profile_draft?: Json
          started_at?: string
          status?: string
          turn_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pain_episodes: {
        Row: {
          consecutive_signals: number
          created_at: string
          explanation_id: string | null
          first_signal_on: string
          id: string
          last_signal_on: string
          level: Database["public"]["Enums"]["pain_protocol_level"]
          referral_issued: boolean
          referral_issued_at: string | null
          resolved_at: string | null
          updated_at: string
          user_id: string
          zone: Database["public"]["Enums"]["body_zone"]
          zone_blocked: boolean
        }
        Insert: {
          consecutive_signals?: number
          created_at?: string
          explanation_id?: string | null
          first_signal_on: string
          id?: string
          last_signal_on: string
          level: Database["public"]["Enums"]["pain_protocol_level"]
          referral_issued?: boolean
          referral_issued_at?: string | null
          resolved_at?: string | null
          updated_at?: string
          user_id: string
          zone: Database["public"]["Enums"]["body_zone"]
          zone_blocked?: boolean
        }
        Update: {
          consecutive_signals?: number
          created_at?: string
          explanation_id?: string | null
          first_signal_on?: string
          id?: string
          last_signal_on?: string
          level?: Database["public"]["Enums"]["pain_protocol_level"]
          referral_issued?: boolean
          referral_issued_at?: string | null
          resolved_at?: string | null
          updated_at?: string
          user_id?: string
          zone?: Database["public"]["Enums"]["body_zone"]
          zone_blocked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pain_episodes_explanation_id_fkey"
            columns: ["explanation_id"]
            isOneToOne: false
            referencedRelation: "explanations"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_blocks: {
        Row: {
          block_index: number
          block_type: Database["public"]["Enums"]["block_type"]
          created_at: string
          end_date: string
          focus: string | null
          id: string
          plan_version_id: string
          start_date: string
          target_load_units: number | null
          user_id: string
        }
        Insert: {
          block_index: number
          block_type: Database["public"]["Enums"]["block_type"]
          created_at?: string
          end_date: string
          focus?: string | null
          id?: string
          plan_version_id: string
          start_date: string
          target_load_units?: number | null
          user_id: string
        }
        Update: {
          block_index?: number
          block_type?: Database["public"]["Enums"]["block_type"]
          created_at?: string
          end_date?: string
          focus?: string | null
          id?: string
          plan_version_id?: string
          start_date?: string
          target_load_units?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_blocks_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_diffs: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          from_version_id: string | null
          id: string
          items: Json
          plan_id: string
          summary_explanation_id: string | null
          to_version_id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          from_version_id?: string | null
          id?: string
          items: Json
          plan_id: string
          summary_explanation_id?: string | null
          to_version_id: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          from_version_id?: string | null
          id?: string
          items?: Json
          plan_id?: string
          summary_explanation_id?: string | null
          to_version_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_diffs_from_version_id_fkey"
            columns: ["from_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_diffs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_diffs_summary_explanation_id_fkey"
            columns: ["summary_explanation_id"]
            isOneToOne: false
            referencedRelation: "explanations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_diffs_to_version_id_fkey"
            columns: ["to_version_id"]
            isOneToOne: true
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_reviews: {
        Row: {
          created_at: string
          findings: string | null
          id: string
          plan_version_id: string
          reviewed_at: string | null
          reviewer_id: string | null
          severity: string | null
          status: string
        }
        Insert: {
          created_at?: string
          findings?: string | null
          id?: string
          plan_version_id: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          severity?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          findings?: string | null
          id?: string
          plan_version_id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          severity?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_reviews_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_versions: {
        Row: {
          created_at: string
          engine_run_id: string
          horizon_end: string
          horizon_start: string
          id: string
          input_snapshot: Json
          input_snapshot_hash: string
          is_weekly_baseline: boolean
          plan_id: string
          ruleset_version: string
          snapshot: Json
          supersedes_version_id: string | null
          trigger: Database["public"]["Enums"]["plan_trigger"]
          user_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          engine_run_id: string
          horizon_end: string
          horizon_start: string
          id?: string
          input_snapshot: Json
          input_snapshot_hash: string
          is_weekly_baseline?: boolean
          plan_id: string
          ruleset_version: string
          snapshot: Json
          supersedes_version_id?: string | null
          trigger: Database["public"]["Enums"]["plan_trigger"]
          user_id: string
          version_number: number
        }
        Update: {
          created_at?: string
          engine_run_id?: string
          horizon_end?: string
          horizon_start?: string
          id?: string
          input_snapshot?: Json
          input_snapshot_hash?: string
          is_weekly_baseline?: boolean
          plan_id?: string
          ruleset_version?: string
          snapshot?: Json
          supersedes_version_id?: string | null
          trigger?: Database["public"]["Enums"]["plan_trigger"]
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_versions_engine_run_id_fkey"
            columns: ["engine_run_id"]
            isOneToOne: false
            referencedRelation: "engine_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_versions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_versions_ruleset_version_fkey"
            columns: ["ruleset_version"]
            isOneToOne: false
            referencedRelation: "rulesets"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "plan_versions_supersedes_version_id_fkey"
            columns: ["supersedes_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_weeks: {
        Row: {
          created_at: string
          detail_level: Database["public"]["Enums"]["detail_level"]
          id: string
          is_deload: boolean
          iso_week: string
          max_consecutive_days_without_rest: number | null
          notes: string | null
          plan_block_id: string | null
          plan_version_id: string
          planned_intense_sessions: number
          target_load_units: number
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          detail_level: Database["public"]["Enums"]["detail_level"]
          id?: string
          is_deload?: boolean
          iso_week: string
          max_consecutive_days_without_rest?: number | null
          notes?: string | null
          plan_block_id?: string | null
          plan_version_id: string
          planned_intense_sessions?: number
          target_load_units: number
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          detail_level?: Database["public"]["Enums"]["detail_level"]
          id?: string
          is_deload?: boolean
          iso_week?: string
          max_consecutive_days_without_rest?: number | null
          notes?: string | null
          plan_block_id?: string | null
          plan_version_id?: string
          planned_intense_sessions?: number
          target_load_units?: number
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_weeks_plan_block_id_fkey"
            columns: ["plan_block_id"]
            isOneToOne: false
            referencedRelation: "plan_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_weeks_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_sessions: {
        Row: {
          created_at: string
          detail_level: Database["public"]["Enums"]["detail_level"]
          duration_min: number | null
          explanation_id: string | null
          id: string
          intensity_zone: string | null
          interference_note: string | null
          load_units: number
          muscle_groups: Database["public"]["Enums"]["muscle_group"][]
          order_in_day: number
          plan_version_id: string
          plan_week_id: string
          prescription: Json | null
          scheduled_date: string
          session_type: Database["public"]["Enums"]["session_type"]
          slot: Database["public"]["Enums"]["day_slot"]
          sport_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          detail_level: Database["public"]["Enums"]["detail_level"]
          duration_min?: number | null
          explanation_id?: string | null
          id?: string
          intensity_zone?: string | null
          interference_note?: string | null
          load_units: number
          muscle_groups?: Database["public"]["Enums"]["muscle_group"][]
          order_in_day?: number
          plan_version_id: string
          plan_week_id: string
          prescription?: Json | null
          scheduled_date: string
          session_type: Database["public"]["Enums"]["session_type"]
          slot?: Database["public"]["Enums"]["day_slot"]
          sport_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          detail_level?: Database["public"]["Enums"]["detail_level"]
          duration_min?: number | null
          explanation_id?: string | null
          id?: string
          intensity_zone?: string | null
          interference_note?: string | null
          load_units?: number
          muscle_groups?: Database["public"]["Enums"]["muscle_group"][]
          order_in_day?: number
          plan_version_id?: string
          plan_week_id?: string
          prescription?: Json | null
          scheduled_date?: string
          session_type?: Database["public"]["Enums"]["session_type"]
          slot?: Database["public"]["Enums"]["day_slot"]
          sport_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_sessions_explanation_id_fkey"
            columns: ["explanation_id"]
            isOneToOne: false
            referencedRelation: "explanations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_sessions_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_sessions_plan_week_id_fkey"
            columns: ["plan_week_id"]
            isOneToOne: false
            referencedRelation: "plan_weeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_sessions_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          current_version_id: string | null
          id: string
          objective_id: string
          started_on: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_version_id?: string | null
          id?: string
          objective_id: string
          started_on: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_version_id?: string | null
          id?: string
          objective_id?: string
          started_on?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          app_enrolled: boolean
          created_at: string
          display_name: string | null
          id: string
          locale: string
          onboarding_status: string
          role: Database["public"]["Enums"]["user_role"]
          timezone: string
          unit_system: string
          updated_at: string
        }
        Insert: {
          app_enrolled?: boolean
          created_at?: string
          display_name?: string | null
          id: string
          locale?: string
          onboarding_status?: string
          role?: Database["public"]["Enums"]["user_role"]
          timezone?: string
          unit_system?: string
          updated_at?: string
        }
        Update: {
          app_enrolled?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          locale?: string
          onboarding_status?: string
          role?: Database["public"]["Enums"]["user_role"]
          timezone?: string
          unit_system?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      risk_flags: {
        Row: {
          created_at: string
          declared_at: string
          flag_type: Database["public"]["Enums"]["risk_flag_type"]
          id: string
          is_active: boolean
          notes_enc: string | null
          resolved_at: string | null
          restrictions: Json
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          declared_at?: string
          flag_type: Database["public"]["Enums"]["risk_flag_type"]
          id?: string
          is_active?: boolean
          notes_enc?: string | null
          resolved_at?: string | null
          restrictions?: Json
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          declared_at?: string
          flag_type?: Database["public"]["Enums"]["risk_flag_type"]
          id?: string
          is_active?: boolean
          notes_enc?: string | null
          resolved_at?: string | null
          restrictions?: Json
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      rulesets: {
        Row: {
          checksum: string
          created_at: string
          is_active: boolean
          notes: string | null
          params: Json
          published_at: string | null
          published_by: string | null
          source_refs: Json
          version: string
        }
        Insert: {
          checksum: string
          created_at?: string
          is_active?: boolean
          notes?: string | null
          params: Json
          published_at?: string | null
          published_by?: string | null
          source_refs?: Json
          version: string
        }
        Update: {
          checksum?: string
          created_at?: string
          is_active?: boolean
          notes?: string | null
          params?: Json
          published_at?: string | null
          published_by?: string | null
          source_refs?: Json
          version?: string
        }
        Relationships: []
      }
      session_logs: {
        Row: {
          actual_duration_min: number | null
          comment: string | null
          completion: Database["public"]["Enums"]["completion_status"]
          created_at: string
          data_connection_id: string | null
          distance_m: number | null
          elevation_gain_m: number | null
          excluded_at: string | null
          exclusion_reason: string | null
          external_activity_id: string | null
          freshness: number | null
          id: string
          load_units: number | null
          logged_date: string
          match_evidence: Json | null
          not_done_reason: string | null
          pain: Database["public"]["Enums"]["pain_level"]
          pain_at_rest: boolean
          pain_zone: Database["public"]["Enums"]["body_zone"] | null
          planned_session_id: string | null
          rpe: number | null
          session_type: Database["public"]["Enums"]["session_type"] | null
          source: Database["public"]["Enums"]["data_source"]
          sport_id: string | null
          started_at: string | null
          superseded_by_log_id: string | null
          user_id: string
        }
        Insert: {
          actual_duration_min?: number | null
          comment?: string | null
          completion: Database["public"]["Enums"]["completion_status"]
          created_at?: string
          data_connection_id?: string | null
          distance_m?: number | null
          elevation_gain_m?: number | null
          excluded_at?: string | null
          exclusion_reason?: string | null
          external_activity_id?: string | null
          freshness?: number | null
          id?: string
          load_units?: number | null
          logged_date: string
          match_evidence?: Json | null
          not_done_reason?: string | null
          pain?: Database["public"]["Enums"]["pain_level"]
          pain_at_rest?: boolean
          pain_zone?: Database["public"]["Enums"]["body_zone"] | null
          planned_session_id?: string | null
          rpe?: number | null
          session_type?: Database["public"]["Enums"]["session_type"] | null
          source?: Database["public"]["Enums"]["data_source"]
          sport_id?: string | null
          started_at?: string | null
          superseded_by_log_id?: string | null
          user_id: string
        }
        Update: {
          actual_duration_min?: number | null
          comment?: string | null
          completion?: Database["public"]["Enums"]["completion_status"]
          created_at?: string
          data_connection_id?: string | null
          distance_m?: number | null
          elevation_gain_m?: number | null
          excluded_at?: string | null
          exclusion_reason?: string | null
          external_activity_id?: string | null
          freshness?: number | null
          id?: string
          load_units?: number | null
          logged_date?: string
          match_evidence?: Json | null
          not_done_reason?: string | null
          pain?: Database["public"]["Enums"]["pain_level"]
          pain_at_rest?: boolean
          pain_zone?: Database["public"]["Enums"]["body_zone"] | null
          planned_session_id?: string | null
          rpe?: number | null
          session_type?: Database["public"]["Enums"]["session_type"] | null
          source?: Database["public"]["Enums"]["data_source"]
          sport_id?: string | null
          started_at?: string | null
          superseded_by_log_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_logs_data_connection_id_fkey"
            columns: ["data_connection_id"]
            isOneToOne: false
            referencedRelation: "data_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_logs_planned_session_id_fkey"
            columns: ["planned_session_id"]
            isOneToOne: false
            referencedRelation: "planned_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_logs_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_logs_superseded_by_log_id_fkey"
            columns: ["superseded_by_log_id"]
            isOneToOne: false
            referencedRelation: "session_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_logs_superseded_by_log_id_fkey"
            columns: ["superseded_by_log_id"]
            isOneToOne: false
            referencedRelation: "session_logs_counted"
            referencedColumns: ["id"]
          },
        ]
      }
      sports: {
        Row: {
          code: string
          created_at: string
          default_muscle_groups: Database["public"]["Enums"]["muscle_group"][]
          family: string
          id: string
          is_documented: boolean
          label_fr: string
        }
        Insert: {
          code: string
          created_at?: string
          default_muscle_groups?: Database["public"]["Enums"]["muscle_group"][]
          family: string
          id?: string
          is_documented?: boolean
          label_fr: string
        }
        Update: {
          code?: string
          created_at?: string
          default_muscle_groups?: Database["public"]["Enums"]["muscle_group"][]
          family?: string
          id?: string
          is_documented?: boolean
          label_fr?: string
        }
        Relationships: []
      }
      stagnation_diagnoses: {
        Row: {
          created_at: string
          diagnosis: Database["public"]["Enums"]["stagnation_diagnosis"] | null
          engine_run_id: string | null
          evaluated_on: string
          evidence: Json
          explanation_id: string | null
          id: string
          indicator: string | null
          plan_version_id: string | null
          recommended_action: string | null
          status: Database["public"]["Enums"]["stagnation_status"]
          user_id: string
          weeks_available: number
          window_end: string
          window_start: string
        }
        Insert: {
          created_at?: string
          diagnosis?: Database["public"]["Enums"]["stagnation_diagnosis"] | null
          engine_run_id?: string | null
          evaluated_on: string
          evidence?: Json
          explanation_id?: string | null
          id?: string
          indicator?: string | null
          plan_version_id?: string | null
          recommended_action?: string | null
          status: Database["public"]["Enums"]["stagnation_status"]
          user_id: string
          weeks_available: number
          window_end: string
          window_start: string
        }
        Update: {
          created_at?: string
          diagnosis?: Database["public"]["Enums"]["stagnation_diagnosis"] | null
          engine_run_id?: string | null
          evaluated_on?: string
          evidence?: Json
          explanation_id?: string | null
          id?: string
          indicator?: string | null
          plan_version_id?: string | null
          recommended_action?: string | null
          status?: Database["public"]["Enums"]["stagnation_status"]
          user_id?: string
          weeks_available?: number
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "stagnation_diagnoses_engine_run_id_fkey"
            columns: ["engine_run_id"]
            isOneToOne: false
            referencedRelation: "engine_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stagnation_diagnoses_explanation_id_fkey"
            columns: ["explanation_id"]
            isOneToOne: false
            referencedRelation: "explanations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stagnation_diagnoses_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          api_version: string | null
          error: string | null
          event_created: string
          id: string
          payload: Json
          processed_at: string | null
          type: string
        }
        Insert: {
          api_version?: string | null
          error?: string | null
          event_created: string
          id: string
          payload: Json
          processed_at?: string | null
          type: string
        }
        Update: {
          api_version?: string | null
          error?: string | null
          event_created?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          type?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          last_event_created: string | null
          price_id: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          last_event_created?: string | null
          price_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          last_event_created?: string | null
          price_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          data_connection_id: string
          error_code: string | null
          error_message: string | null
          external_cursor: string | null
          finished_at: string | null
          id: string
          items_failed: number
          items_imported: number
          items_merged: number
          items_seen: number
          items_skipped: number
          rate_limit: Json | null
          started_at: string
          status: Database["public"]["Enums"]["sync_status"]
          trigger: Database["public"]["Enums"]["sync_trigger"]
          user_id: string
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          data_connection_id: string
          error_code?: string | null
          error_message?: string | null
          external_cursor?: string | null
          finished_at?: string | null
          id?: string
          items_failed?: number
          items_imported?: number
          items_merged?: number
          items_seen?: number
          items_skipped?: number
          rate_limit?: Json | null
          started_at?: string
          status?: Database["public"]["Enums"]["sync_status"]
          trigger: Database["public"]["Enums"]["sync_trigger"]
          user_id: string
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          data_connection_id?: string
          error_code?: string | null
          error_message?: string | null
          external_cursor?: string | null
          finished_at?: string | null
          id?: string
          items_failed?: number
          items_imported?: number
          items_merged?: number
          items_seen?: number
          items_skipped?: number
          rate_limit?: Json | null
          started_at?: string
          status?: Database["public"]["Enums"]["sync_status"]
          trigger?: Database["public"]["Enums"]["sync_trigger"]
          user_id?: string
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_data_connection_id_fkey"
            columns: ["data_connection_id"]
            isOneToOne: false
            referencedRelation: "data_connections"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      session_logs_counted: {
        Row: {
          actual_duration_min: number | null
          comment: string | null
          completion: Database["public"]["Enums"]["completion_status"] | null
          created_at: string | null
          data_connection_id: string | null
          distance_m: number | null
          elevation_gain_m: number | null
          excluded_at: string | null
          exclusion_reason: string | null
          external_activity_id: string | null
          freshness: number | null
          id: string | null
          load_units: number | null
          logged_date: string | null
          match_evidence: Json | null
          not_done_reason: string | null
          pain: Database["public"]["Enums"]["pain_level"] | null
          pain_at_rest: boolean | null
          pain_zone: Database["public"]["Enums"]["body_zone"] | null
          planned_session_id: string | null
          rpe: number | null
          session_type: Database["public"]["Enums"]["session_type"] | null
          source: Database["public"]["Enums"]["data_source"] | null
          sport_id: string | null
          started_at: string | null
          superseded_by_log_id: string | null
          user_id: string | null
        }
        Insert: {
          actual_duration_min?: number | null
          comment?: string | null
          completion?: Database["public"]["Enums"]["completion_status"] | null
          created_at?: string | null
          data_connection_id?: string | null
          distance_m?: number | null
          elevation_gain_m?: number | null
          excluded_at?: string | null
          exclusion_reason?: string | null
          external_activity_id?: string | null
          freshness?: number | null
          id?: string | null
          load_units?: number | null
          logged_date?: string | null
          match_evidence?: Json | null
          not_done_reason?: string | null
          pain?: Database["public"]["Enums"]["pain_level"] | null
          pain_at_rest?: boolean | null
          pain_zone?: Database["public"]["Enums"]["body_zone"] | null
          planned_session_id?: string | null
          rpe?: number | null
          session_type?: Database["public"]["Enums"]["session_type"] | null
          source?: Database["public"]["Enums"]["data_source"] | null
          sport_id?: string | null
          started_at?: string | null
          superseded_by_log_id?: string | null
          user_id?: string | null
        }
        Update: {
          actual_duration_min?: number | null
          comment?: string | null
          completion?: Database["public"]["Enums"]["completion_status"] | null
          created_at?: string | null
          data_connection_id?: string | null
          distance_m?: number | null
          elevation_gain_m?: number | null
          excluded_at?: string | null
          exclusion_reason?: string | null
          external_activity_id?: string | null
          freshness?: number | null
          id?: string | null
          load_units?: number | null
          logged_date?: string | null
          match_evidence?: Json | null
          not_done_reason?: string | null
          pain?: Database["public"]["Enums"]["pain_level"] | null
          pain_at_rest?: boolean | null
          pain_zone?: Database["public"]["Enums"]["body_zone"] | null
          planned_session_id?: string | null
          rpe?: number | null
          session_type?: Database["public"]["Enums"]["session_type"] | null
          source?: Database["public"]["Enums"]["data_source"] | null
          sport_id?: string | null
          started_at?: string | null
          superseded_by_log_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_logs_data_connection_id_fkey"
            columns: ["data_connection_id"]
            isOneToOne: false
            referencedRelation: "data_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_logs_planned_session_id_fkey"
            columns: ["planned_session_id"]
            isOneToOne: false
            referencedRelation: "planned_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_logs_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_logs_superseded_by_log_id_fkey"
            columns: ["superseded_by_log_id"]
            isOneToOne: false
            referencedRelation: "session_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_logs_superseded_by_log_id_fkey"
            columns: ["superseded_by_log_id"]
            isOneToOne: false
            referencedRelation: "session_logs_counted"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      claim_connection_refresh: {
        Args: { p_connection_id: string; p_lease_seconds: number }
        Returns: boolean
      }
      claim_job_queue: {
        Args: { p_limit: number }
        Returns: {
          attempts: number
          created_at: string
          finished_at: string | null
          id: string
          idempotency_key: string
          kind: string
          last_error: string | null
          locked_at: string | null
          payload: Json
          scheduled_for: string
          status: Database["public"]["Enums"]["job_status"]
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "job_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      erase_account: { Args: { p_user: string }; Returns: Json }
      has_active_consent: {
        Args: { p_code: string; p_user: string }
        Returns: boolean
      }
      is_staff: { Args: never; Returns: boolean }
      purge_stale_stripe_events: {
        Args: { p_retention_days?: number }
        Returns: number
      }
      read_data_connection_secret: {
        Args: { p_connection_id: string; p_key: string }
        Returns: {
          access_token: string
          access_token_expires_at: string
          refresh_token: string
        }[]
      }
      requeue_stuck_job_queue: {
        Args: { p_stuck_after_seconds?: number }
        Returns: number
      }
      store_data_connection_secret: {
        Args: {
          p_access_token: string
          p_connection_id: string
          p_expires_at: string
          p_key: string
          p_refresh_token: string
        }
        Returns: undefined
      }
    }
    Enums: {
      adherence_level: "low" | "partial" | "high"
      block_type:
        | "base"
        | "build"
        | "specific"
        | "taper"
        | "transition"
        | "recovery"
      body_zone:
        | "knee"
        | "ankle"
        | "foot"
        | "hip"
        | "lower_back"
        | "upper_back"
        | "shoulder"
        | "elbow"
        | "wrist"
        | "neck"
        | "thigh"
        | "calf"
        | "chest"
        | "other"
      completion_status: "done" | "partial" | "not_done"
      confidence_level: "high" | "calibrating" | "unknown"
      data_connection_status: "pending" | "active" | "needs_reauth" | "revoked"
      data_regime: "cold" | "declared" | "connected"
      data_source: "declared" | "connected"
      day_slot: "am" | "pm" | "unspecified"
      detail_level: "detailed" | "intent" | "macro"
      explanation_source: "template" | "llm"
      feasibility_status: "realistic" | "stretch" | "unrealistic"
      hybrid_score_status: "calibration" | "available"
      job_status: "pending" | "running" | "done" | "failed" | "abandoned"
      muscle_group:
        | "quads"
        | "hamstrings"
        | "glutes"
        | "calves"
        | "core"
        | "back"
        | "chest"
        | "shoulders"
        | "arms"
        | "full_body"
        | "none"
      notification_channel: "push" | "email" | "in_app"
      objective_status:
        | "draft"
        | "active"
        | "renegotiated"
        | "achieved"
        | "expired"
        | "abandoned"
      onboarding_step:
        | "intro"
        | "goal"
        | "level"
        | "history"
        | "sports"
        | "availability"
        | "nutrition"
        | "risk_filter"
        | "disclaimer"
        | "health_consent"
        | "review"
        | "completed"
      pain_level: "none" | "light" | "pain"
      pain_protocol_level: "none" | "light" | "persistent" | "acute"
      plan_trigger:
        | "onboarding"
        | "objective_renegotiation"
        | "negative_signal"
        | "pain_protocol"
        | "weekly_review"
        | "stagnation"
        | "objective_end"
        | "manual_admin"
        | "hybrid_score"
      risk_flag_type:
        | "minor"
        | "pregnancy"
        | "pathology"
        | "eating_disorder_history"
        | "other"
      session_type:
        | "endurance"
        | "tempo"
        | "interval"
        | "long"
        | "strength"
        | "power"
        | "mobility"
        | "technique"
        | "cross_training"
        | "rest"
      stagnation_diagnosis:
        | "understimulation"
        | "overload"
        | "nonadherence"
        | "inconclusive"
      stagnation_status: "calibration" | "no_stagnation" | "stagnation"
      subscription_tier: "free" | "premium"
      sync_status: "running" | "succeeded" | "partial" | "failed"
      sync_trigger:
        | "initial_backfill"
        | "webhook"
        | "scheduled_reconcile"
        | "manual"
      user_role: "athlete" | "staff"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      adherence_level: ["low", "partial", "high"],
      block_type: [
        "base",
        "build",
        "specific",
        "taper",
        "transition",
        "recovery",
      ],
      body_zone: [
        "knee",
        "ankle",
        "foot",
        "hip",
        "lower_back",
        "upper_back",
        "shoulder",
        "elbow",
        "wrist",
        "neck",
        "thigh",
        "calf",
        "chest",
        "other",
      ],
      completion_status: ["done", "partial", "not_done"],
      confidence_level: ["high", "calibrating", "unknown"],
      data_connection_status: ["pending", "active", "needs_reauth", "revoked"],
      data_regime: ["cold", "declared", "connected"],
      data_source: ["declared", "connected"],
      day_slot: ["am", "pm", "unspecified"],
      detail_level: ["detailed", "intent", "macro"],
      explanation_source: ["template", "llm"],
      feasibility_status: ["realistic", "stretch", "unrealistic"],
      hybrid_score_status: ["calibration", "available"],
      job_status: ["pending", "running", "done", "failed", "abandoned"],
      muscle_group: [
        "quads",
        "hamstrings",
        "glutes",
        "calves",
        "core",
        "back",
        "chest",
        "shoulders",
        "arms",
        "full_body",
        "none",
      ],
      notification_channel: ["push", "email", "in_app"],
      objective_status: [
        "draft",
        "active",
        "renegotiated",
        "achieved",
        "expired",
        "abandoned",
      ],
      onboarding_step: [
        "intro",
        "goal",
        "level",
        "history",
        "sports",
        "availability",
        "nutrition",
        "risk_filter",
        "disclaimer",
        "health_consent",
        "review",
        "completed",
      ],
      pain_level: ["none", "light", "pain"],
      pain_protocol_level: ["none", "light", "persistent", "acute"],
      plan_trigger: [
        "onboarding",
        "objective_renegotiation",
        "negative_signal",
        "pain_protocol",
        "weekly_review",
        "stagnation",
        "objective_end",
        "manual_admin",
        "hybrid_score",
      ],
      risk_flag_type: [
        "minor",
        "pregnancy",
        "pathology",
        "eating_disorder_history",
        "other",
      ],
      session_type: [
        "endurance",
        "tempo",
        "interval",
        "long",
        "strength",
        "power",
        "mobility",
        "technique",
        "cross_training",
        "rest",
      ],
      stagnation_diagnosis: [
        "understimulation",
        "overload",
        "nonadherence",
        "inconclusive",
      ],
      stagnation_status: ["calibration", "no_stagnation", "stagnation"],
      subscription_tier: ["free", "premium"],
      sync_status: ["running", "succeeded", "partial", "failed"],
      sync_trigger: [
        "initial_backfill",
        "webhook",
        "scheduled_reconcile",
        "manual",
      ],
      user_role: ["athlete", "staff"],
    },
  },
} as const

