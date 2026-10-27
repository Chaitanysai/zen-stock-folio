/**
 * Expiry formatting for F&O rows.
 *
 * The Dashboard used to index a numeric month table with the *second* dash
 * segment, so the app's documented `DD-Mon-YYYY` format rendered
 * `5 undefined '26` for every options row. One formatter now handles every
 * format the app stores, and an unparseable value is echoed rather than
 * rendered as `undefined`.
 */

import { describe, expect, it } from "vitest";
import { fmtExpiry } from "./sampleData";

describe("fmtExpiry", () => {
  it("formats the documented DD-Mon-YYYY format", () => {
    expect(fmtExpiry("27-Mar-2025")).toBe("27 Mar '25");
    expect(fmtExpiry("05-Nov-2026")).toBe("5 Nov '26");
    expect(fmtExpiry("01-Dec-2030")).toBe("1 Dec '30");
  });

  it("formats a numeric-month DD-MM-YYYY format", () => {
    expect(fmtExpiry("27-03-2025")).toBe("27 Mar '25");
  });

  it("formats an ISO date without shifting the month", () => {
    expect(fmtExpiry("2025-03-27")).toBe("27 Mar '25");
    expect(fmtExpiry("2005-07-01")).toBe("1 Jul '05");
  });

  it("never renders undefined for junk", () => {
    for (const value of ["", "not-a-date", "27-Foo-2025", "27-13-2025", "x-y-z"]) {
      expect(fmtExpiry(value)).not.toContain("undefined");
    }
  });
});
