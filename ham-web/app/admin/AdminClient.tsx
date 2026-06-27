'use client';

import { useState } from 'react';
import { useGameChain } from '@/components/GameProvider';
import { network, userSession } from '@/lib/blockchain/stacks-provider';
import { getTodaySeed } from '@/lib/maze';
import { STACKS_TESTNET, STACKS_MAINNET } from '@stacks/network';
import { uintCV, listCV, principalCV, bufferCV, fetchCallReadOnlyFunction, cvToJSON } from '@stacks/transactions';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Pre-load @stacks/connect to avoid losing user-gesture token during dynamic import
let stacksConnectAPI: any = null;
if (typeof window !== 'undefined') {
  import('@stacks/connect').then(api => {
    stacksConnectAPI = api;
  });
}

export default function AdminPage() {
  const router = useRouter();
  const { address, networkId, provider, connectWallet } = useGameChain();
  const [mazeId, setMazeId] = useState(getTodaySeed());
  const [contractAddr, setContractAddr] = useState('');
  const [multiplier, setMultiplier] = useState(10);
  const [imageUrl, setImageUrl] = useState('');
  const [mintFeeStx, setMintFeeStx] = useState(1);
  const [sponsorAmount, setSponsorAmount] = useState(10);
  const [sponsorMazeId, setSponsorMazeId] = useState(getTodaySeed() + 1);
  const [status, setStatus] = useState<React.ReactNode>('');
  const [contractBalance, setContractBalance] = useState<number | null>(null);
  const [settlementPreview, setSettlementPreview] = useState<{ mazeId: number, winners: string[], signature?: string, version?: string } | null>(null);

  useEffect(() => {
    const deployer = process.env.NEXT_PUBLIC_STACKS_CONTRACT_ADDRESS || "SP1K96254R3KP5TRT5N2X64FB12VMHX6MYS0BQGYQ";
    
    fetchCallReadOnlyFunction({
      network,
      contractAddress: deployer,
      contractName: process.env.NEXT_PUBLIC_STACKS_CONTRACT_NAME || "ham-maze-v4",
      functionName: "get-protocol-fee-balance",
      functionArgs: [],
      senderAddress: deployer
    })
    .then(cv => {
      const json = cvToJSON(cv);
      if (json && json.value !== undefined) setContractBalance(parseInt(json.value) / 1000000);
    })
    .catch(console.error);
  }, [networkId]);

  // Protect route loosely (Contract owner should be the only one checking this)
  const adminAddress = process.env.NEXT_PUBLIC_ADMIN_WALLET || "ST1K96254R3KP5TRT5N2X64FB12VMHX6MYT2VB8B1";
  const IS_OWNER = address === adminAddress;

  const handleSaveCampaign = async () => {
    setStatus("Requesting wallet signature...");
    try {
      if (!stacksConnectAPI) throw new Error("Wallet API not loaded yet. Please try again.");
      await stacksConnectAPI.openSignatureRequestPopup({
        message: `Authorize Settle/Campaign update for HAM Maze`,
        userSession,
        onFinish: async ({ signature, publicKey }: { signature: string; publicKey: string }) => {
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

  const handleFetchWinners = async () => {
    if (!address) return alert("Connect wallet");
    setStatus("Fetching winners from database...");
    setSettlementPreview(null);
    try {
      const res = await fetch('/api/sign-settlement', { method: 'POST', body: JSON.stringify({ mazeId, network: networkId }) });
      const data = await res.json();
      if (!data.winners) throw new Error(data.error || "Failed to fetch winners");
      setSettlementPreview({ mazeId, winners: data.winners, signature: data.signature });
      setStatus("");
    } catch (err: any) {
      setStatus("Error: " + err.message);
    }
  };

  const executeSettle = async () => {
    if (!settlementPreview) return;
    setStatus("Please sign the transaction in your wallet...");
    try {
      const { mazeId: sMazeId, winners, signature } = settlementPreview;

      if (!signature) throw new Error("Signature missing");

      const functionArgs = [
        uintCV(sMazeId),
        listCV(winners.slice(0, 10).map((w: string) => principalCV(w.toUpperCase()))),
        bufferCV(new Uint8Array(signature.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16))))
      ];

      if (!stacksConnectAPI) throw new Error("Wallet API not loaded yet. Please try again.");
      await stacksConnectAPI.openContractCall({
        network,
        contractAddress: process.env.NEXT_PUBLIC_STACKS_CONTRACT_ADDRESS || "SP1K96254R3KP5TRT5N2X64FB12VMHX6MYS0BQGYQ",
        contractName: process.env.NEXT_PUBLIC_STACKS_CONTRACT_NAME || "ham-maze-v4",
        functionName: "settle-maze",
        functionArgs,
        postConditionMode: 1, // Allow contract to transfer STX
        userSession,
        onFinish: (d: any) => {
          const chainQuery = networkId.includes('testnet') ? 'testnet' : 'mainnet';
          setStatus(
            <span>
              Settlement Broadcasted! Tx: <a href={`https://explorer.hiro.so/txid/${d.txId}?chain=${chainQuery}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all' }}>{d.txId.slice(0, 8)}...{d.txId.slice(-6)}</a>
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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Admin Navbar */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        background: 'var(--bg-dark)',
        borderBottom: '1px solid var(--border)',
        height: 60,
        flexShrink: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', marginRight: 10 }} title="Back to Game">
            ←
          </button>
          <img src="/logo.jpg" alt="HAM" width={32} height={32} style={{ borderRadius: 4 }} />
          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 20, letterSpacing: '0.08em', color: 'var(--text)' }}>
            HAM Admin
          </span>
        </div>
        <div>
          {address && (
            <button className="wallet-btn" onClick={connectWallet} title="Fixes Leather wallet 'not authorized' error">
              🔄 Re-Authenticate
            </button>
          )}
        </div>
      </header>

      <div style={{ padding: '40px 24px', fontFamily: 'var(--font-head)', color: 'var(--text)', maxWidth: 1000, margin: '0 auto', width: '100%' }}>

      {!address ? (
        <div className="panel" style={{ textAlign: 'center', padding: 40, border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', background: 'rgba(255,68,68,0.05)' }}>
          <p style={{ color: 'var(--danger)', marginBottom: 20 }}>Please connect your wallet to access admin features.</p>
          <button className="btn btn-primary" onClick={connectWallet}>Connect Wallet</button>
        </div>
      ) : !IS_OWNER ? (
        <div className="panel" style={{ padding: 20, background: 'rgba(255,199,0,0.05)', border: '1px solid var(--gold)', borderRadius: 'var(--radius-md)', color: 'var(--gold)' }}>
          Warning: The connected wallet ({address.slice(0, 6)}...{address.slice(-4)}) is not the contract owner.
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, marginTop: 40 }}>

        {/* Campaign Settings Card */}
        <div className="panel" style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', borderRight: '1px solid var(--border)' }}>
          <h3 className="panel-title" style={{ color: 'var(--accent)' }}>Daily Booster Campaign</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 24 }}>
            Configure an NFT or Token that grants players a score multiplier for a specific maze day.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Maze ID (Date YYYYMMDD)
              <input type="number" value={mazeId} onChange={e => setMazeId(parseInt(e.target.value))} style={{ padding: '10px 12px', background: 'var(--bg-dark)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Booster Contract Address
              <input type="text" placeholder="ST123...456.my-nft" value={contractAddr} onChange={e => setContractAddr(e.target.value)} style={{ padding: '10px 12px', background: 'var(--bg-dark)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Score Multiplier (%)
              <input type="number" value={multiplier} onChange={e => setMultiplier(parseInt(e.target.value))} style={{ padding: '10px 12px', background: 'var(--bg-dark)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Image URL (Optional display image)
              <input type="text" placeholder="https://..." value={imageUrl} onChange={e => setImageUrl(e.target.value)} style={{ padding: '10px 12px', background: 'var(--bg-dark)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)' }} />
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button onClick={handleSaveCampaign} className="btn btn-primary" style={{ flex: 1, padding: 12 }}>
                💾 Save Database
              </button>
              <button onClick={async () => {
                if (!address) return alert("Connect wallet");
                if (!contractAddr) return alert("Please enter a valid Stacks principal contract address");
                try {
                  if (!stacksConnectAPI) throw new Error("Wallet API not loaded yet.");
                  await stacksConnectAPI.openContractCall({
                    network,
                    contractAddress: process.env.NEXT_PUBLIC_STACKS_CONTRACT_ADDRESS || "SP1K96254R3KP5TRT5N2X64FB12VMHX6MYS0BQGYQ",
                    contractName: process.env.NEXT_PUBLIC_STACKS_CONTRACT_NAME || "ham-maze-v4",
                    functionName: "set-daily-booster",
                    functionArgs: [
                      uintCV(mazeId),
                      principalCV(contractAddr.toUpperCase()),
                      uintCV(multiplier)
                    ],
                    userSession,
                    onFinish: (d: any) => {
                      const chainQuery = networkId.includes('testnet') ? 'testnet' : 'mainnet';
                      setStatus(
                        <span>
                          Booster Committed! Tx: <a href={`https://explorer.hiro.so/txid/${d.txId}?chain=${chainQuery}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all' }}>{d.txId.slice(0, 8)}...{d.txId.slice(-6)}</a>
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
        <div className="panel" style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <h3 className="panel-title" style={{ color: 'var(--accent)' }}>Contract Settings</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 24 }}>
            Adjust the global cost to mint a new run on the v3 smart contract. This fee is immediately added to the daily prize pool.
          </p>

          <div style={{ flex: 1 }} />

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 16 }}>
            Mint Fee (STX)
            <input type="number" step="0.1" value={mintFeeStx} onChange={e => setMintFeeStx(parseFloat(e.target.value))} style={{ padding: '10px 12px', background: 'var(--bg-dark)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)' }} />
          </label>

          <button onClick={async () => {
            if (!address) return alert("Connect wallet");
            try {
              const feeMicroStx = Math.floor(mintFeeStx * 1000000);
              if (!stacksConnectAPI) throw new Error("Wallet API not loaded yet.");
              await stacksConnectAPI.openContractCall({
                network,
                contractAddress: process.env.NEXT_PUBLIC_STACKS_CONTRACT_ADDRESS || "SP1K96254R3KP5TRT5N2X64FB12VMHX6MYS0BQGYQ",
                contractName: process.env.NEXT_PUBLIC_STACKS_CONTRACT_NAME || "ham-maze-v4",
                functionName: "set-mint-fee",
                functionArgs: [uintCV(feeMicroStx)],
                userSession,
                onFinish: (d: any) => {
                  const chainQuery = networkId.includes('testnet') ? 'testnet' : 'mainnet';
                  setStatus(
                    <span>
                      Fee Updated! Tx: <a href={`https://explorer.hiro.so/txid/${d.txId}?chain=${chainQuery}`} target="_blank" rel="noreferrer" style={{ color: 'var(--goal)', textDecoration: 'underline', wordBreak: 'break-all' }}>{d.txId.slice(0, 8)}...{d.txId.slice(-6)}</a>
                    </span>
                  );
                }
              });
            } catch (e: any) { setStatus("Error: " + e.message); }
          }} className="btn btn-secondary" style={{ padding: 12, border: '1px solid var(--goal)', color: 'var(--goal)', marginBottom: 24 }}>
            ⚙️ Update Mint Fee
          </button>

          <div style={{ height: 1, background: 'var(--border)', margin: '0 0 24px 0' }} />

          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 16 }}>
            Claim remaining 25% of the settled prize pools.
            <br/>
            <span style={{ color: 'var(--text)' }}>Available in contract: <strong>{contractBalance !== null ? contractBalance.toFixed(2) : '...'} STX</strong></span>
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 16 }}>
            Amount to claim (STX)
            <input type="number" step="0.1" defaultValue={10} id="claimAmount" style={{ padding: '10px 12px', background: 'var(--bg-dark)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)' }} />
          </label>
          <button onClick={async () => {
            if (!address) return alert("Connect wallet");
            try {
              const input = document.getElementById('claimAmount') as HTMLInputElement;
              const amountStx = parseFloat(input.value || "0");
              const amountMicro = Math.floor(amountStx * 1000000);
              if (amountMicro <= 0) return alert("Enter valid amount");
              if (!stacksConnectAPI) throw new Error("Wallet API not loaded yet.");
              
              await stacksConnectAPI.openContractCall({
                network,
                contractAddress: process.env.NEXT_PUBLIC_STACKS_CONTRACT_ADDRESS || "SP1K96254R3KP5TRT5N2X64FB12VMHX6MYS0BQGYQ",
                contractName: process.env.NEXT_PUBLIC_STACKS_CONTRACT_NAME || "ham-maze-v4",
                functionName: "claim-admin-fees",
                functionArgs: [uintCV(amountMicro)],
                userSession,
                onFinish: (d: any) => {
                  const chainQuery = networkId.includes('testnet') ? 'testnet' : 'mainnet';
                  setStatus(
                    <span>
                      Claim Tx Broadcasted! Tx: <a href={`https://explorer.hiro.so/txid/${d.txId}?chain=${chainQuery}`} target="_blank" rel="noreferrer" style={{ color: 'var(--goal)', textDecoration: 'underline', wordBreak: 'break-all' }}>{d.txId.slice(0, 8)}...{d.txId.slice(-6)}</a>
                    </span>
                  );
                }
              });
            } catch (e: any) { setStatus("Error: " + e.message); }
          }} className="btn btn-secondary" style={{ padding: 12, border: '1px solid var(--gold)', color: 'var(--gold)' }}>
            💰 Claim Admin Fees
          </button>
        </div>

        {/* Settlement Card */}
        <div className="panel" style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <h3 className="panel-title" style={{ color: 'var(--accent)' }}>Force Settlement</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 24 }}>
            Manually trigger the settlement for a past maze if no community member has clicked the settle button yet. This will generate the backend ECDSA signature and broadcast the transaction.
          </p>

          <div style={{ flex: 1 }} />

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 16 }}>
            Maze ID to Settle
            <input type="number" value={mazeId} onChange={e => setMazeId(parseInt(e.target.value))} style={{ padding: '10px 12px', background: 'var(--bg-dark)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)' }} />
          </label>

          {!settlementPreview ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <button onClick={handleFetchWinners} className="btn btn-secondary" style={{ flex: '1 1 120px', padding: 12, border: '1px solid var(--accent)', color: 'var(--accent)' }}>
                ⚡ Fetch Winners
              </button>
            </div>
          ) : (
            <div style={{ background: 'rgba(0,0,0,0.5)', padding: 16, borderRadius: 8, border: '1px solid #444' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                Previewing Top 10 for Maze {settlementPreview.mazeId} ({settlementPreview.version})
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

        {/* Sponsor/Rollover Card */}
        <div className="panel" style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <h3 className="panel-title" style={{ color: 'var(--accent)' }}>Rollover Pot (Sponsor)</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 24 }}>
            Manually inject STX directly from your admin wallet into any maze's prize pool. Use this to roll over unused funds from yesterday to tomorrow's pot.
          </p>

          <div style={{ flex: 1 }} />

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 16 }}>
            Target Maze ID
            <input type="number" value={sponsorMazeId} onChange={e => setSponsorMazeId(parseInt(e.target.value))} style={{ padding: '10px 12px', background: 'var(--bg-dark)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)' }} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 16 }}>
            Sponsor Amount (STX)
            <input type="number" step="0.1" value={sponsorAmount} onChange={e => setSponsorAmount(parseFloat(e.target.value))} style={{ padding: '10px 12px', background: 'var(--bg-dark)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)' }} />
          </label>

          <button onClick={async () => {
            if (!address) return alert("Connect wallet");
            try {
              const amountMicroStx = Math.floor(sponsorAmount * 1000000);
              if (amountMicroStx <= 0) return alert("Enter valid amount");
              if (!stacksConnectAPI) throw new Error("Wallet API not loaded yet.");
              await stacksConnectAPI.openContractCall({
                network,
                contractAddress: process.env.NEXT_PUBLIC_STACKS_CONTRACT_ADDRESS || "SP1K96254R3KP5TRT5N2X64FB12VMHX6MYS0BQGYQ",
                contractName: process.env.NEXT_PUBLIC_STACKS_CONTRACT_NAME || "ham-maze-v4",
                functionName: "sponsor-maze",
                functionArgs: [uintCV(sponsorMazeId), uintCV(amountMicroStx)],
                postConditionMode: 1,
                userSession,
                onFinish: (d: any) => {
                  const chainQuery = networkId.includes('testnet') ? 'testnet' : 'mainnet';
                  setStatus(
                    <span>
                      Sponsorship Broadcasted! Tx: <a href={`https://explorer.hiro.so/txid/${d.txId}?chain=${chainQuery}`} target="_blank" rel="noreferrer" style={{ color: 'var(--goal)', textDecoration: 'underline', wordBreak: 'break-all' }}>{d.txId.slice(0, 8)}...{d.txId.slice(-6)}</a>
                    </span>
                  );
                }
              });
            } catch (e: any) { setStatus("Error: " + e.message); }
          }} className="btn btn-primary" style={{ padding: 12 }}>
            🎁 Sponsor Pot
          </button>
        </div>

      </div>

      {status && (
        <div style={{ marginTop: 30, padding: 16, background: '#1a1a1a', borderLeft: '4px solid var(--accent)', color: 'white', fontFamily: 'var(--font-mono)', fontSize: 14 }}>
          {status}
        </div>
      )}
      </div>
    </div>
  );
}
