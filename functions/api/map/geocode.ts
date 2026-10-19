import type { Data, Env } from '../../../lib/types';
import { json, now } from '../../../lib/http';
import { requireUser } from '../../../lib/session';
import { geocode } from '../../../lib/geo';
import { mapState } from './index';

const BUDGET_MS = 8000;
const LOCK_MS = 20_000;

// POST /api/map/geocode → look up a few more places (about a second each), then return the
// updated map. Clients call this repeatedly while the map is open. One lookup runs at a time
// per user, as OpenStreetMap asks.
export const onRequestPost: PagesFunction<Env, string, Data> = async ({ env, data }) => {
  const user = requireUser(data.user);
  const start = now();
  const before = await mapState(env, user);
  let looked = 0;
  if (before.missing.length) {
    const lockKey = `geocode_lock:${user.id}`;
    const got = await env.DB
      .prepare(
        `INSERT INTO meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(meta.value AS INTEGER) < ?3`,
      )
      .bind(lockKey, String(start), start - LOCK_MS)
      .run();
    if (!got.meta.changes) return json({ points: before.points, failed: before.failed, pending: before.missing.length, busy: true });
    try {
      looked = await geocode(env, user.id, before.missing, start + BUDGET_MS);
    } finally {
      await env.DB.prepare('DELETE FROM meta WHERE key = ?1').bind(lockKey).run();
    }
  }
  const s = looked ? await mapState(env, user) : before;
  return json({ points: s.points, failed: s.failed, pending: s.missing.length, stalled: before.missing.length > 0 && s.missing.length >= before.missing.length });
};
