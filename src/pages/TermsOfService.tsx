import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";

export function TermsOfServiceView() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-950">
      <SEOHead
        title="Terms of Service"
        description="Terms of service for RaidScout — the guild operations platform for competitive MMO guilds."
        canonicalUrl="/terms"
        noindex
      />
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 text-slate-300 text-sm leading-relaxed">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 hover:text-[#fafafa] transition text-xs mb-2">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
      <h1 className="text-2xl font-bold text-[#fafafa]">Terms of Service</h1>
      <p className="text-slate-500 text-xs">Last updated: June 16, 2026</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">1. Acceptance of Terms</h2>
        <p>
          By accessing or using RaidScout (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service
          and our Privacy Policy. If you do not agree to these terms, you must not access or use the Service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">2. Description of Service</h2>
        <p>
          RaidScout is a web-based companion tool for gamers, providing boss spawn tracking, activity scheduling,
          guild management, leaderboard systems, viewer mode (read-only access without accounts), and Discord
          integration across multiple games. The Service offers real-time countdown timers, automated Discord
          notifications, attendance tracking, server analytics, and optional AI-powered screenshot processing
          for member name extraction.
        </p>
        <p>
          The Service is game-agnostic and may support multiple titles. Game-specific data such as boss names,
          spawn schedules, and guild assignments are provided by server administrators and may not reflect official
          game data.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">3. User Accounts</h2>
        <p>
          To access the Service, you must create an account using a valid email address. You are responsible for:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Maintaining the confidentiality of your login credentials</li>
          <li>All activities that occur under your account</li>
          <li>Providing accurate, complete, and current registration information</li>
          <li>Promptly notifying us of any unauthorized use of your account</li>
        </ul>
        <p>
          You must be at least 13 years of age to create an account. Accounts found to be created by users under 13
          will be terminated.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">4. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Use the Service for any unlawful purpose or in violation of any applicable laws or regulations</li>
          <li>Attempt to gain unauthorized access to other users&apos; servers, data, or accounts</li>
          <li>Interfere with, disrupt, or overload the Service or its infrastructure</li>
          <li>Upload, transmit, or distribute malicious code, viruses, or harmful content</li>
          <li>Impersonate other individuals or provide false or misleading information</li>
          <li>Harass, abuse, or harm other users through the Service</li>
          <li>Use automated means (bots, scrapers) to access the Service without prior written permission</li>
          <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">5. Server Management &amp; Ownership</h2>
        <p>
          Servers created within the Service are owned by the user who created them (&ldquo;Server Owner&rdquo;).
          Server Owners may:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Add or remove moderators to help manage the server</li>
          <li>Configure server settings including timezone, notifications, and game selection</li>
          <li>Transfer ownership to another user</li>
          <li>Delete the server and all associated data</li>
        </ul>
        <p>
          The Service is not responsible for disputes between server members or between Server Owners and moderators.
          Server Owners are responsible for the content and data within their servers.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">6. Viewer Mode</h2>
        <p>
          Server Owners may generate a read-only viewer link that allows anyone with the link to view boss timers,
          schedules, leaderboards, and activity data without creating an account. Viewer access is subject to the
          following:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Viewers see only public-facing data (timers, schedules, leaderboards) for the linked server</li>
          <li>Viewers cannot modify data unless the Server Owner explicitly enables edit or mark-kill permissions</li>
          <li>Viewer links are server-scoped and do not grant access to other servers</li>
          <li>Server Owners may revoke or rotate viewer keys at any time from Server Settings</li>
          <li>Viewer access does not constitute an account — no personal data is collected from viewers</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">7. User-Generated Content</h2>
        <p>
          By creating content within the Service (including but not limited to server names, guild names, member names,
          and uploaded screenshots), you grant RaidScout a non-exclusive, worldwide, royalty-free license to host,
          store, and display such content solely for the purpose of providing the Service to you and other users
          within your server. You retain all ownership rights to your content.
        </p>
        <p>
          You represent and warrant that you own or have the necessary rights to any content you upload or create
          within the Service, and that such content does not infringe upon the rights of any third party.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">8. Third-Party Services &amp; Integrations</h2>
        <p>The Service integrates with the following third-party services:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Discord:</strong> Optional notification delivery via webhooks. Subject to Discord&apos;s <a href="https://discord.com/terms" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">Terms of Service</a>.</li>
          <li><strong>AI Vision:</strong> Optional screenshot-based name extraction using OpenAI or DeepSeek APIs. Screenshots are processed in-memory and are not stored by the Service or retained by the AI providers per their API data usage policies.</li>
          <li><strong>Supabase:</strong> Database, authentication, and hosting infrastructure. Subject to Supabase&apos;s <a href="https://supabase.com/terms" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">Terms of Service</a>.</li>
          <li><strong>Vercel:</strong> Frontend application hosting and deployment. Subject to Vercel&apos;s <a href="https://vercel.com/legal/terms" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">Terms of Service</a>.</li>
          <li><strong>Fly.io:</strong> Discord bot hosting for 24/7 command availability. Subject to Fly.io&apos;s <a href="https://fly.io/legal/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">Terms of Service</a>.</li>
        </ul>
        <p>
          We are not responsible for the content, privacy practices, or availability of third-party services.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">9. Payments &amp; Server Access</h2>
        <p>
          RaidScout offers server access extensions as one-time payments of $9.99 USD per 30 days via PayPal. New servers
          receive a 7-day free trial with full access to all features. After the trial period ends, a payment is required
          to continue using the Service.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Payments are processed by PayPal. We do not store your payment card details.</li>
          <li>Each payment extends server access by 30 days from the current expiry date. Days stack — paying early does not forfeit remaining time.</li>
          <li>All payments are final. Refunds are handled per our <a href="/refund" className="text-indigo-400 hover:text-indigo-300">Refund Policy</a>.</li>
          <li>Server Owners are responsible for managing their server&apos;s access status. Expired servers have limited functionality as described in the Service.</li>
          <li>We reserve the right to modify pricing with reasonable notice. Price changes do not affect existing paid periods.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">10. Intellectual Property</h2>
        <p>
          The RaidScout name, logo, branding, website design, and source code are the intellectual property of
          RaidScout. All game names, boss names, guild names, and related trademarks are the property of their
          respective owners. RaidScout is an independent tool and is not affiliated with, endorsed by, or
          sponsored by any game developer or publisher.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">11. Disclaimer of Warranties</h2>
        <p>
          THE SERVICE IS PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS WITHOUT WARRANTIES
          OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. We do not guarantee that:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>The Service will be uninterrupted, timely, secure, or error-free</li>
          <li>Boss spawn data, timers, or schedules will be 100% accurate</li>
          <li>Any errors or defects will be corrected</li>
          <li>The Service will be compatible with all devices or browsers</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">12. Limitation of Liability</h2>
        <p>
          TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, RAID SCOUT SHALL NOT BE LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS,
          DATA, USE, OR GOODWILL, ARISING FROM:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Your use of or inability to use the Service</li>
          <li>Any conduct or content of any third party on the Service</li>
          <li>Unauthorized access, use, or alteration of your data</li>
          <li>Any errors or inaccuracies in boss spawn timing or game data</li>
        </ul>
        <p>
          In no event shall our total liability exceed the amount you have paid us (if any) in the twelve months
          preceding the claim. Some jurisdictions do not allow the exclusion of certain warranties or limitations
          of liability, so some of the above may not apply to you.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">13. Termination</h2>
        <p>
          We reserve the right to suspend or terminate your access to the Service at our sole discretion, without
          prior notice, for any reason including but not limited to violation of these Terms. Upon termination:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Your right to access the Service will immediately cease</li>
          <li>Server data belonging to your account may be deleted after a reasonable retention period</li>
          <li>Provisions that by their nature should survive termination (including disclaimers and liability
          limitations) shall survive</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">14. Changes to Terms</h2>
        <p>
          We reserve the right to modify these Terms at any time. Material changes will be communicated through
          our Discord community and/or via email where feasible. The &ldquo;Last updated&rdquo; date at the top
          of this page indicates when these Terms were last revised. Continued use of the Service after changes
          are posted constitutes acceptance of the updated Terms.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">15. Governing Law</h2>
        <p>
          These Terms shall be governed by and construed in accordance with applicable laws. Any disputes arising
          from these Terms or the Service shall be resolved through good-faith negotiations. If resolution cannot
          be reached, disputes shall be subject to the jurisdiction of the courts in the Service operator&apos;s
          jurisdiction.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">16. Contact</h2>
        <p>
          For questions, concerns, or legal inquiries regarding these Terms, contact us through our{" "}
          <a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 transition">
            Discord Community
          </a>.
        </p>
      </section>
      </div>
    </div>
  );
}
