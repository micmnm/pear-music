import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "npm:@simplewebauthn/server@13.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.0";
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

// Generate a Supabase Auth session for a user by creating a magic link token
// and returning the OTP properties so the client can call verifyOtp()
async function createSessionForUser(
  db: ReturnType<typeof createClient>,
  email: string
): Promise<{ email: string; token_hash: string }> {
  const { data, error } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (error || !data?.properties?.hashed_token) {
    throw new Error(error?.message || "Failed to generate session link");
  }

  return {
    email,
    token_hash: data.properties.hashed_token,
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
      const { count } = await db
        .from("users")
        .select("*", { count: "exact", head: true });
      if (count && count > 0) {
        return jsonResponse({ error: "Registration closed" }, 403);
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
      const username = challenge.metadata.username;
      const email = `${username}@pear.music`;

      // Create Supabase Auth user
      const { data: authUser, error: authError } =
        await db.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { username },
        });

      if (authError) {
        return jsonResponse(
          { error: authError.message },
          500
        );
      }

      const userId = authUser.user.id;

      // Store user in our users table
      await db.from("users").insert({
        id: userId,
        username,
        display_name: username,
      });

      // Store WebAuthn credential
      await db.from("user_credentials").insert({
        user_id: userId,
        credential_id: base64Encode(credential.id),
        public_key: base64Encode(credential.publicKey),
        sign_count: credential.counter,
        device_info: credentialDeviceType,
      });

      // Generate session via magic link
      const session = await createSessionForUser(db, email);
      return jsonResponse({ ...session, userId });
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

      const assertionCredId = assertion.id;
      const { data: creds } = await db
        .from("user_credentials")
        .select("*, users(*)")
        .eq("credential_id", assertionCredId);

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
          id: Uint8Array.from(atob(cred.credential_id), (ch) => ch.charCodeAt(0)),
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

      // Get the user's email for session generation
      const username = cred.users.username;
      const email = `${username}@pear.music`;

      const session = await createSessionForUser(db, email);
      return jsonResponse({ ...session, userId: cred.user_id });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});
