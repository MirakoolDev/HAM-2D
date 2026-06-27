'use client';

import { useState, useEffect } from 'react';
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
          
          <h2 style={{ fontSize: '24px', margin: '20px 0 10px', textTransform: 'uppercase', fontFamily: 'var(--font-head)' }}>
            Welcome to Home's A Maze
          </h2>
          
          <p style={{ fontSize: '14px', color: '#a0aab0', marginBottom: '30px', lineHeight: '1.5', maxWidth: '300px', margin: '0 auto 30px' }}>
            {!address 
              ? 'Connect your wallet to start playing, earning daily prizes, and competing on the leaderboard.'
              : 'You are connected! Claim a unique username to represent yourself on the leaderboard.'}
          </p>

          {!address ? (
            <button onClick={handleConnect} style={btnStyle}>
              Connect Wallet
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
              <input
                type="text"
                placeholder="Enter Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={20}
                style={inputStyle}
                disabled={isSaving}
              />
              <button onClick={handleSave} style={btnStyle} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Claim Username'}
              </button>
              {status && <div style={{ color: 'var(--gold)', fontSize: '12px', marginTop: '5px' }}>{status}</div>}
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
  border: '1px solid var(--border)',
  width: '100%',
  maxWidth: '450px',
  padding: '20px',
  color: 'var(--text)',
  position: 'relative',
  boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: 'var(--text-muted)',
  marginBottom: '20px',
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
  width: '80%',
  padding: '12px',
  backgroundColor: 'var(--bg-dark)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: '16px',
  textAlign: 'center',
  outline: 'none',
  fontFamily: 'var(--font-mono)',
};

const btnStyle: React.CSSProperties = {
  width: '80%',
  padding: '14px',
  backgroundColor: 'var(--text)',
  color: 'var(--bg-dark)',
  border: 'none',
  fontSize: '16px',
  fontWeight: 'bold',
  cursor: 'pointer',
  textTransform: 'uppercase',
  transition: 'all 0.2s ease',
  fontFamily: 'var(--font-mono)',
};
