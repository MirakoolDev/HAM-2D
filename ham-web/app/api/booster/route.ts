import { type NextRequest, NextResponse } from 'next/server';
import { fetchCampaign } from '@/lib/supabase';
import { checkHasToken } from '@/lib/stacks-api';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get('address');
    const mazeIdStr = searchParams.get('mazeId');
    const network = searchParams.get('network') || 'testnet';

    if (!address || !mazeIdStr) {
      return NextResponse.json({ error: 'Missing address or mazeId' }, { status: 400 });
    }

    const mazeId = parseInt(mazeIdStr, 10);
    const campaign = await fetchCampaign(mazeId, network);

    let hasBooster = false;
    let multiplier = 0;

    if (campaign?.contract_address) {
      const isTestnet = network === 'testnet';
      hasBooster = await checkHasToken(address, campaign.contract_address, isTestnet);
      multiplier = campaign.multiplier;
    }

    return NextResponse.json({ hasBooster, multiplier });
  } catch (err) {
    console.error('[booster api GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
