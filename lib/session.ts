import type { UserRow } from './types';
import { randomToken, sha256Hex } from './crypto';
import { HttpError, now } from './http';
import { DEFAULT_FIELDS } from './schema';

const COOKIE = 'lig_session';
const MAX_AGE_S = 60 * 60 * 24 * 30;
/** The iOS app stays signed in for a year (it can’t be phished for the cookie, and signing out ends it). */
const APP_MAX_AGE_S = 60 * 60 * 24 * 365;

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function cookieAttrs(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export async function createSession(db: D1Database, request: Request, userId: string): Promise<string> {
  const token = randomToken();
  const t = now();
  await db
    .prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(await sha256Hex(token), userId, t, t + MAX_AGE_S * 1000)
    .run();
  return `${COOKIE}=${token}${cookieAttrs(request)}; Max-Age=${MAX_AGE_S}`;
}

/** A session for the iOS app. Returns the raw token, which the app keeps in its Keychain. */
export async function createAppSession(db: D1Database, userId: string): Promise<string> {
  const token = randomToken();
  const t = now();
  await db
    .prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(await sha256Hex(token), userId, t, t + APP_MAX_AGE_S * 1000)
    .run();
  return token;
}

/** The app sends `Authorization: Bearer <token>`; the web app uses the cookie. */
function sessionToken(request: Request): string | null {
  const auth = request.headers.get('authorization') ?? '';
  const m = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(auth);
  return m ? m[1] : readCookie(request, COOKIE);
}

export async function loadSessionUser(db: D1Database, request: Request): Promise<UserRow | null> {
  const token = sessionToken(request);
  if (!token) return null;
  return db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?1 AND s.expires_at > ?2`,
    )
    .bind(await sha256Hex(token), now())
    .first<UserRow>();
}

export async function destroySession(db: D1Database, request: Request): Promise<string> {
  const token = sessionToken(request);
  if (token) await db.prepare('DELETE FROM sessions WHERE id = ?1').bind(await sha256Hex(token)).run();
  return `${COOKIE}=${cookieAttrs(request)}; Max-Age=0`;
}

export function requireUser(user: UserRow | null): UserRow {
  if (!user) throw new HttpError(401, 'Sign in first.', 'signed_out');
  return user;
}

export async function createUser(db: D1Database, displayName: string | null): Promise<string> {
  const id = crypto.randomUUID();
  const t = now();
  const stmts = [
    db.prepare('INSERT INTO users (id, display_name, read_only, created_at) VALUES (?1, ?2, 0, ?3)').bind(id, displayName, t),
    ...DEFAULT_FIELDS.map((f, i) =>
      db
        .prepare('INSERT INTO field_defs (id, user_id, label, type, position, created_at, key) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
        .bind(crypto.randomUUID(), id, f.label, f.type, i, t, f.key ?? null),
    ),
  ];
  await db.batch(stmts);
  return id;
}
