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
      <p className="text-slate-500 text-xs">Last updated: July 15, 2026</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">1. Acceptance of Terms</h2>
        <p>
          By accessing or using RaidScout (&ldquo;the Service&rdquo;), you acknowledge that you have read,
          understood, and agree to be legally bound by these Terms of Service and our Privacy Policy. These
          Terms constitute a binding agreement between you (&ldquo;User&rdquo; or &ldquo;you&rdquo;) and
          RaidScout (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
        </p>
        <p>
          If you do not agree to these Terms in their entirety, you must immediately discontinue access to
          and use of the Service. Your continued use of the Service following any modification to these Terms
          constitutes your acceptance of the revised Terms.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">2. Description of Service</h2>
        <p>
          RaidScout is a web-based guild operations platform designed for competitive MMO communities. The
          Service provides:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Real-time boss spawn tracking with countdown timers and death record management</li>
          <li>Guild rotation and ownership tracking across daily, weekly, and fixed-schedule modes</li>
          <li>Activity scheduling with attendance tracking, party composition, and rally support</li>
          <li>Leaderboard systems with point tracking, period-based snapshots, and finalization</li>
          <li>Read-only viewer mode for sharing boss timers and schedules without requiring accounts</li>
          <li>Optional Discord integration for automated spawn notifications via webhooks</li>
          <li>Optional AI-powered screenshot processing to extract member names for attendance purposes</li>
          <li>Server analytics including hunter performance, kill history, and attendance metrics</li>
        </ul>
        <p>
          The Service is game-agnostic and may support multiple titles. Game-specific data including boss
          names, spawn schedules, respawn windows, guild assignments, and related metadata are configured by
          server administrators and may not reflect official game data. We make no representation as to the
          accuracy, completeness, or timeliness of any game-related data.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">3. Eligibility &amp; User Accounts</h2>
        <p>
          To create an account and access the Service, you represent and warrant that:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>You are at least 13 years of age. Accounts created by users under 13 will be terminated upon discovery</li>
          <li>All registration information you provide is accurate, complete, and current</li>
          <li>You will maintain and promptly update your registration information to keep it accurate</li>
        </ul>
        <p>
          You are solely responsible for maintaining the confidentiality of your login credentials and for all
          activities that occur under your account. You agree to immediately notify us of any unauthorized use
          of your account or any other breach of security. We will not be liable for any loss or damage arising
          from your failure to comply with these obligations.
        </p>
        <p>
          You may not share your account credentials with any third party. Each account is intended for use by
          a single individual. You may not create accounts using automated methods or create accounts for the
          purpose of circumventing restrictions, bans, or payment requirements.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">4. Acceptable Use</h2>
        <p>In using the Service, you agree not to engage in any of the following prohibited activities:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Using the Service for any unlawful purpose or in violation of any applicable local, state, national, or international laws or regulations</li>
          <li>Attempting to gain unauthorized access to other users' servers, data, accounts, or any portion of the Service not intended for public access</li>
          <li>Interfering with, disrupting, degrading, or overloading the Service, its servers, or its underlying infrastructure</li>
          <li>Uploading, transmitting, or distributing any malicious code, viruses, worms, Trojan horses, ransomware, or other harmful or destructive content</li>
          <li>Impersonating any person or entity, or falsely stating or otherwise misrepresenting your affiliation with a person or entity</li>
          <li>Harassing, threatening, abusing, stalking, or otherwise harming other users through the Service</li>
          <li>Using any automated means — including bots, scrapers, crawlers, or scripts — to access, extract data from, or interact with the Service without our express prior written consent</li>
          <li>Reverse engineering, decompiling, disassembling, or otherwise attempting to derive the source code of any part of the Service</li>
          <li>Removing, obscuring, or altering any proprietary notices, labels, or branding displayed within the Service</li>
          <li>Using the Service to build, train, or improve a competitive product or service</li>
        </ul>
        <p>
          We reserve the right, in our sole discretion, to investigate and take appropriate action — including
          account suspension or termination — against anyone who violates these provisions.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">5. Server Management &amp; Ownership</h2>
        <p>
          Servers created within the Service are owned by the user who created them (&ldquo;Server Owner&rdquo;).
          Server Owners have the following rights and responsibilities:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Adding or removing moderators to assist in server administration</li>
          <li>Configuring server settings including timezone, notification preferences, game selection, and guild assignments</li>
          <li>Generating, revoking, and rotating viewer keys for read-only access to server data</li>
          <li>Managing payment and access status for the server</li>
          <li>Transferring server ownership to another registered user</li>
          <li>Deleting the server and all associated data (bosses, death records, members, leaderboard snapshots, attendance data)</li>
        </ul>
        <p>
          Server Owners are solely responsible for the content and data within their servers, including member
          rosters, guild names, guild assignments, and any uploaded content. While we provide tools for server
          management, we are not responsible for mediating disputes between server members, between Server Owners
          and moderators, or between competing guilds within a server.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">6. Viewer Mode</h2>
        <p>
          Server Owners may generate read-only viewer links that allow anyone in possession of the link to view
          boss timers, schedules, leaderboards, and activity data for the linked server without creating an
          account. Viewer mode is governed by the following terms:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Viewers see only public-facing data for the specific server linked — no cross-server access is granted</li>
          <li>Viewers cannot modify data unless the Server Owner explicitly enables edit or mark-kill permissions</li>
          <li>Viewer session tokens are temporary and scoped to a single server</li>
          <li>Server Owners may revoke or rotate viewer keys at any time, which will immediately invalidate all existing viewer sessions for that key</li>
          <li>Viewer access is provided as a convenience feature and does not establish a contractual relationship between the viewer and RaidScout</li>
          <li>No personal data is collected from viewer-only users</li>
        </ul>
        <p>
          Server Owners are responsible for managing who has access to their viewer keys. We are not responsible
          for unauthorized access resulting from the sharing or leaking of viewer URLs.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">7. User-Generated Content</h2>
        <p>
          By creating, uploading, or submitting content within the Service — including but not limited to server
          names, guild names, member names, boss configurations, guild assignment overrides, and uploaded
          screenshots — you grant RaidScout a non-exclusive, worldwide, royalty-free, sublicensable license to
          host, store, reproduce, modify (for formatting purposes only), and display such content solely as
          necessary to provide, maintain, and improve the Service.
        </p>
        <p>
          You retain all ownership rights to your content. This license terminates when you delete your content
          or your account, except to the extent that the content has been shared with other users within your
          server (who may retain copies) or where retention is required by applicable law.
        </p>
        <p>
          You represent and warrant that you own or have obtained all necessary rights, licenses, consents, and
          permissions to use and authorize us to use any content you submit, and that such content does not
          infringe, misappropriate, or violate the intellectual property, privacy, publicity, or other rights of
          any third party.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">8. Third-Party Services &amp; Integrations</h2>
        <p>The Service relies on and integrates with the following third-party providers:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Supabase</strong> — Database, authentication, and backend infrastructure. Subject to Supabase's <a href="https://supabase.com/terms" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">Terms of Service</a>.</li>
          <li><strong>Discord</strong> — Optional notification delivery via webhooks and bot commands. Subject to Discord's <a href="https://discord.com/terms" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">Terms of Service</a>.</li>
          <li><strong>OpenAI / DeepSeek</strong> — Optional AI-powered screenshot processing for member name extraction. Screenshots are processed in-memory and are not stored by the Service or retained by the AI providers per their respective API data usage policies.</li>
          <li><strong>Vercel</strong> — Frontend application hosting and deployment. Subject to Vercel's <a href="https://vercel.com/legal/terms" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">Terms of Service</a>.</li>
          <li><strong>Fly.io</strong> — Discord bot hosting infrastructure. Subject to Fly.io's <a href="https://fly.io/legal/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">Terms of Service</a>.</li>
          <li><strong>PayPal</strong> — Payment processing for server access extensions. Subject to PayPal's <a href="https://www.paypal.com/legalhub/terms" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">Terms of Service</a>.</li>
        </ul>
        <p>
          We do not control, endorse, and are not responsible for the content, privacy practices, availability,
          or actions of any third-party services. Your use of third-party services is at your own risk and subject
          to those providers' respective terms and policies. We are not liable for any loss or damage arising from
          your use of or reliance on third-party services.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">9. Payments, Trials &amp; Refunds</h2>
        <p>
          RaidScout currently offers server access extensions as one-time payments. New servers receive a 7-day
          free trial with full access to all features. The following payment terms apply:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Each payment extends server access by 30 days from the current expiry date, not the date of payment. Days stack cumulatively — paying early does not forfeit remaining time</li>
          <li>All payments are processed securely through PayPal. We do not collect, store, or have access to your payment card details, bank account information, or PayPal credentials</li>
          <li>All payments are final and non-refundable except as expressly provided in our <a href="/refund" className="text-indigo-400 hover:text-indigo-300">Refund Policy</a></li>
          <li>Server Owners are solely responsible for monitoring their server's access status and processing timely payments to maintain uninterrupted service</li>
          <li>Expired servers retain their data but have limited functionality until access is renewed</li>
          <li>We reserve the right to modify pricing, introduce new pricing tiers, or change the duration of access periods with reasonable advance notice. Price changes do not retroactively affect existing paid periods</li>
          <li>If a server is deleted, any remaining paid access time is forfeited and not refundable</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">10. Intellectual Property Rights</h2>
        <p>
          The RaidScout name, logo, branding, website design, user interface, source code, and all associated
          original content are the exclusive intellectual property of RaidScout and are protected by copyright,
          trademark, and other intellectual property laws. Nothing in these Terms grants you any right, title,
          or interest in or to the Service's intellectual property, except for the limited, non-exclusive,
          non-transferable, revocable right to access and use the Service in accordance with these Terms.
        </p>
        <p>
          All game titles, boss names, guild names, character names, in-game locations, and related trademarks,
          logos, and intellectual property belong to their respective game developers and publishers. RaidScout
          is an independent, unaffiliated third-party tool. The Service is not endorsed by, sponsored by, or
          affiliated with any game developer, publisher, or platform.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">11. Disclaimer of Warranties</h2>
        <p>
          TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICE IS PROVIDED ON AN &ldquo;AS IS&rdquo;
          AND &ldquo;AS AVAILABLE&rdquo; BASIS WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED,
          STATUTORY, OR OTHERWISE, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, AND ANY WARRANTIES ARISING FROM COURSE
          OF DEALING, USAGE, OR TRADE PRACTICE.
        </p>
        <p>Without limiting the foregoing, we do not warrant or represent that:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>The Service will be uninterrupted, timely, secure, error-free, or free from viruses or other harmful components</li>
          <li>Boss spawn data, countdown timers, schedules, or respawn windows will be 100% accurate or error-free</li>
          <li>Any defects or errors in the Service will be corrected within any particular timeframe</li>
          <li>The Service will be compatible with all devices, operating systems, browsers, or network configurations</li>
          <li>Data stored or transmitted through the Service will not be lost, corrupted, or subject to unauthorized access</li>
        </ul>
        <p>
          Your use of the Service and any reliance on boss spawn data or timer information is at your own risk.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">12. Limitation of Liability</h2>
        <p>
          TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL RAID SCOUT, ITS AFFILIATES,
          OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
          SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES OF ANY KIND, INCLUDING BUT NOT LIMITED TO
          LOSS OF PROFITS, REVENUE, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR IN
          CONNECTION WITH:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Your access to, use of, or inability to access or use the Service</li>
          <li>Any conduct, content, or data of any third party on or through the Service</li>
          <li>Unauthorized access, use, disclosure, or alteration of your data, transmissions, or content</li>
          <li>Any errors, inaccuracies, or omissions in boss spawn timing, game data, schedules, or other Service content</li>
          <li>Any bugs, viruses, or other harmful code that may be transmitted to or through the Service by any third party</li>
        </ul>
        <p>
          IN NO EVENT SHALL OUR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THESE
          TERMS OR THE SERVICE EXCEED THE GREATER OF: (A) THE AMOUNT YOU HAVE PAID TO US IN THE TWELVE MONTHS
          IMMEDIATELY PRECEDING THE CLAIM, OR (B) ONE HUNDRED UNITED STATES DOLLARS (USD $100.00).
        </p>
        <p>
          Some jurisdictions do not allow the exclusion of certain warranties or the limitation or exclusion of
          liability for incidental or consequential damages. In such jurisdictions, our liability shall be
          limited to the maximum extent permitted by law.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">13. Indemnification</h2>
        <p>
          You agree to defend, indemnify, and hold harmless RaidScout, its affiliates, officers, directors,
          employees, and agents from and against any and all claims, damages, obligations, losses, liabilities,
          costs, debts, and expenses (including reasonable attorneys' fees) arising out of or relating to:
          (a) your use of and access to the Service; (b) your violation of any term of these Terms; (c) your
          violation of any third-party right, including without limitation any intellectual property, privacy,
          or publicity right; (d) your violation of any applicable law, rule, or regulation; or (e) any content
          or data you create, upload, or submit through the Service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">14. Termination</h2>
        <p>
          We reserve the right, in our sole discretion and without prior notice or liability, to suspend,
          restrict, or terminate your access to the Service, in whole or in part, for any reason, including
          but not limited to:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Violation of these Terms or any applicable law or regulation</li>
          <li>Conduct that we believe is harmful to other users, third parties, or the Service itself</li>
          <li>Extended account inactivity exceeding a reasonable period</li>
          <li>Requests from law enforcement or other government authorities</li>
          <li>Unexpected technical or security issues</li>
        </ul>
        <p>
          Upon termination: (a) your right to access and use the Service will immediately cease; (b) your
          account and all associated data (including server data) may be deleted after a reasonable retention
          period; and (c) any outstanding payment obligations will survive termination. All provisions of these
          Terms that by their nature should survive termination — including without limitation ownership
          provisions, warranty disclaimers, indemnity, and limitations of liability — shall survive.
        </p>
        <p>
          You may terminate your account and discontinue use of the Service at any time by deleting your
          account through the Service or by contacting us.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">15. Modifications to the Service &amp; Terms</h2>
        <p>
          We reserve the right, at our sole discretion, to modify, suspend, or discontinue the Service (or any
          part thereof) at any time, with or without notice. We shall not be liable to you or any third party
          for any modification, suspension, or discontinuance of the Service.
        </p>
        <p>
          We also reserve the right to modify these Terms at any time. When we make material changes, we will
          make reasonable efforts to notify you — such as through our Discord community, in-app notices, or via
          the email address associated with your account. The &ldquo;Last updated&rdquo; date at the top of this
          page reflects the effective date of the current Terms.
        </p>
        <p>
          Your continued use of the Service after any modification to these Terms constitutes your acceptance of
          and agreement to be bound by the revised Terms. If you do not agree to the modified Terms, you must
          discontinue use of the Service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">16. Governing Law &amp; Dispute Resolution</h2>
        <p>
          These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which
          the Service operator resides, without regard to conflict of law principles.
        </p>
        <p>
          Any dispute, controversy, or claim arising out of or relating to these Terms or the Service shall first
          be addressed through good-faith informal negotiations. If the dispute cannot be resolved informally
          within thirty (30) days, either party may pursue resolution through binding arbitration or the courts
          of competent jurisdiction, as applicable under governing law.
        </p>
        <p>
          You agree that any claim or cause of action arising out of or relating to these Terms or the Service
          must be filed within one (1) year after the claim or cause of action arose, or it shall be permanently
          barred.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">17. General Provisions</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Severability:</strong> If any provision of these Terms is found to be unenforceable or invalid by a court of competent jurisdiction, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect</li>
          <li><strong>Waiver:</strong> Our failure to enforce any right or provision of these Terms shall not constitute a waiver of such right or provision. Any waiver must be in writing and signed by an authorized representative</li>
          <li><strong>Assignment:</strong> You may not assign or transfer these Terms, or any rights or obligations hereunder, without our prior written consent. We may assign or transfer these Terms without restriction</li>
          <li><strong>Entire Agreement:</strong> These Terms, together with our Privacy Policy and any other policies referenced herein, constitute the entire agreement between you and RaidScout regarding the Service and supersede all prior agreements, understandings, and representations</li>
          <li><strong>Force Majeure:</strong> We shall not be liable for any failure or delay in performance due to causes beyond our reasonable control, including but not limited to natural disasters, acts of war or terrorism, governmental actions, internet or power outages, or third-party service failures</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">18. Contact</h2>
        <p>
          For questions, concerns, feedback, or legal inquiries regarding these Terms, please reach out through our{" "}
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
