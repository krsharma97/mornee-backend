import crypto from 'crypto';

const secretSeed = process.env.SETTINGS_SECRET || process.env.JWT_SECRET || 'mornee-local-secret';
const key = crypto.createHash('sha256').update(secretSeed).digest();

export const encryptSecret = (value) => {
  if (!value) {
    return '';
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64')
  ].join(':');
};

export const decryptSecret = (payload) => {
  if (!payload) {
    return '';
  }

  try {
    const [ivBase64, tagBase64, encryptedBase64] = String(payload).split(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivBase64, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, 'base64')),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Secret decryption failed:', error);
    return '';
  }
};
