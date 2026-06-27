import { c32addressDecode, c32address } from 'c32check';

export async function checkHasToken(address: string, contractAddress: string, isTestnet: boolean = true): Promise<boolean> {
  if (!contractAddress) return false;

  // Auto-detect if the booster contract is on Mainnet
  const isMainnetContract = contractAddress.toUpperCase().startsWith('SP');
  const baseUrl = isMainnetContract ? 'https://api.hiro.so' : (isTestnet ? 'https://api.testnet.hiro.so' : 'https://api.hiro.so');
  
  let targetAddress = address;
  if (isMainnetContract && address.toUpperCase().startsWith('ST')) {
    try {
      // Convert ST address to SP address to check mainnet balances
      const decoded = c32addressDecode(address.toUpperCase());
      targetAddress = c32address(22, decoded[1]);
    } catch (e) {
      console.error("Failed to convert ST address to SP", e);
    }
  }

  const url = `${baseUrl}/extended/v1/address/${targetAddress}/balances`;

  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const data = await res.json();

    // Check non_fungible_tokens
    const nftBalances = data.non_fungible_tokens || {};
    for (const key of Object.keys(nftBalances)) {
      if (key.includes(contractAddress) && parseInt(nftBalances[key].count) > 0) {
        return true;
      }
    }

    // Check fungible_tokens
    const ftBalances = data.fungible_tokens || {};
    for (const key of Object.keys(ftBalances)) {
      if (key.includes(contractAddress) && BigInt(ftBalances[key].balance) > 0n) {
        return true;
      }
    }

    return false;
  } catch (err) {
    console.error("Error fetching stacks balances:", err);
    return false;
  }
}

import { hexToCV, cvToValue } from '@stacks/transactions';

export async function getCurrentOwner(tokenId: number, isTestnet: boolean = true): Promise<string | null> {
  const baseUrl = isTestnet ? 'https://api.testnet.hiro.so' : 'https://api.hiro.so';
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "ST1K96254R3KP5TRT5N2X64FB12VMHX6MYT2VB8B1";
  const contractName = "ham-maze-v3";

  // Format token_id as a uint CV in hex (e.g. 0x01...01)
  const hexValue = tokenId.toString(16).padStart(32, '0');
  const argHex = `01${hexValue}`;

  try {
    const res = await fetch(`${baseUrl}/v2/contracts/call-read/${contractAddress}/${contractName}/get-owner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: contractAddress,
        arguments: [argHex]
      })
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (data.okay && data.result) {
      const cv = hexToCV(data.result);
      const val = cvToValue(cv);
      // val will be { value: 'ST...' } if (ok (some owner))
      // or null if (ok none)
      if (val && val.value && val.value.value) {
        return val.value.value;
      }
      if (val && val.value && typeof val.value === 'string') {
        return val.value;
      }
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}
