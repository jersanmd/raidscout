import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";

export function PrivacyPolicyView() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-950">
      <SEOHead
        title="Privacy Policy"
        description="Privacy policy for RaidScout — the guild operations platform for competitive MMO guilds."
        canonicalUrl="/privacy"
        noindex
      />
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 text-slate-300 text-sm leading-relaxed">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 hover:text-[#fafafa] transition text-xs mb-2">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
      <h1 className="text-2xl font-bold text-[#fafafa]">Privacy Policy</h1>
      <p className="text-slate-500 text-xs">Last updated: July 15, 2026</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">1. Information We Collect</h2>
        <p>
          RaidScout (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects only the information
          necessary to provide and improve the Service. We are committed to data minimization and do not collect
          information beyond what is needed for core functionality.
        </p>

        <h3 className="text-base font-medium text-slate-200 mt-3">1.1 Account Information</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Email address</strong> — required for account creation, authentication, and account recovery via Supabase Auth. We may also use your email to communicate important service announcements, security notices, or material changes to our policies</li>
          <li><strong>Hashed password</strong> — your password is one-way hashed using bcrypt before storage. We never see, store, or have access to your plain-text password</li>
          <li><strong>Session tokens</strong> — cryptographically signed tokens used to maintain your authenticated session. These are stored as secure, HTTP-only cookies managed by Supabase Auth</li>
        </ul>

        <h3 className="text-base font-medium text-slate-200 mt-3">1.2 Server &amp; Game Data</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Server names, configuration settings, and preferences (timezone, game selection, notification preferences)</li>
          <li>Guild and clan names, assignment overrides, and rotation configuration</li>
          <li>Member rosters with character names you create and manage within your server</li>
          <li>Boss names, spawn schedules, death records, timer configurations, and respawn window data</li>
          <li>Attendance records tracking which members participated in boss kills, activities, or rallies</li>
          <li>Activity schedules, party compositions, and activity attendance records</li>
          <li>Leaderboard rankings, point adjustments, finalized snapshots, and associated metadata</li>
          <li>Audit log entries recording administrative actions for server transparency</li>
        </ul>

        <h3 className="text-base font-medium text-slate-200 mt-3">1.3 Integration &amp; Payment Data</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Discord webhook URLs</strong> — stored when you configure automated spawn notifications. These are URLs only and do not grant us access to your Discord account or server</li>
          <li><strong>Discord user and guild identifiers</strong> — stored when you link a Discord bot to your server for in-Discord commands</li>
          <li><strong>PayPal transaction IDs, payment amounts, and dates</strong> — stored to link payments to your server, provide payment history, and generate receipts. We do not store credit card numbers, bank account details, or PayPal credentials — all payment processing is handled entirely by PayPal</li>
        </ul>

        <h3 className="text-base font-medium text-slate-200 mt-3">1.4 AI Vision Processing (Optional)</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Screenshots you upload for member name extraction are transmitted to AI providers (OpenAI or DeepSeek) for processing</li>
          <li>Screenshots are processed <strong>in-memory only</strong> — they are never written to disk or stored on our servers</li>
          <li>Per the API data usage policies of OpenAI and DeepSeek, data submitted through their API is not used for model training and is not retained after processing</li>
          <li>Only the extracted text (member character names) is stored as server data — the original image is discarded immediately after processing</li>
        </ul>

        <h3 className="text-base font-medium text-slate-200 mt-3">1.5 Automatically Collected Information</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Audit log entries recording administrative actions (server creation, settings changes, role assignments, ownership transfers)</li>
          <li><strong>We do not use tracking cookies, analytics cookies, advertising identifiers, or social media pixels of any kind</strong></li>
          <li>We do not log or store IP addresses, browser fingerprints, device information, or any form of behavioral tracking data</li>
          <li>We do not use any third-party analytics services that track you across websites or build advertising profiles</li>
        </ul>

        <h3 className="text-base font-medium text-slate-200 mt-3">1.6 Viewer Mode</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Viewer Mode allows anyone with a shared viewer link to view boss timers, schedules, leaderboards, and activity data for a specific server without creating an account or providing any personal information</li>
          <li><strong>No personal data is collected from viewer-only users</strong> — no email, no username, no password</li>
          <li>Viewer session tokens are temporary, server-scoped, and do not persist across browser sessions</li>
          <li>Server owners may revoke or rotate viewer keys at any time, immediately invalidating all existing viewer sessions for that key</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">2. How We Use Your Information</h2>
        <p>All information we collect is used exclusively to provide, maintain, protect, and improve the Service. Specifically:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Service Delivery:</strong> To operate core features — real-time boss timers, spawn tracking, guild rotation management, leaderboard calculations, activity scheduling, and server administration tools</li>
          <li><strong>Authentication &amp; Security:</strong> To verify your identity, maintain your login session, protect against unauthorized access, and enable account recovery via Supabase Auth</li>
          <li><strong>Discord Integration:</strong> To deliver boss spawn alerts and scheduled notifications to your configured Discord channels, and to respond to bot commands in linked Discord servers</li>
          <li><strong>AI Vision:</strong> To extract player character names from uploaded screenshots for rally, attendance, and party composition purposes</li>
          <li><strong>Payment Processing:</strong> To record payment history, verify server access status, and generate receipts for server access extension payments</li>
          <li><strong>Audit Logging:</strong> To maintain a transparent, tamper-evident record of administrative actions within each server</li>
          <li><strong>Service Improvement:</strong> To analyze aggregated, anonymized usage patterns to identify bugs, improve performance, and guide feature development</li>
          <li><strong>Legal Compliance:</strong> To comply with applicable laws, regulations, legal processes, or enforceable governmental requests</li>
        </ul>
        <p>
          We do not and will not use your personal data for automated decision-making, profiling, or any purpose
          that produces legal effects concerning you or similarly significantly affects you.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">3. Legal Basis for Processing (GDPR)</h2>
        <p>
          If you are located in the European Economic Area (EEA), United Kingdom, or another jurisdiction with
          similar data protection laws, we process your personal data based on the following lawful grounds:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Contractual Necessity (Article 6(1)(b)):</strong> Processing your email, account credentials, and server data is necessary to perform the contract between you and RaidScout — that is, to provide the Service you have registered for</li>
          <li><strong>Consent (Article 6(1)(a)):</strong> For optional features such as Discord webhook notifications, AI-powered screenshot processing, and receipt of non-essential communications, we rely on your explicit, freely-given consent. You may withdraw consent at any time through your server settings, without affecting the lawfulness of processing based on consent before its withdrawal</li>
          <li><strong>Legitimate Interests (Article 6(1)(f)):</strong> Audit logging, aggregated service analytics, and fraud prevention serve our legitimate interest in maintaining the security, stability, and quality of the Service, provided these interests are not overridden by your data protection rights</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">4. Data Storage &amp; Security</h2>
        <p>
          All application data is stored on Supabase, a SOC 2 Type II compliant cloud platform built on Amazon Web
          Services (AWS) infrastructure using PostgreSQL databases. Our security measures are designed to protect
          your personal data against accidental loss, unauthorized access, alteration, and disclosure:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Passwords are one-way hashed using bcrypt with appropriate salt rounds before storage — we never store or transmit plain-text passwords</li>
          <li>All data transmission between your browser and our servers is encrypted using HTTPS with TLS 1.2 or higher</li>
          <li>Row-Level Security (RLS) policies at the database level enforce strict, per-user data access controls, ensuring users can only access data within servers they belong to</li>
          <li>Database access is restricted to the Service application and authorized administrative personnel only — all access is authenticated and logged</li>
          <li>Database backups are performed regularly and stored encrypted to enable disaster recovery</li>
          <li>Uploaded screenshots are transmitted over encrypted channels, processed entirely in-memory, and never written to persistent storage</li>
        </ul>
        <p>
          While we implement and maintain commercially reasonable administrative, technical, and physical safeguards,
          no method of electronic storage or transmission over the internet is 100% secure. We cannot and do not
          guarantee the absolute security of your data. You are responsible for maintaining the confidentiality of
          your login credentials.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">5. Data Sharing &amp; Third-Party Processors</h2>
        <p>
          <strong>We do not sell, trade, rent, license, or otherwise disclose your personal data to third
          parties for their own marketing or advertising purposes.</strong> Your data is shared only with the
          following service providers — acting as data processors on our behalf — as strictly necessary to
          operate the Service:
        </p>

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
              <td className="py-2 pr-4">Database, Auth, Storage, &amp; API Hosting</td>
              <td className="py-2">All application data, credentials, and session tokens</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-2 pr-4">Vercel</td>
              <td className="py-2 pr-4">Frontend Application Hosting &amp; CDN</td>
              <td className="py-2">Static assets, page requests</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-2 pr-4">Fly.io</td>
              <td className="py-2 pr-4">Discord Bot Runtime Hosting</td>
              <td className="py-2">Discord command traffic, spawn alert triggers</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-2 pr-4">Discord</td>
              <td className="py-2 pr-4">Optional Notification Delivery</td>
              <td className="py-2">Boss spawn data, guild info (via webhook or bot)</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-2 pr-4">PayPal</td>
              <td className="py-2 pr-4">Payment Processing</td>
              <td className="py-2">Transaction amounts, payment method tokens</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-2 pr-4">OpenAI / DeepSeek</td>
              <td className="py-2 pr-4">Optional AI Screenshot Processing</td>
              <td className="py-2">Uploaded screenshots (in-memory, not retained)</td>
            </tr>
          </tbody>
        </table>

        <p>
          Each processor is contractually bound to process your data only on our documented instructions and to
          implement appropriate technical and organizational measures to protect your data. We may also disclose
          your data if required to do so by law, court order, or valid governmental request, or when we believe
          in good faith that disclosure is necessary to protect our rights, your safety, or the safety of others.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">6. Cookies &amp; Local Storage</h2>
        <p>
          RaidScout uses only the minimum necessary client-side storage to provide the Service:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Authentication cookies:</strong> Secure, HTTP-only session tokens managed by Supabase Auth. These are essential for maintaining your authenticated session and are not used for tracking</li>
          <li><strong>Local storage:</strong> Your last active server preference is stored in your browser's local storage so the Service returns you to your most recently used server on subsequent visits. This data never leaves your browser and is not transmitted to our servers</li>
        </ul>
        <p>
          We do <strong>not</strong> use:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Tracking cookies, analytics cookies, or advertising cookies of any kind</li>
          <li>Third-party analytics services (such as Google Analytics, Mixpanel, or similar)</li>
          <li>Social media tracking pixels, retargeting pixels, or conversion tracking</li>
          <li>Fingerprinting, device identification, or any form of user profiling</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">7. Data Retention</h2>
        <p>We retain your data only for as long as necessary to fulfill the purposes for which it was collected:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Account Data &amp; Credentials:</strong> Retained until you delete your account. Upon account deletion, your email address, hashed password, and all authentication records are permanently removed from Supabase Auth</li>
          <li><strong>Server Data:</strong> Retained until the Server Owner deletes the server. Upon deletion, server data may remain in soft-deleted (recoverable) state for up to 30 days before permanent, irreversible deletion</li>
          <li><strong>Audit Logs:</strong> Retained for a period consistent with security best practices and legal requirements, after which they are purged</li>
          <li><strong>Payment Records:</strong> Retained for the duration required by applicable tax and financial regulations in the relevant jurisdiction</li>
          <li><strong>Screenshots (AI Vision):</strong> Not retained at all — processed entirely in-memory and discarded immediately after text extraction completes</li>
          <li><strong>Viewer Session Data:</strong> Temporary session tokens expire when the browser is closed or the viewer key is revoked by the Server Owner</li>
        </ul>
        <p>
          Upon expiration of the applicable retention period, personal data is securely deleted or anonymized so
          that it can no longer be associated with an identifiable individual.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">8. Your Data Rights</h2>
        <p>
          Depending on your jurisdiction, you may have the following rights regarding your personal data.
          We extend these rights to all users regardless of location, where feasible:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Right of Access:</strong> You may request a copy of the personal data we hold about you, along with information about how it is processed</li>
          <li><strong>Right of Rectification:</strong> You may request correction of inaccurate or incomplete personal data. Many fields can also be corrected directly within your account or server settings</li>
          <li><strong>Right of Erasure (&ldquo;Right to be Forgotten&rdquo;):</strong> You may request deletion of your account and all associated personal data, subject to legal retention requirements</li>
          <li><strong>Right of Restriction:</strong> You may request that we limit how your personal data is processed under certain circumstances</li>
          <li><strong>Right of Data Portability:</strong> You may request your data in a structured, commonly used, machine-readable format for transfer to another service</li>
          <li><strong>Right to Object:</strong> You may object to processing based on legitimate interests, including any profiling or automated decision-making</li>
          <li><strong>Right to Withdraw Consent:</strong> Where processing is based on your consent, you may withdraw that consent at any time without affecting the lawfulness of prior processing</li>
        </ul>
        <p>
          To exercise any of these rights, please contact us through our Discord Community or Facebook Page
          (see Section 12). We will respond to verified requests within 30 calendar days. We may need to
          verify your identity before fulfilling certain requests. There is no fee for exercising these
          rights unless a request is manifestly unfounded or excessive.
        </p>
        <p>
          You also have the right to lodge a complaint with your local data protection supervisory authority
          if you believe your data protection rights have been violated.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">9. Children's Privacy</h2>
        <p>
          The Service is not directed at or intended for children under the age of 13. We do not knowingly
          collect, use, or disclose personal information from children under 13. If we become aware that a
          child under 13 has created an account or otherwise provided us with personal information without
          verifiable parental consent, we will take prompt steps to:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Delete all such personal information from our systems</li>
          <li>Terminate the associated account</li>
          <li>Notify the relevant parties as required by applicable law</li>
        </ul>
        <p>
          If you are a parent or guardian and believe your child under 13 has provided us with personal
          information, please contact us immediately so we can take appropriate action.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">10. International Data Transfers</h2>
        <p>
          Your data is stored on Supabase servers located in the Asia-Pacific (APAC) region. By using the
          Service, you acknowledge that your data will be transferred to and processed in this jurisdiction,
          which may have data protection laws that differ from those in your country of residence.
        </p>
        <p>
          Where personal data is transferred from the EEA, UK, or other jurisdictions with data transfer
          restrictions to a country not deemed to provide an adequate level of protection, we implement
          appropriate safeguards — such as Standard Contractual Clauses or equivalent mechanisms — to ensure
          your data receives a comparable level of protection. We take reasonable steps to ensure your data
          is treated securely and in accordance with this Privacy Policy regardless of where it is processed.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">11. Changes to This Privacy Policy</h2>
        <p>
          We may update this Privacy Policy from time to time to reflect changes in our practices, the Service,
          or applicable law. When we make material changes, we will make reasonable efforts to notify you —
          through our Discord community, in-app notices, or via the email address associated with your account —
          before the changes take effect.
        </p>
        <p>
          The &ldquo;Last updated&rdquo; date at the top of this page indicates when this Privacy Policy was
          last revised. We encourage you to periodically review this page for the latest information on our
          privacy practices. Your continued use of the Service after changes are posted constitutes your
          acknowledgment and acceptance of the updated Privacy Policy.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">12. Contact Us</h2>
        <p>
          If you have questions, concerns, or requests regarding this Privacy Policy or our data practices —
          including exercising your data rights, reporting a privacy concern, or inquiring about a data breach —
          please reach out through any of the following channels:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Discord Community:</strong>{" "}
            <a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 transition">
              discord.gg/738AmkeQtU
            </a>
          </li>
          <li>
            <strong>Facebook Page:</strong>{" "}
            <a href="https://www.facebook.com/profile.php?id=61590144185090" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition">
              RaidScout on Facebook
            </a>
          </li>
        </ul>
        <p>
          We aim to acknowledge all privacy-related inquiries within 5 business days and provide a substantive
          response within 30 calendar days.
        </p>
      </section>
      </div>
    </div>
  );
}
