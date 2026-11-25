import type { Env as PushEnv } from '../src/index';

declare global {
  namespace Cloudflare {
    interface Env extends PushEnv {}
  }
}
