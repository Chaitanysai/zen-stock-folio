/**
 * Fully SYNTHETIC migration fixtures.
 *
 * Every uid, email, hash, ticker, and portfolio value in this module is
 * invented (example.test addresses, sequential fixture uids). No value is
 * derived from the real Supabase backup — this fixture exists so the
 * importer can be developed and tested without touching any real record.
 */

export interface FixtureUser {
  supabaseUid: string;
  email: string;
  /** GoTrue-style bcrypt hash; only set for email/password users. */
  passwordHash?: string;
  confirmed: boolean;
  provider: "email" | "google";
}

export interface FixtureSnapshotRow {
  supabaseUid: string;
  snapshot: {
    stocks: Array<{
      ticker: string;
      stockName: string;
      sector: string;
      entryDate: string;
      entryPrice: number;
      cmp: number;
      quantity: number;
      status: string;
      weekHigh52: number;
      weekLow52: number;
    }>;
    trades: unknown[];
    watchlist: unknown[];
    alerts: unknown[];
    fnoTrades: unknown[];
  };
}

export interface FixtureProfileRow {
  supabaseUid: string;
  displayName: string | null;
}

export interface SyntheticFixture {
  note: string;
  users: FixtureUser[];
  snapshots: FixtureSnapshotRow[];
  profiles: FixtureProfileRow[];
}

/** Deterministic synthetic password the fixture hashes are computed from. */
export const SYNTHETIC_PASSWORD = "synthetic-password-A1";

const USER_1 = "11111111-1111-1111-1111-111111111111";
const USER_2 = "22222222-2222-2222-2222-222222222222";
const USER_3 = "33333333-3333-3333-3333-333333333333";
const USER_4 = "44444444-4444-4444-4444-444444444444";

const syntheticSnapshot = (tickers: string[]): FixtureSnapshotRow["snapshot"] => ({
  stocks: tickers.map((ticker, i) => ({
    ticker,
    stockName: `Synthetic ${ticker}`,
    sector: "Technology",
    entryDate: `01-Jan-2026`,
    entryPrice: 100 + i,
    cmp: 110 + i,
    quantity: 10 + i,
    status: "Active",
    weekHigh52: 120 + i,
    weekLow52: 90 + i,
  })),
  trades: [],
  watchlist: [],
  alerts: [],
  fnoTrades: [],
});

/**
 * Builds the synthetic fixture. `hash` must be a bcrypt implementation
 * (e.g. bcryptjs.hashSync) — injected so this module stays dependency-free.
 */
export const buildSyntheticFixture = (hash: (password: string) => string): SyntheticFixture => ({
  note: "Fully synthetic fixture — no value derived from the real backup.",
  users: [
    {
      supabaseUid: USER_1,
      email: "user-1@example.test",
      passwordHash: hash(SYNTHETIC_PASSWORD),
      confirmed: true,
      provider: "email",
    },
    {
      supabaseUid: USER_2,
      email: "user-2@example.test",
      passwordHash: hash(SYNTHETIC_PASSWORD),
      confirmed: true,
      provider: "email",
    },
    { supabaseUid: USER_3, email: "user-3@example.test", confirmed: true, provider: "google" },
    { supabaseUid: USER_4, email: "user-4@example.test", confirmed: false, provider: "email" },
  ],
  snapshots: [
    { supabaseUid: USER_1, snapshot: syntheticSnapshot(["SYNTH1", "SYNTH2"]) },
    { supabaseUid: USER_2, snapshot: syntheticSnapshot(["SYNTH3"]) },
    { supabaseUid: USER_4, snapshot: syntheticSnapshot([]) },
  ],
  profiles: [
    { supabaseUid: USER_1, displayName: "Fixture Alice" },
    { supabaseUid: USER_3, displayName: "Fixture Google User" },
  ],
});

/** Mapping shape: old Supabase UUID → new Firebase UID. */
export type UidMapping = Record<string, string>;
