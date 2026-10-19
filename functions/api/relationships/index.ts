import type { Data, Env } from '../../../lib/types';
import { HttpError, json, now, readJson } from '../../../lib/http';
import { requireUser } from '../../../lib/session';
import { RELATIONSHIP_KINDS } from '../../../lib/schema';
import { accountsFor, ownedContacts, relationshipJson, relationshipsFor, stampLink, type RelationshipRow } from '../../../lib/contacts';

// GET /api/relationships → every relationship between your contacts.
export const onRequestGet: PagesFunction<Env, string, Data> = async ({ env, data }) => {
  const user = requireUser(data.user);
  return json({ relationships: await relationshipsFor(env.DB, user.id) });
};

// POST /api/relationships  { a, b, kind, label?, combined }
// Adds a relationship, or replaces the one already between these two people. For parent and
// manager, a is the parent or manager. Kept only in Ligature, never sent to Google.
export const onRequestPost: PagesFunction<Env, string, Data> = async ({ request, env, data }) => {
  const user = requireUser(data.user);
  const body = await readJson<{ a?: unknown; b?: unknown; kind?: unknown; label?: unknown; combined?: unknown }>(request);
  const a = String(body.a ?? '');
  const b = String(body.b ?? '');
  const kind = String(body.kind ?? '');
  if (!a || !b) throw new HttpError(400, 'Choose two people.');
  if (a === b) throw new HttpError(400, 'Choose someone else.');
  if (!(RELATIONSHIP_KINDS as readonly string[]).includes(kind)) throw new HttpError(400, 'Choose a kind of relationship.');
  const label = kind === 'other' && typeof body.label === 'string' ? body.label.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
  const rows = await ownedContacts(env.DB, user, [a, b]);

  const t = now();
  const existing = await env.DB
    .prepare('SELECT id, created_at FROM relationships WHERE user_id = ?1 AND ((a_id = ?2 AND b_id = ?3) OR (a_id = ?3 AND b_id = ?2))')
    .bind(user.id, a, b)
    .first<{ id: string; created_at: number }>();
  const row: RelationshipRow = { id: existing?.id ?? crypto.randomUUID(), a_id: a, b_id: b, kind, label: label || null, combined: body.combined ? 1 : 0 };
  await env.DB.batch([
    env.DB
      .prepare('DELETE FROM relationships WHERE user_id = ?1 AND ((a_id = ?2 AND b_id = ?3) OR (a_id = ?3 AND b_id = ?2))')
      .bind(user.id, a, b),
    env.DB
      .prepare(
        `INSERT INTO relationships (id, user_id, a_id, b_id, kind, label, combined, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      )
      .bind(row.id, user.id, a, b, kind, row.label, row.combined, existing?.created_at ?? t, t),
  ]);

  // Put Ligature’s ID in each person’s hidden Google data, so the relationship survives merges.
  // If that fails, the next sync retries.
  const accounts = new Map((await accountsFor(env.DB, user.id)).map((x) => [x.id, x]));
  for (const r of rows) {
    const account = accounts.get(r.account_id);
    if (r.link_stamped || !account) continue;
    try {
      await stampLink(env, env.DB, account, r);
    } catch (e) {
      console.warn('link stamp failed', r.id, e);
    }
  }
  return json({ relationship: relationshipJson(row) }, existing ? 200 : 201);
};
