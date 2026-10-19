import type { Data, Env } from '../../../lib/types';
import { HttpError, json, readJson } from '../../../lib/http';
import { requireUser } from '../../../lib/session';
import { cleanLabel, pinJson, type PinRow } from './index';

// PATCH /api/pins/:id  { label }
export const onRequestPatch: PagesFunction<Env, 'id', Data> = async ({ request, env, data, params }) => {
  const user = requireUser(data.user);
  const body = await readJson<{ label?: unknown }>(request);
  const label = cleanLabel(body.label);
  const r = await env.DB.prepare('UPDATE pins SET label = ?3 WHERE id = ?1 AND user_id = ?2').bind(String(params.id), user.id, label).run();
  if (!r.meta.changes) throw new HttpError(404, 'That pin is gone.');
  const pin = await env.DB.prepare('SELECT id, label, address, lat, lng FROM pins WHERE id = ?1').bind(String(params.id)).first<PinRow>();
  return json({ pin: pinJson(pin!) });
};

// DELETE /api/pins/:id
export const onRequestDelete: PagesFunction<Env, 'id', Data> = async ({ env, data, params }) => {
  const user = requireUser(data.user);
  await env.DB.prepare('DELETE FROM pins WHERE id = ?1 AND user_id = ?2').bind(String(params.id), user.id).run();
  return json({ ok: true });
};
