const https = require('https');
const fs = require('fs');

const configPath = 'C:\\Users\\ahash\\.config\\configstore\\firebase-tools.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const accessToken = config.tokens.access_token;

console.log("Testing access token...");

const options = {
  hostname: 'firestore.googleapis.com',
  path: '/v1/projects/crisisnexus-bf9fc/databases/(default)/documents/crises?pageSize=1',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Body: ${data.substring(0, 300)}`);
  });
});

req.on('error', console.error);
req.end();
