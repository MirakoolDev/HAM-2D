import { type NextRequest, NextResponse } from 'next/server';
import { fetchLeaderboard, fetchCampaign, Run } from '@/lib/supabase';
import { checkHasToken } from '@/lib/stacks-api';
import { calculateScore } from '@/lib/scoring';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mazeIdStr = searchParams.get('mazeId');
    const network = searchParams.get('network') || 'testnet';

    if (!mazeIdStr) {
      return NextResponse.json({ error: 'Missing mazeId' }, { status: 400 });
    }

    const mazeId = parseInt(mazeIdStr, 10);
    const runs = await fetchLeaderboard(mazeId, network);
    const campaign = await fetchCampaign(mazeId, network);

    const isTestnet = network === 'testnet';

    // We only want the best score per address
    const addressToBestRun = new Map<string, any>();
    const addressesToFetch = new Set<string>();

    for (const run of runs) {
      addressesToFetch.add(run.address);
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

      const entry = { ...run, score, hasBooster };

      const existing = addressToBestRun.get(run.address);
      if (!existing) {
        addressToBestRun.set(run.address, { ...entry, history: [entry] });
      } else {
        existing.history.push(entry);
        if (score > existing.score) {
          existing.score = score;
          existing.time_ms = entry.time_ms;
          existing.attempts = entry.attempts;
        }
      }
    }

    // Fetch usernames for all addresses
    const profileMap = new Map<string, string>();
    if (addressesToFetch.size > 0) {
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      
      const orQuery = Array.from(addressesToFetch)
        .map(addr => `address.ilike.${addr}`)
        .join(',');

      const { data: profiles } = await supabase
        .from('ham_profiles')
        .select('address, username')
        .or(orQuery);
      
      if (profiles) {
        profiles.forEach((p: any) => profileMap.set(p.address.toLowerCase(), p.username));
      }
    }

    // Convert map to array and sort by score descending
    const finalLeaderboard = Array.from(addressToBestRun.values()).map(run => ({
      ...run,
      username: profileMap.get(run.address.toLowerCase()) || null
    })).sort((a, b) => b.score - a.score);

    // Assign final ranks
    finalLeaderboard.forEach((run, i) => run.rank = i + 1);

    return NextResponse.json({ leaderboard: finalLeaderboard, campaign });
  } catch (err) {
    console.error('[leaderboard api]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
