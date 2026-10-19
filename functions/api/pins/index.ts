import type { Data, Env } from '../../../lib/types';
import { HttpError, json, now, readJson } from '../../../lib/http';
import { requireUser } from '../../../lib/session';

export interface PinRow {
  id: string;
  label: string;
  address: string | null;
  lat: number;
  lng: number;
}

export const pinJson = (p: PinRow) => ({ id: p.id, label: p.label, address: p.address ?? '', lat: p.lat, lng: p.lng });

export function cleanLabel(v: unknown): string {
  const label = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, 100) : '';
  if (!label) throw new HttpError(400, 'Give the pin a label.');
  return label;
}

// GET /api/pins → your pins on the map.
export const onRequestGet: PagesFunction<Env, string, Data> = async ({ env, data }) => {
  const user = requireUser(data.user);
  const rows = (await env.DB.prepare('SELECT id, label, address, lat, lng FROM pins WHERE user_id = ?1 ORDER BY created_at').bind(user.id).all<PinRow>()).results;
  return json({ pins: rows.map(pinJson) });
};

// POST /api/pins  { label, lat, lng, address? }
export const onRequestPost: PagesFunction<Env, string, Data> = async ({ request, env, data }) => {
  const user = requireUser(data.user);
  const body = await readJson<{ label?: unknown; lat?: unknown; lng?: unknown; address?: unknown }>(request);
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new HttpError(400, 'That place has no position.');
  const pin: PinRow = {
    id: crypto.randomUUID(),
    label: cleanLabel(body.label),
    address: typeof body.address === 'string' ? body.address.slice(0, 500) : null,
    lat,
    lng,
  };
  await env.DB
    .prepare('INSERT INTO pins (id, user_id, label, address, lat, lng, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
    .bind(pin.id, user.id, pin.label, pin.address, lat, lng, now())
    .run();
  return json({ pin: pinJson(pin) }, 201);
};
