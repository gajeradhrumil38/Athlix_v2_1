import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { supabase } from './lib/supabase';

/**
 * Bootstrap: if running inside the Next.js /dashboard iframe, wait for the
 * parent to inject the Supabase session via postMessage BEFORE we render
 * React. This guarantees AuthContext.getCurrentUserAsync() finds a valid
 * user on first call, preventing the "black screen / redirect to /auth" bug.
 *
 * If running standalone (direct URL or not in an iframe), the wait is skipped
 * entirely and the app renders immediately.
 */
async function bootstrap() {
  const isInIframe = window.self !== window.top;

  if (isInIframe) {
    await new Promise<void>((resolve) => {
      // Fallback: if no message arrives within 1 s, render anyway (e.g. dev)
      const fallback = window.setTimeout(resolve, 1000);

      const handler = async (event: MessageEvent) => {
        // Only accept messages from our own origin
        if (event.origin !== window.location.origin) return;
        if ((event.data as { type?: string })?.type !== 'ATHLIX_SESSION') return;

        window.clearTimeout(fallback);
        window.removeEventListener('message', handler);

        const { accessToken, refreshToken } = event.data as {
          type: string;
          accessToken: string;
          refreshToken: string;
        };

        if (accessToken && refreshToken) {
          // Inject the session so createBrowserClient has it before any
          // getUser() / getSession() calls in the React component tree.
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }

        resolve();
      };

      window.addEventListener('message', handler);
    });
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrap();
