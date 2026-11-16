// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProviderChain, parseProviderReply } from "./provider";
import { upstreamJson } from "../../_lib/testHelpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

const request = {
  system: "system",
  messages: [{ role: "user" as const, content: "hello" }],
  tools: [],
  timeoutMs: 1000,
};

describe("parseProviderReply", () => {
  it("returns prose when the model answers directly", () => {
    const reply = parseProviderReply(
      { choices: [{ message: { content: "You are up 8%." } }] },
      "groq",
      "llama-3.3-70b-versatile",
    );
    expect(reply?.text).toBe("You are up 8%.");
    expect(reply?.toolCalls).toHaveLength(0);
  });

  it("returns tool calls with their raw JSON arguments", () => {
    const reply = parseProviderReply(
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: "call-1", type: "function", function: { name: "get_holdings", arguments: '{"status":"active"}' } },
              ],
            },
          },
        ],
      },
      "groq",
      "m",
    );
    expect(reply?.toolCalls).toEqual([
      { id: "call-1", name: "get_holdings", arguments: '{"status":"active"}' },
    ]);
  });

  it("drops malformed tool calls instead of coercing them", () => {
    const reply = parseProviderReply(
      {
        choices: [
          {
            message: {
              content: "ok",
              tool_calls: [
                { id: "a" }, // no function
                { id: "b", function: { name: "" , arguments: "{}" } }, // no name
                { id: "c", function: { name: "get_holdings", arguments: 42 } }, // non-string args
                "not-an-object",
              ],
            },
          },
        ],
      },
      "groq",
      "m",
    );
    // The one usable call survives, with empty arguments (rejected later by the
    // registry, which is the right place to decide).
    expect(reply?.toolCalls).toEqual([{ id: "c", name: "get_holdings", arguments: "" }]);
  });

  it("caps how many tool calls one reply can trigger", () => {
    const calls = Array.from({ length: 12 }, (_, index) => ({
      id: `c${index}`,
      type: "function",
      function: { name: "get_holdings", arguments: "{}" },
    }));
    const reply = parseProviderReply({ choices: [{ message: { content: null, tool_calls: calls } }] }, "groq", "m");
    expect(reply?.toolCalls.length).toBe(4);
  });

  it("returns null for a reply with neither prose nor a usable call", () => {
    expect(parseProviderReply({ choices: [{ message: { content: "   " } }] }, "groq", "m")).toBeNull();
    expect(parseProviderReply({}, "groq", "m")).toBeNull();
    expect(parseProviderReply(null, "groq", "m")).toBeNull();
  });
});

describe("createProviderChain", () => {
  it("omits a provider that has no key", () => {
    const chain = createProviderChain({});
    expect(chain.primary).toBeNull();
    expect(chain.fallback).toBeNull();
  });

  it("moves to the next model on a rate limit and stops on an auth failure", async () => {
    const seen: string[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      seen.push(body.model);
      return seen.length === 1 ? upstreamJson({ error: "rate" }, 429) : upstreamJson({ choices: [{ message: { content: "ok" } }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const chain = createProviderChain({ GROQ_API_KEY: "g" });
    const reply = await chain.primary?.complete(request);

    expect(reply?.text).toBe("ok");
    expect(seen.length).toBe(2);
  });

  it("stops after the first auth failure instead of retrying every model", async () => {
    const fetchMock = vi.fn(async () => upstreamJson({ error: "denied" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    const chain = createProviderChain({ GROQ_API_KEY: "g" });
    const reply = await chain.primary?.complete(request);

    expect(reply).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null on a network failure instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    const chain = createProviderChain({ GROQ_API_KEY: "g" });
    await expect(chain.primary?.complete(request)).resolves.toBeNull();
  });
});
