import { beforeEach, describe, expect, it } from "vitest";
import {
  capMessages,
  clearStoredMessages,
  conversationStorageKey,
  loadStoredMessages,
  saveStoredMessages,
} from "./storage";
import { MAX_STORED_MESSAGES } from "./schemas";
import { ASSISTANT_STORAGE_PREFIX, type AssistantMessage } from "./types";

const message = (index: number, over: Partial<AssistantMessage> = {}): AssistantMessage => ({
  id: `m-${index}`,
  role: index % 2 === 0 ? "user" : "assistant",
  content: `message ${index}`,
  createdAt: 1_700_000_000_000 + index,
  ...over,
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("assistant conversation storage", () => {
  it("round-trips a conversation", () => {
    saveStoredMessages("user-a", [message(0), message(1)]);
    const restored = loadStoredMessages("user-a");

    expect(restored.map((entry) => entry.content)).toEqual(["message 0", "message 1"]);
    expect(restored[0].role).toBe("user");
    expect(restored[1].role).toBe("assistant");
  });

  it("keeps each account's conversation separate", () => {
    saveStoredMessages("user-a", [message(0)]);
    saveStoredMessages("user-b", [message(1, { content: "b only" })]);

    expect(loadStoredMessages("user-a").map((entry) => entry.content)).toEqual(["message 0"]);
    expect(loadStoredMessages("user-b").map((entry) => entry.content)).toEqual(["b only"]);
    expect(conversationStorageKey("user-a")).not.toBe(conversationStorageKey("user-b"));
    expect(conversationStorageKey("user-a").startsWith(ASSISTANT_STORAGE_PREFIX)).toBe(true);
  });

  it("returns an empty thread for a corrupt or hostile blob", () => {
    window.localStorage.setItem(conversationStorageKey("user-a"), "{not json");
    expect(loadStoredMessages("user-a")).toEqual([]);

    window.localStorage.setItem(conversationStorageKey("user-a"), JSON.stringify({ role: "user" }));
    expect(loadStoredMessages("user-a")).toEqual([]);
  });

  it("drops individual records that fail validation and keeps the rest", () => {
    window.localStorage.setItem(
      conversationStorageKey("user-a"),
      JSON.stringify([
        { role: "user", content: "kept", createdAt: 1 },
        { role: "system", content: "dropped — not a visible role" },
        { role: "assistant", content: "" },
        { role: "assistant", content: "also kept", createdAt: 2, cards: [{ kind: "nope" }] },
        "not an object",
      ]),
    );

    const restored = loadStoredMessages("user-a");
    expect(restored.map((entry) => entry.content)).toEqual(["kept", "also kept"]);
    // The invalid card is dropped rather than breaking the whole message.
    expect(restored[1].cards).toBeUndefined();
  });

  it("caps the stored thread to the newest messages", () => {
    const many = Array.from({ length: MAX_STORED_MESSAGES + 10 }, (_, index) => message(index));
    const capped = capMessages(many);

    expect(capped).toHaveLength(MAX_STORED_MESSAGES);
    expect(capped[capped.length - 1].content).toBe(`message ${MAX_STORED_MESSAGES + 9}`);
  });

  it("clears only the requested account", () => {
    saveStoredMessages("user-a", [message(0)]);
    saveStoredMessages("user-b", [message(1)]);
    clearStoredMessages("user-a");

    expect(loadStoredMessages("user-a")).toEqual([]);
    expect(loadStoredMessages("user-b")).toHaveLength(1);
  });

  it("does not throw when storage rejects a write", () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      expect(() => saveStoredMessages("user-a", [message(0)])).not.toThrow();
    } finally {
      window.localStorage.setItem = original;
    }
  });
});
