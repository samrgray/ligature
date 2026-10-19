import type { Data, Env, UserRow } from '../../../lib/types';
import { json } from '../../../lib/http';
import { requireUser } from '../../../lib/session';
import { provider } from '../../../lib/providers';
import { cachedGeocodes, placesFor, resolve } from '../../../lib/geo';

export interface MapState {
  /** One point per contact per address that could be placed. */
  points: { id: string; label: string; precision: string; lat: number; lng: number; text: string }[];
  /** Places still to look up. */
  missing: string[];
  /** Addresses OpenStreetMap couldn’t find. */
  failed: { id: string; label: string; text: string }[];
}

export async function mapState(env: Env, user: UserRow): Promise<MapState> {
  const rows = (
    await env.DB
      .prepare(
        `SELECT c.id, c.data_json, a.provider,
           (SELECT fv.value FROM field_values fv JOIN field_defs fd ON fd.id = fv.field_id
            WHERE fv.contact_id = c.id AND fd.key = 'neighborhood') AS hood
         FROM contacts c JOIN accounts a ON a.id = c.account_id
         WHERE c.user_id = ?1 AND c.deleted_at IS NULL AND c.merged_into IS NULL AND c.archived_at IS NULL`,
      )
      .bind(user.id)
      .all<{ id: string; data_json: string; provider: string; hood: string | null }>()
  ).results;
  const cache = await cachedGeocodes(env.DB, user.id);
  const out: MapState = { points: [], missing: [], failed: [] };
  const missing = new Set<string>();
  for (const r of rows) {
    const card = provider(r.provider).toCard(JSON.parse(r.data_json));
    for (const place of placesFor(card.addresses, r.hood ?? '')) {
      const res = resolve(place, cache);
      if ('missing' in res) missing.add(res.missing!);
      else if ('failed' in res) out.failed.push({ id: r.id, label: place.label, text: place.text });
      else out.points.push({ id: r.id, label: place.label, precision: res.precision, lat: res.lat, lng: res.lng, text: place.text });
    }
  }
  out.missing = [...missing];
  return out;
}

// GET /api/map → where your contacts are, as far as it’s been looked up.
export const onRequestGet: PagesFunction<Env, string, Data> = async ({ env, data }) => {
  const user = requireUser(data.user);
  const s = await mapState(env, user);
  return json({ points: s.points, failed: s.failed, pending: s.missing.length });
};
