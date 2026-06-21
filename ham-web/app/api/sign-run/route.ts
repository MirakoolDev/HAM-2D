import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { megaEth } from '@/lib/megaeth';

// We need the contract address and the exact typehash matching the Solidity contract
const HAM_MAZE_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY as `0x${string}`;

export async function POST(req: NextRequest) {
  try {
    const { address, mazeId, timeMs } = await req.json();

    if (!address || !mazeId || !timeMs) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!SIGNER_PRIVATE_KEY) {
      console.error('SIGNER_PRIVATE_KEY is not set in environment');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const account = privateKeyToAccount(SIGNER_PRIVATE_KEY);
    const client = createWalletClient({
      account,
      chain: megaEth,
      transport: http(),
    });

    // We use viem's signTypedData to match OpenZeppelin's EIP712 implementation
    const signature = await client.signTypedData({
      domain: {
        name: 'HAMMaze',
        version: '1',
        chainId: megaEth.id,
        verifyingContract: HAM_MAZE_ADDRESS,
      },
      types: {
        MintRun: [
          { name: 'user', type: 'address' },
          { name: 'mazeId', type: 'uint256' },
          { name: 'timeMs', type: 'uint256' },
        ],
      },
      primaryType: 'MintRun',
      message: {
        user: address as `0x${string}`,
        mazeId: BigInt(mazeId),
        timeMs: BigInt(timeMs),
      },
    });

    return NextResponse.json({ signature });
  } catch (error) {
    console.error('Failed to sign run:', error);
    return NextResponse.json({ error: 'Failed to sign run' }, { status: 500 });
  }
}
