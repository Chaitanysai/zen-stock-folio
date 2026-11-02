import { describe, expect, it } from "vitest";
import { requireIdentity } from "./auth";
import { API_ORIGIN, authedRequest, makeEnv, stubIdentity } from "./testHelpers";

describe("auth boundary (Identity Toolkit lookup)", () => {
  it("passes the caller's own token through for downstream REST calls and never drops it", async () => {
    stubIdentity("user-42", true);
    const result = await requireIdentity(makeEnv(), authedRequest(`${API_ORIGIN}/api/anything`, {}, "token-42"));
    expect(result.ok && result.identity.uid).toBe("user-42");
    expect(result.ok && result.identity.token).toBe("token-42");
  });
});
