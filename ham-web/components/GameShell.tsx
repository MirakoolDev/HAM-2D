'use client';

import { useState, useCallback } from 'react';
import dynamicImport from 'next/dynamic';
import Leaderboard from '@/components/Leaderboard';
import PotPanel from '@/components/PotPanel';
import ResultCard from '@/components/ResultCard';
import { getTodaySeed, addDaysToSeed } from '@/lib/maze';
import { upsertRun } from '@/lib/supabase';
import { useMiniBlockMints } from '@/lib/miniblock';
import ClaimDropdown from '@/components/ClaimDropdown';
import { useGameChain } from '@/components/GameProvider';
import { HAM_MAZE_ADDRESS } from '@/lib/contract';

const MazeCanvas = dynamicImport(() => import('@/components/MazeCanvas'), { ssr: false });

interface RunResult {
  timeMs: number;
  attempts: number;
  pathSvg: string;
  snapshot: string;
}

export default function GameShell() {
  const { address, networkId, connectWallet, disconnectWallet, provider } = useGameChain();
  const isConnected = !!address;

  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [lbRefresh, setLbRefresh] = useState(0);
  const [potRefresh, setPotRefresh] = useState(0);
  const [currentRank, setCurrentRank] = useState<number | null>(null);
  const [gameKey, setGameKey] = useState(0);

  const todayId = getTodaySeed();
  const [mazeId, setMazeId] = useState(todayId);
  const isToday = mazeId === todayId;

  const handlePrevDay = () => setMazeId(prev => addDaysToSeed(prev, -1));
  const handleNextDay = () => setMazeId(prev => addDaysToSeed(prev, 1));

  // Live leaderboard pulse via miniblock WS
  useMiniBlockMints(HAM_MAZE_ADDRESS, (_event) => {
    setLbRefresh((n) => n + 1);
    setPotRefresh((n) => n + 1);
  });

  const handleSuccess = useCallback((timeMs: number, pathSvg: string, snapshot: string) => {
    setRunResult({ timeMs, pathSvg, snapshot, attempts: 1 }); // hardcoded 1 for now, or get from MazeCanvas
  }, []);

  const handleMint = useCallback(async () => {
    if (!runResult || !address) return;

    try {
      // Use the generic provider to mint
      const data = await provider.mintRun({
        mazeId: mazeId,
        timeMs: runResult.timeMs,
        attempts: runResult.attempts,
        pathSvg: runResult.pathSvg,
      });
      
      await upsertRun({
        token_id: Date.now(), // This will be real token_id from indexer later
        maze_id: mazeId,
        network: networkId,
        address,
        time_ms: runResult.timeMs,
        minted_at: new Date().toISOString(),
        tx_hash: data.txId,
      });
      setLbRefresh((n) => n + 1);
      setPotRefresh((n) => n + 1);
      setRunResult(null);
    } catch (err: any) {
      alert("Mint failed: " + err.message);
      throw err;
    }
  }, [runResult, address, provider, mazeId]);

  const handlePlayAgain = useCallback(() => {
    setRunResult(null);
    setCurrentRank(null);
    setGameKey((k) => k + 1);
  }, []);

  return (
    <div className="app-shell">

      {/* Top bar */}
      <header className="topbar">
        <div className="topbar-logo" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>HAM</span>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
        }}>
          <button onClick={handlePrevDay} className="btn btn-secondary" style={{ padding: '4px 8px' }}>&lt;</button>
          <span>Maze #{mazeId}</span>
          <button onClick={handleNextDay} disabled={isToday} className="btn btn-secondary" style={{ padding: '4px 8px' }}>&gt;</button>
        </div>

        {/* Generic Connect button replacing RainbowKit */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ClaimDropdown />
          {isConnected ? (
            <button className="btn btn-secondary" onClick={disconnectWallet}>
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={connectWallet}>
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Main 3-column grid */}
      <main className="main-grid">
        <Leaderboard connectedAddress={address || undefined} refreshTrigger={lbRefresh} />

        <div className="game-center">
          <MazeCanvas 
            key={`${mazeId}-${gameKey}`} 
            mazeId={mazeId} 
            isViewOnly={!isToday} 
            onSuccess={handleSuccess} 
          />
        </div>

        <PotPanel isConnected={isConnected} refreshTrigger={potRefresh} />
      </main>

      {/* Result Card modal */}
      {runResult && (
        <ResultCard
          timeMs={runResult.timeMs}
          snapshot={runResult.snapshot}
          pathSvg={runResult.pathSvg}
          rank={currentRank}
          mazeId={mazeId}
          onMint={handleMint}
          onPlayAgain={handlePlayAgain}
          isConnected={isConnected}
        />
      )}
    </div>
  );
}
