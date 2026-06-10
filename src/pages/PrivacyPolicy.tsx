import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";

export function PrivacyPolicyView() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-950">
      <SEOHead
        title="Privacy Policy"
        description="Privacy policy for RaidScout boss timer application."
        canonicalUrl="/privacy"
        noindex
      />
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 text-slate-300 text-sm leading-relaxed">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 hover:text-[#fafafa] transition text-xs mb-2">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
      <h1 className="text-2xl font-bold text-[#fafafa]">Privacy Policy</h1>
      <p className="text-slate-500 text-xs">Last updated: June 10, 2026</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">1. Information We Collect</h2>
        <p>When you create an account and use RaidScout, we collect the following categories of information:</p>

        <h3 className="text-base font-medium text-slate-200 mt-3">1.1 Account Information</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Email address</strong> — required for account creation and authentication via Supabase Auth</li>
          <li><strong>Hashed password</strong> — stored securely; we never see or access your plain-text password</li>
          <li><strong>Session tokens</strong> — used to maintain your authenticated session</li>
        </ul>

        <h3 className="text-base font-medium text-slate-200 mt-3">1.2 Server &amp; Game Data</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Server names and configuration settings (timezone, notification preferences)</li>
          <li>Guild/clan names and member rosters you create</li>
          <li>Boss names, spawn schedules, death records, and timer data</li>
          <li>Attendance records tracking which members participated in boss kills or activities</li>
          <li>Activity schedules, party compositions, and activity attendance data</li>
          <li>Leaderboard rankings and point adjustments</li>
        </ul>

        <h3 className="text-base font-medium text-slate-200 mt-3">1.3 Integration Data</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Discord webhook URLs</strong> — if you configure Discord notifications</li>
          <li><strong>Discord guild IDs</strong> — if you link a Discord bot to your server</li>
        </ul>

        <h3 className="text-base font-medium text-slate-200 mt-3">1.4 AI Vision Data (Optional)</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Screenshots uploaded for name extraction are sent to AI providers (OpenAI or DeepSeek) for processing</li>
          <li>Screenshots are processed <strong>in-memory only</strong> — they are not stored on our servers or by the AI providers per their API data usage policies</li>
          <li>Only the extracted text (member names) is stored as server data</li>
        </ul>

        <h3 className="text-base font-medium text-slate-200 mt-3">1.5 Automatically Collected Information</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Audit log entries recording administrative actions (server creation, setting changes, role assignments)</li>
          <li>No tracking cookies, analytics cookies, or advertising identifiers are used</li>
          <li>No IP addresses, browser fingerprints, or device information is logged or stored</li>
        </ul>

        <h3 className="text-base font-medium text-slate-200 mt-3">1.6 Viewer Mode</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Viewer Mode allows anyone with a shared link to view boss timers, schedules, leaderboards, and activity data without creating an account</li>
          <li>No personal data is collected from viewers — no email, no account, no cookies beyond the essential session token</li>
          <li>Viewer access is read-only by default; server owners may optionally grant edit or mark-kill permissions</li>
          <li>Viewer session tokens are temporary and scoped to a single server</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">2. How We Use Your Information</h2>
        <p>We use the collected information for the following purposes:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Service Delivery:</strong> To provide core features — boss timers, spawn tracking, leaderboards, guild management, activity scheduling, and server administration</li>
          <li><strong>Authentication:</strong> To verify your identity and maintain your login session via Supabase Auth</li>
          <li><strong>Discord Integration:</strong> To deliver spawn alerts and notifications to your configured Discord channels via webhooks</li>
          <li><strong>AI Vision:</strong> To extract player names from uploaded screenshots for rally/attendance purposes</li>
          <li><strong>Audit Logging:</strong> To maintain a record of administrative actions for server management transparency</li>
          <li><strong>Service Improvement:</strong> To analyze usage patterns and improve functionality (using aggregated, anonymized data only)</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">3. Legal Basis for Processing</h2>
        <p>
          We process your personal data based on the following legal grounds:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Contractual Necessity:</strong> Processing your email and server data is necessary to provide the Service you have requested</li>
          <li><strong>Consent:</strong> For optional features such as Discord notifications and AI-powered screenshot processing, we rely on your explicit consent (configurable in server settings)</li>
          <li><strong>Legitimate Interests:</strong> Audit logging and aggregated analytics serve our legitimate interest in maintaining service security and improving functionality</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">4. Data Storage &amp; Security</h2>
        <p>
          All data is stored on Supabase, a SOC 2 compliant cloud platform built on Amazon Web Services (AWS)
          infrastructure with PostgreSQL databases. Security measures include:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Passwords are hashed using bcrypt; we never store plain-text passwords</li>
          <li>All data transmission is encrypted via HTTPS/TLS</li>
          <li>Row-Level Security (RLS) policies restrict data access to authorized users</li>
          <li>Database access is restricted to the Service and authorized administrators</li>
          <li>Uploaded screenshots are transmitted securely and processed in-memory without persistent storage</li>
        </ul>
        <p>
          While we implement reasonable security measures, no method of electronic storage or transmission is 100%
          secure. We cannot guarantee absolute security of your data.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">5. Data Sharing &amp; Third-Party Processors</h2>
        <p>We do <strong>not</strong> sell, trade, rent, or share your personal data with third parties for their
        marketing purposes. Data is shared only with the following service providers necessary to operate the Service:</p>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="py-2 pr-4 text-slate-200 font-medium">Provider</th>
              <th className="py-2 pr-4 text-slate-200 font-medium">Purpose</th>
              <th className="py-2 text-slate-200 font-medium">Data Shared</th>
            </tr>
          </thead>
          <tbody className="text-slate-400">
            <tr className="border-b border-slate-800">
              <td className="py-2 pr-4">Supabase</td>
              <td className="py-2 pr-4">Database, Auth, &amp; Hosting</td>
              <td className="py-2">All application data</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-2 pr-4">Discord</td>
              <td className="py-2 pr-4">Notifications (optional)</td>
              <td className="py-2">Boss spawn data, guild info via webhook</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-2 pr-4">Vercel</td>
              <td className="py-2 pr-4">Frontend Hosting</td>
              <td className="py-2">Page requests, static assets</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-2 pr-4">Fly.io</td>
              <td className="py-2 pr-4">Bot Hosting</td>
              <td className="py-2">Discord command traffic</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-2 pr-4">OpenAI / DeepSeek</td>
              <td className="py-2 pr-4">AI Vision (optional)</td>
              <td className="py-2">Uploaded screenshots (in-memory, not stored)</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">6. Cookies</h2>
        <p>
          RaidScout uses only essential authentication cookies (session tokens managed by Supabase Auth) required
          for the Service to function. We do not use:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Tracking cookies or third-party analytics cookies</li>
          <li>Advertising or marketing cookies</li>
          <li>Social media tracking pixels</li>
        </ul>
        <p>
          The Service stores your server preference in your browser&apos;s local storage so you return to your last
          active server on subsequent visits. This is stored locally and is not transmitted to our servers.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">7. Data Retention</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Account Data:</strong> Retained until you delete your account. Upon deletion, your email and
          authentication data are removed from Supabase Auth</li>
          <li><strong>Server Data:</strong> Retained until the Server Owner deletes the server. Server data may be
          soft-deleted (recoverable) for a period before permanent deletion</li>
          <li><strong>Audit Logs:</strong> Retained for a reasonable period for security and administrative purposes</li>
          <li><strong>Screenshots:</strong> Not stored — processed in-memory and immediately discarded</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">8. Your Rights</h2>
        <p>Depending on your jurisdiction, you may have the following rights regarding your personal data:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Access:</strong> Request a copy of your personal data</li>
          <li><strong>Rectification:</strong> Correct inaccurate or incomplete data</li>
          <li><strong>Erasure:</strong> Request deletion of your account and associated data</li>
          <li><strong>Restriction:</strong> Request limitation on how your data is processed</li>
          <li><strong>Portability:</strong> Receive your data in a structured, machine-readable format</li>
          <li><strong>Objection:</strong> Object to processing based on legitimate interests</li>
        </ul>
        <p>
          To exercise any of these rights, contact us through our Discord Community. We will respond within 30 days.
          Note that some data may be retained as required by law or for legitimate business purposes.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">9. Children&apos;s Privacy</h2>
        <p>
          The Service is not directed at children under the age of 13. We do not knowingly collect personal
          information from children under 13. If we become aware that a child under 13 has provided us with
          personal information, we will take steps to delete such information and terminate the account. If you
          believe a child under 13 has created an account, please contact us immediately.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">10. International Data Transfers</h2>
        <p>
          Your data is stored on Supabase servers located in the Asia-Pacific region. By using the Service,
          you consent to the transfer and processing of your data in this jurisdiction. We take appropriate
          safeguards to ensure your data is protected in accordance with this Privacy Policy.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">11. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be communicated through
          our Discord community. The &ldquo;Last updated&rdquo; date at the top of this page reflects the most
          recent revision. Continued use of the Service after changes are posted constitutes acceptance of the
          updated Privacy Policy.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">12. Contact Us</h2>
        <p>
          For privacy-related inquiries, data requests, or concerns, reach out through our{" "}
          <a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 transition">
            Discord Community
          </a>{" "}
          or our{" "}
          <a href="https://www.facebook.com/profile.php?id=61590144185090" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition">
            Facebook Page
          </a>.
        </p>
      </section>
      </div>
    </div>
  );
}
