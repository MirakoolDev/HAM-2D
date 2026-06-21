import { showConnect, userSession, openContractCall } from '@stacks/connect';
import { StacksMocknet } from '@stacks/network';
import { uintCV, stringAsciiCV, callReadOnlyFunction, cvToValue, listCV, principalCV } from '@stacks/transactions';
import { IBlockchainProvider, RunData } from './interface';

// Default to Devnet/Mocknet for local development. We can switch this later.
export const network = new StacksMocknet();

// Define the contract address and name
export const CONTRACT_ADDRESS = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"; // Default devnet address
export const CONTRACT_NAME = "ham-maze";

export class StacksGameService implements IBlockchainProvider {
  async connectWallet() {
    return new Promise<void>((resolve, reject) => {
      showConnect({
        appDetails: {
          name: 'HAM Maze',
          icon: window.location.origin + '/favicon.ico',
        },
        redirectTo: '/',
        onFinish: () => {
          resolve();
        },
        onCancel: () => {
          reject(new Error("User cancelled connection"));
        },
        userSession,
      });
    });
  }

  disconnectWallet() {
    if (userSession.isUserSignedIn()) {
      userSession.signUserOut('/');
    }
  }

  getAddress() {
    if (userSession.isUserSignedIn()) {
      const userData = userSession.loadUserData();
      // Use testnet address if network is testnet/mocknet, else mainnet
      return userData.profile.stxAddress.testnet; 
    }
    return null;
  }

  async getPrizePool(mazeId: number) {
    try {
      const sender = this.getAddress() || CONTRACT_ADDRESS;
      const response = await callReadOnlyFunction({
        network,
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'get-prize-pool',
        functionArgs: [uintCV(mazeId)],
        senderAddress: sender,
      });
      // cvToValue returns the value directly (e.g. integer value for uintCV)
      return cvToValue(response).toString();
    } catch (e) {
      console.error("Failed to get prize pool:", e);
      return "0";
    }
  }

  async getLeaderboard(mazeId: number) {
    // A true on-chain leaderboard requires an indexer (e.g., Supabase fetching contract events)
    // For now we return an empty array until the backend is hooked up.
    return [];
  }

  async mintRun(runData: RunData) {
    return new Promise<{ txId: string }>((resolve, reject) => {
      openContractCall({
        network,
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'mint-run',
        functionArgs: [
          uintCV(runData.mazeId),
          uintCV(runData.timeMs),
          uintCV(runData.attempts),
          stringAsciiCV(runData.pathSvg.slice(0, 4096))
        ],
        onFinish: (data) => {
          console.log("Mint transaction broadcasted", data);
          resolve({ txId: data.txId });
        },
        onCancel: () => {
          reject(new Error("User cancelled minting"));
        }
      });
    });
  }

  async settleMaze(mazeId: number, winners: string[] = []) {
    return new Promise<{ txId: string }>((resolve, reject) => {
      // Create a list of up to 10 principals
      const winnerPrincipals = winners.slice(0, 10).map(w => principalCV(w));
      
      openContractCall({
        network,
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'settle-maze',
        functionArgs: [
          uintCV(mazeId),
          listCV(winnerPrincipals)
        ],
        onFinish: (data) => {
          console.log("Settle transaction broadcasted", data);
          resolve({ txId: data.txId });
        },
        onCancel: () => {
          reject(new Error("User cancelled settlement"));
        }
      });
    });
  }
}
