import { tupleCV, uintCV, serializeCV } from '@stacks/transactions';
const payloadCV = tupleCV({ 'maze-id': uintCV(1) });
const serializedBytes = serializeCV(payloadCV);
console.log('typeof serializedBytes:', typeof serializedBytes);
console.log('serializedBytes:', serializedBytes);
