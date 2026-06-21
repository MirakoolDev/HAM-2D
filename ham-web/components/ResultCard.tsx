'use client';

import { useState } from 'react';
import { useGameChain } from '@/components/GameProvider';

interface ResultCardProps {
  timeMs: number;
  snapshot: string;
  pathSvg: string;
  rank: number | null;
  mazeId: number;
  onMint: () => Promise<void>;
  onPlayAgain: () => void;
  isConnected: boolean;
}

type MintState = 'idle' | 'signing' | 'confirming' | 'done' | 'error';

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return `${s}.${centis.toString().padStart(2, '0')}s`;
}

export default function ResultCard({
  timeMs, snapshot, pathSvg, rank, mazeId, onMint, onPlayAgain, isConnected,
}: ResultCardProps) {
  const [mintState, setMintState] = useState<MintState>('idle');
  const [error, setError] = useState('');
  const { connectWallet } = useGameChain();

  const handleMint = async () => {
    setMintState('signing');
    setError('');
    try {
      setMintState('confirming');
      await onMint();
      setMintState('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Transaction failed');
      setMintState('error');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="result-card">
        <div className="result-title">
          {mintState === 'done' ? '🏆 Minted!' : '★ Maze Solved!'}
        </div>

        <div className="result-time">{formatTime(timeMs)}</div>

        <div className="result-meta">
          {rank !== null && <span>Rank <strong>#{rank}</strong></span>}
          <span>Maze <strong>#{mazeId}</strong></span>
        </div>

        <div className="result-preview" style={{ height: 180 }}>
          {snapshot && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={snapshot} alt="Your maze run"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          )}
        </div>

        {mintState === 'done' && (
          <div className="mint-confirm">
            <span>✓</span> NFT minted
          </div>
        )}

        {mintState === 'error' && (
          <div style={{ color: 'var(--danger)', fontSize: 12, fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!isConnected && mintState === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Connect your wallet to mint
              </div>
              <button className="btn btn-primary" onClick={connectWallet}>
                Connect Wallet
              </button>
            </div>
          )}

          {isConnected && mintState === 'idle' && (
            <button className="btn btn-primary btn-full" onClick={handleMint}>
              Mint Your Run — 1 STX
            </button>
          )}

          {mintState === 'signing' && (
            <button className="btn btn-primary btn-full" disabled>
              ⏳ Waiting for signature…
            </button>
          )}

          {mintState === 'confirming' && (
            <button className="btn btn-primary btn-full" disabled>
              <span className="live-dot" /> Confirming…
            </button>
          )}

          {(mintState === 'done' || mintState === 'error') && (
            <button className="btn btn-secondary btn-full" onClick={onPlayAgain}>
              Play Again
            </button>
          )}

          {mintState === 'idle' && (
            <button className="btn btn-secondary btn-full" onClick={onPlayAgain}>
              Play Again (no mint)
            </button>
          )}
        </div>


      </div>
    </div>
  );
}
