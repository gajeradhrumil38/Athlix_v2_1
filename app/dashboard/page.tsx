import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/db';

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <main className="stack">
      <h1 style={{ marginBottom: 0 }}>Dashboard</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Protected route. Middleware and server-side checks are both active.
      </p>
      <div className="card stack">
        <strong>Signed in as</strong>
        <code>{user.email}</code>
        <code>{user.id}</code>
      </div>
    </main>
  );
}
