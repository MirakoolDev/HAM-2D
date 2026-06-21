'use client';

// Skip static prerendering — this page uses wallet providers (Privy/Wagmi)
export const dynamic = 'force-dynamic';

import dynamicImport from 'next/dynamic';

// Load entire game shell only client-side — prevents Wagmi/Privy SSR errors
const GameShell = dynamicImport(() => import('@/components/GameShell'), { ssr: false });

export default function Home() {
  return <GameShell />;
}
