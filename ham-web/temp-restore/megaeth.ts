import { type Chain } from 'viem';

export const megaEth: Chain = {
  id: 4326,
  name: 'MegaETH',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://mainnet.megaeth.com/rpc'],
      webSocket: ['wss://mainnet.megaeth.com/ws'],
    },
  },
  blockExplorers: {
    default: {
      name: 'MegaETH Explorer',
      url: 'https://megaeth.com',
    },
  },
};

export const MEGAETH_WS_URL = 'wss://mainnet.megaeth.com/ws';
