import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { megaEth } from '@/lib/megaeth';

// Stacks imports
import { tupleCV, uintCV, stringAsciiCV, principalCV, serializeCV, signMessageHashRsv, createMessageSignature } from '@stacks/transactions';
import { sha256 } from '@noble/hashes/sha256';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// 4everland S3-compatible IPFS storage
const s3 = new S3Client({
  endpoint: "https://endpoint.4everland.co",
  region: "us-west-2",
  credentials: {
    accessKeyId: process.env.EVERLAND_ACCESS_KEY || '',
    secretAccessKey: process.env.EVERLAND_SECRET_KEY || '',
  },
  forcePathStyle: true,
});
const BUCKET = process.env.EVERLAND_BUCKET || '';

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
      // 0. Upload to 4everland IPFS
      let ipfsUri = "ipfs://";
      try {
        if (!BUCKET || !process.env.EVERLAND_ACCESS_KEY) throw new Error("4everland not configured");
        
        // Ensure valid SVG string
        let svgContent = pathSvg || '';
        if (!svgContent.includes('xmlns="http://www.w3.org/2000/svg"')) {
          svgContent = svgContent.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
        }
        
        // Upload SVG
        const svgKey = `ham-maze/svg/${Date.now()}-${mazeId}-${address}.svg`;
        const svgCmd = new PutObjectCommand({
          Bucket: BUCKET, Key: svgKey, Body: Buffer.from(svgContent), ContentType: "image/svg+xml", ACL: "public-read",
        });
        const svgResult = await s3.send(svgCmd);
        const svgCid = svgResult.ETag ? svgResult.ETag.replace(/"/g, "") : "";
        
        // Generate JSON metadata
        const metadata = {
          sip: 16,
          name: `HAM Maze Run (Maze #${mazeId})`,
          description: `An official speedrun of HAM Maze #${mazeId}. Navigate the path as fast as possible without touching the walls.`,
          image: `ipfs://${svgCid}`,
          attributes: [
            { trait_type: "Maze ID", value: mazeId.toString() },
            { trait_type: "Time (ms)", value: timeMs, display_type: "number" },
            { trait_type: "Attempts", value: attempts || 1, display_type: "number" }
          ]
        };
        
        // Upload JSON
        const jsonKey = `ham-maze/metadata/${Date.now()}-${mazeId}-${address}.json`;
        const jsonCmd = new PutObjectCommand({
          Bucket: BUCKET, Key: jsonKey, Body: Buffer.from(JSON.stringify(metadata)), ContentType: "application/json", ACL: "public-read",
        });
        const jsonResult = await s3.send(jsonCmd);
        const jsonCid = jsonResult.ETag ? jsonResult.ETag.replace(/"/g, "") : "";
        
        ipfsUri = `ipfs://${jsonCid}`;
      } catch (e: any) {
        console.error("IPFS Upload Failed:", e);
        return NextResponse.json({ error: 'IPFS Upload Failed: ' + e.message }, { status: 500 });
      }

      // 1. Pack the data exactly as `to-consensus-buff?` does in Clarity
      const tuple = tupleCV({
        'maze-id': uintCV(mazeId),
        'minter': principalCV(address),
        'time-ms': uintCV(timeMs),
        'attempts': uintCV(attempts || 1),
        'path-svg': stringAsciiCV((pathSvg || "").slice(0, 4096)),
        'ipfs-uri': stringAsciiCV(ipfsUri)
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
      
      return NextResponse.json({ signature: signatureStr, ipfsUri });
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
