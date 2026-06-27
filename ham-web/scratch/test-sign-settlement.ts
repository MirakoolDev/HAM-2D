import fetch from 'node-fetch';

async function test() {
  const res = await fetch('http://localhost:3000/api/sign-settlement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mazeId: 20260625, network: 'testnet' })
  });
  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', data);
}
test();
