'use client';

import { useEffect, useState } from 'react';
import { getTodaySeed } from '@/lib/maze';
import { useGameChain } from '@/components/GameProvider';

interface LeaderboardProps {
  mazeId: number;
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

export default function Leaderboard({ mazeId, connectedAddress, refreshTrigger = 0 }: LeaderboardProps) {
  const [runs, setRuns] = useState<any[]>([]);
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pulsing, setPulsing] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const totalWinners = 10;
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
      const { network: stacksNet } = await import('@/lib/blockchain/stacks-provider');
      const { winners, signature } = settlePreview;

      await openContractCall({
        network: stacksNet,
        contractAddress: "ST1K96254R3KP5TRT5N2X64FB12VMHX6MYT2VB8B1",
        contractName: "ham-maze-v4",
        functionName: "settle-maze",
        functionArgs: [
          uintCV(mazeId),
          listCV(winners.slice(0, 10).map((w: string) => principalCV(w.toUpperCase()))),
          bufferCV(new Uint8Array(signature.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16))))
        ],
        postConditionMode: 1, // Allow contract to transfer STX to winners
        onFinish: (d) => {
          const chainQuery = networkId.includes('testnet') ? 'testnet' : 'mainnet';
          setSettlingStatus(
            <span>
              Settlement Broadcasted! Tx: <a href={`https://explorer.hiro.so/txid/${d.txId}?chain=${chainQuery}`} target="_blank" rel="noreferrer" style={{ color: 'var(--goal)', textDecoration: 'underline', wordBreak: 'break-all' }}>{d.txId.slice(0, 8)}...{d.txId.slice(-6)}</a>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1 }}>
      <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="live-dot" style={{ opacity: pulsing ? 1 : 0.4 }} />
          Leaderboard 🏆
        </div>
        {campaign && (
          <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
            +{campaign.multiplier}% Boost
          </div>
        )}
      </div>

      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '24px minmax(0,1fr) 40px 60px 16px',
          gap: 8,
          fontSize: 10,
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          padding: '6px 10px 10px',
          borderBottom: '1px solid var(--border)',
          marginBottom: 4,
        }}
      >
        <span>#</span>
        <span>Player</span>
        <span style={{ textAlign: 'right' }}>Time</span>
        <span style={{ textAlign: 'right' }}>Score</span>
        <span></span>
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
                gridTemplateColumns: '24px minmax(0,1fr) 40px 60px 16px',
                gap: 8,
                opacity: inPrizes ? 1 : 0.5,
                cursor: 'pointer',
              }}
              onClick={() => setExpandedRow(isExpanded ? null : run.address)}
            >
              <span className={`lb-rank ${rankClass(rank)}`}>{rankEmoji(rank)}</span>
              <span className="lb-addr" title={run.address}>
                {isMe ? '👤 You' : (run.username || shortenAddr(run.address))}
                {run.hasBooster && <span style={{ color: 'var(--accent)', marginLeft: 4 }}>🚀</span>}
              </span>
              <span className="lb-time" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatTime(run.time_ms)}</span>
              <span className="lb-time" style={{ textAlign: 'right', fontWeight: 700 }}>{run.score.toLocaleString()}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {run.history && run.history.length > 1 ? (isExpanded ? '▼' : '▶') : ''}
              </span>
            </div>

            {/* Expanded History */}
            {isExpanded && run.history && run.history.length > 0 && (
              <div style={{ padding: '8px 10px 8px 40px', backgroundColor: 'rgba(0,0,0,0.2)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>All Mints:</div>
                {run.history.sort((a: any, b: any) => a.token_id - b.token_id).map((hist: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.6, marginBottom: 2 }}>
                    <span>Mint {i + 1} {hist.attempts > 1 ? `(${hist.attempts} tries)` : ''}</span>
                    <span style={{ display: 'flex', gap: 10 }}>
                      <span>{hist.score.toLocaleString()} pts</span>
                      <span>{formatTime(hist.time_ms)}</span>
                    </span>
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
      {mazeId < getTodaySeed() && !isSettled && runs.length > 0 && (
        <div style={{ marginTop: 20, padding: 16, borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            This maze has ended but the prize pot is not yet distributed. Anyone can trigger the settlement!
          </div>

          {!settlePreview ? (
            <button onClick={handleFetchSettle} className="btn btn-secondary" style={{ padding: 10, border: '1px solid var(--goal)', color: 'var(--goal)' }}>
              ⚡ Settle Pot
            </button>
          ) : (
            <div style={{ background: '#111', padding: 16, borderRadius: 8, border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
                Previewing Top 10 Winners
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, maxHeight: 160, overflowY: 'auto', paddingRight: 4 }}>
                {settlePreview.winners.slice(0, 10).map((w, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#ddd', background: '#000', padding: '8px 12px', borderRadius: 6, border: '1px solid #222' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 'bold' }}>#{i + 1}</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{w.slice(0, 8)}...{w.slice(-6)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={handleExecuteSettle} className="btn btn-primary" style={{ width: '100%', padding: '10px 0' }}>
                  🚀 Sign & Broadcast
                </button>
                <button onClick={() => setSettlePreview(null)} className="btn btn-secondary" style={{ width: '100%', padding: '10px 0' }}>
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
