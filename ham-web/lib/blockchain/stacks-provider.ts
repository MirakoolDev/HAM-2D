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
export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_STACKS_CONTRACT_ADDRESS || "ST1K96254R3KP5TRT5N2X64FB12VMHX6MYT2VB8B1";
export const CONTRACT_NAME = process.env.NEXT_PUBLIC_STACKS_CONTRACT_NAME || "ham-maze-v3";

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

  async isMazeSettled(mazeId: number) {
    try {
      const sender = this.getAddress() || CONTRACT_ADDRESS;
      const response = await fetchCallReadOnlyFunction({
        network,
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'is-maze-settled',
        functionArgs: [uintCV(mazeId)],
        senderAddress: sender,
      });
      return cvToValue(response);
    } catch (e) {
      console.error("Failed to check if settled:", e);
      return false;
    }
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
    // We now use /api/leaderboard on the frontend instead of stacks-provider
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
          pathSvg: runData.pathSvg.slice(0, 4096),
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
            bufferCV(new Uint8Array(data.signature.match(/.{1,2}/g).map((b: string) => parseInt(b, 16))))
          ],
          postConditionMode: 1, // PostConditionMode.Allow (1)
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

  async settleMaze(mazeId: number) {
    try {
      // 1. Fetch ECDSA signature and winners from backend
      const res = await fetch('/api/sign-settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mazeId,
          network: network === STACKS_TESTNET ? 'testnet' : 'mainnet'
        }),
      });
      const data = await res.json();
      if (data.error || !data.signature) {
        throw new Error(data.error || "Failed to fetch settlement signature");
      }

      const winners: string[] = data.winners;
      const signatureHex = data.signature;

      // Create a list of up to 10 principals
      const winnerPrincipals = winners.slice(0, 10).map(w => principalCV(w));
      
      return new Promise<{ txId: string }>((resolve, reject) => {
        openContractCall({
          network,
          contractAddress: CONTRACT_ADDRESS,
          contractName: CONTRACT_NAME,
          functionName: 'settle-maze',
          functionArgs: [
            uintCV(mazeId),
            listCV(winnerPrincipals),
            bufferCV(new Uint8Array(signatureHex.match(/.{1,2}/g).map((b: string) => parseInt(b, 16))))
          ],
          userSession,
          onFinish: (data) => {
            console.log("Settle transaction broadcasted", data);
            resolve({ txId: data.txId });
          },
          onCancel: () => {
            reject(new Error("User cancelled settlement"));
          }
        });
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
