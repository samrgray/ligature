import type { AccountRow, ContactRow, Data, Env } from '../../../lib/types';
import { HttpError, json, now, readJson } from '../../../lib/http';
import { requireUser } from '../../../lib/session';
import { provider } from '../../../lib/providers';
import { cached } from '../../../lib/contacts';

// POST /api/contacts/delete  { ids, etags? }  → delete contacts in Google (and so on your
// iPhone and Mac), then in Ligature.
// A contact is only deleted if it hasn’t changed since you last saw it: `etags` (from the
// detail panel) must match our copy, and Google’s copy must match ours. Others are skipped
// and reported, so a stale screen can never delete someone’s newer details.
export const onRequestPost: PagesFunction<Env, string, Data> = async ({ request, env, data }) => {
  const user = requireUser(data.user);
  const body = await readJson<{ ids?: unknown; etags?: unknown }>(request);
  if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 200 || body.ids.some((id) => typeof id !== 'string')) {
    throw new HttpError(400, 'Choose up to 200 contacts to delete.');
  }
  const seen = (body.etags && typeof body.etags === 'object' ? body.etags : {}) as Record<string, unknown>;
  const rows = (
    await env.DB
      .prepare(
        `SELECT * FROM contacts WHERE user_id = ?1 AND deleted_at IS NULL AND merged_into IS NULL AND archived_at IS NULL
           AND id IN (SELECT value FROM json_each(?2))`,
      )
      .bind(user.id, JSON.stringify(body.ids))
      .all<ContactRow>()
  ).results;

  const changed: string[] = [];
  const byAccount = new Map<string, ContactRow[]>();
  for (const r of rows) {
    if (typeof seen[r.id] === 'string' && seen[r.id] !== r.etag) {
      changed.push(r.id);
      continue;
    }
    byAccount.set(r.account_id, [...(byAccount.get(r.account_id) ?? []), r]);
  }

  const removed: string[] = [];
  for (const [accountId, all] of byAccount) {
    // Drafts are only in Ligature: nothing to delete in Google.
    removed.push(...all.filter((r) => r.draft).map((r) => r.id));
    const list = all.filter((r) => !r.draft);
    if (!list.length) continue;
    const account = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?1 AND user_id = ?2').bind(accountId, user.id).first<AccountRow>();
    if (!account) continue;
    const result = await provider(account.provider).deleteContacts({ env, db: env.DB, account }, list.map(cached));
    const done = new Set([...result.deleted, ...result.gone]);
    for (const r of list) {
      if (done.has(r.provider_contact_id)) removed.push(r.id);
      else changed.push(r.id);
    }
  }

  // Kept as deleted rows, like contacts deleted in Google, so a merge or restore can find them.
  if (removed.length) {
    const t = now();
    await env.DB
      .prepare(`UPDATE contacts SET deleted_at = ?2, updated_at = ?2 WHERE user_id = ?3 AND id IN (SELECT value FROM json_each(?1))`)
      .bind(JSON.stringify(removed), t, user.id)
      .run();
  }
  return json({ deleted: removed, changed, missing: (body.ids as string[]).filter((id) => !rows.some((r) => r.id === id)) });
};
