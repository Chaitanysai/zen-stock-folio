// @vitest-environment node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CONTENT_SECURITY_POLICY,
  SECURITY_HEADERS,
  applySecurityHeaders,
} from "./securityHeaders";

const headersFile = readFileSync("public/_headers", "utf8");
const indexHtml = readFileSync("index.html", "utf8");

/** Parse the indented `Name: value` lines of the `/*` block in _headers. */
const parseStaticHeaders = (): Map<string, string> => {
  const map = new Map<string, string>();
  for (const line of headersFile.split(/\r?\n/)) {
    const match = /^\s{2,}([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (match) map.set(match[1], match[2].trim());
  }
  return map;
};

describe("security headers", () => {
  it("keeps public/_headers in sync with the shared policy", () => {
    const staticHeaders = parseStaticHeaders();
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(staticHeaders.get(name), name).toBe(value);
    }
  });

  it("uses a CSP whose inline-script hashes match every pre-paint script", () => {
    const scripts = Array.from(
      indexHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g),
      (match) => match[1],
    );
    expect(scripts).toHaveLength(2);
    for (const script of scripts) {
      // The HTML parser normalizes CRLF to LF before CSP hashes the script.
      const normalized = script.replace(/\r\n/g, "\n");
      const digest = createHash("sha256").update(normalized, "utf8").digest("base64");
      expect(CONTENT_SECURITY_POLICY).toContain(`'sha256-${digest}'`);
    }
  });

  it("allows the next-themes pre-hydration script by hash (not unsafe-inline)", () => {
    expect(CONTENT_SECURITY_POLICY).toContain(
      "'sha256-eMuh8xiwcX72rRYNAGENurQBAcH7kLlAUQcoOri3BIo='",
    );
  });

  it("never grants script execution from arbitrary origins", () => {
    expect(CONTENT_SECURITY_POLICY).not.toContain("script-src 'unsafe-inline'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("script-src *");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
  });

  it("applies headers with set(), so a duplicate value cannot accumulate", () => {
    const headers = new Headers({ "X-Frame-Options": "SAMEORIGIN" });
    applySecurityHeaders(headers);
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Content-Security-Policy")).toBe(CONTENT_SECURITY_POLICY);
  });
});
