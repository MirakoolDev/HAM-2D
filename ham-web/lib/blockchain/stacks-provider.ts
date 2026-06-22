import { showConnect, openContractCall, AppConfig, UserSession } from '@stacks/connect';
import { STACKS_MOCKNET } from '@stacks/network';

const appConfig = new AppConfig(['store_write']);
export const userSession = new UserSession({ appConfig });

import { uintCV, stringAsciiCV, fetchCallReadOnlyFunction, cvToValue, listCV, principalCV, bufferCV } from '@stacks/transactions';
import { IBlockchainProvider, RunData } from './interface';

// The contract was deployed to Testnet (ST... address)
import { STACKS_TESTNET } from '@stacks/network';
export const network = STACKS_TESTNET;

// Define the contract address and name
export const CONTRACT_ADDRESS = "ST1K96254R3KP5TRT5N2X64FB12VMHX6MYT2VB8B1";
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
      const response = await fetchCallReadOnlyFunction({
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
    try {
      const address = this.getAddress();
      if (!address) throw new Error("Wallet not connected");

      // 1. Fetch ECDSA signature from our backend
      const res = await fetch('/api/sign-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          mazeId: runData.mazeId,
          timeMs: runData.timeMs,
          attempts: runData.attempts,
          pathSvg: runData.pathSvg,
          chain: "STACKS"
        }),
      });
      const data = await res.json();
      if (data.error || !data.signature) {
        throw new Error(data.error || "Failed to fetch signature");
      }

      // 2. Broadcast transaction with signature
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
            stringAsciiCV(runData.pathSvg.slice(0, 4096)),
            bufferCV(Buffer.from(data.signature, 'hex'))
          ],
          userSession, // Pass explicit userSession to avoid unauthorized errors
          onFinish: (data) => {
            console.log("Mint transaction broadcasted", data);
            resolve({ txId: data.txId });
          },
          onCancel: () => {
            reject(new Error("User cancelled minting"));
          }
        });
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
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
        userSession, // Pass explicit userSession to avoid unauthorized errors
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
