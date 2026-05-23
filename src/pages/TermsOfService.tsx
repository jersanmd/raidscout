import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";

export function TermsOfServiceView() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-950">
      <SEOHead
        title="Terms of Service"
        description="Terms of service for RaidScout boss timer application."
        canonicalUrl="/terms"
        noindex
      />
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 text-slate-300 text-sm leading-relaxed">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 hover:text-white transition text-xs mb-2">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
      <h1 className="text-2xl font-bold text-white">Terms of Service</h1>
      <p className="text-slate-500 text-xs">Last updated: May 21, 2026</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">1. Acceptance of Terms</h2>
        <p>
          By accessing or using RaidScout (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service.
          If you do not agree, do not use the Service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">2. Description of Service</h2>
        <p>
          RaidScout is a free web-based tool for tracking boss spawn timers, scheduling hunts, coordinating guild
          assignments, and monitoring member performance in the game LordNine. The Service provides real-time timers,
          Discord notifications, leaderboard tracking, and guild management features.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">3. User Accounts</h2>
        <p>
          You must create an account to use the Service. You are responsible for maintaining the confidentiality of
          your login credentials and for all activities under your account. You must provide accurate and complete
          information when creating your account.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">4. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Use the Service for any unlawful purpose or in violation of any applicable laws</li>
          <li>Attempt to gain unauthorized access to other users&apos; servers or data</li>
          <li>Interfere with or disrupt the Service or its servers</li>
          <li>Upload malicious code or content</li>
          <li>Impersonate others or provide false information</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">5. Server Ownership</h2>
        <p>
          Servers created within RaidScout are owned by the user who created them. Server owners may transfer
          ownership, add moderators, and manage server settings. RaidScout is not responsible for disputes between
          server members.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">6. Third-Party Services</h2>
        <p>
          The Service integrates with Discord for notification features. Use of Discord is subject to Discord&apos;s own
          Terms of Service. The Service may also use AI-powered name extraction from uploaded screenshots, processed
          through third-party AI providers.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">7. Intellectual Property</h2>
        <p>
          The RaidScout name, logo, and Service are owned by RaidScout. LordNine is a trademark of its respective
          owner. RaidScout is an independent tool and is not affiliated with or endorsed by LordNine or its developers.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">8. Disclaimer of Warranties</h2>
        <p>
          The Service is provided &ldquo;as is&rdquo; without warranties of any kind, express or implied. RaidScout does not
          guarantee uninterrupted access, error-free operation, or accuracy of boss spawn data.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">9. Limitation of Liability</h2>
        <p>
          To the fullest extent permitted by law, RaidScout shall not be liable for any indirect, incidental, or
          consequential damages arising from your use of the Service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">10. Changes to Terms</h2>
        <p>
          We reserve the right to modify these Terms at any time. Continued use of the Service after changes
          constitutes acceptance of the updated Terms.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">11. Contact</h2>
        <p>
          For questions about these Terms, contact us through our{" "}
          <a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 transition">
            Discord Community
          </a>.
        </p>
      </section>
      </div>
    </div>
  );
}
