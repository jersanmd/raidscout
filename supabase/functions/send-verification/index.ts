/**
 * Email verification via Brevo API with signed tokens.
 * 
 * POST { action: "send", email, userId } — sends verification email
 * POST { action: "verify", token, userId } — verifies token and confirms email
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const SECRET = SUPABASE_SERVICE_ROLE_KEY;

const SENDER = { email: "noreply@raidscout.com", name: "RaidScout" };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Signed token helpers ──────────────────────────────

async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function createToken(userId: string): Promise<string> {
  const expiry = Date.now() + 3600000; // 1 hour
  const payload = `${userId}:${expiry}`;
  const sig = await hmacSign(payload, SECRET);
  return btoa(`${payload}:${sig}`);
}

async function verifyToken(token: string): Promise<string | null> {
  try {
    const decoded = atob(token);
    const parts = decoded.split(":");
    if (parts.length < 3) return null;
    const sig = parts.pop()!;
    const payload = parts.join(":");
    const [userId, expiryStr] = payload.split(":");
    if (Date.now() > parseInt(expiryStr)) return null;
    const expectedSig = await hmacSign(payload, SECRET);
    if (sig !== expectedSig) return null;
    return userId;
  } catch {
    return null;
  }
}

// ── Email template ────────────────────────────────────

function verificationEmailTemplate(email: string, confirmUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:system-ui,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090b;padding:40px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
<tr><td align="center" style="padding-bottom:32px;"><img src="https://www.raidscout.com/logo.png" alt="RaidScout" width="48" height="48" style="display:block;border-radius:12px;"></td></tr>
<tr><td style="background-color:#18181b;border:1px solid #27272a;border-radius:16px;padding:40px 32px;">
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td align="center"><span style="display:inline-block;background-color:#fafafa;color:#09090b;font-size:11px;font-weight:700;padding:6px 14px;border-radius:20px;letter-spacing:0.5px;text-transform:uppercase;">Verify Your Email</span></td></tr></table>
<h1 style="margin:0 0 12px;font-size:26px;font-weight:700;color:#fafafa;text-align:center;letter-spacing:-0.5px;">Confirm your email</h1>
<p style="margin:0 0 8px;font-size:15px;color:#a1a1aa;text-align:center;line-height:1.7;">Thanks for joining <strong style="color:#fafafa;">RaidScout</strong>!</p>
<p style="margin:0 0 32px;font-size:14px;color:#71717a;text-align:center;line-height:1.7;">Click below to verify <strong style="color:#d4d4d8;">${email}</strong> and unlock billing — just one click.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;"><tr><td align="center"><a href="${confirmUrl}" style="display:inline-block;background-color:#fafafa;color:#09090b;font-size:15px;font-weight:600;padding:14px 40px;border-radius:10px;text-decoration:none;box-shadow:0 2px 8px rgba(255,255,255,0.08);">Confirm Email →</a></td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #27272a;"></td></tr></table>
<p style="margin:24px 0 0;font-size:11px;color:#52525b;text-align:center;line-height:1.6;">Button not working? Copy and paste:</p>
<p style="margin:8px 0 0;font-size:11px;color:#71717a;text-align:center;word-break:break-all;line-height:1.6;"><a href="${confirmUrl}" style="color:#a1a1aa;">${confirmUrl}</a></p>
</td></tr>
<tr><td style="padding-top:20px;"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#18181b;border:1px solid #27272a;border-radius:12px;padding:20px 24px;"><tr><td style="text-align:center;">
<p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#d4d4d8;">RaidScout — Guild Operations Platform</p>
<p style="margin:0 0 16px;font-size:11px;color:#71717a;line-height:1.7;">Track boss respawn timers across any game.<br>Schedule hunts, monitor performance, and dominate together.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr><td align="center">
<a href="https://discord.gg/738AmkeQtU" style="display:inline-block;color:#a1a1aa;font-size:11px;text-decoration:none;padding:4px 10px;">Discord</a><span style="color:#3f3f46;font-size:11px;padding:0 4px;">·</span>
<a href="https://www.raidscout.com/terms" style="display:inline-block;color:#a1a1aa;font-size:11px;text-decoration:none;padding:4px 10px;">Terms</a><span style="color:#3f3f46;font-size:11px;padding:0 4px;">·</span>
<a href="https://www.raidscout.com/privacy" style="display:inline-block;color:#a1a1aa;font-size:11px;text-decoration:none;padding:4px 10px;">Privacy</a><span style="color:#3f3f46;font-size:11px;padding:0 4px;">·</span>
<a href="https://www.raidscout.com/changelog" style="display:inline-block;color:#a1a1aa;font-size:11px;text-decoration:none;padding:4px 10px;">Changelog</a>
</td></tr></table>
<p style="margin:0;font-size:10px;color:#52525b;line-height:1.6;">Sent to <strong style="color:#71717a;">${email}</strong> from <a href="https://www.raidscout.com" style="color:#a1a1aa;text-decoration:underline;">raidscout.com</a>.</p>
<p style="margin:12px 0 0;font-size:10px;color:#3f3f46;">© 2026 RaidScout. All rights reserved.</p>
</td></tr></table></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Handler ───────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── VERIFY action: confirm email from token ──
    if (body.action === "verify") {
      const { token, userId } = body;
      if (!token || !userId) {
        return new Response(JSON.stringify({ error: "Missing token or userId" }), {
          status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      const tokenUserId = await verifyToken(token);
      if (!tokenUserId || tokenUserId !== userId) {
        return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
          status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      // Unconfirm then reconfirm so email_confirmed_at gets a fresh timestamp
      await supabase.auth.admin.updateUserById(userId, { email_confirm: false });
      await supabase.auth.admin.updateUserById(userId, { email_confirm: true });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── SEND action (default) ──
    const { email, userId } = body;
    if (!email) {
      return new Response(JSON.stringify({ error: "Missing email" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const token = await createToken(userId);
    const confirmUrl = `https://www.raidscout.com/server-settings?tab=account&token=${encodeURIComponent(token)}`;

    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: SENDER,
        to: [{ email }],
        subject: "RaidScout",
        htmlContent: verificationEmailTemplate(email, confirmUrl),
      }),
    });

    if (!brevoRes.ok) {
      console.error("Brevo error:", await brevoRes.text());
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
