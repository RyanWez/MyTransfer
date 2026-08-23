const { authenticator } = require('otplib');
const qrcode = require('qrcode-terminal');

const secret = authenticator.generateSecret();
const token = authenticator.generate(secret);
const otpauth = authenticator.keyuri('Operator', 'MyShare', secret);

console.log('\n=== Google Authenticator Setup ===\n');
console.log('1. Add this secret to your .env file as:');
console.log(`   AUTH_TOTP_SECRET=${secret}\n`);
console.log('2. Scan the QR code below using the Google Authenticator app:');

qrcode.generate(otpauth, { small: true });

console.log('\nIf you cannot scan the QR code, manually enter the setup key:');
console.log(secret);
console.log('\n==================================\n');
