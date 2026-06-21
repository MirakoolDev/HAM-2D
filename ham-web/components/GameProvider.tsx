"use client";

import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { IBlockchainProvider } from '../lib/blockchain/interface';
import { StacksGameService } from '../lib/blockchain/stacks-provider';
import { EvmGameService } from '../lib/blockchain/evm-provider';

// Configuration: we are prioritizing Stacks right now
const ACTIVE_CHAIN = process.env.NEXT_PUBLIC_ACTIVE_CHAIN || "STACKS"; // "STACKS" or "EVM"

interface GameContextProps {
  provider: IBlockchainProvider;
  address: string | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

const GameContext = createContext<GameContextProps | undefined>(undefined);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

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
    // Note: Stacks userSession might take a tick to load, 
    // so we can call this after a small delay or trust local state
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
    <GameContext.Provider value={{ provider, address, connectWallet, disconnectWallet }}>
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
