export default function NotFound() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <h1 style={{ fontSize: 48, marginBottom: 16, fontFamily: 'var(--font-head)', color: 'var(--danger)' }}>404</h1>
      <p style={{ fontSize: 18, color: 'var(--text-muted)' }}>The maze path you are looking for does not exist.</p>
      <a href="/" style={{ marginTop: 24, padding: '12px 24px', background: 'var(--accent)', color: 'black', textDecoration: 'none', borderRadius: 8, fontWeight: 'bold' }}>
        Return to Start
      </a>
    </div>
  );
}
