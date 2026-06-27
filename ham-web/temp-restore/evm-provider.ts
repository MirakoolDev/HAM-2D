import { IBlockchainProvider, RunData } from './interface';

export class EvmGameService implements IBlockchainProvider {
  // Skeleton implementation for the EVM logic using Wagmi/Viem
  // This will be fully implemented when the EVM option is re-enabled.

  async connectWallet() {
    console.log("EVM Connect triggered - should open RainbowKit/Privy modal");
  }

  disconnectWallet() {
    console.log("EVM Disconnect triggered");
  }

  getAddress() {
    return null; // Will read from wagmi's useAccount
  }

  async getPrizePool(mazeId: number) {
    return "0";
  }

  async getLeaderboard(mazeId: number) {
    return [];
  }

  async mintRun(runData: RunData) {
    console.log("Minting on EVM", runData);
    return { txId: "0x123..." };
  }

  async settleMaze(mazeId: number) {
    console.log("Settling on EVM", mazeId);
    return { txId: "0x456..." };
  }

  async isMazeSettled(mazeId: number) {
    return false;
  }

  async getMintFee() {
    return "0";
  }
}
