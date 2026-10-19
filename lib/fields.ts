import { HttpError } from './http';
import type { Group } from './types';

/** { accountId, listId } → the list, checked against the account; null → every contact. */
export async function readList(db: D1Database, userId: string, list: unknown) {
  if (list === null || list === undefined) return null;
  const l = list as { accountId?: unknown; listId?: unknown };
  const account = await db
    .prepare('SELECT groups_json FROM accounts WHERE id = ?1 AND user_id = ?2')
    .bind(String(l.accountId ?? ''), userId)
    .first<{ groups_json: string | null }>();
  const g = (JSON.parse(account?.groups_json ?? '[]') as Group[]).find((x) => x.id === l.listId);
  if (!g || g.id === 'contactGroups/myContacts') throw new HttpError(400, 'That list isn’t there any more. Sync and try again.');
  return { accountId: String(l.accountId), listId: g.id, listName: g.name };
}
