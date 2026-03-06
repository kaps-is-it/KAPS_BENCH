export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          username: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          username?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string | null;
          username?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
      };
      device_profiles: {
        Row: {
          id: string;
          gpu_renderer: string;
          gpu_vendor: string;
          gpu_architecture: string | null;
          gpu_description: string | null;
          webgpu_supported: boolean;
          webgpu_info: Json | null;
          cpu_logical_cores: number;
          device_memory_gb: number | null;
          screen_width: number;
          screen_height: number;
          physical_width: number;
          physical_height: number;
          device_pixel_ratio: number;
          color_depth: number;
          browser_name: string;
          browser_version: string;
          os_name: string;
          os_version: string;
          user_agent: string;
          capabilities: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          gpu_renderer: string;
          gpu_vendor: string;
          gpu_architecture?: string | null;
          gpu_description?: string | null;
          webgpu_supported: boolean;
          webgpu_info?: Json | null;
          cpu_logical_cores: number;
          device_memory_gb?: number | null;
          screen_width: number;
          screen_height: number;
          physical_width: number;
          physical_height: number;
          device_pixel_ratio: number;
          color_depth: number;
          browser_name: string;
          browser_version: string;
          os_name: string;
          os_version: string;
          user_agent: string;
          capabilities: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["device_profiles"]["Insert"]>;
      };
      benchmark_runs: {
        Row: {
          id: string;
          user_id: string | null;
          device_profile_id: string;
          benchmark_kind: string;
          headline_score: number;
          rating: string;
          sub_scores: Json;
          raw_metrics: Json;
          benchmark_version: string;
          browser_name: string;
          browser_version: string;
          os_platform: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          device_profile_id: string;
          benchmark_kind: string;
          headline_score: number;
          rating: string;
          sub_scores: Json;
          raw_metrics: Json;
          benchmark_version: string;
          browser_name: string;
          browser_version: string;
          os_platform: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["benchmark_runs"]["Insert"]>;
      };
      benchmark_results: {
        Row: {
          id: string;
          user_id: string | null;
          device_profile_id: string;
          coding_score: number;
          rating: string;
          sub_scores: Json;
          raw_metrics: Json;
          benchmark_version: string;
          browser_name: string;
          browser_version: string;
          os_platform: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          device_profile_id: string;
          coding_score: number;
          rating: string;
          sub_scores: Json;
          raw_metrics: Json;
          benchmark_version: string;
          browser_name: string;
          browser_version: string;
          os_platform: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["benchmark_results"]["Insert"]
        >;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
