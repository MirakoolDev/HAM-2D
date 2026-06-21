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
  address: string;
  time_ms: number;
  minted_at: string;
  tx_hash: string;
  rank?: number;
}

/** Fetch today's leaderboard sorted by time_ms ascending */
export async function fetchLeaderboard(mazeId: number): Promise<Run[]> {
  try {
    const { data, error } = await getClient()
      .from('ham_runs')
      .select('*')
      .eq('maze_id', mazeId)
      .order('time_ms', { ascending: true })
      .limit(50);
    if (error) { console.error('Leaderboard fetch error:', error); return []; }
    return (data ?? []).map((r, i) => ({ ...r, rank: i + 1 }));
  } catch { return []; }
}

/** Insert or update a run (upsert by token_id) */
export async function upsertRun(run: Omit<Run, 'rank'>): Promise<void> {
  try {
    const { error } = await getClient().from('ham_runs').upsert(run, { onConflict: 'token_id' });
    if (error) console.error('Upsert error:', error);
  } catch (e) { console.error('upsertRun:', e); }
}

/** Fetch pot total for a given maze day (sum of all mints × 0.001 ETH) */
export async function fetchPotEth(mazeId: number): Promise<number> {
  try {
    const { count, error } = await getClient()
      .from('ham_runs')
      .select('*', { count: 'exact', head: true })
      .eq('maze_id', mazeId);
    if (error) return 0;
    return (count ?? 0) * 0.001;
  } catch { return 0; }
}

/** Fetch all unique maze IDs played by a user */
export async function fetchUserMazeIds(address: string): Promise<number[]> {
  try {
    const { data, error } = await getClient()
      .from('ham_runs')
      .select('maze_id')
      .ilike('address', address);
    if (error) return [];
    const ids = data.map(r => r.maze_id);
    return Array.from(new Set(ids));
  } catch { return []; }
}
