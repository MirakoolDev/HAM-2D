import { useCallback, useEffect, useRef } from 'react';
import { MEGAETH_WS_URL } from '@/lib/megaeth';

export interface MintEvent {
  tokenId: bigint;
  mazeId: bigint;
  minter: string;
  timeMs: bigint;
}

// ABI topic for: MintResult(uint256 indexed tokenId, uint256 indexed mazeId, address minter, uint256 timeMs)
const MINT_TOPIC = '0x' + /* keccak256 of the event sig — placeholder until contract deployed */
  'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

/**
 * Subscribes to MegaETH miniblock stream via WebSocket.
 * Fires onMint callback in ~10ms when a MintResult event lands.
 */
export function useMiniBlockMints(
  contractAddress: string | undefined,
  onMint: (event: MintEvent) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMintRef = useRef(onMint);
  onMintRef.current = onMint;

  useEffect(() => {
    if (!contractAddress) return;

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let subId: string | null = null;

    const connect = () => {
      ws = new WebSocket(MEGAETH_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        // Subscribe to miniblocks
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_subscribe',
          params: ['miniBlocks'],
        }));
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);

          // Capture subscription ID
          if (data.id === 1 && data.result) {
            subId = data.result;
            return;
          }

          // Filter subscription events
          if (data.method !== 'eth_subscription') return;
          const block = data.params?.result;
          if (!block?.logs) return;

          for (const log of block.logs) {
            if (
              log.address?.toLowerCase() !== contractAddress.toLowerCase() ||
              log.topics?.[0]?.toLowerCase() !== MINT_TOPIC.toLowerCase()
            ) continue;

            const tokenId = BigInt(log.topics[1] ?? '0x0');
            const mazeId  = BigInt(log.topics[2] ?? '0x0');
            const minter  = '0x' + (log.topics[3] ?? '').slice(26);
            const timeMs  = BigInt(log.data ?? '0x0');

            onMintRef.current({ tokenId, mazeId, minter, timeMs });
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [contractAddress]);
}
