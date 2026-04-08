import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import { supabase } from "./supabase.js";
import type { AppState } from "../shared/types.js";

export async function checkAppState(): Promise<AppState> {
  const { data: { session } } = await supabase.auth.getSession();
  console.log("[auth] checkAppState session:", session ? `user=${session.user.email} expires=${session.expires_at}` : "null");

  if (!session) {
    // No session — use the SECURITY DEFINER RPC to check if any users exist.
    // Direct SELECT is blocked by the new RLS policies for anonymous callers.
    const { data: total, error } = await supabase.rpc("count_total_users");
    if (error) {
      console.error("[auth] count_total_users failed:", error);
      return "signup"; // fail-safe: show signup
    }
    return (total ?? 0) > 0 ? "login" : "signup";
  }

  // Authenticated — read own status. The "Users can read own row" RLS policy
  // permits this.
  const { data: me, error } = await supabase
    .from("users")
    .select("status")
    .eq("id", session.user.id)
    .single();

  if (error || !me) {
    console.error("[auth] failed to read own user row:", error);
    return "login";
  }

  console.log("[auth] user status:", me.status);
  if (me.status === "rejected") return "rejected";
  if (me.status === "pending_approval") return "waitlist";
  return "active";
}

async function setSessionFromResponse(data: { access_token: string; refresh_token: string }): Promise<void> {
  console.log("[auth] setSessionFromResponse: tokens received",
    data.access_token ? `access_token (${data.access_token.length} chars)` : "NO access_token",
    data.refresh_token ? `refresh_token (${data.refresh_token.length} chars)` : "NO refresh_token");
  const { data: setData, error } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (error) {
    console.error("[auth] setSession error:", error);
    throw new Error(error.message);
  }
  console.log("[auth] setSession result:", setData.session ? `session set for ${setData.session.user.email}` : "NO session in result");

  // Verify it's actually in storage
  const stored = window.localStorage.getItem("sb-" + new URL(import.meta.env.VITE_SUPABASE_URL as string).hostname.split(".")[0] + "-auth-token");
  console.log("[auth] localStorage after setSession:", stored ? `found (${stored.length} chars)` : "NOT FOUND");
}

export async function register(email: string): Promise<{ status: string; isAdmin: boolean }> {
  const optionsRes = await supabase.functions.invoke("auth", {
    body: { action: "register-options", email },
  });
  if (optionsRes.error) throw new Error(optionsRes.error.message);

  const { options, challengeId } = optionsRes.data;

  const attestation = await startRegistration({ optionsJSON: options });

  const verifyRes = await supabase.functions.invoke("auth", {
    body: { action: "register", challengeId, attestation },
  });
  if (verifyRes.error) throw new Error(verifyRes.error.message);

  await setSessionFromResponse(verifyRes.data);
  return { status: verifyRes.data.status, isAdmin: verifyRes.data.isAdmin };
}

export async function login(): Promise<{ status: string }> {
  const optionsRes = await supabase.functions.invoke("auth", {
    body: { action: "login-options" },
  });
  if (optionsRes.error) throw new Error(optionsRes.error.message);

  const { options, challengeId } = optionsRes.data;

  const assertion = await startAuthentication({ optionsJSON: options });

  const verifyRes = await supabase.functions.invoke("auth", {
    body: { action: "login", challengeId, assertion },
  });
  if (verifyRes.error) throw new Error(verifyRes.error.message);

  await setSessionFromResponse(verifyRes.data);
  return { status: verifyRes.data.status };
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}
