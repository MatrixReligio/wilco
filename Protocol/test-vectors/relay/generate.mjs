// Generates vectors.json: the relay's wire formats for a fixed key, so the Worker and the
// Swift code can be checked against the same bytes. Run: node generate.mjs > vectors.json
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';

const bytes = (start, count) => Buffer.from(Array.from({ length: count }, (_, i) => (start + i) & 0xff));
const b64 = (buf) => Buffer.from(buf).toString('base64url');
const hex = (buf) => Buffer.from(buf).toString('hex');

const seed = bytes(1, 32);
const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
const publicKey = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32);
const channel = b64(createHash('sha256').update(publicKey).digest()).slice(0, 22);
const z = Buffer.from([0]);

const nonce = bytes(0xa0, 32);
const relay = 'relay.example.com';
const authMessage = Buffer.concat([Buffer.from('wilco-relay/1'), z, Buffer.from('host'), z, Buffer.from(relay), z, Buffer.from(channel), z, nonce]);

function token(kind, id, expiry) {
  const body = Buffer.alloc(26);
  body[0] = 1;
  body[1] = kind;
  id.copy(body, 2);
  body.writeBigUInt64BE(BigInt(expiry), 18);
  const message = Buffer.concat([Buffer.from('wilco-relay-token/1'), z, Buffer.from(channel), z, body]);
  return { kind, id: b64(id), expiry, signedMessage: hex(message), token: b64(Buffer.concat([body, sign(null, message, privateKey)])) };
}

function frame(type, connection, payload) {
  const head = Buffer.alloc(5);
  head[0] = type;
  head.writeUInt32BE(connection, 1);
  return hex(Buffer.concat([head, payload]));
}

const deviceID = bytes(0x10, 16);
console.log(JSON.stringify({
  ed25519Seed: hex(seed),
  publicKey: b64(publicKey),
  channel,
  auth: { relay, nonce: b64(nonce), message: hex(authMessage), signature: b64(sign(null, authMessage, privateKey)) },
  deviceToken: token(1, deviceID, 0),
  pairingToken: token(2, bytes(0x30, 16), 1800000000),
  frames: [
    { type: 'open', connection: 1, payload: hex(deviceID), bytes: frame(1, 1, deviceID) },
    { type: 'data', connection: 7, payload: hex(Buffer.from('hello')), bytes: frame(2, 7, Buffer.from('hello')) },
    { type: 'close', connection: 4294967295, payload: '', bytes: frame(3, 4294967295, Buffer.alloc(0)) },
  ],
}, null, 2));
