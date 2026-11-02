// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { serverTimestamp } from "firebase/firestore";

/**
 * Firestore security-rule verification against the local emulator.
 *
 * Run with:  npm run test:rules
 * (which wraps the suite in `firebase emulators:exec --only firestore`).
 * Without a running emulator the suite skips itself so `npm run test`
 * stays green on machines without the emulator.
 */

const emulatorUp = await fetch("http://localhost:4400/emulators", {
  signal: AbortSignal.timeout(1500),
})
  .then((r) => r.ok)
  .catch(() => false);

const d = emulatorUp ? describe : describe.skip;

const ALICE = "alice-uid-1";
const BOB = "bob-uid-2";

const rules = readFileSync("firestore.rules", "utf8");
let testEnv: RulesTestEnvironment;

const authed = (uid: string) => testEnv.authenticatedContext(uid).firestore();
const unauthed = () => testEnv.unauthenticatedContext().firestore();

const portfolioShape = {
  uid: ALICE,
  snapshot: { stocks: [{ ticker: "RELIANCE" }], trades: [], watchlist: [], alerts: [], fnoTrades: [] },
};

d("firestore.rules — portfolios/{uid}", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-zenfolio-rules",
      firestore: { rules },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("lets an owner create, read, update and delete their own snapshot", async () => {
    const alice = authed(ALICE);

    await assertSucceeds(
      alice.doc(`portfolios/${ALICE}`).set({ ...portfolioShape, snapshot: { stocks: [], trades: [], watchlist: [], alerts: [], fnoTrades: [] } }),
    );
    await assertSucceeds(alice.doc(`portfolios/${ALICE}`).get());

    await assertSucceeds(
      alice
        .doc(`portfolios/${ALICE}`)
        .update({ snapshot: portfolioShape.snapshot, uid: ALICE }),
    );
    await assertSucceeds(alice.doc(`portfolios/${ALICE}`).delete());
  });

  it("denies another authenticated user reading or writing the snapshot", async () => {
    const bob = authed(BOB);
    await assertSucceeds(
      authed(ALICE).doc(`portfolios/${ALICE}`).set(portfolioShape),
    );

    await assertFails(bob.doc(`portfolios/${ALICE}`).get());
    await assertFails(bob.doc(`portfolios/${ALICE}`).set({ ...portfolioShape, uid: BOB }));
    await assertFails(bob.doc(`portfolios/${ALICE}`).update({ snapshot: {} }));
    await assertFails(bob.doc(`portfolios/${ALICE}`).delete());
  });

  it("denies unauthenticated access", async () => {
    const anon = unauthed();
    await assertFails(anon.doc(`portfolios/${ALICE}`).get());
    await assertFails(anon.doc(`portfolios/${ALICE}`).set(portfolioShape));
  });

  it("rejects create/update when the payload uid does not match the document id (WITH CHECK analogue)", async () => {
    const alice = authed(ALICE);
    await assertFails(alice.doc(`portfolios/${ALICE}`).set({ ...portfolioShape, uid: BOB }));
    await assertFails(
      alice.doc(`portfolios/${ALICE}`).set(portfolioShape).then(() =>
        alice.doc(`portfolios/${ALICE}`).update({ uid: BOB }),
      ),
    );
  });

  it("denies writes that omit the uid field entirely", async () => {
    const alice = authed(ALICE);
    const { uid: _uid, ...withoutUid } = portfolioShape;
    await assertFails(alice.doc(`portfolios/${ALICE}`).set(withoutUid));
  });

  it("rejects unknown top-level fields, so a client cannot drift the schema", async () => {
    const alice = authed(ALICE);
    await assertFails(
      alice.doc(`portfolios/${ALICE}`).set({ ...portfolioShape, role: "admin" }),
    );
  });

  it("rejects a snapshot whose arrays exceed the storage bounds", async () => {
    const alice = authed(ALICE);
    const oversized = Array.from({ length: 1001 }, (_, i) => ({ ticker: `S${i}` }));
    await assertFails(
      alice.doc(`portfolios/${ALICE}`).set({
        uid: ALICE,
        snapshot: {
          stocks: oversized,
          trades: [],
          watchlist: [],
          alerts: [],
          fnoTrades: [],
        },
      }),
    );
  });

  it("bounds the execution ledger at 10000 fills", async () => {
    const alice = authed(ALICE);
    const base = { stocks: [], trades: [], watchlist: [], alerts: [], fnoTrades: [] };
    const fills = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ id: `indmoney:${index}` }));

    await assertSucceeds(
      alice.doc(`portfolios/${ALICE}`).set({
        uid: ALICE,
        snapshot: { ...base, executions: fills(10000) },
      }),
    );

    await assertFails(
      alice.doc(`portfolios/${ALICE}`).set({
        uid: ALICE,
        snapshot: { ...base, executions: fills(10001) },
      }),
    );
  }, 30000);
});

