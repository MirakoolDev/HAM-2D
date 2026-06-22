'use client';

import { useEffect, useState } from 'react';
import { useGameChain } from './GameProvider';
import { getTodaySeed } from '@/lib/maze';

interface PotPanelProps {
  isConnected: boolean;
  refreshTrigger: number;
}

export default function PotPanel({ isConnected, refreshTrigger }: PotPanelProps) {
  const { provider } = useGameChain();
  const [prizePool, setPrizePool] = useState<string>("0");

  useEffect(() => {
    async function fetchPot() {
      try {
        const pool = await provider.getPrizePool(getTodaySeed());
        setPrizePool(pool);
      } catch (err) {
        console.error("Failed to fetch prize pool", err);
      }
    }
    fetchPot();
  }, [provider, refreshTrigger]);

  return (
    <div className="panel side-panel pot-panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>Prize Pool</h2>
      </div>
      <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 48, fontWeight: 'bold', color: 'var(--accent)' }}>
          {prizePool}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8 }}>
          Microstacks (uSTX)
        </div>
      </div>
    </div>
  );
}
