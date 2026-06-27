export interface RunData {
  mazeId: number;
  timeMs: number;
  attempts: number;
  pathSvg: string;
}

export interface IBlockchainProvider {
  /** Connect the user's wallet */
  connectWallet: () => Promise<void>;

  /** Disconnect the user's wallet */
  disconnectWallet: () => void;

  /** Get the currently connected wallet address */
  getAddress: () => string | null;

  /** Get the total prize pool for a given mazeId (in the native token, e.g., STX or ETH as a string) */
  getPrizePool: (mazeId: number) => Promise<string>;

  /** Get the leaderboard data for a given mazeId */
  getLeaderboard: (mazeId: number) => Promise<any[]>;

  /** Mint the result NFT on-chain */
  mintRun: (runData: RunData) => Promise<{ txId: string }>;

  /** Trigger daily settlement to distribute the prize pool */
  settleMaze: (mazeId: number) => Promise<{ txId: string }>;
}
