// Push credentials (Protocol/push.md): a device proves with Apple DeviceCheck that it is the
// Wilco app on a real Apple device, and its Host gets a credential for one of its push tokens.
// A credential is an HMAC of the token, so the service keeps nothing to check one.
import { signJWT } from './jwt';
import type { Environment } from './validate';

export interface CredentialSecrets {
  DEVICECHECK_PRIVATE_KEY?: string;
  DEVICECHECK_KEY_ID?: string;
  APNS_TEAM_ID: string;
  CREDENTIAL_SECRET?: string;
}

const DEVICECHECK = { production: 'api.devicecheck.apple.com', sandbox: 'api.development.devicecheck.apple.com' } as const;

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function credentialFor(secret: string, token: string, environment: Environment): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const message = new TextEncoder().encode(`wilco-push-credential-v1\n${environment}\n${token.toLowerCase()}`);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, message)));
}

/** Whether `credential` is the one for this token, compared in constant time. */
export async function isCredential(secret: string, token: string, environment: Environment, credential: string): Promise<boolean> {
  const expected = new TextEncoder().encode(await credentialFor(secret, token, environment));
  const given = new TextEncoder().encode(credential);
  if (given.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ given[i];
  return difference === 0;
}

export type DeviceCheckResult = 'valid' | 'invalid' | 'unavailable';

/** Asks Apple whether a DeviceCheck token comes from the app on a real device. */
export async function checkDevice(
  secrets: CredentialSecrets, environment: Environment, deviceToken: string, now: number,
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
): Promise<DeviceCheckResult> {
  const jwt = await signJWT(secrets.DEVICECHECK_PRIVATE_KEY ?? '', secrets.DEVICECHECK_KEY_ID ?? '', secrets.APNS_TEAM_ID, now);
  let response: Response;
  try {
    response = await fetcher(`https://${DEVICECHECK[environment]}/v1/validate_device_token`, {
      method: 'POST',
      headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
      body: JSON.stringify({ device_token: deviceToken, transaction_id: crypto.randomUUID(), timestamp: now * 1000 }),
    });
  } catch {
    return 'unavailable';
  }
  if (response.ok) return 'valid';
  // 400: the device token is not valid. Anything else (our key refused, Apple's trouble) is ours.
  return response.status === 400 ? 'invalid' : 'unavailable';
}
