import { describe, expect, it } from "vitest";
import { BrokerTokenKeyError, decryptBrokerToken, encryptBrokerToken } from "./brokerToken";

// 32 zero bytes, base64. Test-only key; never used outside this suite.
const KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const UID = "user-1";
const TOKEN = "tok_1234567890abcdef";

describe("broker token sealing", () => {
  it("round-trips a token for the same user", async () => {
    const sealed = await encryptBrokerToken(TOKEN, UID, KEY);
    expect(sealed.keyVersion).toBe(1);
    expect(sealed.ciphertext).not.toContain("tok_");
    expect(await decryptBrokerToken(sealed, UID, KEY)).toBe(TOKEN);
  });

  it("uses a fresh IV per call", async () => {
    const a = await encryptBrokerToken(TOKEN, UID, KEY);
    const b = await encryptBrokerToken(TOKEN, UID, KEY);
    expect(a.iv).not.toBe(b.iv);
    // A fresh IV must also change the ciphertext, otherwise the IV is not
    // actually feeding the keystream.
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("binds the ciphertext to the owning uid", async () => {
    const sealed = await encryptBrokerToken(TOKEN, UID, KEY);
    await expect(decryptBrokerToken(sealed, "user-2", KEY)).rejects.toThrow();
  });

  it("rejects a tampered ciphertext and a wrong key length", async () => {
    const sealed = await encryptBrokerToken(TOKEN, UID, KEY);
    await expect(decryptBrokerToken({ ...sealed, ciphertext: sealed.ciphertext.slice(0, -4) + "AAAA" }, UID, KEY)).rejects.toThrow();
    await expect(encryptBrokerToken(TOKEN, UID, "short")).rejects.toThrow();
  });

  it("rejects an unknown key version", async () => {
    const sealed = await encryptBrokerToken(TOKEN, UID, KEY);
    await expect(decryptBrokerToken({ ...sealed, keyVersion: 2 }, UID, KEY)).rejects.toThrow();
  });

  it("fails closed on a malformed key and says nothing secret", async () => {
    const shortKey = btoa("a".repeat(24));
    await expect(encryptBrokerToken(TOKEN, UID, shortKey)).rejects.toBeInstanceOf(BrokerTokenKeyError);
    await expect(encryptBrokerToken(TOKEN, UID, "")).rejects.toBeInstanceOf(BrokerTokenKeyError);
    await expect(decryptBrokerToken({ ciphertext: "AAAA", iv: "AAAA", keyVersion: 1 }, UID, shortKey))
      .rejects.toBeInstanceOf(BrokerTokenKeyError);
  });

  it("does not leak the token, the key, or the plaintext when decryption fails", async () => {
    const sealed = await encryptBrokerToken(TOKEN, UID, KEY);
    const tampered = { ...sealed, ciphertext: sealed.ciphertext.slice(0, -4) + "AAAA" };

    const error = await decryptBrokerToken(tampered, UID, KEY).catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    const message = String((error as Error).message);
    expect(message).not.toContain(TOKEN);
    expect(message).not.toContain("tok_");
    expect(message).not.toContain(KEY);
  });
});
