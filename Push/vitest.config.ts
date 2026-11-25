import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: { bindings: { APNS_KEY_ID: 'KEYID00000', APNS_TEAM_ID: 'TEAM000000', APNS_TOPIC: 'com.example.wilco', APNS_PRIVATE_KEY: '' } },
    }),
  ],
});
