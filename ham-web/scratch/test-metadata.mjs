import fetch from 'node-fetch';

async function test() {
  const res = await fetch('http://localhost:3000/api/metadata/1');
  const data = await res.json();
  console.log(data);
}
test();
