import type { Data, Env } from '../../../../lib/types';
import { HttpError, json, readJson } from '../../../../lib/http';
import { requireUser } from '../../../../lib/session';
import { provider } from '../../../../lib/providers';
import { cached, loadContact, saveDraft, saveFromProvider } from '../../../../lib/contacts';
import { contactPayload } from '../../../../lib/payload';

const MAX_BASE64 = 2_000_000; // about 1.5 MB of image; the browser sends a 512 px JPEG

type Ctx = Parameters<PagesFunction<Env, 'id', Data>>[0];

/**
 * Google’s photo endpoints don’t take an etag, so first make sure the contact is the one
 * you saw: our copy must match your etag, and Google’s current copy must match ours.
 * If either has moved on, reload and ask you to try again rather than overwrite.
 */
async function prepare(ctx: Ctx, etag: unknown) {
  const user = requireUser(ctx.data.user);
  if (typeof etag !== 'string' || !etag) throw new HttpError(400, 'Missing etag.');
  const { row, account } = await loadContact(ctx.env.DB, user, String(ctx.params.id));
  if (row.archived_at) throw new HttpError(409, 'This contact is archived. Restore it to edit it.', 'archived');
  const p = provider(account.provider);
  const pctx = { env: ctx.env, db: ctx.env.DB, account };
  const conflict = async (fresh = row) => {
    throw new HttpError(409, 'This contact changed in Google since you opened it. It’s been reloaded; change the photo again.', 'conflict', {
      contact: await contactPayload(ctx.env.DB, user, fresh, account),
    });
  };
  if (etag !== row.etag) await conflict();
  if (row.draft) return { user, row, account, p, pctx, draft: true };
  const current = await p.get(pctx, row.provider_contact_id);
  if (current.etag !== row.etag) await conflict(await saveFromProvider(ctx.env.DB, row, current, account.provider));
  return { user, row, account, p, pctx, draft: false };
}

// PUT /api/contacts/:id/photo  { etag, image }  → set the photo in Google (JPEG, base64).
export const onRequestPut: PagesFunction<Env, 'id', Data> = async (ctx) => {
  const body = await readJson<{ etag?: unknown; image?: unknown }>(ctx.request);
  if (typeof body.image !== 'string' || !body.image) throw new HttpError(400, 'No image.');
  const image = body.image.replace(/^data:image\/\w+;base64,/, '');
  if (image.length > MAX_BASE64 || !/^[A-Za-z0-9+/]+=*$/.test(image)) throw new HttpError(400, 'That image is too large or not readable.');
  const { user, row, account, p, pctx, draft } = await prepare(ctx, body.etag);
  const saved = draft
    ? await saveDraft(ctx.env.DB, row, p.setDraftPhoto(JSON.parse(row.data_json ?? '{}'), image), account.provider)
    : await saveFromProvider(ctx.env.DB, row, await p.setPhoto(pctx, cached(row), image), account.provider);
  return json(await contactPayload(ctx.env.DB, user, saved, account));
};

// DELETE /api/contacts/:id/photo?etag=…  → remove the photo in Google.
export const onRequestDelete: PagesFunction<Env, 'id', Data> = async (ctx) => {
  const { user, row, account, p, pctx, draft } = await prepare(ctx, new URL(ctx.request.url).searchParams.get('etag'));
  const saved = draft
    ? await saveDraft(ctx.env.DB, row, p.setDraftPhoto(JSON.parse(row.data_json ?? '{}'), null), account.provider)
    : await saveFromProvider(ctx.env.DB, row, await p.deletePhoto(pctx, cached(row)), account.provider);
  return json(await contactPayload(ctx.env.DB, user, saved, account));
};
