import { createClient } from "npm:@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

/**
 * Verifies the caller's JWT and confirms they have is_admin = true in our
 * users table. Authority is the database, not the JWT — JWT claims could be
 * stale.
 *
 * Throws on unauthorized; returns the admin's userId on success.
 */
async function requireAdmin(req: Request): Promise<{ userId: string }> {
  const authHeader = req.headers.get("Authorization");
  console.log("[admin] authHeader present:", !!authHeader);
  if (!authHeader) {
    throw new Error("Unauthorized: no Authorization header");
  }

  // Extract the JWT token (strip "Bearer " prefix)
  const token = authHeader.replace(/^Bearer\s+/i, "");

  // Use the admin (service-role) client's auth.getUser(token) — this
  // decodes and validates the JWT directly against the auth service
  // without needing a separate user-scoped client.
  const adminDb = getAdminClient();
  const { data: { user }, error: getUserError } = await adminDb.auth.getUser(token);
  console.log("[admin] getUser result:", user ? `user=${user.id}` : `error=${getUserError?.message}`);
  if (getUserError || !user) {
    throw new Error(`Unauthorized: ${getUserError?.message || "no user"}`);
  }

  // Authoritative admin check against the database
  const { data: row, error: rowError } = await adminDb
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  console.log("[admin] is_admin lookup:", rowError ? `error=${rowError.message}` : `is_admin=${row?.is_admin}`);

  if (!row?.is_admin) {
    throw new Error("Forbidden");
  }

  return { userId: user.id };
}

async function listUsers(): Promise<Response> {
  const db = getAdminClient();

  // Fetch all users + their album counts in one round-trip via a stored
  // expression. Two queries is simpler and fine at 15-user scale.
  const { data: users, error: usersError } = await db
    .from("users")
    .select("id, email, display_name, status, is_admin, approved_at, created_at")
    .order("created_at", { ascending: false });

  if (usersError) {
    return jsonResponse({ error: usersError.message }, 500);
  }

  const { data: counts, error: countsError } = await db
    .from("library_items")
    .select("user_id");

  if (countsError) {
    return jsonResponse({ error: countsError.message }, 500);
  }

  // Tally album counts per user_id
  const countByUser = new Map<string, number>();
  for (const row of counts ?? []) {
    countByUser.set(row.user_id, (countByUser.get(row.user_id) ?? 0) + 1);
  }

  const result = (users ?? []).map((u) => ({
    ...u,
    album_count: countByUser.get(u.id) ?? 0,
  }));

  return jsonResponse({ users: result });
}

async function approveUser(userId: string): Promise<Response> {
  if (!userId) return jsonResponse({ error: "userId required" }, 400);
  const db = getAdminClient();

  // Capacity check: count current active users vs cap
  const { count: activeCount } = await db
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  const { data: settings } = await db
    .from("app_settings")
    .select("max_active_users")
    .eq("id", 1)
    .single();

  const max = settings?.max_active_users ?? 15;
  if ((activeCount ?? 0) >= max) {
    return jsonResponse(
      { error: `At capacity (${activeCount}/${max}). Raise max_active_users first.` },
      409
    );
  }

  // Verify the target is actually pending
  const { data: target } = await db
    .from("users")
    .select("status")
    .eq("id", userId)
    .single();

  if (!target) return jsonResponse({ error: "User not found" }, 404);
  if (target.status !== "pending_approval") {
    return jsonResponse({ error: `User is ${target.status}, not pending` }, 409);
  }

  const { error } = await db
    .from("users")
    .update({ status: "active", approved_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ ok: true });
}

async function rejectUser(userId: string): Promise<Response> {
  if (!userId) return jsonResponse({ error: "userId required" }, 400);
  const db = getAdminClient();

  const { data: target } = await db
    .from("users")
    .select("status, is_admin")
    .eq("id", userId)
    .single();

  if (!target) return jsonResponse({ error: "User not found" }, 404);
  if (target.is_admin) return jsonResponse({ error: "Cannot reject an admin" }, 409);
  if (target.status !== "pending_approval") {
    return jsonResponse({ error: `User is ${target.status}, not pending` }, 409);
  }

  const { error } = await db
    .from("users")
    .update({ status: "rejected" })
    .eq("id", userId);

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ ok: true });
}

async function deleteUser(userId: string, callerId: string): Promise<Response> {
  if (!userId) return jsonResponse({ error: "userId required" }, 400);
  if (userId === callerId) {
    return jsonResponse({ error: "Cannot delete yourself" }, 409);
  }

  const db = getAdminClient();

  // Verify the target exists and is not another admin
  const { data: target } = await db
    .from("users")
    .select("is_admin")
    .eq("id", userId)
    .single();

  if (!target) return jsonResponse({ error: "User not found" }, 404);
  if (target.is_admin) return jsonResponse({ error: "Cannot delete an admin" }, 409);

  // Delete from custom users table — ON DELETE CASCADE removes
  // library_items, user_settings, user_credentials.
  const { error: usersError } = await db.from("users").delete().eq("id", userId);
  if (usersError) return jsonResponse({ error: usersError.message }, 500);

  // Also delete the corresponding Supabase Auth user
  const { error: authError } = await db.auth.admin.deleteUser(userId);
  if (authError) {
    // The custom users row is already gone — log the orphan but return success.
    console.warn(`Orphaned auth.users row ${userId}: ${authError.message}`);
  }

  return jsonResponse({ ok: true });
}

async function setMaxActiveUsers(value: unknown): Promise<Response> {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return jsonResponse({ error: "value must be a positive integer" }, 400);
  }

  const db = getAdminClient();

  // Don't allow shrinking below current active count
  const { count: activeCount } = await db
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  if (value < (activeCount ?? 0)) {
    return jsonResponse(
      { error: `Cannot set below current active count (${activeCount})` },
      409
    );
  }

  const { error } = await db
    .from("app_settings")
    .update({ max_active_users: value, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ ok: true, max_active_users: value });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId: callerUserId } = await requireAdmin(req);
    const body = await req.json();
    const { action, ...params } = body;

    if (action === "list-users") {
      return await listUsers();
    }
    if (action === "approve") {
      return await approveUser(params.userId);
    }
    if (action === "reject") {
      return await rejectUser(params.userId);
    }
    if (action === "delete") {
      return await deleteUser(params.userId, callerUserId);
    }
    if (action === "set-max-active-users") {
      return await setMaxActiveUsers(params.value);
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
