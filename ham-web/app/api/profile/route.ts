import { type NextRequest, NextResponse } from 'next/server';
import { upsertProfile, fetchProfile } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, username } = body;

    if (!address || !username) {
      return NextResponse.json({ error: 'Missing address or username' }, { status: 400 });
    }

    if (username.length > 20 || username.length < 3) {
      return NextResponse.json({ error: 'Username must be between 3 and 20 characters' }, { status: 400 });
    }

    await upsertProfile(address, username);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[profile api POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ error: 'Missing address' }, { status: 400 });
    }

    const profile = await fetchProfile(address);
    return NextResponse.json({ profile });
  } catch (err) {
    console.error('[profile api GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
