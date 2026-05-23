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
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 hover:text-white transition text-xs mb-2">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
      <h1 className="text-2xl font-bold text-white">Privacy Policy</h1>
      <p className="text-slate-500 text-xs">Last updated: May 21, 2026</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">1. Information We Collect</h2>
        <p>When you use RaidScout, we collect the following information:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Account Information:</strong> Email address (used for authentication via Supabase Auth)</li>
          <li><strong>Server Data:</strong> Server names, guild names, boss data, death records, and member names you create</li>
          <li><strong>Attendance Data:</strong> Records of which members participated in boss kills</li>
          <li><strong>Discord Webhook URLs:</strong> If you configure Discord notifications</li>
          <li><strong>Uploaded Screenshots:</strong> Rally images uploaded for AI name extraction (processed in-memory, not stored)</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">2. How We Use Your Information</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>To provide and maintain the Service (boss timers, leaderboards, guild management)</li>
          <li>To authenticate your account via email/password</li>
          <li>To send Discord notifications to your configured webhook</li>
          <li>To extract player names from uploaded screenshots using AI (OpenAI GPT-4o mini or similar)</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">3. Data Storage &amp; Security</h2>
        <p>
          All data is stored in Supabase, a secure PostgreSQL database platform. Your password is hashed and never
          stored in plain text. Authentication is handled through Supabase Auth. Uploaded screenshots are processed
          in-memory and are <strong>not stored</strong> on our servers.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">4. Data Sharing</h2>
        <p>
          We do <strong>not</strong> sell, trade, or share your personal data with third parties, except:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Discord: If you configure webhook notifications, boss kill/spawn data is sent to your Discord server</li>
          <li>AI Providers: Screenshots are sent to OpenAI or DeepSeek for name extraction (not stored by them per API terms)</li>
          <li>Supabase: Data is hosted on Supabase infrastructure</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">5. Cookies</h2>
        <p>
          RaidScout uses essential cookies for authentication (session tokens managed by Supabase Auth). We do not
          use tracking cookies or analytics cookies.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">6. Your Rights</h2>
        <p>You have the right to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Access your personal data stored in the Service</li>
          <li>Request deletion of your account and associated data</li>
          <li>Request a copy of your data</li>
        </ul>
        <p>To exercise these rights, contact us through our Discord Community.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">7. Data Retention</h2>
        <p>
          Your data is retained as long as your account exists or the server you belong to exists. When you delete
          your account, your personal data is removed. Server owners can delete server data at any time.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">8. Children&apos;s Privacy</h2>
        <p>
          The Service is not directed at children under 13. We do not knowingly collect personal data from children.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">10. Contact Us</h2>
        <p>
          For privacy-related inquiries, reach out through our{" "}
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
