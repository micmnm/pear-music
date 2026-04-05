import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import { supabase } from "./supabase.js";
import { setSession } from "./supabase.js";

export async function checkAppState(): Promise<"setup" | "login" | "authenticated"> {
  const token = localStorage.getItem("pear_music_jwt");
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.exp * 1000 > Date.now()) return "authenticated";
    } catch {
      // Invalid token, fall through
    }
    localStorage.removeItem("pear_music_jwt");
  }

  const { count, error } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });

  if (error || count === null || count === 0) return "setup";
  return "login";
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

  setSession(verifyRes.data.token);
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

  setSession(verifyRes.data.token);
}
