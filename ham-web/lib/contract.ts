'use client';

import { useCallback } from 'react';
import { useWalletClient, usePublicClient } from 'wagmi';
import { parseEther } from 'viem';

export const HAM_MAZE_ADDRESS = (
  process.env.NEXT_PUBLIC_HAM_CONTRACT ?? '0x0000000000000000000000000000000000000000'
) as `0x${string}`;

export const HAM_MAZE_ABI = [
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'mazeId', type: 'uint256' },
      { name: 'timeMs', type: 'uint256' },
      { name: 'pathSvg', type: 'string' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'finalizeDay',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'mazeId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'claimPrize',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'mazeId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'claimable',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'mazeId', type: 'uint256' }, { name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'pot',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'mazeId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'MintResult',
    type: 'event',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'mazeId',  type: 'uint256', indexed: true },
      { name: 'minter',  type: 'address', indexed: false },
      { name: 'timeMs',  type: 'uint256', indexed: false },
    ],
  },
] as const;

/**
 * Hook to mint a maze run NFT (0.001 ETH).
 * Compatible with wagmi v2.
 */
export function useMintResult() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const mint = useCallback(
    async (mazeId: number, timeMs: number, pathSvg: string, signature: `0x${string}`): Promise<`0x${string}`> => {
      if (!walletClient || !publicClient) throw new Error('Wallet not connected');

      const hash = await walletClient.writeContract({
        address: HAM_MAZE_ADDRESS,
        abi: HAM_MAZE_ABI,
        functionName: 'mint',
        args: [BigInt(mazeId), BigInt(timeMs), pathSvg, signature],
        value: parseEther('0.001'),
      });

      // waitForTransactionReceipt is the wagmi v2 public client method
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
    [walletClient, publicClient],
  );

  return { mint };
}
