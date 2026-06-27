"use client";

import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { IBlockchainProvider } from '../lib/blockchain/interface';
import { StacksGameService } from '../lib/blockchain/stacks-provider';
import { EvmGameService } from '../lib/blockchain/evm-provider';

// Configuration: we are prioritizing Stacks right now
const ACTIVE_CHAIN = process.env.NEXT_PUBLIC_ACTIVE_CHAIN || "STACKS"; // "STACKS" or "EVM"
const NETWORK_ENV = process.env.NEXT_PUBLIC_NETWORK_ENV || "testnet"; // "testnet" or "mainnet"

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
  const networkId = ACTIVE_CHAIN === "STACKS" 
    ? `stacks-${NETWORK_ENV}` 
    : (process.env.NEXT_PUBLIC_EVM_NETWORK || "base-sepolia");

  // Initialize the correct provider based on configuration
  const provider = useMemo(() => {
    return ACTIVE_CHAIN === "EVM" ? new EvmGameService() : new StacksGameService();
  }, []);

  // Sync the address initially (if previously connected)
  useEffect(() => {
    const checkAddress = () => {
      const addr = provider.getAddress();
      setAddress(addr);
    };
    checkAddress();
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
