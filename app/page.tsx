import Image from 'next/image';
import Link from 'next/link';
import { Nav } from '@/components/nav';

export default function HomePage() {
  return (
    <main className="stack">
      <Nav />
      <section className="card stack">
        <h1 style={{ margin: 0 }}>Next.js 14 + Supabase + Vercel</h1>
        <p className="muted" style={{ margin: 0 }}>
          This starter is wired for GitHub push -&gt; CI -&gt; Vercel deploy with Supabase backend.
        </p>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="stack" style={{ flex: 1 }}>
            <Link href="/login" className="button" style={{ width: 'fit-content' }}>
              Go To Login
            </Link>
            <p className="muted" style={{ margin: 0 }}>
              Uses <code>@supabase/ssr</code> clients and middleware session refresh.
            </p>
          </div>
          <Image
            src="/assets/opentraining/Bench-press-1.png"
            alt="Exercise preview"
            width={180}
            height={140}
            style={{ borderRadius: 10, objectFit: 'cover' }}
            priority
          />
        </div>
      </section>
    </main>
  );
}
