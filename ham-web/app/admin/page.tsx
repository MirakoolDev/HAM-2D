'use client';

import { useState } from 'react';
import { useGameChain } from '@/components/GameProvider';
import { getTodaySeed } from '@/lib/maze';
import { openSignatureRequestPopup } from '@stacks/connect';
import { network, CONTRACT_ADDRESS, CONTRACT_NAME } from '@/lib/blockchain/stacks-provider';

export default function AdminPage() {
  const { address, networkId, provider } = useGameChain();
  const [mazeId, setMazeId] = useState(getTodaySeed());
  const [contractAddr, setContractAddr] = useState('');
  const [multiplier, setMultiplier] = useState(10);
  const [imageUrl, setImageUrl] = useState('');
  const [mintFeeStx, setMintFeeStx] = useState(1);
  const [status, setStatus] = useState<React.ReactNode>('');
  const [settlementPreview, setSettlementPreview] = useState<{ v3: boolean, mazeId: number, winners: string[], signature?: string } | null>(null);

  // Protect route loosely (Contract owner should be the only one checking this)
  const adminWallet = process.env.NEXT_PUBLIC_ADMIN_WALLET || "ST1K96254R3KP5TRT5N2X64FB12VMHX6MYT2VB8B1";
  const IS_OWNER = address === adminWallet; 

  const handleSaveCampaign = async () => {
    setStatus("Requesting wallet signature...");
    try {
      await openSignatureRequestPopup({
        message: `Authorize Settle/Campaign update for HAM Maze`,
        network,
        appDetails: { name: 'HAM Admin', icon: window.location.origin + '/favicon.ico' },
        onFinish: async ({ signature, publicKey }) => {
          setStatus("Saving campaign...");
          const res = await fetch('/api/admin/campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mazeId,
              network: networkId,
              contractAddress: contractAddr,
              multiplier,
              imageUrl,
              signature,
              publicKey
            })
          });
          const data = await res.json();
          if (data.ok) setStatus("Campaign saved successfully! ✅");
          else setStatus("Error: " + data.error);
        },
        onCancel: () => {
          setStatus("Signature request cancelled.");
        }
      });
    } catch (err: any) {
      setStatus("Error: " + err.message);
    }
  };

  const handleFetchWinners = async (isV3: boolean) => {
    if (!address) return alert("Connect wallet");
    setStatus("Fetching winners from database...");
    setSettlementPreview(null);
    try {
      const res = await fetch('/api/sign-settlement', { method: 'POST', body: JSON.stringify({ mazeId, network: networkId }) });
      const data = await res.json();
      if (!data.winners) throw new Error(data.error || "Failed to fetch winners");
      setSettlementPreview({ v3: isV3, mazeId, winners: data.winners, signature: data.signature });
      setStatus("");
    } catch (err: any) {
      setStatus("Error: " + err.message);
    }
  };

  const executeSettle = async () => {
    if (!settlementPreview) return;
    setStatus("Please sign the transaction in your wallet...");
    try {
      const { openContractCall } = await import('@stacks/connect');
      const { uintCV, listCV, principalCV, bufferCV } = await import('@stacks/transactions');
      const { v3, mazeId: sMazeId, winners, signature } = settlementPreview;

      const functionArgs = v3 ? [
        uintCV(sMazeId),
        listCV(winners.slice(0, 10).map((w: string) => principalCV(w.toUpperCase()))),
        bufferCV(new Uint8Array(signature!.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16))))
      ] : [
        uintCV(sMazeId),
        listCV(winners.slice(0, 10).map((w: string) => principalCV(w.toUpperCase())))
      ];

      await openContractCall({
        network,
        contractAddress: CONTRACT_ADDRESS,
        contractName: v3 ? CONTRACT_NAME : "ham-maze-v2",
        functionName: "settle-maze",
        functionArgs,
        onFinish: (d) => {
          const chainQuery = networkId.includes('testnet') ? 'testnet' : 'mainnet';
          setStatus(
            <span>
              Settlement Broadcasted! Tx: <a href={`https://explorer.hiro.so/txid/${d.txId}?chain=${chainQuery}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>{d.txId}</a>
            </span>
          );
          setSettlementPreview(null);
        }
      });
    } catch (e: any) {
      setStatus("Error: " + e.message);
    }
  };

  return (
    <div style={{ padding: '40px 20px', fontFamily: 'var(--font-mono)', color: 'white', maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>HAM Admin Control Panel</h1>
      
      {!address ? (
        <div style={{ padding: 20, background: 'rgba(255,0,0,0.1)', border: '1px solid #ff4444', borderRadius: 8, color: '#ff4444' }}>
          Please connect your wallet to access admin features.
        </div>
      ) : !IS_OWNER ? (
        <div style={{ padding: 20, background: 'rgba(255,165,0,0.1)', border: '1px solid orange', borderRadius: 8, color: 'orange' }}>
          Warning: The connected wallet ({address.slice(0,6)}...{address.slice(-4)}) is not the contract owner.
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 30, marginTop: 40 }}>
        
        {/* Campaign Settings Card */}
        <div style={{ padding: 24, border: '1px solid var(--border)', background: '#111', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
          <h3 style={{ marginTop: 0, color: 'var(--goal)', textTransform: 'uppercase' }}>Daily Booster Campaign</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20 }}>
            Configure an NFT or Token that grants players a score multiplier for a specific maze day.
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#ccc' }}>
              Maze ID (Date YYYYMMDD)
              <input type="number" value={mazeId} onChange={e => setMazeId(parseInt(e.target.value))} style={{ padding: '10px 12px', background: '#000', color: 'white', border: '1px solid #333', borderRadius: 6, fontFamily: 'var(--font-mono)' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#ccc' }}>
              Booster Contract Address
              <input type="text" placeholder="ST123...456.my-nft" value={contractAddr} onChange={e => setContractAddr(e.target.value)} style={{ padding: '10px 12px', background: '#000', color: 'white', border: '1px solid #333', borderRadius: 6, fontFamily: 'var(--font-mono)' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#ccc' }}>
              Score Multiplier (%)
              <input type="number" value={multiplier} onChange={e => setMultiplier(parseInt(e.target.value))} style={{ padding: '10px 12px', background: '#000', color: 'white', border: '1px solid #333', borderRadius: 6, fontFamily: 'var(--font-mono)' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#ccc' }}>
              Image URL (Optional display image)
              <input type="text" placeholder="https://..." value={imageUrl} onChange={e => setImageUrl(e.target.value)} style={{ padding: '10px 12px', background: '#000', color: 'white', border: '1px solid #333', borderRadius: 6, fontFamily: 'var(--font-mono)' }} />
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button onClick={handleSaveCampaign} className="btn btn-primary" style={{ flex: 1, padding: 12 }}>
                💾 Save Database
              </button>
              <button onClick={async () => {
                if (!address) return alert("Connect wallet");
                if (!contractAddr) return alert("Please enter a valid Stacks principal contract address");
                try {
                  const { openContractCall } = await import('@stacks/connect');
                  const { uintCV, principalCV } = await import('@stacks/transactions');
                  await openContractCall({
                    network,
                    contractAddress: CONTRACT_ADDRESS,
                    contractName: CONTRACT_NAME,
                    functionName: "set-daily-booster",
                    functionArgs: [
                      uintCV(mazeId),
                      principalCV(contractAddr.toUpperCase()),
                      uintCV(multiplier)
                    ],
                    onFinish: (d) => {
                      const chainQuery = networkId.includes('testnet') ? 'testnet' : 'mainnet';
                      setStatus(
                        <span>
                          Booster Committed! Tx: <a href={`https://explorer.hiro.so/txid/${d.txId}?chain=${chainQuery}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>{d.txId}</a>
                        </span>
                      );
                    }
                  });
                } catch (e: any) { setStatus("Error: " + e.message); }
              }} className="btn btn-secondary" style={{ flex: 1, padding: 12, border: '1px solid var(--accent)', color: 'var(--accent)' }}>
                🔗 Commit On-Chain
              </button>
            </div>
          </div>
        </div>

        {/* Mint Fee Settings Card */}
        <div style={{ padding: 24, border: '1px solid var(--border)', background: '#111', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginTop: 0, color: 'var(--goal)', textTransform: 'uppercase' }}>Contract Settings</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20 }}>
            Adjust the global cost to mint a new run on the v3 smart contract. This fee is immediately added to the daily prize pool.
          </p>
          
          <div style={{ flex: 1 }} />
          
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#ccc', marginBottom: 16 }}>
            Mint Fee (STX)
            <input type="number" step="0.1" value={mintFeeStx} onChange={e => setMintFeeStx(parseFloat(e.target.value))} style={{ padding: '10px 12px', background: '#000', color: 'white', border: '1px solid #333', borderRadius: 6, fontFamily: 'var(--font-mono)' }} />
          </label>
          
          <button onClick={async () => {
            if (!address) return alert("Connect wallet");
            try {
              const { openContractCall } = await import('@stacks/connect');
              const { uintCV } = await import('@stacks/transactions');
              const feeMicroStx = Math.floor(mintFeeStx * 1000000);
              await openContractCall({
                network,
                contractAddress: CONTRACT_ADDRESS,
                contractName: CONTRACT_NAME,
                functionName: "set-mint-fee",
                functionArgs: [uintCV(feeMicroStx)],
                onFinish: (d) => {
                  const chainQuery = networkId.includes('testnet') ? 'testnet' : 'mainnet';
                  setStatus(
                    <span>
                      Fee Updated! Tx: <a href={`https://explorer.hiro.so/txid/${d.txId}?chain=${chainQuery}`} target="_blank" rel="noreferrer" style={{ color: 'var(--goal)', textDecoration: 'underline' }}>{d.txId}</a>
                    </span>
                  );
                }
              });
            } catch (e: any) { setStatus("Error: " + e.message); }
          }} className="btn btn-secondary" style={{ padding: 12, border: '1px solid var(--goal)', color: 'var(--goal)' }}>
            ⚙️ Update Mint Fee
          </button>
        </div>

        {/* Settlement Card */}
        <div style={{ padding: 24, border: '1px solid var(--border)', background: '#111', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginTop: 0, color: 'var(--goal)', textTransform: 'uppercase' }}>Force Settlement</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20 }}>
            Manually trigger the settlement for a past maze if no community member has clicked the settle button yet. This will generate the backend ECDSA signature and broadcast the transaction.
          </p>
          
          <div style={{ flex: 1 }} />
          
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#ccc', marginBottom: 16 }}>
            Maze ID to Settle
            <input type="number" value={mazeId} onChange={e => setMazeId(parseInt(e.target.value))} style={{ padding: '10px 12px', background: '#000', color: 'white', border: '1px solid #333', borderRadius: 6, fontFamily: 'var(--font-mono)' }} />
          </label>
          
          {!settlementPreview ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => handleFetchWinners(true)} className="btn btn-secondary" style={{ flex: 1, padding: 12, border: '1px solid var(--goal)', color: 'var(--goal)' }}>
                ⚡ Fetch Winners (v3)
              </button>

              <button onClick={() => handleFetchWinners(false)} className="btn btn-secondary" style={{ flex: 1, padding: 12, border: '1px solid orange', color: 'orange' }}>
                🔧 Fetch Legacy (v2)
              </button>
            </div>
          ) : (
            <div style={{ background: 'rgba(0,0,0,0.5)', padding: 16, borderRadius: 8, border: '1px solid #444' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                Previewing Top 10 for Maze {settlementPreview.mazeId} ({settlementPreview.v3 ? 'v3' : 'v2'})
              </div>
              <ul style={{ margin: 0, padding: '0 0 0 20px', fontSize: 12, color: '#ccc', marginBottom: 16 }}>
                {settlementPreview.winners.slice(0, 10).map((w, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{w.slice(0, 8)}...{w.slice(-6)}</li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={executeSettle} className="btn btn-primary" style={{ flex: 1, padding: 10 }}>
                  🚀 Sign & Broadcast
                </button>
                <button onClick={() => setSettlementPreview(null)} className="btn btn-secondary" style={{ padding: 10 }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {status && (
        <div style={{ marginTop: 30, padding: 16, background: '#1a1a1a', borderLeft: '4px solid var(--accent)', color: 'white', fontFamily: 'var(--font-mono)', fontSize: 14 }}>
          {status}
        </div>
      )}
    </div>
  );
}
