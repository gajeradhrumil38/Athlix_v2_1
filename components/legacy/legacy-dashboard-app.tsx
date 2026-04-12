'use client';

export function LegacyDashboardApp() {
  return (
    <main className="bg-black" style={{ minHeight: '100dvh' }}>
      <iframe
        title="Athlix Application"
        src="/legacy-app/index.html"
        className="w-full border-0"
        style={{ height: '100dvh' }}
      />
    </main>
  );
}
