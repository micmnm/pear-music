import { supabase } from "./supabase.js";

const DEFAULT_STOREFRONT = "ro";

let cachedStorefront: string | null = null;

export async function getStorefront(): Promise<string> {
  if (cachedStorefront) return cachedStorefront;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return DEFAULT_STOREFRONT;

  const { data } = await supabase
    .from("user_settings")
    .select("storefront")
    .eq("user_id", user.id)
    .single();

  cachedStorefront = (data?.storefront as string) || DEFAULT_STOREFRONT;
  return cachedStorefront;
}

export async function setStorefront(storefront: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, storefront, updated_at: new Date().toISOString() });

  if (error) throw new Error(error.message);
  cachedStorefront = storefront;
}
