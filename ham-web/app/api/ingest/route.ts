import { type NextRequest, NextResponse } from 'next/server';
import { upsertRun } from '@/lib/supabase';

/**
 * POST /api/ingest
 * Called by the server-side miniblock event listener (or directly by frontend
 * after mint confirmation) to write a confirmed run to Supabase.
 *
 * Body: { tokenId, mazeId, address, timeMs, txHash }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tokenId, mazeId, address, timeMs, txHash } = body;

    if (!tokenId || !mazeId || !address || !timeMs) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    await upsertRun({
      token_id: Number(tokenId),
      maze_id:  Number(mazeId),
      address:  String(address).toLowerCase(),
      time_ms:  Number(timeMs),
      minted_at: new Date().toISOString(),
      tx_hash:  String(txHash ?? ''),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[ingest]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
