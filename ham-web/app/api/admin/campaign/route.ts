import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyMessageSignatureRsv } from '@stacks/encryption';
import { getAddressFromPublicKey, TransactionVersion } from '@stacks/transactions';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mazeId, network, contractAddress, multiplier, imageUrl, signature, publicKey } = body;

    if (!signature || !publicKey) {
      throw new Error("Missing wallet signature");
    }

    const isValid = verifyMessageSignatureRsv({
      message: 'Authorize Settle/Campaign update for HAM Maze',
      publicKey,
      signature
    });

    if (!isValid) throw new Error("Invalid wallet signature");

    const address = getAddressFromPublicKey(publicKey, network === 'mainnet' ? TransactionVersion.Mainnet : TransactionVersion.Testnet);
    if (address !== "ST1K96254R3KP5TRT5N2X64FB12VMHX6MYT2VB8B1") {
      throw new Error("Wallet is not authorized admin");
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !adminKey) throw new Error('Missing Admin Key');

    const adminClient = createClient(url, adminKey);

    const { error } = await adminClient.from('ham_campaigns').upsert({
      maze_id: mazeId,
      network: network,
      contract_address: contractAddress,
      multiplier: multiplier,
      image_url: imageUrl
    }, { onConflict: 'maze_id,network' });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[admin campaign]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
