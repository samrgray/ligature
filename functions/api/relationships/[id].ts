import type { Data, Env } from '../../../lib/types';
import { HttpError, json } from '../../../lib/http';
import { requireUser } from '../../../lib/session';

// DELETE /api/relationships/:id
export const onRequestDelete: PagesFunction<Env, 'id', Data> = async ({ env, data, params }) => {
  const user = requireUser(data.user);
  const r = await env.DB.prepare('DELETE FROM relationships WHERE id = ?1 AND user_id = ?2').bind(String(params.id), user.id).run();
  if (!r.meta.changes) throw new HttpError(404, 'That relationship is already gone.');
  return json({ ok: true });
};
