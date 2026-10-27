import type { Metadata } from "next";

export const metadata: Metadata = { title: "Data Deletion · Sabarinathan Jewellers" };

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-canvas px-4 py-10">
      <article className="max-w-2xl mx-auto bg-white rounded-xl border border-line shadow-soft p-6 sm:p-8 space-y-5 text-sm text-ink leading-relaxed">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">Data Deletion Instructions</h1>
          <p className="text-ink-dim">Sabarinathan Jewellers</p>
        </header>

        <p>
          When you comment on or message our Instagram account @sabarinathan_jewellers_madurai, we store your Instagram
          username, account ID, and the comment or message text so we can reply to your enquiry. You can ask us to delete
          this information at any time.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">How to request deletion</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Send a direct message with the word <b>DELETE</b> to @sabarinathan_jewellers_madurai on Instagram, or</li>
            <li>Send a WhatsApp message to <b>+91 73053 93916</b> with your Instagram username and the word DELETE.</li>
          </ol>
          <p>
            We will delete all comment and message records linked to your Instagram account from our systems within 30 days
            and confirm by reply once it is done.
          </p>
        </section>

        <p className="text-ink-dim">
          See our <a href="/privacy" className="text-gold underline">Privacy Policy</a> for details of the information we receive.
        </p>
      </article>
    </main>
  );
}
