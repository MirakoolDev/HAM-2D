import { getAddressFromPublicKey } from '@stacks/transactions';

console.log('Testnet:', getAddressFromPublicKey('03b30bd39e4a36b568d71d3e2db7159c40da79313ea59b85434cf93f932e650b44', 'testnet'));
console.log('Stacks-testnet:', getAddressFromPublicKey('03b30bd39e4a36b568d71d3e2db7159c40da79313ea59b85434cf93f932e650b44', 'stacks-testnet' as any));
