import type { Data, Env, Group } from '../../lib/types';
import { json } from '../../lib/http';
import { accountsFor } from '../../lib/contacts';
import { canSendEmail, googleConfigured } from '../../lib/providers/google';
import { provider } from '../../lib/providers';

const safeJson = (s: string | null) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

export const onRequestGet: PagesFunction<Env, string, Data> = async ({ env, data }) => {
  const configured = googleConfigured(env);
  const user = data.user;
  if (!user) return json({ configured, user: null });

  const accounts = await accountsFor(env.DB, user.id);
  const fields = (
    await env.DB.prepare('SELECT id, label, type, position, key FROM field_defs WHERE user_id = ?1 ORDER BY position, created_at').bind(user.id).all()
  ).results;

  return json({
    configured,
    user: { id: user.id, name: user.display_name, prefs: safeJson(user.prefs) },
    accounts: accounts.map((a) => ({
      id: a.id,
      provider: a.provider,
      providerName: provider(a.provider).name,
      label: a.label,
      canEmail: a.provider === 'google' && canSendEmail(a),
      lastSyncedAt: a.last_synced_at,
      groups: JSON.parse(a.groups_json ?? '[]') as Group[],
    })),
    fields,
  });
};
