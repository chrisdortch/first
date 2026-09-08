export default function AccessDeniedPage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="denied-title">
        <p className="eyebrow">Default deny</p>
        <h1 id="denied-title">This workspace is unavailable</h1>
        <p>The request did not carry a verified owner session. No workspace or session existence was disclosed.</p>
      </section>
    </main>
  );
}
