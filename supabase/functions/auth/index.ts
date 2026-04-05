import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "npm:@simplewebauthn/server@13.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { encode as base64Encode } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RP_NAME = "Pear Music";
const RP_ID = Deno.env.get("WEBAUTHN_RP_ID") || "music.mltru.com";
const RP_ORIGIN = Deno.env.get("WEBAUTHN_ORIGIN") || "https://music.mltru.com";
const JWT_SECRET = Deno.env.get("SUPABASE_JWT_SECRET")!;

function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

async function mintJwt(userId: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    role: "authenticated",
    iss: "pear-music",
    iat: now,
    exp: now + 86400,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "");
  const data = encoder.encode(`${headerB64}.${payloadB64}`);

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, data);
  const sigB64 = base64Encode(new Uint8Array(signature))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${headerB64}.${payloadB64}.${sigB64}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
      },
    });
  }

  try {
    const { action, ...params } = await req.json();
    const db = getAdminClient();

    // === REGISTER OPTIONS ===
    if (action === "register-options") {
      const { count } = await db
        .from("users")
        .select("*", { count: "exact", head: true });
      if (count && count > 0) {
        return Response.json({ error: "Registration closed" }, { status: 403 });
      }

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userName: params.username,
        userDisplayName: params.username,
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
      });

      const { data: challenge } = await db
        .from("webauthn_challenges")
        .insert({
          challenge: options.challenge,
          type: "registration",
          metadata: { username: params.username },
        })
        .select()
        .single();

      return Response.json({ options, challengeId: challenge!.id });
    }

    // === REGISTER ===
    if (action === "register") {
      const { challengeId, attestation } = params;

      const { data: challenge } = await db
        .from("webauthn_challenges")
        .select("*")
        .eq("id", challengeId)
        .single();

      if (!challenge) {
        return Response.json({ error: "Invalid challenge" }, { status: 400 });
      }

      await db.from("webauthn_challenges").delete().eq("id", challengeId);

      const verification = await verifyRegistrationResponse({
        response: attestation,
        expectedChallenge: challenge.challenge,
        expectedOrigin: RP_ORIGIN,
        expectedRPID: RP_ID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return Response.json({ error: "Verification failed" }, { status: 400 });
      }

      const { credential, credentialDeviceType } = verification.registrationInfo;

      const { data: user } = await db
        .from("users")
        .insert({
          username: challenge.metadata.username,
          display_name: challenge.metadata.username,
        })
        .select()
        .single();

      await db.from("user_credentials").insert({
        user_id: user!.id,
        credential_id: base64Encode(credential.id),
        public_key: base64Encode(credential.publicKey),
        sign_count: credential.counter,
        device_info: credentialDeviceType,
      });

      const token = await mintJwt(user!.id);
      return Response.json({ token, userId: user!.id });
    }

    // === LOGIN OPTIONS ===
    if (action === "login-options") {
      const { data: creds } = await db
        .from("user_credentials")
        .select("credential_id");

      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        userVerification: "preferred",
        allowCredentials: (creds || []).map((c: { credential_id: string }) => ({
          id: Uint8Array.from(atob(c.credential_id), (ch) => ch.charCodeAt(0)),
          type: "public-key",
        })),
      });

      const { data: challenge } = await db
        .from("webauthn_challenges")
        .insert({ challenge: options.challenge, type: "login" })
        .select()
        .single();

      return Response.json({ options, challengeId: challenge!.id });
    }

    // === LOGIN ===
    if (action === "login") {
      const { challengeId, assertion } = params;

      const { data: challenge } = await db
        .from("webauthn_challenges")
        .select("*")
        .eq("id", challengeId)
        .single();

      if (!challenge) {
        return Response.json({ error: "Invalid challenge" }, { status: 400 });
      }

      await db.from("webauthn_challenges").delete().eq("id", challengeId);

      const assertionCredId = assertion.id;
      const { data: creds } = await db
        .from("user_credentials")
        .select("*, users(*)")
        .eq("credential_id", assertionCredId);

      if (!creds || creds.length === 0) {
        return Response.json({ error: "Unknown credential" }, { status: 400 });
      }

      const cred = creds[0];

      const verification = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: challenge.challenge,
        expectedOrigin: RP_ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: Uint8Array.from(atob(cred.credential_id), (ch) => ch.charCodeAt(0)),
          publicKey: Uint8Array.from(atob(cred.public_key), (ch) => ch.charCodeAt(0)),
          counter: cred.sign_count,
        },
      });

      if (!verification.verified) {
        return Response.json({ error: "Verification failed" }, { status: 400 });
      }

      await db
        .from("user_credentials")
        .update({ sign_count: verification.authenticationInfo.newCounter })
        .eq("id", cred.id);

      const token = await mintJwt(cred.user_id);
      return Response.json({ token, userId: cred.user_id });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
});
