// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { buildSyntheticFixture, type SyntheticFixture } from "./fixture";

/**
 * Password-hash compatibility test for Firebase `importUsers` with
 * Supabase/GoTrue-style bcrypt hashes.
 *
 * Everything here is synthetic: a fixture password, a locally computed
 * bcrypt hash, an example.test address, and a demo-* emulator project. No
 * real hash or user record ever leaves this machine.
 *
 * VERIFIED HERE (auth emulator):
 *  - the real Admin `importUsers` API accepts a GoTrue-format bcrypt hash
 *    ($2a$…) with { algorithm: "BCRYPT" } and reports zero errors — the API
 *    boundary validates the hash format;
 *  - the imported user is retrievable with email + emailVerified intact.
 *
 * NOT VERIFIABLE ON ANY AUTH EMULATOR (firebase-tools 13.29, 14.11, 15.34
 * all reproduce it — see the skipped round-trip test): the client-facing
 * sign-in path does not see users created via importUsers
 * (EMAIL_NOT_FOUND despite admin listUsers returning the account). The
 * password round-trip must therefore be verified with a synthetic account
 * against a staging project in Phase 5 before any real import. Until then,
 * password preservation is API-accepted but NOT end-to-end proven, and the
 * password-reset fallback remains the documented plan B.
 *
 * Run with: npm run test:migration
 * Skips itself when the auth emulator is not wired up.
 */

const emulatorUp = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const d = emulatorUp ? describe : describe.skip;

const PROJECT_ID = "demo-zenfolio-auth";
let fixture: SyntheticFixture;

d("auth importUsers bcrypt compatibility (emulator)", () => {
  beforeAll(() => {
    fixture = buildSyntheticFixture((password) => bcrypt.hashSync(password, 10));
  });

  it("imports a GoTrue-style bcrypt hash without errors and preserves the account shape", async () => {
    if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
    const auth = getAuth();

    const [syntheticUser] = fixture.users;
    const importRequest = {
      uid: "fixture_fb_user_1",
      email: syntheticUser.email,
      // GoTrue stores bcrypt ($2a$…) — exactly the format this fixture holds.
      passwordHash: Buffer.from(syntheticUser.passwordHash, "utf8"),
      emailVerified: syntheticUser.confirmed,
    };

    // The real Admin importUsers API against the emulator.
    const result = await auth.importUsers([importRequest], {
      hash: { algorithm: "BCRYPT" },
    });

    expect(result.errors).toEqual([]);
    const imported = await auth.getUser(importRequest.uid);
    expect(imported.email).toBe(syntheticUser.email);
    expect(imported.emailVerified).toBe(true);
    expect(imported.passwordHash).toBeDefined();
  });

  // KNOWN EMULATOR GAP (reproduced on firebase-tools 13.29.2, 14.11.0 and
  // 15.34.1): users created via importUsers are visible to the Admin SDK but
  // EMAIL_NOT_FOUND on the client sign-in path. Verification plan: synthetic
  // account + importUsers against the staging project in Phase 5.
  it.skip("authenticates with the original password after import (blocked by auth-emulator importUsers/sign-in integration gap)", async () => {
    expect(true).toBe(true);
  });
});
