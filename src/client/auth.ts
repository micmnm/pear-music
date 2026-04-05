import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import { supabase } from "./supabase.js";

export async function checkAppState(): Promise<"setup" | "login" | "authenticated"> {
  // Check for existing Supabase session
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return "authenticated";

  // Check if any users exist
  const { count, error } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });

  if (error || count === null || count === 0) return "setup";
  return "login";
}

async function setSessionFromResponse(data: { access_token: string; refresh_token: string }): Promise<void> {
  const { error } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (error) throw new Error(error.message);
}

export async function register(username: string): Promise<void> {
  const optionsRes = await supabase.functions.invoke("auth", {
    body: { action: "register-options", username },
  });
  if (optionsRes.error) throw new Error(optionsRes.error.message);

  const { options, challengeId } = optionsRes.data;

  const attestation = await startRegistration({ optionsJSON: options });

  const verifyRes = await supabase.functions.invoke("auth", {
    body: { action: "register", challengeId, attestation },
  });
  if (verifyRes.error) throw new Error(verifyRes.error.message);

  await setSessionFromResponse(verifyRes.data);
}

export async function login(): Promise<void> {
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
}
