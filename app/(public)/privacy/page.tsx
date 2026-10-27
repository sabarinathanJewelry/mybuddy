import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy · Sabarinathan Jewellers" };

const UPDATED = "27 October 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-canvas px-4 py-10">
      <article className="max-w-2xl mx-auto bg-white rounded-xl border border-line shadow-soft p-6 sm:p-8 space-y-5 text-sm text-ink leading-relaxed">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">Privacy Policy</h1>
          <p className="text-ink-dim">Sabarinathan Jewellers · Last updated {UPDATED}</p>
        </header>

        <p>
          Sabarinathan Jewellers (&quot;we&quot;, &quot;us&quot;), 166 Nethaji Road, Madurai 625001, Tamil Nadu, India, runs MyBuddy, our internal
          shop system. This policy explains what information we receive when you interact with our Instagram account
          @sabarinathan_jewellers_madurai and how we use it.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Information we receive</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Your Instagram username and the account ID Instagram shares with us.</li>
            <li>The text of comments you post on our reels and posts.</li>
            <li>Messages you send to our Instagram account, including button taps in our replies.</li>
            <li>Whether you follow our Instagram account, which Instagram shares only after you message us.</li>
          </ul>
          <p>We do not receive your password, phone number, email or any other private Instagram data.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">How we use it</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>To reply to your comment with a private message containing the product details, price or offer you asked about.</li>
            <li>To post a short public reply under your comment letting you know we have messaged you.</li>
            <li>To keep a record of enquiries so our staff can follow up and avoid sending you the same message twice.</li>
          </ul>
          <p>We do not sell, rent or share your information with anyone for advertising.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Storage and retention</h2>
          <p>
            Information is stored securely in our database (Supabase, hosted in Asia) and is accessible only to authorised
            shop administrators. We keep comment and message records for up to 12 months, after which they are deleted.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Your choices</h2>
          <p>
            You can stop receiving messages at any time by not commenting keywords on our posts or by blocking our account.
            You can ask us to delete your information at any time — see our{" "}
            <a href="/data-deletion" className="text-gold underline">data deletion instructions</a>.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Contact</h2>
          <p>
            Sabarinathan Jewellers, 166 Nethaji Road, Madurai 625001 · WhatsApp / phone +91 73053 93916 · Instagram
            @sabarinathan_jewellers_madurai
          </p>
        </section>
      </article>
    </main>
  );
}
