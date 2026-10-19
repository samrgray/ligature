import type { Data, Env } from '../../../../lib/types';
import { HttpError, json, now, readJson } from '../../../../lib/http';
import { pkceChallenge, sha256Hex } from '../../../../lib/crypto';
import { createAppSession } from '../../../../lib/session';

// POST /api/auth/app/token  { code, verifier }  → { token }
// The iOS app trades the one-time code from sign-in for a session token. The verifier must
// match the challenge the app sent when it started, so a code caught on the way is useless.
export const onRequestPost: PagesFunction<Env, string, Data> = async ({ request, env }) => {
  const body = await readJson<{ code?: unknown; verifier?: unknown }>(request);
  if (typeof body.code !== 'string' || typeof body.verifier !== 'string') throw new HttpError(400, 'Missing code.');
  const id = await sha256Hex(body.code);
  const row = await env.DB.prepare('SELECT * FROM app_codes WHERE id = ?1').bind(id).first<{
    user_id: string; challenge: string; created_at: number;
  }>();
  await env.DB.prepare('DELETE FROM app_codes WHERE id = ?1').bind(id).run();
  if (!row || now() - row.created_at > 5 * 60_000) throw new HttpError(400, 'That sign-in expired. Try again.', 'expired');
  if ((await pkceChallenge(body.verifier)) !== row.challenge) throw new HttpError(400, 'That sign-in didn’t start in this app. Try again.');
  return json({ token: await createAppSession(env.DB, row.user_id) });
};
