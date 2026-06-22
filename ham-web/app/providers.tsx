'use client';

import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { wagmiConfig } from '@/lib/wagmi';
import { GameProvider } from '@/components/GameProvider';

import '@rainbow-me/rainbowkit/styles.css';

// Custom RainbowKit theme matching HAM's brutalist palette
const rkTheme = darkTheme({
  accentColor: '#ffffff',
  accentColorForeground: '#000000',
  borderRadius: 'none',
  fontStack: 'system',
});

import { Connect } from '@stacks/connect-react';
import { userSession } from '@/lib/blockchain/stacks-provider';

export function Providers({ children }: { children: ReactNode }) {
  // useState ensures a stable QueryClient per session (matches pin repo pattern)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rkTheme}>
          <Connect authOptions={{
            appDetails: {
              name: 'HAM Maze',
              icon: typeof window !== 'undefined' ? window.location.origin + '/favicon.ico' : '',
            },
            userSession,
          }}>
            <GameProvider>
              {children}
            </GameProvider>
          </Connect>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
