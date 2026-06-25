'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamicImport from 'next/dynamic';
import Leaderboard from '@/components/Leaderboard';
import Navbar from '@/components/Navbar';
import ResultCard from '@/components/ResultCard';
import { getTodaySeed, addDaysToSeed } from '@/lib/maze';
import { useMiniBlockMints } from '@/lib/miniblock';
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
  const { address, networkId, provider } = useGameChain();
  const isConnected = !!address;

  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [lbRefresh, setLbRefresh] = useState(0);
  const [gameKey, setGameKey] = useState(0);

  const todayId = getTodaySeed();
  const [mazeId, setMazeId] = useState(todayId);
  const isToday = mazeId === todayId;
  const [campaign, setCampaign] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/leaderboard?mazeId=${mazeId}&network=${networkId}`)
      .then(res => res.json())
      .then(data => setCampaign(data.campaign))
      .catch(() => {});
  }, [mazeId, networkId]);

  const handlePrevDay = () => {
    setMazeId(prev => addDaysToSeed(prev, -1));
    setGameKey(k => k + 1);
  };
  const handleNextDay = () => {
    setMazeId(prev => addDaysToSeed(prev, 1));
    setGameKey(k => k + 1);
  };

  useMiniBlockMints(HAM_MAZE_ADDRESS, (_event) => {
    setLbRefresh((n) => n + 1);
  });

  const handleSuccess = useCallback((timeMs: number, pathSvg: string, snapshot: string, attempts: number = 1) => {
    setRunResult({ timeMs, pathSvg, snapshot, attempts });
  }, []);

  const handleMint = useCallback(async () => {
    if (!runResult || !address) return;

    try {
      const data = await provider.mintRun({
        mazeId: mazeId,
        timeMs: runResult.timeMs,
        attempts: runResult.attempts,
        pathSvg: runResult.pathSvg,
      });
      
      await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: Date.now(), 
          mazeId: mazeId,
          network: networkId,
          address: address,
          timeMs: runResult.timeMs,
          txHash: data.txId,
          attempts: runResult.attempts,
          pathSvg: runResult.pathSvg.slice(0, 4096),
        })
      });
      setLbRefresh((n) => n + 1);
      setRunResult(null);
    } catch (err: any) {
      alert("Mint failed: " + err.message);
      throw err;
    }
  }, [runResult, address, provider, mazeId, networkId]);

  const handlePlayAgain = useCallback(() => {
    setRunResult(null);
    setGameKey((k) => k + 1);
  }, []);

  return (
    <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', backgroundColor: '#050505' }}>
      <Navbar mazeId={mazeId} />

      <div className="date-nav" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', backgroundColor: '#0a0a0a', borderBottom: '1px solid var(--border)' }}>
        <button onClick={handlePrevDay} className="btn btn-secondary" style={{ padding: '4px 8px' }}>&lt;</button>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'white' }}>Maze #{mazeId}</span>
        <button onClick={handleNextDay} disabled={isToday} className="btn btn-secondary" style={{ padding: '4px 8px' }}>&gt;</button>
      </div>

      <main className="responsive-grid">
        {/* Left Column: Leaderboard */}
        <div className="leaderboard-col">
          <Leaderboard connectedAddress={address || undefined} refreshTrigger={lbRefresh} />
        </div>

        {/* Center Column: Game */}
        <div className="game-col">
          <MazeCanvas 
            key={`${mazeId}-${gameKey}`} 
            mazeId={mazeId} 
            isViewOnly={!isToday} 
            onSuccess={handleSuccess} 
          />
        </div>

        {/* Right Column: Info Panel */}
        <div className="info-col">
          <div className="info-section">
            <h3 className="info-title">🕹️ How to Play</h3>
            <p className="info-text">
              Move your cursor into the start zone to begin. Carefully navigate the path to the finish without touching the walls! 
              The faster you solve it, the higher your score. Extra attempts give a small penalty, so stay steady!
            </p>
          </div>

          <div className="info-section">
            <h3 className="info-title">💰 Prize Breakdown</h3>
            <p className="info-text">
              The daily Pot Size is automatically split among the Top 10 fastest players on the leaderboard.
            </p>
            <ul className="prize-list">
              <li>🥇 1st Place: 35%</li>
              <li>🥈 2nd Place: 20%</li>
              <li>🥉 3rd Place: 10%</li>
              <li>🏅 4th-10th Place: 5% each</li>
            </ul>
          </div>

          <div style={{ flex: 1 }} />

          {campaign ? (
            <div className="info-section booster-card">
              <h3 className="info-title" style={{ color: 'var(--accent)' }}>🚀 Active Booster</h3>
              <p className="info-text" style={{ marginBottom: 10 }}>
                Hold the <strong>{campaign.contract_address.split('.')[1] || 'Token'}</strong> NFT in your wallet to get a <strong>+{campaign.multiplier}%</strong> score boost!
              </p>
              {campaign.image_url && (
                <div style={{ width: '100%', height: 180, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={campaign.image_url} alt="Booster NFT" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
            </div>
          ) : (
            <div className="info-section" style={{ opacity: 0.5 }}>
              <h3 className="info-title">🚀 Daily Booster</h3>
              <p className="info-text" style={{ marginBottom: 10 }}>
                No active NFT booster for today's maze. 
              </p>
              <div style={{ width: '100%', height: 180, borderRadius: 8, background: '#222', border: '1px dashed var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                [Sponsor Image Placeholder]
              </div>
            </div>
          )}
        </div>
      </main>

      {runResult && (
        <ResultCard
          timeMs={runResult.timeMs}
          snapshot={runResult.snapshot}
          pathSvg={runResult.pathSvg}
          rank={null}
          mazeId={mazeId}
          onMint={handleMint}
          onPlayAgain={handlePlayAgain}
          isConnected={isConnected}
        />
      )}

      <style jsx>{`
        .responsive-grid {
          display: flex;
          flex: 1;
          overflow: hidden;
        }
        .leaderboard-col {
          width: 320px;
          border-right: 1px solid var(--border);
          overflow-y: auto;
          background: #0a0a0a;
        }
        .game-col {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          overflow: hidden;
          background: #000;
        }
        .info-col {
          width: 300px;
          border-left: 1px solid var(--border);
          overflow-y: auto;
          background: #0a0a0a;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .info-section {
          background: #111;
          border: 1px solid var(--border);
          padding: 16px;
          border-radius: 6px;
        }
        .info-title {
          font-family: var(--font-mono);
          font-size: 14px;
          margin: 0 0 10px 0;
          color: white;
          text-transform: uppercase;
        }
        .info-text {
          font-family: var(--font-mono);
          font-size: 11px;
          line-height: 1.5;
          color: var(--text-muted);
          margin: 0;
        }
        .prize-list {
          list-style: none;
          padding: 0;
          margin: 10px 0 0 0;
          font-family: var(--font-mono);
          font-size: 11px;
          color: white;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .booster-card {
          border-color: var(--accent);
          background: rgba(var(--accent-rgb), 0.05);
        }

        @media (max-width: 1000px) {
          .info-col {
            display: none; /* Hide info on medium screens */
          }
        }
        @media (max-width: 800px) {
          .responsive-grid {
            flex-direction: column-reverse;
            overflow-y: auto;
          }
          .leaderboard-col {
            width: 100%;
            border-right: none;
            border-top: 1px solid var(--border);
            height: auto;
          }
          .game-col {
            flex: none;
            height: 60vh;
            padding: 10px;
          }
          .info-col {
            display: flex; /* Show at bottom on mobile */
            width: 100%;
            border-left: none;
            border-top: 1px solid var(--border);
            height: auto;
          }
        }
      `}</style>
    </div>
  );
}
