import { describe, expect, it } from "vitest";
import {
  credentialEncryptionReady,
  decryptCredentials,
  encryptCredentials,
  type CredentialContext,
} from "./crypto.ts";
import { BrokerError } from "./errors.ts";
import { base64Key, brokerEnv } from "./testKit.ts";

const context: CredentialContext = {
  uid: "user-1",
  connectionId: "conn-1",
  provider: "zerodha",
};

const bundle = { apiKey: "key-1234", apiSecret: "secret-5678", accessToken: "token-9999" };
const nowIso = "2026-10-28T00:00:00.000Z";

const expectBrokerError = async (work: Promise<unknown>, code: string) => {
  const caught = await work.then(
    () => null,
    (error: unknown) => error,
  );
  expect(caught).toBeInstanceOf(BrokerError);
  expect(caught).toMatchObject({ code });
};

describe("broker credential encryption", () => {
  it("round-trips a credential bundle", async () => {
    const env = brokerEnv();
    const envelope = await encryptCredentials(env, context, bundle);

    expect(envelope.v).toBe(1);
    expect(envelope.ct).not.toContain("secret-5678");
    expect(await decryptCredentials(env, context, envelope)).toEqual(bundle);
  });

  it("binds the envelope to uid, connection and provider via AAD", async () => {
    const env = brokerEnv();
    const envelope = await encryptCredentials(env, context, bundle);

    await expectBrokerError(
      decryptCredentials(env, { ...context, uid: "user-2" }, envelope),
      "internal_error",
    );
    await expectBrokerError(
      decryptCredentials(env, { ...context, connectionId: "conn-2" }, envelope),
      "internal_error",
    );
    await expectBrokerError(
      decryptCredentials(env, { ...context, provider: "groww" }, envelope),
      "internal_error",
    );
  });

  it("rejects a tampered ciphertext", async () => {
    const env = brokerEnv();
    const envelope = await encryptCredentials(env, context, bundle);
    const bytes = atob(envelope.ct).split("");
    bytes[0] = String.fromCharCode(bytes[0].charCodeAt(0) ^ 0xff);

    await expectBrokerError(
      decryptCredentials(env, context, { ...envelope, ct: btoa(bytes.join("")) }),
      "internal_error",
    );
  });

  it("uses the highest key version and honours an explicit active version", async () => {
    const env = brokerEnv({ BROKER_CREDENTIALS_KEYS: JSON.stringify({ "1": base64Key(), "2": base64Key() }) });
    const v2 = await encryptCredentials(env, context, bundle);
    expect(v2.v).toBe(2);

    const pinned = brokerEnv({
      BROKER_CREDENTIALS_KEYS: JSON.stringify({ "1": base64Key(), "2": base64Key() }),
      BROKER_CREDENTIALS_ACTIVE_KEY_VERSION: "1",
    });
    expect((await encryptCredentials(pinned, context, bundle)).v).toBe(1);

    // An envelope encrypted under version 2 must still decrypt with both keys present.
    expect(await decryptCredentials(env, context, v2)).toEqual(bundle);
  });

  it("fails closed when the key set is missing, malformed or lacks the envelope version", async () => {
    await expectBrokerError(
      encryptCredentials(brokerEnv({ BROKER_CREDENTIALS_KEYS: undefined }), context, bundle),
      "setup_required",
    );

    expect(await credentialEncryptionReady(brokerEnv({ BROKER_CREDENTIALS_KEYS: "{not-json" }))).toBe(false);
    expect(
      await credentialEncryptionReady(
        brokerEnv({ BROKER_CREDENTIALS_KEYS: JSON.stringify({ "1": btoa("too-short") }) }),
      ),
    ).toBe(false);
    expect(
      await credentialEncryptionReady(
        brokerEnv({
          BROKER_CREDENTIALS_KEYS: JSON.stringify({ "1": base64Key() }),
          BROKER_CREDENTIALS_ACTIVE_KEY_VERSION: "7",
        }),
      ),
    ).toBe(false);

    const older = await encryptCredentials(
      brokerEnv({ BROKER_CREDENTIALS_KEYS: JSON.stringify({ "1": base64Key() }) }),
      context,
      bundle,
    );
    const onlyV2 = brokerEnv({ BROKER_CREDENTIALS_KEYS: JSON.stringify({ "2": base64Key() }) });
    await expectBrokerError(decryptCredentials(onlyV2, context, older), "setup_required");
  });

  it("rejects a malformed envelope before touching the key set", async () => {
    const env = brokerEnv();
    await expectBrokerError(
      decryptCredentials(env, context, {
        v: 1,
        iv: 4 as unknown as string,
        ct: "x",
        createdAt: nowIso,
      }),
      "internal_error",
    );
  });
});
