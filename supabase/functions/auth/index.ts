import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "npm:@simplewebauthn/server@13.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { decideSignupStatus } from "../_shared/slot-accounting.ts";
function base64Encode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data));
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RP_NAME = "Pear Music";
const RP_ID = Deno.env.get("WEBAUTHN_RP_ID") || "music.mltru.com";
const RP_ORIGIN = Deno.env.get("WEBAUTHN_ORIGIN") || "https://music.mltru.com";

function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// Generate a Supabase Auth session by creating a magic link and verifying it
// server-side, returning the access_token and refresh_token to the client.
async function createSessionForUser(
  email: string
): Promise<{ access_token: string; refresh_token: string }> {
  const adminDb = getAdminClient();

  const { data: linkData, error: linkError } = await adminDb.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error(linkError?.message || "Failed to generate session link");
  }

  // Verify the token server-side to get a session
  const verifyUrl = `${SUPABASE_URL}/auth/v1/verify`;
  const verifyRes = await fetch(verifyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_KEY,
    },
    body: JSON.stringify({
      type: "magiclink",
      token_hash: linkData.properties.hashed_token,
    }),
  });

  if (!verifyRes.ok) {
    const err = await verifyRes.json();
    throw new Error(err.msg || "Failed to verify session");
  }

  const session = await verifyRes.json();
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  };
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();
    const db = getAdminClient();

    // === REGISTER OPTIONS ===
    if (action === "register-options") {
      // No single-user gate — registration is open. Slot accounting happens in the
      // 'register' action below, after the WebAuthn ceremony succeeds.

      if (!params.email || typeof params.email !== "string") {
        return jsonResponse({ error: "Email required" }, 400);
      }

      // Reject duplicate emails up front so we fail fast instead of after WebAuthn.
      const { data: existing } = await db
        .from("users")
        .select("id")
        .eq("email", params.email)
        .maybeSingle();
      if (existing) {
        return jsonResponse({ error: "Email already registered" }, 409);
      }

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userName: params.email,
        userDisplayName: params.email,
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
          metadata: { email: params.email },
        })
        .select()
        .single();

      return jsonResponse({ options, challengeId: challenge!.id });
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
        return jsonResponse({ error: "Invalid challenge" }, 400);
      }

      await db.from("webauthn_challenges").delete().eq("id", challengeId);

      const verification = await verifyRegistrationResponse({
        response: attestation,
        expectedChallenge: challenge.challenge,
        expectedOrigin: RP_ORIGIN,
        expectedRPID: RP_ID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return jsonResponse({ error: "Verification failed" }, 400);
      }

      const { credential, credentialDeviceType } = verification.registrationInfo;
      const email = challenge.metadata.email;

      // Slot accounting: count current users + read cap, then decide status.
      const { count: totalUsers } = await db
        .from("users")
        .select("*", { count: "exact", head: true });

      const { count: activeUsers } = await db
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");

      const { data: settings } = await db
        .from("app_settings")
        .select("max_active_users")
        .eq("id", 1)
        .single();

      const decision = decideSignupStatus({
        totalUsers: totalUsers ?? 0,
        activeUsers: activeUsers ?? 0,
        maxActiveUsers: settings?.max_active_users ?? 15,
      });

      // Create Supabase Auth user with the real email (not synthetic)
      const { data: authUser, error: authError } =
        await db.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { display_name: email },
        });

      if (authError) {
        return jsonResponse({ error: authError.message }, 500);
      }

      const userId = authUser.user.id;

      // Insert into custom users table with the slot decision
      await db.from("users").insert({
        id: userId,
        email,
        display_name: email,
        status: decision.status,
        is_admin: decision.isAdmin,
        approved_at: decision.status === "active" ? new Date().toISOString() : null,
      });

      // Store WebAuthn credential
      await db.from("user_credentials").insert({
        user_id: userId,
        credential_id: credential.id,
        public_key: base64Encode(credential.publicKey),
        sign_count: credential.counter,
        device_info: credentialDeviceType,
      });

      // Generate session via magic link
      const session = await createSessionForUser(email);
      return jsonResponse({
        ...session,
        userId,
        status: decision.status,
        isAdmin: decision.isAdmin,
      });
    }

    // === LOGIN OPTIONS ===
    if (action === "login-options") {
      // SECURITY: do NOT enumerate credentials here. Returning all credential IDs
      // leaks the total user count and per-user credential IDs to anyone hitting
      // this endpoint. Use discoverable credentials instead — the browser will
      // surface the user's saved passkeys for this RP without server enumeration.
      // Registration already uses residentKey: "preferred", so existing passkeys
      // are already discoverable.
      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        userVerification: "preferred",
        // No allowCredentials — relies on discoverable credentials.
      });

      const { data: challenge } = await db
        .from("webauthn_challenges")
        .insert({ challenge: options.challenge, type: "login" })
        .select()
        .single();

      return jsonResponse({ options, challengeId: challenge!.id });
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
        return jsonResponse({ error: "Invalid challenge" }, 400);
      }

      await db.from("webauthn_challenges").delete().eq("id", challengeId);

      const { data: creds } = await db
        .from("user_credentials")
        .select("*, users(*)")
        .eq("credential_id", assertion.id);

      if (!creds || creds.length === 0) {
        return jsonResponse({ error: "Unknown credential" }, 400);
      }

      const cred = creds[0];

      const verification = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: challenge.challenge,
        expectedOrigin: RP_ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: cred.credential_id,
          publicKey: Uint8Array.from(atob(cred.public_key), (ch) => ch.charCodeAt(0)),
          counter: cred.sign_count,
        },
      });

      if (!verification.verified) {
        return jsonResponse({ error: "Verification failed" }, 400);
      }

      await db
        .from("user_credentials")
        .update({ sign_count: verification.authenticationInfo.newCounter })
        .eq("id", cred.id);

      // Look up the user's email and status from the joined users row
      const userRow = cred.users as { email: string; status: string };

      if (userRow.status === "rejected") {
        return jsonResponse({ error: "Registration declined" }, 403);
      }

      // Both 'pending_approval' and 'active' get a session — the frontend gates
      // the UI by status. Pending users need a session to see the waitlist page.
      const session = await createSessionForUser(userRow.email);
      return jsonResponse({
        ...session,
        userId: cred.user_id,
        status: userRow.status,
      });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});
