// @vitest-environment jsdom
import axe from "axe-core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { sampleKitchen } from "../src/demo";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom can't measure colors, so contrast is checked in a real browser instead; everything else runs here.
const audit = async () => {
  const r = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } }, resultTypes: ["violations"] });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
};

describe("accessibility", () => {
  it("main list, edit sheet, settings and the cook sheet have no axe violations", async () => {
    localStorage.setItem("ks-household-v1", JSON.stringify(sampleKitchen()));
    localStorage.setItem("ks-tab", "first");
    const { default: App } = await import("../src/App");
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);
    await act(async () => createRoot(root).render(<App />));
    const click = async (el: Element | null | undefined) => act(async () => (el as HTMLElement).click());
    const esc = async () => act(async () => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

    expect(await audit()).toEqual([]);
    await click(document.querySelector(".linkish"));
    expect(await audit()).toEqual([]);
    await esc();
    await click(document.querySelector('[aria-label="Kitchen settings"]'));
    expect(await audit()).toEqual([]);
    await esc();
    await click(document.querySelector(".cookbar .btn"));
    expect(await audit()).toEqual([]);
  });
});
