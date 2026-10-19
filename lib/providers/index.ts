import type { Provider } from './types';
import { google } from './google';
import { HttpError } from '../http';

// Register future providers (CardDAV, iCloud) here.
const PROVIDERS: Record<string, Provider> = { google };

export function provider(id: string): Provider {
  const p = PROVIDERS[id];
  if (!p) throw new HttpError(500, `Unknown contacts provider: ${id}`);
  return p;
}
