// Wilco relay (Protocol/relay.md): one Durable Object per Host channel forwards end-to-end
// encrypted traffic between the Host and its devices. It never sees plaintext.
import { isChannelID } from './wire';

export { ChannelObject } from './channel';

export interface Env {
  CHANNELS: DurableObjectNamespace<import('./channel').ChannelObject>;
  MAX_FRAME_BYTES: string;
  MAX_DEVICES: string;
  CHANNEL_BYTES_PER_MINUTE: string;
  IDLE_SECONDS: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');
    const match = /^\/v1\/(host|connect)\/([^/]+)$/.exec(url.pathname);
    if (!match || !isChannelID(match[2])) return new Response('not found', { status: 404 });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected a WebSocket upgrade', { status: 426 });
    }
    const stub = env.CHANNELS.get(env.CHANNELS.idFromName(match[2]));
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;
