import type { Data, Env } from '../../../lib/types';
import { HttpError, json, now, readJson } from '../../../lib/http';
import { requireUser } from '../../../lib/session';
import { FIELD_TYPES } from '../../../lib/schema';

// POST /api/fields  { label, type }  → define a new field of your own.
export const onRequestPost: PagesFunction<Env, string, Data> = async ({ request, env, data }) => {
  const user = requireUser(data.user);
  const body = await readJson<{ label?: unknown; type?: unknown }>(request);
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 80) : '';
  const type = typeof body.type === 'string' ? body.type : 'text';
  if (!label) throw new HttpError(400, 'Give the field a name.');
  if (!(FIELD_TYPES as readonly string[]).includes(type)) throw new HttpError(400, 'Unknown field type.');
  const max = await env.DB.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM field_defs WHERE user_id = ?1').bind(user.id).first<{ m: number }>();
  const field = { id: crypto.randomUUID(), label, type, position: (max?.m ?? -1) + 1 };
  await env.DB
    .prepare('INSERT INTO field_defs (id, user_id, label, type, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(field.id, user.id, field.label, field.type, field.position, now())
    .run();
  return json(field, 201);
};
