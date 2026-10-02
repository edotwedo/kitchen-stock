// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { sampleKitchen } from "../src/demo";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// No built-in reader, and the downloadable one fails to load (say, no signal).
vi.mock("barcode-detector/ponyfill", () => {
  throw new Error("offline");
});

describe("barcode scanner when the reader can't load", () => {
  it("turns the camera off, offers typing only, and 'Scan another' doesn't pretend to scan", async () => {
    const stop = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop }] }) } });
    HTMLMediaElement.prototype.play = async () => {};
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ status: 0 }), { status: 200 }));

    const { ScanSheet } = await import("../src/ScanSheet");
    const root = document.createElement("div");
    document.body.append(root);
    await act(async () => createRoot(root).render(<ScanSheet h={sampleKitchen()} onClose={() => {}} onFound={() => {}} />));
    await act(async () => new Promise((r) => setTimeout(r, 50)));

    const status = () => document.querySelector('[role="status"]')!.textContent;
    const buttons = () => [...document.querySelectorAll(".actions button")].map((b) => b.textContent);
    expect(stop).toHaveBeenCalled();
    expect(status()).toMatch(/Type the number/);
    expect(buttons()).not.toContain("Take a photo of it");

    // A typed number that isn't in the database, then "Scan another".
    const input = document.querySelector<HTMLInputElement>('[aria-label="Barcode number"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "0123456789012");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => input.form!.requestSubmit());
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(status()).toMatch(/isn't in the product database/);
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>(".actions button")].find((b) => b.textContent === "Scan another")!.click());
    expect(status()).not.toMatch(/Line up the barcode/);
    expect(status()).toMatch(/Type the number/);
  });
});
