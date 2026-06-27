import { principalCV } from '@stacks/transactions';

try {
  principalCV('st1k96254r3kp5trt5n2x64fb12vmhx6myt2vb8b1');
  console.log('Success with lowercase');
} catch (e: any) {
  console.error('Error with lowercase:', e.message);
}

try {
  principalCV('ST1K96254R3KP5TRT5N2X64FB12VMHX6MYT2VB8B1');
  console.log('Success with uppercase');
} catch (e: any) {
  console.error('Error with uppercase:', e.message);
}
