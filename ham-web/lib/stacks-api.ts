export async function checkHasToken(address: string, contractAddress: string, isTestnet: boolean = true): Promise<boolean> {
  if (!contractAddress) return false;
  
  const baseUrl = isTestnet ? 'https://api.testnet.hiro.so' : 'https://api.hiro.so';
  const url = `${baseUrl}/extended/v1/address/${address}/balances`;

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
