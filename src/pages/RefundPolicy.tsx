import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";

export function RefundPolicyView() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-950">
      <SEOHead
        title="Refund Policy"
        description="Refund and cancellation policy for RaidScout server access payments."
        canonicalUrl="/refund"
        noindex
      />
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 text-slate-300 text-sm leading-relaxed">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 hover:text-[#fafafa] transition text-xs mb-2">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
      <h1 className="text-2xl font-bold text-[#fafafa]">Refund Policy</h1>
      <p className="text-slate-500 text-xs">Last updated: June 16, 2026</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">1. Digital Service Nature</h2>
        <p>
          RaidScout provides a digital service — access to a web-based guild operations platform. When you make a payment,
          you receive immediate access to all features for your server. Due to the digital nature of the service, all sales
          are considered final once access has been granted.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">2. Eligibility for Refunds</h2>
        <p>We may, at our sole discretion, issue a refund in the following circumstances:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Duplicate charges</strong> — if you were charged multiple times for the same transaction due to a technical error</li>
          <li><strong>Service unavailability</strong> — if the RaidScout platform experiences an extended outage (24+ hours) that prevents all use of the service</li>
          <li><strong>Fraudulent transactions</strong> — if a payment was made without your authorization</li>
        </ul>
        <p>
          Refund requests must be submitted within 14 days of the transaction date. Requests submitted after this
          period will not be considered.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">3. Non-Refundable Circumstances</h2>
        <p>The following are NOT eligible for refunds:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Change of mind after purchasing</li>
          <li>Failure to use the service during the paid period</li>
          <li>Dissatisfaction with game-specific data accuracy (boss timers, spawn schedules)</li>
          <li>Your guild or server stops playing a particular game</li>
          <li>Partial period refunds — we do not prorate refunds for unused time</li>
          <li>Accidental purchases where the payment was intentional and completed</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">4. How to Request a Refund</h2>
        <p>To request a refund, contact us through our{" "}
          <a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 transition">
            Discord Community
          </a> with the following information:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Your RaidScout account email</li>
          <li>The server name the payment was made for</li>
          <li>The PayPal transaction ID (found in your PayPal receipt or RaidScout Payment History)</li>
          <li>The reason for your refund request</li>
        </ul>
        <p>
          We will review your request and respond within 5 business days. Approved refunds will be processed
          through PayPal and may take 5-10 business days to appear on your statement, depending on your
          payment method and financial institution.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">5. Chargebacks</h2>
        <p>
          If you dispute a charge through your bank or PayPal (a &ldquo;chargeback&rdquo;) without first
          contacting us, we reserve the right to immediately suspend your RaidScout account and all associated
          servers until the dispute is resolved. We encourage you to contact us first — we&apos;re reasonable
          people and want to work things out.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">6. Changes to This Policy</h2>
        <p>
          We reserve the right to modify this Refund Policy at any time. Changes will be posted on this page
          with an updated date. Continued use of the Service after changes are posted constitutes acceptance
          of the updated policy.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[#fafafa]">7. Contact</h2>
        <p>
          For refund inquiries, reach out via our{" "}
          <a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 transition">
            Discord Community
          </a>.
        </p>
      </section>
      </div>
    </div>
  );
}
