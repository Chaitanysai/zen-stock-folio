import { describe, expect, it } from "vitest";
import { parseSupabaseDump } from "./parseSupabaseDump";

/**
 * Unit tests run against a fully SYNTHETIC mini-dump. Every value in this
 * file is invented (example.test emails, well-known test UUIDs, a dummy
 * hash shape) — nothing here is derived from the real backup.
 */

const syntheticDump = `--
-- PostgreSQL database cluster dump
--

\\restrict synthetic-token
SET default_transaction_read_only = off;

--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.users (instance_id, id, aud, email, encrypted_password, email_confirmed_at, last_sign_in_at) FROM stdin;
00000000-0000-0000-0000-000000000000	11111111-1111-1111-1111-111111111111	authenticated	user-1@example.test	$2a$10$abcdefghijklmnopqrstuv	2026-01-01 00:00:00+00	2026-01-02 00:00:00+00
00000000-0000-0000-0000-000000000000	22222222-2222-2222-2222-222222222222	authenticated	user-2@example.test	$2a$10$zyxwvutsrqponmlkjihgf	\\N	\\N
00000000-0000-0000-0000-000000000000	33333333-3333-3333-3333-333333333333	authenticated	user-3@example.test	\\N	2026-01-03 00:00:00+00	2026-01-03 00:00:00+00
\\.

--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.identities (id, user_id, provider, identity_data) FROM stdin;
id-1	11111111-1111-1111-1111-111111111111	google	{}
id-2	11111111-1111-1111-1111-111111111111	email	{}
id-3	44444444-4444-4444-4444-444444444444	google	{}
\\.

--
-- Data for Name: portfolio_snapshots; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.portfolio_snapshots (user_id, snapshot, updated_at) FROM stdin;
11111111-1111-1111-1111-111111111111	{"stocks":[]}	2026-01-04 00:00:00+00
22222222-2222-2222-2222-222222222222	{"stocks":[]}	2026-01-04 00:00:00+00
\\.

--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.profiles (id, display_name, updated_at) FROM stdin;
11111111-1111-1111-1111-111111111111	Alice	2026-01-04 00:00:00+00
\\.

--
-- Data for Name: eod_price_cache; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.eod_price_cache (ticker, price, fetched_at, source) FROM stdin;
RELIANCE	2500.0000	2026-01-04 10:00:00+00	test
TCS	4100.0000	2026-01-04 10:00:00+00	test
\\.

--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.sessions (id, user_id, created_at) FROM stdin;
sess-1	11111111-1111-1111-1111-111111111111	2026-01-02 00:00:00+00
\\.
`;

describe("parseSupabaseDump (synthetic mini-dump)", () => {
  it("counts users, confirmed users, google users, snapshots, profiles, cache rows", () => {
    const counts = parseSupabaseDump(syntheticDump);

    expect(counts.users).toBe(3);
    expect(counts.confirmedUsers).toBe(2);
    // user-1 has one google identity; user-4 exists only as a google identity
    expect(counts.googleProviderUsers).toBe(2);
    expect(counts.portfolioSnapshots).toBe(2);
    expect(counts.profiles).toBe(1);
    expect(counts.priceCacheRecords).toBe(2);
    expect(counts.parseErrors).toEqual([]);
    expect(counts.otherTablesSeen).toContain("auth.sessions");
  });

  it("reports an unterminated COPY block by table name only", () => {
    // A dump that ends inside a COPY block (no `\.` terminator).
    const broken = [
      "COPY auth.users (id, email, email_confirmed_at) FROM stdin;",
      "00000000-0000-0000-0000-000000000000\tuser-1@example.test\t2026-01-01 00:00:00+00",
      "00000000-0000-0000-0000-000000000000\tuser-2@example.test\t\\N",
    ].join("\n");
    const counts = parseSupabaseDump(broken);

    expect(counts.parseErrors).toContain("unterminated COPY block for auth.users");
    // The malformed block's rows are never counted
    expect(counts.users).toBe(0);
  });

  it("never surfaces row content in any output field", () => {
    const counts = parseSupabaseDump(syntheticDump);
    const serialized = JSON.stringify(counts);
    expect(serialized).not.toContain("example.test");
    expect(serialized).not.toContain("$2a$");
    expect(serialized).not.toContain("RELIANCE");
    expect(serialized).not.toContain("Alice");
  });

  it("returns zeros for an empty dump", () => {
    const counts = parseSupabaseDump("-- nothing here\n");
    expect(counts).toMatchObject({
      users: 0,
      confirmedUsers: 0,
      googleProviderUsers: 0,
      portfolioSnapshots: 0,
      profiles: 0,
      priceCacheRecords: 0,
      parseErrors: [],
    });
  });
});
