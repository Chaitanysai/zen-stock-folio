import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

/** Decode one CSV cell back to the value a spreadsheet would display. */
const decodeCell = (encoded: string): string => {
  if (encoded.startsWith('"') && encoded.endsWith('"') && encoded.length >= 2) {
    return encoded.slice(1, -1).replace(/""/g, '"');
  }
  return encoded;
};

describe("csvCell", () => {
  it.each([
    ["equals", "=1+1"],
    ["plus", "+1+1"],
    ["minus", "-1+1"],
    ["at", "@SUM(A1)"],
    ["tab", "\t1+1"],
    ["carriage return", "\r1+1"],
  ])("neutralizes a formula payload prefixed with %s", (_label, payload) => {
    // The guard must survive whatever quoting is applied around it.
    expect(decodeCell(csvCell(payload)).startsWith("'")).toBe(true);
  });

  it("prefixes the apostrophe before quoting so the guard stays at column start", () => {
    // A value that both looks like a formula and needs quoting.
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(decodeCell(csvCell('=HYPERLINK("http://x","y")'))).toBe(`'=HYPERLINK("http://x","y")`);
  });

  it("neutralizes and quotes a formula payload containing a comma and newline", () => {
    const encoded = csvCell("=cmd\r\ncalc,now");
    expect(encoded.startsWith(`"'`)).toBe(true);
    expect(encoded.endsWith('"')).toBe(true);
    expect(decodeCell(encoded)).toBe("'=cmd\r\ncalc,now");
  });

  it("quotes and doubles embedded quotes per RFC 4180", () => {
    expect(csvCell('Foo, Inc "India"')).toBe('"Foo, Inc ""India"""');
  });

  it("quotes values containing a newline", () => {
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("leaves ordinary values untouched", () => {
    expect(csvCell("RELIANCE")).toBe("RELIANCE");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(0)).toBe("0");
  });

  it("maps null and undefined to an empty cell", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("does not neutralize a formula character that is not at the start", () => {
    expect(csvCell("A=B")).toBe("A=B");
    expect(csvCell("1-2")).toBe("1-2");
  });
});

describe("toCsv", () => {
  it("emits a header row plus data rows joined with CRLF", () => {
    expect(toCsv(["A", "B"], [[1, 2], [3, 4]])).toBe("A,B\r\n1,2\r\n3,4");
  });

  it("escapes headers as well as data", () => {
    expect(toCsv(["=danger"], [["ok"]])).toBe("'=danger\r\nok");
  });

  it("renders an empty dataset as just the header", () => {
    expect(toCsv(["A"], [])).toBe("A");
  });
});
