// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("landing page link", () => {
  it("opens the sample kitchen from /?demo for a new visitor, then tidies the address", async () => {
    localStorage.clear();
    history.replaceState(null, "", "/?demo");
    const { default: App } = await import("../src/App");
    const { snapshot } = await import("../src/store");
    const root = document.createElement("div");
    document.body.append(root);
    await act(async () => createRoot(root).render(<App />));

    expect(snapshot().demo).toBe(true);
    expect(location.search).toBe("");
    expect(root.querySelectorAll(".row").length).toBeGreaterThan(0);
    // Nothing from the sample is saved as this visitor's kitchen.
    expect(localStorage.getItem("ks-household-v1")).toBeNull();
  });

  it("keeps ?demo when a tab is in the link too", async () => {
    history.replaceState(null, "", "/?demo&tab=shop");
    const { readTab } = await import("../src/App");
    expect(readTab()).toBe("shop");
    expect(location.search).toBe("?demo");
  });
});
