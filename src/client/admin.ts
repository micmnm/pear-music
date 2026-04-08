import { supabase } from "./supabase.js";
import type { AdminUserRow } from "../shared/types.js";

async function callAdmin<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  // Explicitly attach the current session token. supabase.functions.invoke
  // doesn't reliably auto-attach it, and the admin function is gated with
  // verify_jwt: true so it returns 401 at the gateway without a Bearer.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("admin", {
    body: { action, ...params },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function listUsers(): Promise<AdminUserRow[]> {
  const data = await callAdmin<{ users: AdminUserRow[] }>("list-users");
  return data.users;
}

export async function approveUser(userId: string): Promise<void> {
  await callAdmin("approve", { userId });
}

export async function rejectUser(userId: string): Promise<void> {
  await callAdmin("reject", { userId });
}

export async function deleteUser(userId: string): Promise<void> {
  await callAdmin("delete", { userId });
}

export async function setMaxActiveUsers(value: number): Promise<void> {
  await callAdmin("set-max-active-users", { value });
}

export async function getMaxActiveUsers(): Promise<number> {
  const { data } = await supabase
    .from("app_settings")
    .select("max_active_users")
    .eq("id", 1)
    .single();
  return data?.max_active_users ?? 15;
}

export async function getActiveUserCount(): Promise<number> {
  const { data } = await supabase.rpc("count_users_by_status", {
    target_status: "active",
  });
  return (data as number) ?? 0;
}

export async function getPendingUserCount(): Promise<number> {
  const { data } = await supabase.rpc("count_users_by_status", {
    target_status: "pending_approval",
  });
  return (data as number) ?? 0;
}
