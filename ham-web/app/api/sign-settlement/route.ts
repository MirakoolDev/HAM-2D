import { type NextRequest, NextResponse } from 'next/server';
import { fetchLeaderboard, fetchCampaign, Run } from '@/lib/supabase';
import { checkHasToken } from '@/lib/stacks-api';
import { calculateScore } from '@/lib/scoring';
import { signMessageHashRsv, tupleCV, uintCV, listCV, principalCV, serializeCV } from '@stacks/transactions';
import { createHash } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mazeId, network } = body;

    if (!mazeId || !network) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Ensure it's a past maze (Commented out for testing so you can settle today's maze!)
    // const todayStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
    // if (parseInt(mazeId, 10) >= parseInt(todayStr, 10)) {
    //   return NextResponse.json({ error: 'Cannot settle today or future maze' }, { status: 400 });
    // }

    const runs = await fetchLeaderboard(mazeId, network);

    const campaign = await fetchCampaign(mazeId, network);
    const isTestnet = network === 'testnet';

    // We only want the best score per address
    const addressToBestRun = new Map<string, any>();

    for (const run of runs) {
      let hasBooster = false;
      if (campaign?.contract_address) {
        hasBooster = await checkHasToken(run.address, campaign.contract_address, isTestnet);
      }

      const score = calculateScore({
        timeMs: run.time_ms,
        attempts: run.attempts || 1,
        hasBooster,
        boosterMultiplier: campaign ? campaign.multiplier / 100 : 0,
      });

      const existing = addressToBestRun.get(run.address);
      if (!existing || score > existing.score) {
        addressToBestRun.set(run.address, { ...run, score });
      }
    }

    // Sort descending by score, grab top 10
    const top10Runs = Array.from(addressToBestRun.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const { getCurrentOwner } = await import('@/lib/stacks-api');
    
    const top10 = [];
    for (const r of top10Runs) {
      if (r.token_id) {
        const currentOwner = await getCurrentOwner(r.token_id, isTestnet);
        top10.push(currentOwner || r.address);
      } else {
        top10.push(r.address);
      }
    }

    if (top10.length > 0 && top10.length < 10) {
      // The user requested that if there are fewer than 10 players, the remaining 5% prize slots
      // should be distributed amongst the players who actually played, rather than the admin pot.
      // We do this by simply cycling through the existing players to fill the 10 slots!
      let i = 0;
      const initialLength = top10.length;
      while (top10.length < 10) {
        top10.push(top10[i % initialLength]);
        i++;
      }
    } else if (top10.length === 0) {
      const padAddress = process.env.NEXT_PUBLIC_ADMIN_WALLET || process.env.NEXT_PUBLIC_STACKS_CONTRACT_ADDRESS || "SP1K96254R3KP5TRT5N2X64FB12VMHX6MYS0BQGYQ";
      while (top10.length < 10) {
        top10.push(padAddress);
      }
    }

    const privateKeyHex = process.env.SIGNER_PRIVATE_KEY;
    if (!privateKeyHex) {
      return NextResponse.json({ error: 'Server misconfigured: missing SIGNER_PRIVATE_KEY' }, { status: 500 });
    }

    // Create the tuple equivalent to Clarity's { maze-id: uint, winners: (list 10 principal) }
    const payloadCV = tupleCV({
      'maze-id': uintCV(mazeId),
      'winners': listCV(top10.map(addr => principalCV(addr.toUpperCase())))
    });

    const serializedBytes = serializeCV(payloadCV);
    const hash = createHash('sha256').update(Buffer.from(serializedBytes, 'hex')).digest();
    
    // Using Stacks library signMessageHashRsv
    const signatureStr = signMessageHashRsv({
      messageHash: hash.toString('hex'),
      privateKey: privateKeyHex
    });

    return NextResponse.json({
      winners: top10,
      signature: signatureStr
    });
  } catch (err) {
    console.error('[sign-settlement]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
