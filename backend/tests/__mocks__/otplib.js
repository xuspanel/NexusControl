module.exports = {
  verifySync: () => ({ valid: true }),
  generateSecret: () => 'JBSWY3DPEHPK3PXP',
  generateURI: ({ secret, label, issuer }) => `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}`
};

