import { json } from '../../lib/http';

export const onRequest: PagesFunction = async () => json({ error: 'Not found.' }, 404);
