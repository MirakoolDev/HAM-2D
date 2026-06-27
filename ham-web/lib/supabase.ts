import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || url.startsWith('your_')) {
      throw new Error('Supabase env vars not configured');
    }
    _client = createClient(url, key);
  }
  return _client;
}

export interface Run {
  token_id: number;
  maze_id: number;
  network: string;
  address: string;
  time_ms: number;
  minted_at: string;
  tx_hash: string;
  attempts?: number;
  path_svg?: string;
  rank?: number;
}

/** Fetch today's leaderboard sorted by time_ms ascending */
export async function fetchLeaderboard(mazeId: number, network: string): Promise<Run[]> {
  try {
    const { data, error } = await getClient()
      .from('ham_runs')
      .select('*')
      .eq('maze_id', mazeId)
      .eq('network', network)
      .order('time_ms', { ascending: true })
      .limit(50);
    if (error) { console.error('Leaderboard fetch error:', error); return []; }
    return (data ?? []).map((r, i) => ({ ...r, rank: i + 1 }));
  } catch { return []; }
}

/** Insert or update a run (upsert by network and token_id) using Admin Key */
export async function adminUpsertRun(run: Omit<Run, 'rank'>): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !adminKey) throw new Error('Missing Admin Key');
    
    const adminClient = createClient(url, adminKey);
    const { error } = await adminClient.from('ham_runs').upsert(run, { onConflict: 'network,token_id' });
    if (error) console.error('Upsert error:', error);
  } catch (e) { console.error('adminUpsertRun:', e); }
}

/** Fetch pot total for a given maze day (sum of all mints × 0.001 ETH/STX) */
export async function fetchPotEth(mazeId: number, network: string): Promise<number> {
  try {
    const { count, error } = await getClient()
      .from('ham_runs')
      .select('*', { count: 'exact', head: true })
      .eq('maze_id', mazeId)
      .eq('network', network);
    if (error) return 0;
    return (count ?? 0) * 0.001;
  } catch { return 0; }
}

export async function fetchUserMazeIds(address: string, network: string): Promise<number[]> {
  try {
    const { data, error } = await getClient()
      .from('ham_runs')
      .select('maze_id')
      .eq('network', network)
      .ilike('address', address);
    if (error) return [];
    const ids = data.map(r => r.maze_id);
    return Array.from(new Set(ids));
  } catch { return []; }
}

export interface Campaign {
  maze_id: number;
  network: string;
  contract_address: string;
  multiplier: number;
  image_url: string;
}

export async function fetchCampaign(mazeId: number, network: string): Promise<Campaign | null> {
  try {
    const { data, error } = await getClient()
      .from('ham_campaigns')
      .select('*')
      .eq('maze_id', mazeId)
      .eq('network', network)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch { return null; }
}

export interface Profile {
  address: string;
  username: string;
  created_at: string;
}

export async function fetchProfile(address: string): Promise<Profile | null> {
  try {
    const { data, error } = await getClient()
      .from('ham_profiles')
      .select('*')
      .ilike('address', address)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch { return null; }
}

export async function upsertProfile(address: string, username: string): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !adminKey) throw new Error('Missing Admin Key');
    
    const adminClient = createClient(url, adminKey);
    const { error } = await adminClient
      .from('ham_profiles')
      .upsert({ address, username }, { onConflict: 'address' });
    if (error) console.error('Upsert profile error:', error);
  } catch (e) { console.error('upsertProfile:', e); }
}
