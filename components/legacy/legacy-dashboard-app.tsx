'use client';

import { useEffect, useRef } from 'react';

interface Props {
  accessToken: string;
  refreshToken: string;
}

export function LegacyDashboardApp({ accessToken, refreshToken }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !accessToken) return;

    const inject = () => {
      iframe.contentWindow?.postMessage(
        { type: 'ATHLIX_SESSION', accessToken, refreshToken },
        window.location.origin,
      );
    };

    // The iframe may already be loaded by the time this effect runs
    if (
      iframe.contentDocument?.readyState === 'complete' ||
      iframe.contentDocument?.readyState === 'interactive'
    ) {
      inject();
    }

    // Also fire on load in case the iframe hasn't finished yet
    iframe.addEventListener('load', inject);
    return () => iframe.removeEventListener('load', inject);
  }, [accessToken, refreshToken]);

  return (
    <main style={{ minHeight: '100dvh', background: '#0a0a0a' }}>
      <iframe
        ref={iframeRef}
        title="Athlix Application"
        src="/legacy-app/index.html"
        className="w-full border-0"
        style={{ height: '100dvh' }}
      />
    </main>
  );
}
