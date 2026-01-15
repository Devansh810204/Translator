const selfsigned = require('selfsigned');
const fs = require('fs');

// Generate self-signed certificate
const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = selfsigned.generate(attrs, { days: 365 });

// Write certificate files
fs.writeFileSync('server.key', pems.privateKey);
fs.writeFileSync('server.cert', pems.cert);

console.log('SSL certificates generated successfully!');
console.log('server.key and server.cert created');
