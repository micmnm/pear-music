import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

export function setSession(accessToken: string): void {
  localStorage.setItem("pear_music_jwt", accessToken);
}

export function getStoredToken(): string | null {
  return localStorage.getItem("pear_music_jwt");
}

export function clearSession(): void {
  localStorage.removeItem("pear_music_jwt");
}

export function getAuthenticatedClient(): SupabaseClient {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
