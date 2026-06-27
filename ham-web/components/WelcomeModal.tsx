'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useGameChain } from './GameProvider';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  address: string | null;
  profileName: string | null;
  onProfileUpdated: (name: string) => void;
}

export default function WelcomeModal({ isOpen, onClose, address, profileName, onProfileUpdated }: WelcomeModalProps) {
  const { connectWallet } = useGameChain();
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // If they connect and already have a profile, auto-close
  useEffect(() => {
    if (address && profileName) {
      onClose();
    }
  }, [address, profileName, onClose]);

  if (!isOpen) return null;

  const handleConnect = () => {
    connectWallet();
    onClose();
  };

  const handleSave = async () => {
    if (!username || username.length < 3 || username.length > 20) {
      setStatus('Username must be 3-20 characters');
      return;
    }
    setIsSaving(true);
    setStatus('Saving...');
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, username }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      onProfileUpdated(username);
      setStatus('Saved!');
      setTimeout(() => onClose(), 1000);
    } catch (e: any) {
      setStatus(e.message || 'Error saving profile');
    } finally {
      setIsSaving(false);
    }
  };

  // Only allow closing if they either aren't connected, or they have a profile
  const canClose = !address || (address && profileName);

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', letterSpacing: '1px' }}>WELCOME</span>
          {canClose && (
             <button onClick={onClose} style={closeBtnStyle}>✕</button>
          )}
        </div>

        <div style={contentStyle}>
          <div style={{ marginBottom: 24, width: '100%', height: 180, position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
            <Image src="/welcome.jpg" alt="A home is a maze" fill style={{ objectFit: 'cover' }} priority />
          </div>
          
          <h2 style={{ fontSize: '20px', margin: '0 0 24px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', color: 'var(--text)' }}>
            Welcome to Home's A Maze
          </h2>
          
          {!address ? (
            <div style={{ textAlign: 'left', marginBottom: '24px', padding: '0 10px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5', fontFamily: 'var(--font-head)', textAlign: 'center' }}>
                The first fully on-chain daily maze. Here's how it works:
              </p>
              <ul style={{ fontSize: '12px', color: 'var(--text)', lineHeight: '1.6', listStyle: 'none', padding: 0, margin: '0', display: 'flex', flexDirection: 'column', gap: '12px', fontFamily: 'var(--font-head)' }}>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ fontSize: '14px' }}>🏁</span>
                  <span><strong>Solve the Maze:</strong> <span style={{ color: 'var(--text-muted)' }}>Enter the start arrow (↓) to begin. Navigate to the center home icon without touching walls.</span></span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ fontSize: '14px' }}>⏱️</span>
                  <span><strong>Mint Your Run:</strong> <span style={{ color: 'var(--text-muted)' }}>Record your completion time permanently on Stacks.</span></span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ fontSize: '14px' }}>🏆</span>
                  <span><strong>Win the Pot:</strong> <span style={{ color: 'var(--text-muted)' }}>The top 10 fastest players each day split the prize pool!</span></span>
                </li>
              </ul>
            </div>
          ) : (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: '1.5', fontFamily: 'var(--font-head)' }}>
              You are connected! Claim a unique username to represent yourself on the leaderboard.
            </p>
          )}

          {!address ? (
            <button onClick={handleConnect} className="btn btn-primary btn-full" style={{ padding: '16px', fontSize: '14px', letterSpacing: '0.1em' }}>
              CONNECT WALLET
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                placeholder="ENTER USERNAME"
                value={username}
                onChange={(e) => setUsername(e.target.value.toUpperCase())}
                maxLength={20}
                style={inputStyle}
                disabled={isSaving}
              />
              <button onClick={handleSave} className="btn btn-primary btn-full" disabled={isSaving} style={{ padding: '16px', fontSize: '14px', letterSpacing: '0.1em' }}>
                {isSaving ? 'SAVING...' : 'CLAIM USERNAME'}
              </button>
              {status && <div style={{ color: 'var(--gold)', fontSize: '12px', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>{status}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.85)',
  backdropFilter: 'blur(5px)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 9999,
};

const modalStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-panel)',
  border: '3px solid var(--wall)',
  width: '100%',
  maxWidth: '380px',
  padding: '24px',
  color: 'var(--text)',
  position: 'relative',
  boxShadow: 'var(--shadow-lg)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: 'var(--text-muted)',
  marginBottom: '24px',
  fontFamily: 'var(--font-mono)',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  fontSize: '18px',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
};

const contentStyle: React.CSSProperties = {
  textAlign: 'center',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '16px',
  backgroundColor: 'var(--bg-dark)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: '14px',
  textAlign: 'center',
  outline: 'none',
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.1em',
};
