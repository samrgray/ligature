import type { Data, Env } from '../../lib/types';
import { HttpError, json, now } from '../../lib/http';
import { requireUser } from '../../lib/session';
import { searchPlaces } from '../../lib/geo';

// GET /api/places?q=…  → places matching an address or name, from OpenStreetMap.
// One search a second per user, as OpenStreetMap asks.
export const onRequestGet: PagesFunction<Env, string, Data> = async ({ request, env, data }) => {
  const user = requireUser(data.user);
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 300);
  if (q.length < 3) throw new HttpError(400, 'Type a bit more of the address.');
  const t = now();
  const ok = await env.DB
    .prepare(
      `INSERT INTO meta (key, value) VALUES (?1, ?2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(meta.value AS INTEGER) < ?3`,
    )
    .bind(`place_search:${user.id}`, String(t), t - 1000)
    .run();
  if (!ok.meta.changes) throw new HttpError(429, 'One search a second. Try again.');
  try {
    return json({ places: await searchPlaces(env, q) });
  } catch (e) {
    throw new HttpError(502, `Couldn’t search OpenStreetMap: ${(e as Error).message}`);
  }
};
