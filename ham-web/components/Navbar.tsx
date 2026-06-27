'use client';

import { useGameChain } from './GameProvider';
import { useEffect, useState } from 'react';
import { getTodaySeed } from '@/lib/maze';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import WelcomeModal from './WelcomeModal';

interface NavbarProps {
  mazeId: number;
}

const ADMIN_ADDRESS = "ST1K96254R3KP5TRT5N2X64FB12VMHX6MYT2VB8B1";

export default function Navbar({ mazeId }: NavbarProps) {
  const { address, connectWallet, disconnectWallet, provider } = useGameChain();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [prizePool, setPrizePool] = useState<number>(0);
  const [isSettled, setIsSettled] = useState(false);
  const [mintFee, setMintFee] = useState(1);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const router = useRouter();

  const isPastMaze = mazeId < getTodaySeed();
  const isOwner = address === ADMIN_ADDRESS;

  useEffect(() => {
    async function checkProfile() {
      if (!address) {
        setProfileName(null);
        setShowWelcome(true);
        return;
      }
      try {
        const res = await fetch(`/api/profile?address=${address}`);
        const data = await res.json();
        if (data.profile?.username) {
          setProfileName(data.profile.username);
          setShowWelcome(false);
        } else {
          setProfileName(null);
          setShowWelcome(true);
        }
      } catch (e) {
        console.error('Failed to fetch profile', e);
      }
    }
    checkProfile();
  }, [address]);

  useEffect(() => {
    async function fetchStats() {
      try {
        const pool = await provider.getPrizePool(mazeId);
        setPrizePool(parseInt(pool) / 1_000_000);
        const fee = await provider.getMintFee?.() || "1000000";
        setMintFee(parseInt(fee) / 1_000_000);
        if (isPastMaze) {
          const settled = await provider.isMazeSettled(mazeId);
          setIsSettled(settled);
        }
      } catch (err) {
        console.error("Failed to fetch stats", err);
      }
    }
    fetchStats();
  }, [provider, mazeId, isPastMaze]);

  const handleSettle = async () => {
    if (!address) return alert("Connect wallet first!");
    try {
      await provider.settleMaze(mazeId);
      alert("Settlement transaction broadcasted!");
    } catch (e: any) {
      alert("Settlement failed: " + e.message);
    }
  };

  return (
    <>
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      background: 'var(--bg-dark)',
      borderBottom: '1px solid var(--border)',
      height: 60,
      flexShrink: 0,
      zIndex: 100,
    }}>

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Image
          src="/logo.jpg"
          alt="HAM"
          width={32}
          height={32}
          style={{ borderRadius: 4 }}
          priority
        />
        <span style={{
          fontFamily: 'var(--font-head)',
          fontWeight: 700,
          fontSize: 20,
          letterSpacing: '0.08em',
          color: 'var(--text)',
        }}>HAM</span>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
        {[
          { label: 'POT SIZE', value: `${prizePool.toFixed(2)} STX` },
          { label: 'MINT FEE', value: `${mintFee} STX` },
        ].map(({ label, value }, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
            {i > 0 && <div style={{ width: 1, height: 28, background: 'var(--border)' }} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>{label}</span>
              <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => {
            const isLight = document.documentElement.getAttribute('data-theme') === 'light';
            document.documentElement.setAttribute('data-theme', isLight ? 'dark' : 'light');
            localStorage.setItem('theme', isLight ? 'dark' : 'light');
          }}
          style={{
            background: 'none',
            border: 'none',
            fontSize: 20,
            cursor: 'pointer',
            padding: 4,
          }}
          title="Toggle Theme"
        >
          🌓
        </button>

        <div style={{ position: 'relative' }}>
          {address ? (
            <>
              <button
                className="wallet-btn connected"
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                {profileName ? profileName : `${address.slice(0, 6)}…${address.slice(-4)}`}
              </button>
              {dropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  zIndex: 200,
                  minWidth: 180,
                  boxShadow: 'var(--shadow-lg)',
                }}>
                  {isOwner && (
                    <button
                      onClick={() => { setDropdownOpen(false); router.push('/admin'); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer' }}
                    >
                      Admin Dashboard
                    </button>
                  )}
                  {isPastMaze && !isSettled && (
                    <button
                      onClick={handleSettle}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer' }}
                    >
                      Settle Maze #{mazeId}
                    </button>
                  )}
                  {isPastMaze && isSettled && (
                    <button
                      disabled
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'default' }}
                    >
                      Maze Settled ✓
                    </button>
                  )}
                  <button
                    onClick={() => { setDropdownOpen(false); setShowWelcome(true); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer' }}
                  >
                    Change Username
                  </button>
                  <button
                    onClick={() => { disconnectWallet(); setDropdownOpen(false); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 16px', background: 'none', border: 'none', color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,68,68,0.1)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </>
          ) : (
            <button className="wallet-btn" onClick={connectWallet}>
              Connect Wallet
            </button>
          )}
        </div>
      </div>

    </header>
      <WelcomeModal 
        isOpen={showWelcome} 
        onClose={() => setShowWelcome(false)} 
        address={address || null}
        profileName={profileName}
        onProfileUpdated={(name) => {
          setProfileName(name);
          setShowWelcome(false);
        }}
      />
    </>
  );
}
