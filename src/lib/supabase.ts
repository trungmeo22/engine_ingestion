import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = ((import.meta as any).env?.VITE_SUPABASE_URL as string) || '';
const SUPABASE_ANON_KEY = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string) || '';

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

export interface SupabaseHealthStatus {
  connected: boolean;
  url: string;
  authHealthy: boolean;
  error?: string;
}

export async function checkSupabaseConnection(): Promise<SupabaseHealthStatus> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      connected: false,
      url: SUPABASE_URL,
      authHealthy: false,
      error: 'Supabase environment variables are not configured.',
    };
  }

  try {
    const response = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    return {
      connected: response.ok,
      url: SUPABASE_URL,
      authHealthy: response.ok,
      error: response.ok ? undefined : `Supabase returned HTTP ${response.status}`,
    };
  } catch (error: any) {
    return {
      connected: false,
      url: SUPABASE_URL,
      authHealthy: false,
      error: error?.message || 'Cannot reach Supabase.',
    };
  }
}
