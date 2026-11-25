// APNs provider tokens: ES256 JWTs signed with the team's .p8 key (WebCrypto), kept for 50 minutes
// (Apple refuses tokens older than an hour and too many new ones).

export interface Credentials {
  APNS_PRIVATE_KEY: string;
  APNS_KEY_ID: string;
  APNS_TEAM_ID: string;
}

const LIFETIME = 50 * 60;
let cached: { keyID: string; teamID: string; issuedAt: number; jwt: string } | undefined;

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const encodeJSON = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));

/** `pem`: a PKCS#8 P-256 key, as in Apple's .p8 file. */
export async function signJWT(pem: string, keyID: string, teamID: string, issuedAt: number): Promise<string> {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const input = `${encodeJSON({ alg: 'ES256', kid: keyID })}.${encodeJSON({ iss: teamID, iat: issuedAt })}`;
  // WebCrypto's ECDSA signature is r||s, the form JWS uses.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input)));
  return `${input}.${base64url(signature)}`;
}

/** The current provider token; `renew` drops one APNs refused. */
export async function providerToken(env: Credentials, now: number, options: { renew?: boolean } = {}): Promise<string> {
  if (options.renew) cached = undefined;
  if (cached && cached.keyID === env.APNS_KEY_ID && cached.teamID === env.APNS_TEAM_ID && now - cached.issuedAt < LIFETIME
      && now >= cached.issuedAt) {
    return cached.jwt;
  }
  const jwt = await signJWT(env.APNS_PRIVATE_KEY, env.APNS_KEY_ID, env.APNS_TEAM_ID, now);
  cached = { keyID: env.APNS_KEY_ID, teamID: env.APNS_TEAM_ID, issuedAt: now, jwt };
  return jwt;
}

export function forgetProviderToken(): void {
  cached = undefined;
}
