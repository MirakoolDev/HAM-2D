'use client';

import { useEffect, useState } from 'react';
import { getTodaySeed } from '@/lib/maze';
import { useGameChain } from '@/components/GameProvider';

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

const PODIUM_SHARE = [35, 20, 10]; // % of prize pool for 1st/2nd/3rd
const TAIL_TOTAL = 35;             // % split equally among 4th–10th (5% each)

function prizeShare(rank: number, totalWinners: number): string {
  if (rank === 1) return `${PODIUM_SHARE[0]}%`;
  if (rank === 2) return `${PODIUM_SHARE[1]}%`;
  if (rank === 3) return `${PODIUM_SHARE[2]}%`;
  if (rank <= totalWinners) {
    const tailN = Math.max(totalWinners - 3, 1);
    return `${(TAIL_TOTAL / tailN).toFixed(0)}%`;
  }
  return '—';
}

export default function Leaderboard({ connectedAddress, refreshTrigger = 0 }: LeaderboardProps) {
  const [runs, setRuns] = useState<any[]>([]);
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pulsing, setPulsing] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const totalWinners = 10;
  const mazeId = getTodaySeed();
  const { networkId, provider } = useGameChain();

  const [isSettled, setIsSettled] = useState(true);
  const [settlePreview, setSettlePreview] = useState<{ winners: string[], signature: string } | null>(null);
  const [settlingStatus, setSettlingStatus] = useState<React.ReactNode>('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    
    // Check if settled on-chain
    provider.isMazeSettled(mazeId).then(settled => {
      if (!cancelled) setIsSettled(settled);
    });

    fetch(`/api/leaderboard?mazeId=${mazeId}&network=${networkId}`)
      .then(res => res.json())
      .then((data) => {
        if (!cancelled) {
          setRuns(data.leaderboard || []);
          setCampaign(data.campaign);
          setLoading(false);
          if (refreshTrigger > 0) {
            setPulsing(true);
            setTimeout(() => setPulsing(false), 1200);
          }
        }
      })
      .catch(err => {
        console.error(err);
        if (!cancelled) setLoading(false);
      });
      
    return () => { cancelled = true; };
  }, [mazeId, refreshTrigger, networkId, provider]);

  const handleFetchSettle = async () => {
    if (!connectedAddress) return alert("Please connect your wallet to settle.");
    setSettlingStatus("Fetching winners...");
    setSettlePreview(null);
    try {
      const res = await fetch('/api/sign-settlement', { method: 'POST', body: JSON.stringify({ mazeId, network: networkId }) });
      const data = await res.json();
      if (!data.winners) throw new Error(data.error || "Failed to fetch winners");
      setSettlePreview({ winners: data.winners, signature: data.signature });
      setSettlingStatus("");
    } catch (err: any) {
      setSettlingStatus("Error: " + err.message);
    }
  };

  const handleExecuteSettle = async () => {
    if (!settlePreview) return;
    setSettlingStatus("Please sign the transaction in your wallet...");
    try {
      const { openContractCall } = await import('@stacks/connect');
      const { uintCV, listCV, principalCV, bufferCV } = await import('@stacks/transactions');
      const { network: stacksNet, CONTRACT_ADDRESS, CONTRACT_NAME } = await import('@/lib/blockchain/stacks-provider');
      const { winners, signature } = settlePreview;

      await openContractCall({
        network: stacksNet,
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: "settle-maze",
        functionArgs: [
          uintCV(mazeId),
          listCV(winners.slice(0, 10).map((w: string) => principalCV(w.toUpperCase()))),
          bufferCV(new Uint8Array(signature.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16))))
        ],
        onFinish: (d) => {
          const chainQuery = networkId.includes('testnet') ? 'testnet' : 'mainnet';
          setSettlingStatus(
            <span>
              Settlement Broadcasted! Tx: <a href={`https://explorer.hiro.so/txid/${d.txId}?chain=${chainQuery}`} target="_blank" rel="noreferrer" style={{ color: 'var(--goal)', textDecoration: 'underline' }}>{d.txId}</a>
            </span>
          );
          setSettlePreview(null);
          setIsSettled(true);
        }
      });
    } catch (e: any) {
      setSettlingStatus("Error: " + e.message);
    }
  };

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
      <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className="live-dot" style={{ opacity: pulsing ? 1 : 0.4 }} />
          Leaderboard 🏆
        </div>
        {campaign && (
          <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
            Booster Active: +{campaign.multiplier}%
          </div>
        )}
      </div>

      {/* Header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '32px 1fr auto auto auto',
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
        <span>Score</span>
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
        const isExpanded = expandedRow === run.address;
        
        return (
          <div key={run.address} style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              className={`lb-row${isMe ? ' me' : ''}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 1fr auto auto auto',
                gap: 8,
                opacity: inPrizes ? 1 : 0.55,
                cursor: 'pointer'
              }}
              onClick={() => setExpandedRow(isExpanded ? null : run.address)}
            >
              <span className={`lb-rank ${rankClass(rank)}`}>{rankEmoji(rank)}</span>
              <span className="lb-addr" title={run.address}>
                {isMe ? '👤 You' : shortenAddr(run.address)}
                {run.hasBooster && <span style={{color: 'var(--accent)', marginLeft: 4}}>🚀</span>}
              </span>
              <span className="lb-time" style={{ fontWeight: 'bold' }}>{run.score.toLocaleString()}</span>
              <span className="lb-time" style={{ color: 'var(--text-muted)' }}>{formatTime(run.time_ms)}</span>
              <span
                className="lb-time"
                style={{ color: inPrizes ? 'var(--goal)' : 'var(--text-muted)', fontSize: 10 }}
              >
                {prizeShare(rank, totalWinners)}
              </span>
            </div>
            
            {/* Expanded History */}
            {isExpanded && run.history && run.history.length > 1 && (
              <div style={{ padding: '8px 10px 8px 40px', backgroundColor: 'rgba(0,0,0,0.2)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Previous Attempts:</div>
                {run.history.sort((a: any, b: any) => a.attempts - b.attempts).map((hist: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.6, marginBottom: 2 }}>
                    <span>Attempt {hist.attempts}</span>
                    <span>{formatTime(hist.time_ms)}</span>
                  </div>
                ))}
              </div>
            )}
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

      {/* Public Settlement UI */}
      {!isSettled && runs.length > 0 && (
        <div style={{ marginTop: 20, padding: 16, borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            This maze has ended but the prize pot is not yet distributed. Anyone can trigger the settlement!
          </div>
          
          {!settlePreview ? (
            <button onClick={handleFetchSettle} className="btn btn-secondary" style={{ padding: 10, border: '1px solid var(--goal)', color: 'var(--goal)' }}>
              ⚡ Settle Pot
            </button>
          ) : (
            <div style={{ background: '#000', padding: 12, borderRadius: 6, border: '1px solid #333' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                Previewing Top 10 Winners
              </div>
              <ul style={{ margin: 0, padding: '0 0 0 20px', fontSize: 10, color: '#ccc', marginBottom: 12 }}>
                {settlePreview.winners.slice(0, 10).map((w, i) => (
                  <li key={i} style={{ marginBottom: 2 }}>{w.slice(0, 8)}...{w.slice(-6)}</li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleExecuteSettle} className="btn btn-primary" style={{ flex: 1, padding: 8, fontSize: 12 }}>
                  🚀 Sign & Broadcast
                </button>
                <button onClick={() => setSettlePreview(null)} className="btn btn-secondary" style={{ padding: 8, fontSize: 12 }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {settlingStatus && (
            <div style={{ fontSize: 12, color: 'var(--accent)', textAlign: 'center', marginTop: 8 }}>
              {settlingStatus}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
