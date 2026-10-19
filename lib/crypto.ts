import type { Env } from './types';
import { HttpError } from './http';

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(s: string): Uint8Array {
  const std = s.replace(/-/g, '+').replace(/_/g, '/');
  const b = atob(std + '==='.slice((std.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(input)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** PKCE S256 challenge for a verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier))));
}

// Provider tokens are encrypted at rest with AES-GCM. The key is TOKEN_ENCRYPTION_KEY
// (base64, 32 bytes) when set; otherwise it is derived from GOOGLE_CLIENT_SECRET, so a
// self-hosted install works with just the Google credentials.
let cached: { source: string; key: CryptoKey } | null = null;

async function key(env: Env): Promise<CryptoKey> {
  const source = env.TOKEN_ENCRYPTION_KEY || env.GOOGLE_CLIENT_SECRET || '';
  if (!source) throw new HttpError(500, 'No encryption key: set GOOGLE_CLIENT_SECRET or TOKEN_ENCRYPTION_KEY.', 'not_configured');
  if (cached?.source === source) return cached.key;
  let raw: ArrayBuffer | Uint8Array;
  if (env.TOKEN_ENCRYPTION_KEY) {
    raw = fromB64(env.TOKEN_ENCRYPTION_KEY);
    if (raw.length !== 32) throw new HttpError(500, 'TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded.', 'not_configured');
  } else {
    raw = await crypto.subtle.digest('SHA-256', enc.encode(`ligature-token-key:${source}`));
  }
  const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  cached = { source, key: k };
  return k;
}

export async function encryptJson(env: Env, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), enc.encode(JSON.stringify(value)));
  return `v1.${b64url(iv)}.${b64url(new Uint8Array(ct))}`;
}

export async function decryptJson<T>(env: Env, payload: string): Promise<T> {
  const [v, iv, ct] = payload.split('.');
  if (v !== 'v1' || !iv || !ct) throw new HttpError(401, 'Stored credentials are unreadable. Sign in with Google again.', 'reauth');
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await key(env), fromB64(ct));
    return JSON.parse(dec.decode(pt)) as T;
  } catch {
    // Happens if the encryption key changed. The fix is a fresh sign-in.
    throw new HttpError(401, 'Stored credentials are unreadable. Sign in with Google again.', 'reauth');
  }
}
