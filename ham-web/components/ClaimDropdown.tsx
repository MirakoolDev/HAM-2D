'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContracts, useWriteContract } from 'wagmi';
import { HAM_MAZE_ADDRESS, HAM_MAZE_ABI } from '@/lib/contract';
import { fetchUserMazeIds } from '@/lib/supabase';
import { formatEther } from 'viem';

export default function ClaimDropdown() {
  const { address } = useAccount();
  const [mazeIds, setMazeIds] = useState<number[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const { writeContractAsync } = useWriteContract();

  useEffect(() => {
    if (address) {
      fetchUserMazeIds(address).then(setMazeIds);
    } else {
      setMazeIds([]);
    }
  }, [address]);

  const { data: claimables, refetch } = useReadContracts({
    contracts: mazeIds.map(id => ({
      address: HAM_MAZE_ADDRESS,
      abi: HAM_MAZE_ABI,
      functionName: 'claimable',
      args: [BigInt(id), address as `0x${string}`],
    })),
    query: {
      enabled: mazeIds.length > 0 && !!address,
    }
  });

  const availableClaims = mazeIds.map((id, i) => ({
    mazeId: id,
    amount: claimables?.[i]?.result as bigint | undefined,
  })).filter(c => c.amount && c.amount > BigInt(0));

  const handleClaim = async (mazeId: number) => {
    try {
      await writeContractAsync({
        address: HAM_MAZE_ADDRESS,
        abi: HAM_MAZE_ABI,
        functionName: 'claimPrize',
        args: [BigInt(mazeId)],
      });
      alert('Claim successful!');
      refetch();
    } catch (e: any) {
      alert('Claim failed: ' + e.message);
    }
  };

  if (availableClaims.length === 0) return null;

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn btn-primary" onClick={() => setIsOpen(!isOpen)}>
        Claim Winnings ({availableClaims.length})
      </button>
      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8,
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          padding: 12, minWidth: 240, zIndex: 50, display: 'flex', flexDirection: 'column', gap: 8
        }}>
          {availableClaims.map(c => (
            <div key={c.mazeId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Maze #{c.mazeId}
              </span>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '4px 8px', fontSize: 10 }}
                onClick={() => handleClaim(c.mazeId)}
              >
                Claim {Number(formatEther(c.amount!)).toFixed(4)} ETH
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
