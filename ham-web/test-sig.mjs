import { tupleCV, uintCV, stringAsciiCV, principalCV, serializeCV, signMessageHashRsv } from '@stacks/transactions';
import { sha256 } from '@noble/hashes/sha256';

const tuple = tupleCV({
  'maze-id': uintCV(20260623),
  'time-ms': uintCV(15000),
  'attempts': uintCV(1),
  'path-svg': stringAsciiCV('M0,0'),
  'minter': principalCV('ST1K96254R3KP5TRT5N2X64FB12VMHX6MYT2VB8B1')
});

const buff = serializeCV(tuple);
const hash = sha256(buff);
const signature = signMessageHashRsv({ 
  messageHash: Buffer.from(hash).toString('hex'), 
  privateKey: '01'.repeat(32) 
});

console.log({ 
  hash: Buffer.from(hash).toString('hex'), 
  signature, 
  buff: Buffer.from(buff).toString('hex') 
});
