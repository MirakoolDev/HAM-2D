"use client";

import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { IBlockchainProvider } from '../lib/blockchain/interface';
import { StacksGameService } from '../lib/blockchain/stacks-provider';

// Configuration: we are prioritizing Stacks right now
const NETWORK_ENV = process.env.NEXT_PUBLIC_NETWORK_ENV || "mainnet"; // "testnet" or "mainnet"

interface GameContextProps {
  provider: IBlockchainProvider;
  address: string | null;
  networkId: string;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

const GameContext = createContext<GameContextProps | undefined>(undefined);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  // Determine the network string for Supabase leaderboard partitioning
  const networkId = `stacks-${NETWORK_ENV}`;

  // Initialize the correct provider based on configuration
  const provider = useMemo(() => {
    return new StacksGameService();
  }, []);

  // Sync the address initially (if previously connected)
  useEffect(() => {
    const initAndCheck = async () => {
      if (provider.init) {
        await provider.init();
      }
      const addr = provider.getAddress();
      setAddress(addr);
    };
    initAndCheck();
  }, [provider]);

  const connectWallet = async () => {
    try {
      await provider.connectWallet();
      setAddress(provider.getAddress());
    } catch (error) {
      console.error("Wallet connection failed:", error);
    }
  };

  const disconnectWallet = () => {
    provider.disconnectWallet();
    setAddress(null);
  };

  return (
    <GameContext.Provider value={{ provider, address, networkId, connectWallet, disconnectWallet }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGameChain() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGameChain must be used within a GameProvider');
  }
  return context;
}
