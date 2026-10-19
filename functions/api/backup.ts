import type { Data, Env } from '../../lib/types';
import { requireUser } from '../../lib/session';

const parse = (s: unknown) => {
  if (typeof s !== 'string' || !s) return s ?? null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

// GET /api/backup → everything Ligature keeps for you, as one JSON file to download:
// each contact’s full Google card (as last synced), your fields and their values,
// relationships, map pins, the archive (with photos), lists and settings.
// Sign-in tokens and sessions are left out.
export const onRequestGet: PagesFunction<Env, string, Data> = async ({ env, data }) => {
  const user = requireUser(data.user);
  const all = async (sql: string) => (await env.DB.prepare(sql).bind(user.id).all<Record<string, unknown>>()).results;

  const [accounts, contacts, fieldDefs, fieldValues, relationships, pins, archives, interactions] = await Promise.all([
    all(`SELECT id, provider, provider_account_id, label, scopes, groups_json, last_synced_at, created_at FROM accounts WHERE user_id = ?1`),
    all(`SELECT id, account_id, provider_contact_id, etag, display_name, data_json, merged_into, deleted_at, archived_at, updated_at, created_at
         FROM contacts WHERE user_id = ?1 ORDER BY sort_key`),
    all(`SELECT id, label, type, position, key, created_at FROM field_defs WHERE user_id = ?1 ORDER BY position`),
    all(`SELECT contact_id, field_id, value, updated_at FROM field_values WHERE user_id = ?1`),
    all(`SELECT id, a_id, b_id, kind, label, combined, created_at, updated_at FROM relationships WHERE user_id = ?1`),
    all(`SELECT id, label, address, lat, lng, created_at FROM pins WHERE user_id = ?1`),
    all(`SELECT contact_id, person_json, groups_json, photo, archived_at FROM archives WHERE user_id = ?1`),
    all(`SELECT id, contact_id, channel, mode, subject, body, occurred_at, batch_id FROM interactions WHERE user_id = ?1`),
  ]);

  const backup = {
    app: 'Ligature',
    version: 1,
    exportedAt: new Date().toISOString(),
    user: { id: user.id, name: user.display_name, prefs: parse(user.prefs) },
    accounts: accounts.map(({ groups_json, ...a }) => ({ ...a, lists: parse(groups_json) })),
    contacts: contacts.map(({ data_json, ...c }) => ({ ...c, google: parse(data_json) })),
    fields: fieldDefs,
    fieldValues,
    relationships,
    pins,
    archive: archives.map(({ person_json, groups_json, ...a }) => ({ ...a, google: parse(person_json), lists: parse(groups_json) })),
    messages: interactions,
  };

  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="ligature-backup-${day}.json"`,
      'cache-control': 'no-store',
    },
  });
};
