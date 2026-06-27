import { c32addressDecode, c32address } from 'c32check';

const testnetAddr = 'ST1K96254R3KP5TRT5N2X64FB12VMHX6MYT2VB8B1';
const decoded = c32addressDecode(testnetAddr);
console.log('Decoded:', decoded);
const mainnetAddr = c32address(22, decoded[1]);
console.log('Mainnet:', mainnetAddr);
