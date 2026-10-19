import type { Data, Env } from '../../../lib/types';
import { HttpError, json, readJson } from '../../../lib/http';
import { requireUser } from '../../../lib/session';
import { provider } from '../../../lib/providers';

// POST /api/contacts/lookup  { ids }  → names, phones, emails and your fields for each,
// for filling in message templates.
export const onRequestPost: PagesFunction<Env, string, Data> = async ({ request, env, data }) => {
  const user = requireUser(data.user);
  const { ids } = await readJson<{ ids?: unknown }>(request);
  if (!Array.isArray(ids) || ids.length > 2000 || ids.some((id) => typeof id !== 'string')) throw new HttpError(400, 'Bad contact list.');
  const list = JSON.stringify([...new Set(ids as string[])]);

  const [rows, values] = await env.DB.batch([
    env.DB
      .prepare(
        `SELECT c.id, c.account_id, c.data_json, a.provider FROM contacts c JOIN accounts a ON a.id = c.account_id
         WHERE c.user_id = ?1 AND c.deleted_at IS NULL AND c.merged_into IS NULL AND c.archived_at IS NULL
           AND c.id IN (SELECT value FROM json_each(?2))`,
      )
      .bind(user.id, list),
    env.DB
      .prepare(`SELECT contact_id, field_id, value FROM field_values WHERE user_id = ?1 AND contact_id IN (SELECT value FROM json_each(?2))`)
      .bind(user.id, list),
  ]);

  const fields = new Map<string, Record<string, string>>();
  for (const v of values.results as { contact_id: string; field_id: string; value: string }[]) {
    const f = fields.get(v.contact_id) ?? {};
    f[v.field_id] = v.value;
    fields.set(v.contact_id, f);
  }

  return json({
    contacts: (rows.results as { id: string; account_id: string; data_json: string; provider: string }[]).map((r) => {
      const card = provider(r.provider).toCard(JSON.parse(r.data_json));
      return {
        id: r.id,
        accountId: r.account_id,
        givenName: card.givenName,
        familyName: card.familyName,
        displayName: card.displayName,
        organization: card.organization,
        title: card.title,
        phones: card.phones,
        emails: card.emails,
        fields: fields.get(r.id) ?? {},
      };
    }),
  });
};
