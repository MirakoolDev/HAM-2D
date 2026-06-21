'use client';

import { useEffect, useState } from 'react';
import { useGameChain } from '@/components/GameProvider';
import { getTodaySeed } from '@/lib/maze';

const PRIZE_SHARE = 0.75;
const PODIUM = [30, 20, 15];
const TAIL_TOTAL = 35;
const TOTAL_WINNERS = 10;

function getCountdown(): string {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const diff = midnight.getTime() - now.getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

interface PotPanelProps {
  isConnected: boolean;
  refreshTrigger?: number;
}

export default function PotPanel({ isConnected, refreshTrigger = 0 }: PotPanelProps) {
  const [potStx, setPotStx] = useState(0);
  const [countdown, setCountdown] = useState(getCountdown());
  const mazeId = getTodaySeed();
  const { provider } = useGameChain();

  useEffect(() => {
    provider.getPrizePool(mazeId).then(pool => {
      // The pool is returned in micro-STX as a string
      const stxValue = Number(pool) / 1_000_000;
      setPotStx(stxValue);
    }).catch(console.error);
  }, [mazeId, refreshTrigger, provider]);

  useEffect(() => {
    const t = setInterval(() => setCountdown(getCountdown()), 1000);
    return () => clearInterval(t);
  }, []);

  // Prize breakdown removed per PND minimalist UI request

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <div>
        <div className="panel-title">Today's Pot 💰</div>
        <div className="pot-amount">{potStx.toFixed(4)} STX</div>
        <div className="pot-label">Total mints × 1 STX</div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

      <div>
        <div className="panel-title">Settlement in</div>
        <div className="countdown">{countdown}</div>
      </div>



    </div>
  );
}
