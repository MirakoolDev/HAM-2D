import type { AppConfig as AppConfigType, UserSession as UserSessionType } from '@stacks/connect';

// Wrap in getter to prevent Turbopack SSR module instantiation crashes
let userSessionInstance: UserSessionType | null = null;
export const getUserSession = () => {
  if (typeof window === 'undefined') return {} as UserSessionType;
  if (!userSessionInstance) {
    const { AppConfig, UserSession } = require('@stacks/connect');
    const appConfig = new AppConfig(['store_write']);
    userSessionInstance = new UserSession({ appConfig });
  }
  return userSessionInstance;
};

// Export userSession as a proxy to maintain backward compatibility
export const userSession = new Proxy({}, {
  get(target, prop) {
    const session = getUserSession();
    const value = (session as any)[prop];
    if (typeof value === 'function') {
      return value.bind(session);
    }
    return value;
  }
}) as UserSessionType;

import { uintCV, stringAsciiCV, fetchCallReadOnlyFunction, cvToValue, listCV, principalCV, bufferCV, Pc, PostConditionMode } from '@stacks/transactions';
import { IBlockchainProvider, RunData } from './interface';
import { STACKS_MOCKNET, STACKS_TESTNET, STACKS_MAINNET } from '@stacks/network';

// The contract was deployed to Mainnet (SP... address)
export const network = STACKS_MAINNET;

// Define the contract address and name
export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_STACKS_CONTRACT_ADDRESS || "SP1K96254R3KP5TRT5N2X64FB12VMHX6MYS0BQGYQ";
export const CONTRACT_NAME = process.env.NEXT_PUBLIC_STACKS_CONTRACT_NAME || "ham-maze-v4";

import { authenticate, openContractCall } from '@stacks/connect';

export class StacksGameService implements IBlockchainProvider {
  async init() {
    if (userSession.isSignInPending()) {
      await userSession.handlePendingSignIn();
    }
  }

  async connectWallet() {
    return new Promise<void>(async (resolve, reject) => {
      authenticate({
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
      if (network === STACKS_MAINNET) {
        return userData.profile.stxAddress.mainnet;
      }
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
      return cvToValue(response).toString();
    } catch (e) {
      console.error("Failed to get prize pool:", e);
      return "0";
    }
  }

  async getMintFee() {
    try {
      const baseUrl = network === STACKS_MAINNET ? 'https://api.hiro.so' : 'https://api.testnet.hiro.so';
      const url = `${baseUrl}/v2/data_var/${CONTRACT_ADDRESS}/${CONTRACT_NAME}/mint-fee`;
      const response = await fetch(url);
      const json = await response.json();
      if (json.data) {
        // json.data is a hex string like 0x01000000...0f4240 (uintCV)
        const hex = json.data.startsWith('0x') ? json.data.slice(2) : json.data;
        // The last 32 hex chars (16 bytes) represent the uint value
        const valHex = hex.slice(-32);
        return parseInt(valHex, 16).toString();
      }
      return "1000000";
    } catch (e) {
      console.error("Failed to get mint fee:", e);
      return "1000000"; // default 1 STX in microSTX
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
          pathSvg: runData.pathSvg
        }),
      });
      const data = await res.json();
      if (data.error || !data.signature) {
        throw new Error(data.error || "Failed to fetch signature");
      }

      // 2. Prepare exact STX transfer post-condition
      const feeAmount = await this.getMintFee();
      const postCondition = Pc.principal(address).willSendEq(feeAmount).ustx();

      // 3. Broadcast transaction with signature
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
            stringAsciiCV(runData.pathSvg.slice(0, 2048)),
            stringAsciiCV(data.ipfsUri),
            bufferCV(new Uint8Array(data.signature.match(/.{1,2}/g).map((b: string) => parseInt(b, 16))))
          ],
          postConditionMode: PostConditionMode.Deny, // strict post-conditions
          postConditions: [postCondition],
          fee: 10000, // Hardcode fee to avoid FeeTooLow error on large SVG payloads
          userSession, // Pass explicit userSession to avoid unauthorized errors
          onFinish: (data: any) => {
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
          postConditionMode: PostConditionMode.Deny,
          postConditions: [
            Pc.principal(`${CONTRACT_ADDRESS}.${CONTRACT_NAME}`).willSendGte(0).ustx()
          ],
          userSession,
          onFinish: (data: any) => {
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
