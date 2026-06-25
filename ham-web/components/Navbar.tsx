'use client';

import { useGameChain } from './GameProvider';
import { useEffect, useState } from 'react';
import { getTodaySeed } from '@/lib/maze';
import Link from 'next/link';

interface NavbarProps {
  mazeId: number;
}

const ADMIN_ADDRESS = "ST1K96254R3KP5TRT5N2X64FB12VMHX6MYT2VB8B1";

import { useRouter } from 'next/navigation';

export default function Navbar({ mazeId }: NavbarProps) {
  const { address, connectWallet, disconnectWallet, provider } = useGameChain();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [prizePool, setPrizePool] = useState<number>(0);
  const [isSettled, setIsSettled] = useState(false);
  const [mintFee, setMintFee] = useState(1); // Default 1 STX
  const router = useRouter();
  
  const isPastMaze = mazeId < getTodaySeed();
  const isOwner = address === ADMIN_ADDRESS;

  useEffect(() => {
    async function fetchStats() {
      try {
        const pool = await provider.getPrizePool(mazeId);
        setPrizePool(parseInt(pool) / 1000000); // Convert uSTX to STX
        
        if (isPastMaze) {
          const settled = await provider.isMazeSettled(mazeId);
          setIsSettled(settled);
        }
      } catch (err) {
        console.error("Failed to fetch stats", err);
      }
    }
    fetchStats();
  }, [provider, mazeId, isPastMaze]);

  const handleSettle = async () => {
    if (!address) return alert("Connect wallet first!");
    try {
      await provider.settleMaze(mazeId);
      alert("Settlement transaction broadcasted!");
    } catch (e: any) {
      alert("Settlement failed: " + e.message);
    }
  };

  return (
    <header className="navbar-custom">
      <div className="nav-left">
        <span className="nav-brand">HAM</span>
      </div>

      <div className="nav-stats">
        <div className="nav-stat-group">
          <div className="stat-label">CURRENT SCORE</div>
          <div className="stat-value">
            <span>--</span>
            <span className="stat-sub" style={{ opacity: 0 }}>-</span>
          </div>
        </div>
        
        <div className="nav-divider" />

        <div className="nav-stat-group">
          <div className="stat-label">POT SIZE</div>
          <div className="stat-value">
            <span>{prizePool.toFixed(2)} STX</span>
            <span className="stat-sub">$0.00</span>
          </div>
        </div>

        <div className="nav-divider" />

        <div className="nav-stat-group">
          <div className="stat-label">MINT FEE</div>
          <div className="stat-value">
            <span>{mintFee} STX</span>
            <span className="stat-sub" style={{ opacity: 0 }}>-</span>
          </div>
        </div>
      </div>

      <div className="nav-right">
        {address ? (
          <div className="wallet-dropdown-container">
            <button className="btn btn-primary" onClick={() => setDropdownOpen(!dropdownOpen)}>
              {address.slice(0, 6)}...{address.slice(-4)}
            </button>
            {dropdownOpen && (
              <div className="wallet-dropdown">
                {isOwner && (
                  <button onClick={() => { setDropdownOpen(false); router.push('/admin'); }} className="dropdown-item" style={{ color: 'var(--accent)' }}>
                    Admin Dashboard
                  </button>
                )}
                {isPastMaze && !isSettled && (
                  <button onClick={handleSettle} className="dropdown-item" style={{color: 'var(--goal)'}}>
                    Settle Maze #{mazeId}
                  </button>
                )}
                {isPastMaze && isSettled && (
                  <button disabled className="dropdown-item" style={{color: 'var(--text-muted)'}}>
                    Maze Settled ✓
                  </button>
                )}
                <button onClick={() => { disconnectWallet(); setDropdownOpen(false); }} className="dropdown-item danger">
                  Disconnect
                </button>
              </div>
            )}
          </div>
        ) : (
          <button className="btn btn-primary" onClick={connectWallet}>
            Connect Wallet
          </button>
        )}
      </div>
      
      <style jsx>{`
        .navbar-custom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 16px;
          background-color: rgba(0, 0, 0, 0.9);
          border-bottom: 1px solid var(--border);
          font-family: var(--font-mono);
          height: 60px;
        }
        .nav-left {
          display: flex;
          align-items: center;
        }
        .nav-brand {
          font-weight: bold;
          font-size: 20px;
          letter-spacing: 2px;
        }
        .nav-stats {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .nav-stat-group {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
        }
        .stat-label {
          font-size: 10px;
          color: var(--text-muted);
          letter-spacing: 1px;
        }
        .stat-value {
          display: flex;
          flex-direction: column;
          font-size: 14px;
          font-weight: bold;
          line-height: 1.2;
        }
        .stat-sub {
          font-size: 10px;
          color: var(--text-muted);
          font-weight: normal;
        }
        .nav-divider {
          width: 1px;
          height: 24px;
          background-color: var(--border);
        }
        .nav-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .wallet-dropdown-container {
          position: relative;
        }
        .wallet-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 8px;
          background-color: #111;
          border: 1px solid var(--border);
          border-radius: 4px;
          overflow: hidden;
          z-index: 100;
          min-width: 160px;
        }
        .dropdown-item {
          display: block;
          width: 100%;
          padding: 12px 16px;
          text-align: left;
          background: none;
          border: none;
          border-bottom: 1px solid #222;
          color: white;
          font-family: var(--font-mono);
          font-size: 12px;
          cursor: pointer;
        }
        .dropdown-item:last-child {
          border-bottom: none;
        }
        .dropdown-item:hover:not(:disabled) {
          background-color: rgba(255, 255, 255, 0.1);
        }
        .dropdown-item.danger:hover {
          background-color: rgba(255, 0, 0, 0.2);
          color: #ff4444;
        }
        
        @media (max-width: 800px) {
          .nav-stats {
            display: none;
          }
        }
      `}</style>
    </header>
  );
}
