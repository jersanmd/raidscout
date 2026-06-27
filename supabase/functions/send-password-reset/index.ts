/**
 * Sends password reset email via Brevo API with a Supabase recovery link.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;

const SENDER = { email: "noreply@raidscout.com", name: "RaidScout" };

const ALLOWED_ORIGINS = [
  "https://www.raidscout.com",
  "https://raidscout-staging.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowedOrigin = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

function emailTemplate(email: string, url: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:system-ui,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090b;padding:40px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
<tr><td align="center" style="padding-bottom:32px;"><img src="https://www.raidscout.com/logo.png" alt="RaidScout" width="48" height="48" style="display:block;border-radius:12px;"></td></tr>
<tr><td style="background-color:#18181b;border:1px solid #27272a;border-radius:16px;padding:40px 32px;">
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td align="center"><span style="display:inline-block;background-color:#fafafa;color:#09090b;font-size:11px;font-weight:700;padding:6px 14px;border-radius:20px;letter-spacing:0.5px;text-transform:uppercase;">Reset Password</span></td></tr></table>
<h1 style="margin:0 0 12px;font-size:26px;font-weight:700;color:#fafafa;text-align:center;">Reset your password</h1>
<p style="margin:0 0 8px;font-size:15px;color:#a1a1aa;text-align:center;line-height:1.7;">A password reset was requested for <strong style="color:#fafafa;">${email}</strong>.</p>
<p style="margin:0 0 32px;font-size:14px;color:#71717a;text-align:center;line-height:1.7;">Click below to set a new password. This link expires in 1 hour.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;"><tr><td align="center"><a href="${url}" style="display:inline-block;background-color:#fafafa;color:#09090b;font-size:15px;font-weight:600;padding:14px 40px;border-radius:10px;text-decoration:none;">Reset Password →</a></td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #27272a;"></td></tr></table>
<p style="margin:24px 0 0;font-size:11px;color:#52525b;text-align:center;">Or copy: <a href="${url}" style="color:#a1a1aa;">${url}</a></p>
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
<p style="margin:0;font-size:10px;color:#52525b;line-height:1.6;">Sent to <strong style="color:#71717a;">${email}</strong> from <a href="https://www.raidscout.com" style="color:#a1a1aa;text-decoration:underline;">raidscout.com</a>.<br>If you didn't request this, you can safely ignore this email.</p>
<p style="margin:12px 0 0;font-size:10px;color:#3f3f46;">© 2026 RaidScout. All rights reserved.</p>
</td></tr></table></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "Missing email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: "https://www.raidscout.com/change-password",
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("Failed to generate recovery link:", linkError);
      return new Response(JSON.stringify({ error: "Failed to generate reset link" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = linkData.properties.action_link;

    // Remove the Supabase redirect & add our own
    const customUrl = url.replace(
      /redirect_to=[^&]+/,
      "redirect_to=https://www.raidscout.com/change-password"
    );

    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: SENDER,
        to: [{ email }],
        subject: "Reset your password — RaidScout",
        htmlContent: emailTemplate(email, customUrl),
      }),
    });

    if (!brevoRes.ok) {
      console.error("Brevo error:", await brevoRes.text());
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
