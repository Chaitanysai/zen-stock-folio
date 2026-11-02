/**
 * Broker-token sealing.
 *
 * AES-256-GCM with a random 96-bit IV and the owner's uid in the AAD, so a
 * ciphertext copied into another user's document cannot be decrypted for them.
 * The plaintext token is never logged, returned, or persisted anywhere else.
 */

const KEY_VERSION = 1;
const IV_BYTES = 12;

export class BrokerTokenKeyError extends Error {
  constructor(message = "Broker token key must be 32 base64-encoded bytes") {
    super(message);
    this.name = "BrokerTokenKeyError";
  }
}

const aadFor = (uid: string): Uint8Array => new TextEncoder().encode(`${uid}:indmoney:v1`);

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

// Locally typed rather than `KeyUsage`: neither the Workers nor the Node type
// definitions expose that name to this project's lib set.
type KeyUsage = "encrypt" | "decrypt";

const decodeKey = (keyBase64: string): Uint8Array => {
  if (typeof keyBase64 !== "string" || keyBase64 === "") throw new BrokerTokenKeyError();
  let raw: Uint8Array;
  try {
    raw = fromBase64(keyBase64);
  } catch {
    // Never fall back to a derived or truncated key: a short key silently
    // weakens (or splits) every stored ciphertext.
    throw new BrokerTokenKeyError();
  }
  if (raw.length !== 32) throw new BrokerTokenKeyError();
  return raw;
};

/**
 * Rejects unusable key material before any broker call. A key that is merely
 * present but malformed must fail closed here, or every request would reach the
 * broker and spend a daily unit before sealing throws.
 */
export const assertBrokerTokenKey = (keyBase64: string): void => {
  decodeKey(keyBase64);
};

const importKey = async (keyBase64: string, usage: KeyUsage): Promise<CryptoKey> => {
  const raw = decodeKey(keyBase64);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [usage]);
};

export interface SealedToken {
  ciphertext: string;
  iv: string;
  keyVersion: number;
}

export async function encryptBrokerToken(
  token: string,
  uid: string,
  keyBase64: string,
): Promise<SealedToken> {
  const key = await importKey(keyBase64, "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aadFor(uid) },
    key,
    new TextEncoder().encode(token),
  );
  return {
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
    keyVersion: KEY_VERSION,
  };
}

export async function decryptBrokerToken(
  sealed: { ciphertext: string; iv: string; keyVersion: number },
  uid: string,
  keyBase64: string,
): Promise<string> {
  if (sealed.keyVersion !== KEY_VERSION) throw new Error("Unsupported broker token key version");
  const key = await importKey(keyBase64, "decrypt");
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(sealed.iv), additionalData: aadFor(uid) },
      key,
      fromBase64(sealed.ciphertext),
    );
  } catch {
    // WebCrypto errors are already opaque, but a single fixed message makes it
    // impossible for a future change to surface ciphertext, key, or plaintext.
    throw new Error("Broker token could not be decrypted");
  }
  return new TextDecoder().decode(plaintext);
}
