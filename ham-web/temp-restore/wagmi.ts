import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { megaEth } from '@/lib/megaeth';

// Get a free projectId at https://cloud.walletconnect.com
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'PLACEHOLDER_DEV_ID';

export const wagmiConfig = getDefaultConfig({
  appName: 'HAM Maze',
  projectId,
  chains: [megaEth],
  transports: {
    [megaEth.id]: http('https://mainnet.megaeth.com/rpc'),
  },
  ssr: true,
});
