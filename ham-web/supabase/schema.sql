CREATE TABLE IF NOT EXISTS ham_runs (
  -- Primary composite key
  network text NOT NULL,
  token_id bigint NOT NULL,

  -- Core run data
  maze_id bigint NOT NULL,
  address text NOT NULL,
  time_ms bigint NOT NULL,
  minted_at timestamp with time zone NOT NULL,
  tx_hash text NOT NULL,

  -- Additional run metadata
  attempts integer,
  path_svg text,

  -- Constraints
  PRIMARY KEY (network, token_id)
);

-- Index for fast leaderboard fetching (by maze_id, network, ordered by time_ms)
CREATE INDEX IF NOT EXISTS idx_ham_runs_leaderboard 
ON ham_runs (maze_id, network, time_ms ASC);

-- Index for fetching a user's played mazes quickly
CREATE INDEX IF NOT EXISTS idx_ham_runs_user 
ON ham_runs (address, network);