d("firestore.rules — users/{uid}", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-zenfolio-rules",
      firestore: { rules },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("lets an owner write and read their own profile", async () => {
    const alice = authed(ALICE);
    await assertSucceeds(
      alice.doc(`users/${ALICE}`).set({ uid: ALICE, displayName: "Alice" }),
    );
    await assertSucceeds(alice.doc(`users/${ALICE}`).get());
  });

  it("denies another user and unauthenticated access to a profile", async () => {
    await assertSucceeds(
      authed(ALICE).doc(`users/${ALICE}`).set({ uid: ALICE, displayName: "Alice" }),
    );

    await assertFails(authed(BOB).doc(`users/${ALICE}`).get());
    await assertFails(
      authed(BOB).doc(`users/${ALICE}`).set({ uid: BOB, displayName: "Hijacked" }),
    );
    await assertFails(unauthed().doc(`users/${ALICE}`).get());
  });

  it("rejects an over-long displayName and unknown profile fields", async () => {
    const alice = authed(ALICE);
    await assertFails(
      alice.doc(`users/${ALICE}`).set({ uid: ALICE, displayName: "x".repeat(101) }),
    );
    await assertFails(
      alice.doc(`users/${ALICE}`).set({ uid: ALICE, displayName: "Alice", isAdmin: true }),
    );
  });
});

d("firestore.rules — users/{uid}/private/brokerConnection", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-zenfolio-rules",
      firestore: { rules },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  const path = () => `users/${ALICE}/private/brokerConnection`;
  const connection = {
    uid: ALICE,
    provider: "indmoney",
    ciphertext: "ciphertext-material",
    iv: "initialization-vector",
    keyVersion: 1,
    expiresAt: "2026-11-02T00:00:00.000Z",
    syncedAt: null,
    updatedAt: new Date(),
  };

  it("lets an owner create, read, update, and delete the sealed connection", async () => {
    const alice = authed(ALICE);

    await assertSucceeds(alice.doc(path()).set(connection));
    await assertSucceeds(alice.doc(path()).get());
    await assertSucceeds(
      alice.doc(path()).update({ syncedAt: "2026-11-01T01:00:00.000Z", updatedAt: new Date() }),
    );
    await assertSucceeds(alice.doc(path()).delete());
  });

  it("accepts the browser's serverTimestamp() writes", async () => {
    const alice = authed(ALICE);

    await assertSucceeds(
      alice.doc(path()).set({ ...connection, updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(
      alice.doc(path()).update({
        syncedAt: "2026-11-01T01:00:00.000Z",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("denies another user and unauthenticated access", async () => {
    await assertSucceeds(authed(ALICE).doc(path()).set(connection));

    await assertFails(authed(BOB).doc(path()).get());
    await assertFails(authed(BOB).doc(path()).set({ ...connection, uid: BOB }));
    await assertFails(authed(BOB).doc(path()).delete());
    await assertFails(unauthed().doc(path()).get());
  });

  it("rejects forged ownership and anything outside the field allowlist", async () => {
    const alice = authed(ALICE);

    await assertFails(alice.doc(path()).set({ ...connection, uid: BOB }));
    await assertFails(alice.doc(path()).set({ ...connection, provider: "other" }));
    await assertFails(alice.doc(path()).set({ ...connection, plaintextToken: "tok_123" }));
    await assertFails(alice.doc(path()).set({ ...connection, keyVersion: 2 }));
    await assertFails(alice.doc(path()).set({ ...connection, ciphertext: "" }));
    await assertFails(alice.doc(path()).set({ ...connection, ciphertext: "x".repeat(8193) }));
    await assertFails(alice.doc(path()).set({ ...connection, iv: "" }));
    await assertFails(alice.doc(path()).set({ ...connection, iv: "x".repeat(65) }));
    await assertFails(alice.doc(path()).set({ ...connection, syncedAt: 42 }));
  });

  it("refuses any other private document", async () => {
    await assertFails(
      authed(ALICE).doc(`users/${ALICE}/private/somethingElse`).set(connection),
    );
  });
});
