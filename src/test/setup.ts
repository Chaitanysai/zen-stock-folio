import "@testing-library/jest-dom";

// Node-environment test files (e.g. the Firestore rules suite) have no
// window; only install the jsdom shims when a DOM is present.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });

  // jsdom does not implement scrollIntoView; chat-style components call it.
  if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

// jsdom does not implement AbortSignal.timeout(), which the provider adapters
// use to bound every upstream call. Provide the standard behaviour so adapter
// tests exercise the real code path instead of a stubbed one.
if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout !== "function") {
  AbortSignal.timeout = (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort(new DOMException("The operation timed out.", "TimeoutError"));
    }, ms);
    return controller.signal;
  };
}
