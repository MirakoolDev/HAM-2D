import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { megaEth } from '@/lib/megaeth';

// Stacks imports
import { tupleCV, uintCV, stringAsciiCV, principalCV, serializeCV, signMessageHashRsv, createMessageSignature } from '@stacks/transactions';
import { sha256 } from '@noble/hashes/sha256';

const HAM_MAZE_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY as string;

export async function POST(req: NextRequest) {
  try {
    const { address, mazeId, timeMs, attempts, pathSvg, chain } = await req.json();

    if (!address || !mazeId || !timeMs || !chain) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!SIGNER_PRIVATE_KEY) {
      console.error('SIGNER_PRIVATE_KEY is not set in environment');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (chain === "STACKS") {
      // 1. Pack the data exactly as `to-consensus-buff?` does in Clarity
      const tuple = tupleCV({
        'maze-id': uintCV(mazeId),
        'time-ms': uintCV(timeMs),
        'attempts': uintCV(attempts || 1),
        'path-svg': stringAsciiCV((pathSvg || "").slice(0, 4096)),
        'minter': principalCV(address),
      });

      const hexStr = serializeCV(tuple);
      // Convert the hex string to raw bytes since sha256 expects a byte array (passing a string makes it hash the utf-8 text!)
      const rawBytes = new Uint8Array(hexStr.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      
      // 2. Hash it with SHA256 (matches Clarity `sha256`)
      const hash = sha256(rawBytes);

      // 3. Sign it using the Stacks private key (produces 65-byte RSV signature)
      const signatureStr = signMessageHashRsv({ 
        messageHash: Buffer.from(hash).toString('hex'), 
        privateKey: SIGNER_PRIVATE_KEY 
      });
      
      return NextResponse.json({ signature: signatureStr });
    } 
    else {
      // EVM EIP-712 Signer
      const evmPrivateKey = SIGNER_PRIVATE_KEY.startsWith('0x') ? SIGNER_PRIVATE_KEY : `0x${SIGNER_PRIVATE_KEY}`;
      const account = privateKeyToAccount(evmPrivateKey as `0x${string}`);
      const client = createWalletClient({
        account,
        chain: megaEth,
        transport: http(),
      });

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
    }
  } catch (error) {
    console.error('Failed to sign run:', error);
    return NextResponse.json({ error: 'Failed to sign run' }, { status: 500 });
  }
}
