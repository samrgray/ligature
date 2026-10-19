import type { AccountRow, Card, CardEdit, ContactRow, Labeled, UserRow } from './types';
import { provider } from './providers';
import { HttpError } from './http';

/** Your fields that are checkboxes: ticked ones are searched by their label, not their “1”. */
export async function checkboxFields(db: D1Database, userId: string): Promise<Map<string, string>> {
  const rows = (
    await db.prepare(`SELECT id, label FROM field_defs WHERE user_id = ?1 AND type = 'checkbox'`).bind(userId).all<{ id: string; label: string }>()
  ).results;
  return new Map(rows.map((r) => [r.id, r.label]));
}

/**
 * Everything about a contact that search looks through: every Google field and every one of
 * yours. Phone numbers are also there as bare digits, so “5550188” finds “(503) 555-0188”.
 */
export function searchText(card: Card, fields: Record<string, string>, checkboxes: Map<string, string>): string {
  const labeled = (list: Labeled[]) => list.flatMap((l) => [l.value, l.label]);
  return [
    card.givenName, card.familyName, card.displayName, card.organization, card.title,
    ...labeled(card.phones), ...card.phones.map((p) => p.value.replace(/\D/g, '')),
    ...labeled(card.emails), ...labeled(card.urls), ...labeled(card.relations), ...labeled(card.events),
    ...card.addresses.flatMap((a) => [a.value, a.label]),
    card.birthday, card.notes,
    ...Object.entries(fields).map(([id, v]) => (checkboxes.has(id) ? (v === '1' ? checkboxes.get(id) : '') : v)),
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export async function contactPayload(db: D1Database, user: UserRow, row: ContactRow, account: AccountRow) {
  const p = provider(account.provider);
  const values = (
    await db.prepare('SELECT field_id, value, updated_at FROM field_values WHERE contact_id = ?1').bind(row.id).all<{
      field_id: string; value: string; updated_at: number;
    }>()
  ).results;
  const card = p.toCard(JSON.parse(row.data_json ?? '{}'));
  let archived: { at: number; groups: string[] } | undefined;
  if (row.archived_at) {
    // Archived: Google no longer has them, so the photo and lists come from the archive.
    const a = await db
      .prepare('SELECT photo, groups_json, archived_at FROM archives WHERE contact_id = ?1')
      .bind(row.id)
      .first<{ photo: string | null; groups_json: string; archived_at: number }>();
    card.photoUrl = a?.photo ? `data:image/jpeg;base64,${a.photo}` : '';
    card.groups = JSON.parse(a?.groups_json ?? '[]');
    archived = { at: a?.archived_at ?? row.archived_at, groups: card.groups };
  }
  const fields: Record<string, string> = Object.fromEntries(values.map((v) => [v.field_id, v.value]));
  return {
    id: row.id,
    etag: row.etag,
    archived,
    card,
    fields,
    search: searchText(card, fields, await checkboxFields(db, user.id)),
    linked: Boolean(row.link_stamped),
    account: { id: account.id, provider: account.provider, providerName: p.name, label: account.label },
    syncedAt: row.updated_at,
  };
}

const str = (v: unknown, max = 2000) => {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new HttpError(400, 'Expected text.');
  return v.slice(0, max);
};
const list = (v: unknown): Labeled[] | undefined => {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > 50) throw new HttpError(400, 'Expected a list.');
  return v.map((i) => ({ value: str(i?.value, 500) ?? '', label: str(i?.label, 60) ?? '' }));
};

const addresses = (v: unknown) => {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > 20) throw new HttpError(400, 'Expected a list of addresses.');
  return v.map((i) => ({
    label: str(i?.label, 60) ?? '',
    street: str(i?.street, 500) ?? '',
    city: str(i?.city, 200) ?? '',
    region: str(i?.region, 200) ?? '',
    postalCode: str(i?.postalCode, 40) ?? '',
    country: str(i?.country, 200) ?? '',
  }));
};

export function cleanEdit(e: unknown): CardEdit {
  const x = (e ?? {}) as Record<string, unknown>;
  return {
    givenName: str(x.givenName, 200),
    familyName: str(x.familyName, 200),
    organization: str(x.organization, 200),
    title: str(x.title, 200),
    phones: list(x.phones),
    emails: list(x.emails),
    urls: list(x.urls),
    addresses: addresses(x.addresses),
    groups: Array.isArray(x.groups) ? x.groups.filter((g): g is string => typeof g === 'string').slice(0, 20) : undefined,
    notes: str(x.notes, 20000),
  };
}
