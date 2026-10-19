import type { Data, Env } from '../../../lib/types';
import { HttpError, json, readJson } from '../../../lib/http';
import { requireUser } from '../../../lib/session';
import { FIELD_TYPES } from '../../../lib/schema';

// PATCH /api/fields/:id  { label?, type?, position? }
export const onRequestPatch: PagesFunction<Env, 'id', Data> = async ({ request, env, data, params }) => {
  const user = requireUser(data.user);
  const body = await readJson<{ label?: unknown; type?: unknown; position?: unknown }>(request);
  const sets: string[] = [];
  const args: unknown[] = [String(params.id), user.id];
  if (body.label !== undefined) {
    const label = typeof body.label === 'string' ? body.label.trim().slice(0, 80) : '';
    if (!label) throw new HttpError(400, 'Give the field a name.');
    args.push(label);
    sets.push(`label = ?${args.length}`);
  }
  if (body.type !== undefined && body.type !== 'text') {
    const f = await env.DB.prepare('SELECT key FROM field_defs WHERE id = ?1 AND user_id = ?2').bind(String(params.id), user.id).first<{ key: string | null }>();
    if (f?.key) throw new HttpError(400, 'This field is built in, so its type can’t change.');
  }
  if (body.type !== undefined) {
    if (typeof body.type !== 'string' || !(FIELD_TYPES as readonly string[]).includes(body.type)) throw new HttpError(400, 'Unknown field type.');
    args.push(body.type);
    sets.push(`type = ?${args.length}`);
  }
  if (body.position !== undefined) {
    if (typeof body.position !== 'number') throw new HttpError(400, 'Position must be a number.');
    args.push(Math.floor(body.position));
    sets.push(`position = ?${args.length}`);
  }
  if (!sets.length) throw new HttpError(400, 'Nothing to change.');
  const r = await env.DB.prepare(`UPDATE field_defs SET ${sets.join(', ')} WHERE id = ?1 AND user_id = ?2`).bind(...args).run();
  if (!r.meta.changes) throw new HttpError(404, 'Field not found.');
  return json({ ok: true });
};

// DELETE /api/fields/:id  → removes the field and its values on every contact.
export const onRequestDelete: PagesFunction<Env, 'id', Data> = async ({ env, data, params }) => {
  const user = requireUser(data.user);
  const id = String(params.id);
  const owned = await env.DB.prepare('SELECT key FROM field_defs WHERE id = ?1 AND user_id = ?2').bind(id, user.id).first<{ key: string | null }>();
  if (!owned) throw new HttpError(404, 'Field not found.');
  if (owned.key) throw new HttpError(400, 'This field is built in, so it can’t be deleted. You can hide its column.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM field_values WHERE field_id = ?1 AND user_id = ?2').bind(id, user.id),
    env.DB.prepare('DELETE FROM field_defs WHERE id = ?1 AND user_id = ?2').bind(id, user.id),
  ]);
  return json({ ok: true });
};
