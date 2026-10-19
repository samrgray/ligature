import type { Data, Env } from '../../lib/types';
import { ensureSchema } from '../../lib/schema';
import { loadSessionUser } from '../../lib/session';
import { errorResponse, HttpError } from '../../lib/http';

export const onRequest: PagesFunction<Env, string, Data> = async (ctx) => {
  try {
    const { request, env } = ctx;
    if (!env.DB) throw new HttpError(500, 'The D1 database isn’t bound as DB.', 'not_configured');
    await ensureSchema(env.DB);

    // Cookie sessions + SameSite=Lax, plus an Origin check on every state-changing request.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'Cross-site request blocked.');
    }

    ctx.data.user = await loadSessionUser(env.DB, request);
    return await ctx.next();
  } catch (e) {
    return errorResponse(e);
  }
};
