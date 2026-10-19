import type { Data, Env } from '../../lib/types';
import { HttpError, json, readJson } from '../../lib/http';
import { requireUser } from '../../lib/session';

// PUT /api/prefs  { prefs }  → saves display settings (table columns, widths, sort) so they
// follow you to other devices.
export const onRequestPut: PagesFunction<Env, string, Data> = async ({ request, env, data }) => {
  const user = requireUser(data.user);
  const { prefs } = await readJson<{ prefs?: unknown }>(request);
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) throw new HttpError(400, 'Settings must be an object.');
  const text = JSON.stringify(prefs);
  if (text.length > 200000) throw new HttpError(400, 'Settings are too large.');
  await env.DB.prepare('UPDATE users SET prefs = ?2 WHERE id = ?1').bind(user.id, text).run();
  return json({ ok: true });
};

// PATCH /api/prefs  { set: { key: value } }  → changes only those settings, so the web app
// (columns, sort) and the iOS app (pinned lists) don’t overwrite each other’s.
export const onRequestPatch: PagesFunction<Env, string, Data> = async ({ request, env, data }) => {
  const user = requireUser(data.user);
  const { set } = await readJson<{ set?: unknown }>(request);
  if (!set || typeof set !== 'object' || Array.isArray(set)) throw new HttpError(400, 'Settings must be an object.');
  const row = await env.DB.prepare('SELECT prefs FROM users WHERE id = ?1').bind(user.id).first<{ prefs: string | null }>();
  let prefs: Record<string, unknown> = {};
  try {
    prefs = JSON.parse(row?.prefs || '{}') ?? {};
  } catch {
    prefs = {};
  }
  Object.assign(prefs, set);
  const text = JSON.stringify(prefs);
  if (text.length > 200000) throw new HttpError(400, 'Settings are too large.');
  await env.DB.prepare('UPDATE users SET prefs = ?2 WHERE id = ?1').bind(user.id, text).run();
  return json({ ok: true, prefs });
};
