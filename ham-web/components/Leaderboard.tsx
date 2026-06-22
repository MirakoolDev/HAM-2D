'use client';

import { useEffect, useState } from 'react';
import { fetchLeaderboard, type Run } from '@/lib/supabase';
import { getTodaySeed } from '@/lib/maze';

interface LeaderboardProps {
  connectedAddress?: string;
  refreshTrigger?: number; // increment to force refresh
}

function shortenAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return `${s}.${centis.toString().padStart(2, '0')}s`;
}

const PODIUM_SHARE = [30, 20, 15]; // % of prize pool for 1st/2nd/3rd
const TAIL_TOTAL = 35;             // % split equally among 4th–Nth

function prizeShare(rank: number, totalWinners: number): string {
  if (rank === 1) return `${PODIUM_SHARE[0]}%`;
  if (rank === 2) return `${PODIUM_SHARE[1]}%`;
  if (rank === 3) return `${PODIUM_SHARE[2]}%`;
  if (rank <= totalWinners) {
    const tailN = Math.max(totalWinners - 3, 1);
    return `${(TAIL_TOTAL / tailN).toFixed(1)}%`;
  }
  return '—';
}

import { useGameChain } from '@/components/GameProvider';

export default function Leaderboard({ connectedAddress, refreshTrigger = 0 }: LeaderboardProps) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [pulsing, setPulsing] = useState(false);
  const totalWinners = 10;
  const mazeId = getTodaySeed();
  const { networkId } = useGameChain();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLeaderboard(mazeId, networkId).then((data) => {
      if (!cancelled) {
        setRuns(data);
        setLoading(false);
        if (refreshTrigger > 0) {
          setPulsing(true);
          setTimeout(() => setPulsing(false), 1200);
        }
      }
    });
    return () => { cancelled = true; };
  }, [mazeId, refreshTrigger]);

  const rankClass = (rank: number) => {
    if (rank === 1) return 'gold';
    if (rank === 2) return 'silver';
    if (rank === 3) return 'bronze';
    return '';
  };

  const rankEmoji = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div className="panel-title">
        <span className="live-dot" style={{ opacity: pulsing ? 1 : 0.4 }} />
        Leaderboard 🏆
      </div>

      {/* Header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '32px 1fr auto auto',
          gap: 8,
          padding: '4px 10px',
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border)',
          marginBottom: 6,
        }}
      >
        <span>#</span>
        <span>Player</span>
        <span>Time</span>
        <span>Prize</span>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          Loading…
        </div>
      )}

      {!loading && runs.length === 0 && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          No runs yet today.<br />Be the first! 🏁
        </div>
      )}

      {runs.map((run) => {
        const rank = run.rank ?? 0;
        const isMe = connectedAddress?.toLowerCase() === run.address.toLowerCase();
        const inPrizes = rank <= totalWinners;
        return (
          <div
            key={run.token_id}
            className={`lb-row${isMe ? ' me' : ''}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '32px 1fr auto auto',
              gap: 8,
              opacity: inPrizes ? 1 : 0.55,
            }}
          >
            <span className={`lb-rank ${rankClass(rank)}`}>{rankEmoji(rank)}</span>
            <span className="lb-addr" title={run.address}>
              {isMe ? '👤 You' : shortenAddr(run.address)}
            </span>
            <span className="lb-time">{formatTime(run.time_ms)}</span>
            <span
              className="lb-time"
              style={{ color: inPrizes ? 'var(--goal)' : 'var(--text-muted)', fontSize: 10 }}
            >
              {prizeShare(rank, totalWinners)}
            </span>
          </div>
        );
      })}

      {runs.length > 0 && runs.length > totalWinners && (
        <>
          <hr className="lb-divider" />
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center', padding: '4px 0' }}>
            Top {totalWinners} share the prize pool
          </div>
        </>
      )}
    </div>
  );
}
