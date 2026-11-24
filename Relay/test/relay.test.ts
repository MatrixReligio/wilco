import { env, runDurableObjectAlarm, runInDurableObject, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { base64url, decodeFrame, encodeFrame, FrameType, TokenKind } from '../src/wire';
import type { ChannelObject } from '../src/channel';
import { connectDevice, connectHost, issue, newKey, randomID, readyHost, Socket, vectorKey, vectors } from './helpers';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('relay', () => {
  it('answers health checks', async () => {
    const response = await SELF.fetch('https://relay.test/health');
    expect(response.status).toBe(200);
    expect((await SELF.fetch('https://relay.test/elsewhere')).status).toBe(404);
  });

  it('authenticates a Host with its key', async () => {
    const host = await readyHost(await vectorKey());
    host.ws.close();
  });

  it('refuses a Host signing with a key that is not the channel\'s', async () => {
    const owner = await newKey();
    const host = await connectHost(owner, await newKey());
    expect((await host.closure()).code).toBe(4401);
  });

  it('refuses a signature replayed from an earlier challenge', async () => {
    const key = await vectorKey();
    const response = await SELF.fetch('https://relay.test/v1/host/' + key.channel, { headers: { Upgrade: 'websocket' } });
    const host = new Socket(response.webSocket!);
    await host.next();
    host.send(JSON.stringify({ type: 'auth', key: vectors.publicKey, sig: vectors.auth.signature }));
    expect((await host.closure()).code).toBe(4401);
  });

  it('refuses a Host that sends anything before authenticating', async () => {
    const key = await newKey();
    const response = await SELF.fetch('https://relay.test/v1/host/' + key.channel, { headers: { Upgrade: 'websocket' } });
    const host = new Socket(response.webSocket!);
    await host.next();
    host.send(new Uint8Array([2, 0, 0, 0, 1]));
    expect((await host.closure()).code).toBe(4401);
  });

  it('does not count a Host that has not authenticated yet', async () => {
    const key = await newKey();
    const token = await issue(key, TokenKind.device, randomID());
    (await readyHost(key)).ws.close(1000);
    await new Promise((r) => setTimeout(r, 50));
    const response = await SELF.fetch('https://relay.test/v1/host/' + key.channel, { headers: { Upgrade: 'websocket' } });
    const pending = new Socket(response.webSocket!);
    await pending.next();
    expect((await connectDevice(key.channel, token)).response.status).toBe(503);
    pending.ws.close();
  });

  it('closes a Host connection that does not authenticate in time', async () => {
    const key = await newKey();
    const response = await SELF.fetch('https://relay.test/v1/host/' + key.channel, { headers: { Upgrade: 'websocket' } });
    const pending = new Socket(response.webSocket!);
    await pending.next();
    const stub = env.CHANNELS.get(env.CHANNELS.idFromName(key.channel));
    await runInDurableObject(stub, (instance: ChannelObject) => instance.ageUnauthenticated());
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await pending.closure()).code).toBe(4401);
  });

  it('closes a device that sends text', async () => {
    const key = await newKey();
    const host = await readyHost(key);
    const { socket: device } = await connectDevice(key.channel, await issue(key, TokenKind.device, randomID()));
    await host.nextBinary();
    device!.send('hello');
    expect((await device!.closure()).code).toBe(1003);
    host.ws.close();
  });

  it('refuses requests that are not WebSocket upgrades or name no valid channel', async () => {
    const key = await newKey();
    expect((await SELF.fetch('https://relay.test/v1/host/' + key.channel)).status).toBe(426);
    expect((await SELF.fetch('https://relay.test/v1/host/short', { headers: { Upgrade: 'websocket' } })).status).toBe(404);
  });

  it('carries a device connection to the Host and back, in order', async () => {
    const key = await newKey();
    const host = await readyHost(key);
    const id = randomID();
    const { response, socket: device } = await connectDevice(key.channel, await issue(key, TokenKind.device, id));
    expect(response.status).toBe(101);
    const open = decodeFrame(await host.nextBinary())!;
    expect(open.type).toBe(FrameType.open);
    expect(open.payload).toEqual(id);
    for (const text of ['one', 'two', 'three']) device!.send(bytes(text));
    for (const text of ['one', 'two', 'three']) {
      const frame = decodeFrame(await host.nextBinary())!;
      expect(frame).toEqual({ type: FrameType.data, connection: open.connection, payload: bytes(text) });
    }
    host.send(encodeFrame(FrameType.data, open.connection, bytes('back')));
    expect(await device!.nextBinary()).toEqual(bytes('back'));
    // The device hangs up: the Host hears it.
    device!.ws.close(1000);
    expect(decodeFrame(await host.nextBinary())).toEqual({ type: FrameType.close, connection: open.connection, payload: new Uint8Array() });
    host.ws.close();
  });

  it('closes a device when the Host closes its connection', async () => {
    const key = await newKey();
    const host = await readyHost(key);
    const { socket: device } = await connectDevice(key.channel, await issue(key, TokenKind.device, randomID()));
    const open = decodeFrame(await host.nextBinary())!;
    host.send(encodeFrame(FrameType.close, open.connection));
    await device!.closure();
    host.ws.close();
  });

  it('gives each device connection its own ID', async () => {
    const key = await newKey();
    const host = await readyHost(key);
    const token = await issue(key, TokenKind.device, randomID());
    await connectDevice(key.channel, token);
    await connectDevice(key.channel, token);
    const first = decodeFrame(await host.nextBinary())!, second = decodeFrame(await host.nextBinary())!;
    expect(first.connection).not.toBe(second.connection);
    host.ws.close();
  });

  it('answers 503 while the Host is not connected', async () => {
    const key = await newKey();
    const token = await issue(key, TokenKind.device, randomID());
    expect((await connectDevice(key.channel, token)).response.status).toBe(503);
    const host = await readyHost(key);
    host.ws.close(1000);
    await new Promise((r) => setTimeout(r, 50));
    expect((await connectDevice(key.channel, token)).response.status).toBe(503);
  });

  it('refuses missing, malformed, foreign and expired tokens', async () => {
    const key = await newKey();
    const host = await readyHost(key);
    expect((await connectDevice(key.channel)).response.status).toBe(401);
    expect((await connectDevice(key.channel, 'garbage')).response.status).toBe(401);
    expect((await connectDevice(key.channel, await issue(await newKey(), TokenKind.device, randomID(), 0, key.channel))).response.status).toBe(401);
    const expired = await issue(key, TokenKind.pairing, randomID(), Math.floor(Date.now() / 1000) - 1);
    expect((await connectDevice(key.channel, expired)).response.status).toBe(403);
    const valid = await issue(key, TokenKind.pairing, randomID(), Math.floor(Date.now() / 1000) + 600);
    expect((await connectDevice(key.channel, valid)).response.status).toBe(101);
    host.ws.close();
  });

  it('revoking a token refuses it from then on and closes its connections', async () => {
    const key = await newKey();
    const host = await readyHost(key);
    const id = randomID();
    const token = await issue(key, TokenKind.device, id);
    const { socket: device } = await connectDevice(key.channel, token);
    await host.nextBinary();
    host.send(JSON.stringify({ type: 'revoke', id: base64url(id) }));
    expect((await device!.closure()).code).toBe(4403);
    expect((await connectDevice(key.channel, token)).response.status).toBe(403);
    // Another device is unaffected.
    expect((await connectDevice(key.channel, await issue(key, TokenKind.device, randomID()))).response.status).toBe(101);
    host.ws.close();
  });

  it('a new Host connection replaces the old one and its devices', async () => {
    const key = await newKey();
    const old = await readyHost(key);
    const { socket: device } = await connectDevice(key.channel, await issue(key, TokenKind.device, randomID()));
    await old.nextBinary();
    const replacement = await readyHost(key);
    expect((await old.closure()).code).toBe(4409);
    await device!.closure();
    const { response } = await connectDevice(key.channel, await issue(key, TokenKind.device, randomID()));
    expect(response.status).toBe(101);
    expect(decodeFrame(await replacement.nextBinary())!.type).toBe(FrameType.open);
    replacement.ws.close();
  });

  it('closes a device that sends a frame over the limit', async () => {
    const key = await newKey();
    const host = await readyHost(key);
    const { socket: device } = await connectDevice(key.channel, await issue(key, TokenKind.device, randomID()));
    await host.nextBinary();
    device!.send(new Uint8Array(4096));
    expect((await device!.closure()).code).toBe(1009);
    host.ws.close();
  });

  it('limits the device connections of a channel', async () => {
    const key = await newKey();
    const host = await readyHost(key);
    const token = await issue(key, TokenKind.device, randomID());
    for (let i = 0; i < 3; i++) expect((await connectDevice(key.channel, token)).response.status).toBe(101);
    expect((await connectDevice(key.channel, token)).response.status).toBe(429);
    host.ws.close();
  });

  it('closes the device that pushes a channel past its rate', async () => {
    const key = await newKey();
    const host = await readyHost(key);
    const { socket: device } = await connectDevice(key.channel, await issue(key, TokenKind.device, randomID()));
    await host.nextBinary();
    for (let i = 0; i < 10; i++) device!.send(new Uint8Array(2000));
    expect((await device!.closure()).code).toBe(4429);
    host.ws.close();
  });

  it('closes idle device connections', async () => {
    const key = await newKey();
    const host = await readyHost(key);
    const { socket: device } = await connectDevice(key.channel, await issue(key, TokenKind.device, randomID()));
    await host.nextBinary();
    const stub = env.CHANNELS.get(env.CHANNELS.idFromName(key.channel));
    await runInDurableObject(stub, (instance: ChannelObject) => instance.forgetActivity());
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await device!.closure()).code).toBe(4408);
    host.ws.close();
  });
});
