'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamicImport from 'next/dynamic';
import Leaderboard from '@/components/Leaderboard';
import Navbar from '@/components/Navbar';
import ResultCard from '@/components/ResultCard';
import { getTodaySeed, addDaysToSeed } from '@/lib/maze';
import { useGameChain } from '@/components/GameProvider';
import { Globe, Send, Rocket, Gamepad2, Coins } from 'lucide-react';
import Image from 'next/image';

const MazeCanvas = dynamicImport(() => import('@/components/MazeCanvas'), { ssr: false });

interface RunResult {
  timeMs: number;
  attempts: number;
  pathSvg: string;
  snapshot: string;
}

function MazeSelector({ mazeId, onChange }: { mazeId: number; onChange: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const todayId = getTodaySeed();
  const ref = useRef<HTMLDivElement>(null);

  // Build last 7 days of maze options
  const options: number[] = [];
  for (let i = 0; i < 7; i++) {
    options.push(addDaysToSeed(todayId, -i));
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function formatMazeLabel(id: number) {
    const str = String(id);
    const y = str.slice(0, 4), m = str.slice(4, 6), d = str.slice(6, 8);
    const date = new Date(`${y}-${m}-${d}`);
    const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return id === todayId ? `Today — ${label}` : label;
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'transparent',
          border: '1px solid var(--text-muted)',
          color: 'var(--text)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          padding: '6px 12px',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          whiteSpace: 'nowrap',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--text)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--text-muted)')}
      >
        Maze #{mazeId}
        <span style={{ fontSize: 10, opacity: 0.6 }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          zIndex: 200,
          minWidth: 180,
          boxShadow: 'var(--shadow-lg)',
        }}>
          {options.map((id) => (
            <button
              key={id}
              onClick={() => { onChange(id); setOpen(false); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 16px',
                background: id === mazeId ? 'var(--bg-dark)' : 'transparent',
                color: id === mazeId ? 'var(--text)' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                border: 'none',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-dark)')}
              onMouseLeave={e => (e.currentTarget.style.background = id === mazeId ? 'var(--bg-dark)' : 'transparent')}
            >
              {formatMazeLabel(id)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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

  const handleMazeChange = (id: number) => {
    setMazeId(id);
    setGameKey(k => k + 1);
  };

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
          pathSvg: runResult.pathSvg,
        })
      });
      setLbRefresh((n) => n + 1);
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
    <div className="app-shell">
      <Navbar mazeId={mazeId} />

      {/* Maze selector sub-bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 20px',
        height: 44,
        background: 'var(--bg-dark)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <MazeSelector mazeId={mazeId} onChange={handleMazeChange} />
        {!isToday && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
            VIEW ONLY — past maze
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <a href="https://miracleotugo.art/" target="_blank" rel="noreferrer" title="Website" className="sq-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', textDecoration: 'none' }}>
            <Globe size={16} />
          </a>
          <a href="https://x.com/MiracleOtugo" target="_blank" rel="noreferrer" title="Twitter (X)" className="sq-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', textDecoration: 'none' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>
          <a href="https://t.me/playHAM3d" target="_blank" rel="noreferrer" title="Telegram" className="sq-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', textDecoration: 'none' }}>
            <Send size={16} />
          </a>
        </div>
      </div>

      <main className="main-grid" style={{ flex: 1, minHeight: 0 }}>
        {/* ── LEFT: Leaderboard ── */}
        <div className="panel">
          <Leaderboard mazeId={mazeId} connectedAddress={address || undefined} refreshTrigger={lbRefresh} />
        </div>

        {/* ── CENTER: Game Canvas ── */}
        <div className="game-center">
          <MazeCanvas 
            key={`${mazeId}-${gameKey}`} 
            mazeId={mazeId} 
            isViewOnly={!isToday} 
            onSuccess={handleSuccess} 
          />
        </div>

        {/* ── RIGHT: Info Panel ── */}
        <div className="panel right-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* How to Play */}
          <div>
            <div className="panel-title" style={{ display: 'flex', alignItems: 'center' }}>
              <Gamepad2 size={18} style={{ marginRight: 8, color: 'var(--text-muted)' }} /> How to Play
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, margin: 0 }}>
              Move your cursor over the <strong style={{ color: 'var(--text)' }}>start arrow (↓)</strong> to begin. Navigate the path to the <strong style={{ color: 'var(--text)' }}>home icon</strong> without touching the walls.
              The faster you solve it, the higher your score. Extra attempts incur a small penalty.
            </p>
          </div>

          <div style={{ height: '1px', background: 'var(--border)' }} />

          {/* Prize Breakdown */}
          <div>
            <div className="panel-title" style={{ display: 'flex', alignItems: 'center' }}>
              <Coins size={18} style={{ marginRight: 8, color: 'var(--text-muted)' }} /> Prize Breakdown
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
              Top 10 fastest players split the daily pot:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { label: '1st Place', pct: '35%', color: 'var(--gold)' },
                { label: '2nd Place', pct: '20%', color: 'var(--silver)' },
                { label: '3rd Place', pct: '10%', color: 'var(--bronze)' },
                { label: '4th – 10th', pct: '5% each', color: 'var(--text-muted)' },
              ].map(({ label, pct, color }) => (
                <div key={label} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{pct}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Active Booster */}
          {campaign && (
            <>
              <div style={{ height: '1px', background: 'var(--border)' }} />
              <div>
                <div className="panel-title" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
                  <Rocket size={18} style={{ marginRight: 8 }} /> Active Booster
                </div>
                {campaign.image_url && (
                  <div style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    border: '1px solid var(--border)',
                    marginBottom: 12,
                    background: '#111',
                  }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={campaign.image_url}
                      alt="Booster NFT"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </div>
                )}
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.5 }}>
                  {campaign.description || `Hold the NFT to get a score boost.`}
                </p>
                <div style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--accent)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  +{campaign.multiplier}% Score Boost
                </div>
              </div>
            </>
          )}

          <div style={{ flex: 1 }} />
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
    </div>
  );
}
