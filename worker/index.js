// The Cloudflare side of Kitchen Stock. Pages and files are served straight from dist/
// (see wrangler.jsonc); this script only adds a daily keep-alive.
//
// Supabase pauses free projects after a week with no activity, which would take the app
// offline. Once a day we make one tiny read through Supabase's API so that never happens.
// Signed-out reads are refused by the sharing rules, so this sees no kitchen data.

export default {
  fetch(request, env) {
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(keepAwake(env));
  },
};

export async function keepAwake(env, f = fetch) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.log("keep-alive skipped: SUPABASE_URL or SUPABASE_KEY not set (deploy with npm run deploy)");
    return false;
  }
  const res = await f(`${env.SUPABASE_URL}/rest/v1/households?select=id&limit=1`, {
    headers: { apikey: env.SUPABASE_KEY },
  });
  console.log(`keep-alive: Supabase answered ${res.status}`);
  return res.ok;
}
