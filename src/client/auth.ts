import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import { supabase } from "./supabase.js";
import type { AppState } from "../shared/types.js";

export async function checkAppState(): Promise<AppState> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    // No session — use the SECURITY DEFINER RPC to check if any users exist.
    // Direct SELECT is blocked by the new RLS policies for anonymous callers.
    const { data: total, error } = await supabase.rpc("count_total_users");
    if (error) {
      console.error("count_total_users failed:", error);
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

  if (error) {
    if (error.code === "PGRST116") return "login"; // no row → not registered
    // Transient error (network, deploy downtime) — trust the existing session
    console.warn("checkAppState: transient error, trusting session:", error.message);
    return "active";
  }

  if (!me) return "login";

  if (me.status === "rejected") return "rejected";
  if (me.status === "pending_approval") return "waitlist";
  return "active";
}

async function setSessionFromResponse(data: { access_token: string; refresh_token: string }): Promise<void> {
  const { error } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (error) throw new Error(error.message);
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
