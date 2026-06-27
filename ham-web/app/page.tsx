"use client";

import dynamicImport from 'next/dynamic';
import { useState, useEffect } from 'react';


// Load components client-side — prevents Wagmi/Privy SSR errors
const GameShell = dynamicImport(() => import('@/components/GameShell'), { ssr: false });
const AdminPage = dynamicImport(() => import('@/app/admin/page'), { ssr: false });

import { useGameChain } from '@/components/GameProvider';

function PageContent() {
  const [isAdmin, setIsAdmin] = useState(false);
  const { address } = useGameChain();

  const adminAddress = process.env.NEXT_PUBLIC_ADMIN_ADDRESS || "ST1K96254R3KP5TRT5N2X64FB12VMHX6MYT2VB8B1";
  const isAdminUser = address === adminAddress;

  // Forcefully strip any query parameters to ensure Leather wallet authorization passes
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  return (
    <>
      {isAdminUser && (
        <button 
          onClick={() => setIsAdmin(!isAdmin)}
          style={{ position: 'fixed', bottom: 10, left: 10, zIndex: 9999, background: 'black', color: 'white', padding: '8px 12px', borderRadius: '4px', border: '1px solid #333' }}
        >
          Admin Toggle
        </button>
      )}
      {isAdmin ? <AdminPage /> : <GameShell />}
    </>
  );
}

export default function Home() {
  return <PageContent />;
}
