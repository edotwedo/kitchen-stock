import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS worker module
import { keepAwake } from "../worker/index.js";

describe("Supabase keep-alive", () => {
  it("makes one small signed-out read", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = await keepAwake({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_KEY: "pk" }, async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("[]", { status: 200 });
    });
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://x.supabase.co/rest/v1/households?select=id&limit=1");
    expect(calls[0].init.headers).toEqual({ apikey: "pk" });
  });

  it("does nothing when it isn't configured", async () => {
    expect(await keepAwake({}, async () => { throw new Error("should not fetch"); })).toBe(false);
  });
});
