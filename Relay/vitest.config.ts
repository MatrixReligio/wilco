import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      // Small limits so the tests can reach them.
      miniflare: { bindings: { MAX_FRAME_BYTES: '2048', MAX_DEVICES: '3', CHANNEL_BYTES_PER_MINUTE: '16384', IDLE_SECONDS: '600' } },
    }),
  ],
});
