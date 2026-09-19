#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const otplibPath = path.resolve(__dirname, '../backend/node_modules/otplib');
const qrcodePath = path.resolve(__dirname, '../backend/node_modules/qrcode');
const { generateSecret, generateURI } = require(otplibPath);
const qrcode = require(qrcodePath);

const envPath = path.resolve(__dirname, '../.env');

// Read existing .env
let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
}

// Check for existing TOTP_SECRET
const existingSecretMatch = envContent.match(/TOTP_SECRET=([A-Z0-9]+)/);
const forceNew = process.argv.includes('--force') || process.argv.includes('-f');

let secret = '';
if (existingSecretMatch && !forceNew) {
  secret = existingSecretMatch[1];
  console.log('\n[!] Found existing TOTP_SECRET in .env. Use --force to regenerate a new one.\n');
} else {
  secret = generateSecret();
  if (existingSecretMatch) {
    envContent = envContent.replace(/TOTP_SECRET=[A-Z0-9]+/, `TOTP_SECRET=${secret}`);
  } else {
    envContent = envContent.trim() + `\nTOTP_SECRET=${secret}\n`;
  }
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('\n[+] Generated and saved new TOTP_SECRET to /opt/NexusControl/.env\n');
}

// Get admin email from .env or fallback
const emailMatch = envContent.match(/ADMIN_EMAIL=([^\s]+)/);
const adminEmail = emailMatch ? emailMatch[1] : 'admin@xus.me';

const otpUri = generateURI({
  secret,
  label: adminEmail,
  issuer: 'NexusControl'
});

console.log('================================================================');
console.log('         NexusControl Multi-Factor Authentication Setup         ');
console.log('================================================================');
console.log(`Administrator Email: ${adminEmail}`);
console.log(`Base32 Secret Key  : ${secret}`);
console.log(`Key URI            : ${otpUri}`);
console.log('----------------------------------------------------------------');
console.log('Scan the QR Code below with Google Authenticator, 1Password, or Authy:');
console.log('----------------------------------------------------------------\n');

qrcode.toString(otpUri, { type: 'terminal', small: true }, (err, qr) => {
  if (err) {
    console.error('Error rendering QR code:', err);
  } else {
    console.log(qr);
  }
  console.log('----------------------------------------------------------------');
  console.log('If you cannot scan the QR code, manually enter the Base32 key:');
  console.log(`  KEY: ${secret}`);
  console.log('  TYPE: Time-based (TOTP), 6 digits, 30s interval');
  console.log('================================================================\n');
});
