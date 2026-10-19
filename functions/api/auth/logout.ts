import type { Data, Env } from '../../../lib/types';
import { json } from '../../../lib/http';
import { destroySession } from '../../../lib/session';

export const onRequestPost: PagesFunction<Env, string, Data> = async ({ request, env }) => {
  return json({ ok: true }, 200, { 'set-cookie': await destroySession(env.DB, request) });
};
