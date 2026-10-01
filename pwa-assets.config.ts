import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

// Home-screen icons generated from public/icon.svg (npm run icons).
export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.1, resizeOptions: { background: "#13263b" } },
    apple: { ...minimal2023Preset.apple, padding: 0.1, resizeOptions: { background: "#13263b" } },
  },
  images: ["public/icon.svg"],
});
