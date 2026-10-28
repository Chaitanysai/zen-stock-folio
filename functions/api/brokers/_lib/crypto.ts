import type { BrokerProviderId } from "../../../../src/lib/brokers/contracts.ts";
import type { Env } from "../../_lib/types.ts";
import { BrokerError } from "./errors.ts";

/**
 * Credential encryption: AES-256-GCM via WebCrypto.
 *
 * `BROKER_CREDENTIALS_KEYS` is a JSON map of version -> base64 32-byte key.
 * Every envelope records the version used, so a new key can be introduced
 * without losing the ability to decrypt older records. There is deliberately
 * no plaintext fallback: a missing or malformed key set is `setup_required`.
 */

export interface CredentialBundle {
  apiKey: string;
  apiSecret: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface EncryptedCredentials {
  v: number;
  iv: string;
  ct: string;
  createdAt: string;
}

export interface CredentialContext {
  uid: string;
  connectionId: string;
  provider: BrokerProviderId;
}

const KEY_BYTES = 32;
const IV_BYTES = 12;
const AAD_PREFIX = "zenfolio-broker-credentials";

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const aadFor = (context: CredentialContext, version: number): Uint8Array =>
  new TextEncoder().encode(
    `${AAD_PREFIX}|${version}|${context.uid}|${context.connectionId}|${context.provider}`,
  );

const parseKeySet = async (
  env: Env,
): Promise<{ keys: Map<number, CryptoKey>; active: number }> => {
  const raw = env.BROKER_CREDENTIALS_KEYS;
  if (!raw) throw new BrokerError("setup_required", "BROKER_CREDENTIALS_KEYS is not set");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BrokerError("setup_required", "BROKER_CREDENTIALS_KEYS is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new BrokerError("setup_required", "BROKER_CREDENTIALS_KEYS must be an object");
  }

  const keys = new Map<number, CryptoKey>();
  for (const [versionText, encoded] of Object.entries(parsed as Record<string, unknown>)) {
    const version = Number(versionText);
    if (!Number.isInteger(version) || version < 1 || typeof encoded !== "string") {
      throw new BrokerError("setup_required", "BROKER_CREDENTIALS_KEYS has an invalid entry");
    }
    let bytes: Uint8Array;
    try {
      bytes = fromBase64(encoded);
    } catch {
      throw new BrokerError("setup_required", "BROKER_CREDENTIALS_KEYS has an invalid key");
    }
    if (bytes.length !== KEY_BYTES) {
      throw new BrokerError("setup_required", "BROKER_CREDENTIALS_KEYS key must be 32 bytes");
    }
    const key = await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
    keys.set(version, key);
  }

  if (keys.size === 0) {
    throw new BrokerError("setup_required", "BROKER_CREDENTIALS_KEYS is empty");
  }

  const requested = env.BROKER_CREDENTIALS_ACTIVE_KEY_VERSION
    ? Number(env.BROKER_CREDENTIALS_ACTIVE_KEY_VERSION)
    : Math.max(...keys.keys());
  if (!Number.isInteger(requested) || !keys.has(requested)) {
    throw new BrokerError("setup_required", "Active broker encryption key version is not configured");
  }
  return { keys, active: requested };
};

export const credentialEncryptionReady = async (env: Env): Promise<boolean> => {
  try {
    await parseKeySet(env);
    return true;
  } catch {
    return false;
  }
};

export const encryptCredentials = async (
  env: Env,
  context: CredentialContext,
  bundle: CredentialBundle,
): Promise<EncryptedCredentials> => {
  const { keys, active } = await parseKeySet(env);
  const key = keys.get(active)!;
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(bundle));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aadFor(context, active) },
    key,
    plaintext,
  );
  return {
    v: active,
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  };
};

export const decryptCredentials = async (
  env: Env,
  context: CredentialContext,
  envelope: EncryptedCredentials,
): Promise<CredentialBundle> => {
  if (
    !envelope ||
    !Number.isInteger(envelope.v) ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ct !== "string"
  ) {
    throw new BrokerError("internal_error", "Credential envelope is malformed");
  }

  const { keys } = await parseKeySet(env);
  const key = keys.get(envelope.v);
  if (!key) {
    throw new BrokerError("setup_required", "The encryption key that protects this connection is not configured");
  }

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(envelope.iv),
        additionalData: aadFor(context, envelope.v),
      },
      key,
      fromBase64(envelope.ct),
    );
  } catch {
    throw new BrokerError("internal_error", "Credential envelope could not be decrypted");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new BrokerError("internal_error", "Credential payload is malformed");
  }
  const bundle = parsed as Partial<CredentialBundle>;
  if (
    typeof bundle !== "object" ||
    bundle === null ||
    typeof bundle.apiKey !== "string" ||
    typeof bundle.apiSecret !== "string"
  ) {
    throw new BrokerError("internal_error", "Credential payload is incomplete");
  }
  return {
    apiKey: bundle.apiKey,
    apiSecret: bundle.apiSecret,
    ...(typeof bundle.accessToken === "string" ? { accessToken: bundle.accessToken } : {}),
    ...(typeof bundle.refreshToken === "string" ? { refreshToken: bundle.refreshToken } : {}),
  };
};
