// A tiny stand-in for Google OAuth + the People API, for local testing only.
// Run with `npm run dev:mock`. Not deployed (lives outside public/ and functions/).
import http from 'node:http';

const PORT = 8790;
const SCOPE = 'openid https://www.googleapis.com/auth/contacts';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ID_TOKEN = `${b64({ alg: 'none' })}.${b64({ iss: 'https://accounts.google.com', aud: 'mock-client', sub: 'mock-sub-1' })}.`;
// Scopes granted so far (Google keeps earlier grants with include_granted_scopes=true).
const granted = new Set(SCOPE.split(' '));
const sent = [];
let version = 1;
let nextId = 100;
let geoCalls = 0;
const people = new Map();

function put(p) {
  p.etag = `e${version}-${Math.random().toString(36).slice(2, 7)}`;
  p._v = version++;
  people.set(p.resourceName, p);
  return p;
}

const seed = [
  ['Ava', 'Chen', 'Northwind Studio', 'Design Lead', '(503) 555-0142', 'ava.chen@example.com', ['contactGroups/work', 'contactGroups/starred']],
  ['Aaron', 'Diaz', 'Diaz & Co.', 'Owner', '(503) 555-0110', 'aaron@example.com', []],
  ['Ben', 'Lowell', '', '', '(971) 555-0181', 'ben.lowell@example.net', ['contactGroups/family']],
  ['Beatriz', 'Okafor', 'Harbor Health', 'Physician', '(503) 555-0123', 'beatriz.okafor@example.org', []],
  ['Chris', 'Park', 'Northwind Studio', 'Engineer', '(503) 555-0164', 'chris.park@example.com', ['contactGroups/work']],
  ['Carmen', 'Ruiz', '', '', '(503) 555-0137', 'carmen.ruiz@example.com', ['contactGroups/neighbors']],
];
for (const [g, f, org, title, phone, email, groups] of seed) {
  put({
    resourceName: `people/c${nextId++}`,
    names: [{ givenName: g, familyName: f, displayName: `${g} ${f}`, metadata: { primary: true } }],
    organizations: org ? [{ name: org, title }] : [],
    phoneNumbers: [{ value: phone, type: 'mobile', formattedType: 'Mobile' }],
    emailAddresses: [{ value: email, type: 'work', formattedType: 'Work' }],
    memberships: groups.map((id) => ({ contactGroupMembership: { contactGroupResourceName: id } })),
    clientData: [],
  });
}

// MOCK_CSV=test-contacts.csv loads the 50 test contacts instead of the six above.
if (process.env.MOCK_CSV) {
  const { readFileSync } = await import('node:fs');
  const rows = parseCsv(readFileSync(process.env.MOCK_CSV, 'utf8'));
  const head = rows.shift();
  const col = (r, name) => r[head.indexOf(name)] ?? '';
  people.clear();
  const labelIds = { Work: 'contactGroups/work', Family: 'contactGroups/family', Neighbors: 'contactGroups/neighbors', Friends: 'contactGroups/friends' };
  for (const r of rows) {
    if (r.length < 2) continue;
    const [y, m, d] = col(r, 'Birthday').split('-').map(Number);
    put({
      resourceName: `people/c${nextId++}`,
      names: col(r, 'First Name') || col(r, 'Last Name') ? [{ givenName: col(r, 'First Name'), familyName: col(r, 'Last Name') }] : [],
      organizations: col(r, 'Organization Name') ? [{ name: col(r, 'Organization Name'), title: col(r, 'Organization Title') }] : [],
      phoneNumbers: ['Phone 1', 'Phone 2'].filter((k) => col(r, `${k} - Value`)).map((k) => ({ value: col(r, `${k} - Value`), type: col(r, `${k} - Label`).toLowerCase(), formattedType: col(r, `${k} - Label`) })),
      emailAddresses: ['E-mail 1', 'E-mail 2'].filter((k) => col(r, `${k} - Value`)).map((k) => ({ value: col(r, `${k} - Value`), type: col(r, `${k} - Label`).toLowerCase(), formattedType: col(r, `${k} - Label`) })),
      addresses: col(r, 'Address 1 - Street') ? [{
        formattedValue: `${col(r, 'Address 1 - Street')}\n${col(r, 'Address 1 - City')}, ${col(r, 'Address 1 - Region')} ${col(r, 'Address 1 - Postal Code')}`,
        streetAddress: col(r, 'Address 1 - Street'), city: col(r, 'Address 1 - City'), region: col(r, 'Address 1 - Region'),
        postalCode: col(r, 'Address 1 - Postal Code'), country: 'United States', countryCode: 'US', type: 'home', formattedType: 'Home',
      }] : [],
      birthdays: y ? [{ date: { year: y, month: m, day: d } }] : [],
      biographies: col(r, 'Notes') ? [{ value: col(r, 'Notes') }] : [],
      memberships: col(r, 'Labels').split(' ::: ').map((l) => labelIds[l.trim()]).filter(Boolean).map((id) => ({ contactGroupMembership: { contactGroupResourceName: id } })),
      clientData: [],
    });
  }
}

function parseCsv(text) {
  const out = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); out.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

let groups = [
  { resourceName: 'contactGroups/myContacts', groupType: 'SYSTEM_CONTACT_GROUP', name: 'myContacts' },
  { resourceName: 'contactGroups/starred', groupType: 'SYSTEM_CONTACT_GROUP', name: 'starred' },
  { resourceName: 'contactGroups/work', groupType: 'USER_CONTACT_GROUP', name: 'Work', formattedName: 'Work' },
  { resourceName: 'contactGroups/family', groupType: 'SYSTEM_CONTACT_GROUP', name: 'family', formattedName: 'Family', memberCount: 1 },
  { resourceName: 'contactGroups/coworkers', groupType: 'SYSTEM_CONTACT_GROUP', name: 'coworkers', formattedName: 'Coworkers', memberCount: 0 },
  { resourceName: 'contactGroups/neighbors', groupType: 'USER_CONTACT_GROUP', name: 'Neighbors', formattedName: 'Neighbors' },
  { resourceName: 'contactGroups/friends', groupType: 'SYSTEM_CONTACT_GROUP', name: 'friends', formattedName: 'Friends', memberCount: 8 },
];

const pub = (p) => {
  const { _v, ...rest } = p;
  void _v;
  const n = rest.names?.[0];
  if (n) n.displayName = [n.givenName, n.familyName].filter(Boolean).join(' ');
  return rest;
};
const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((r) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => r(s));
  });
const authed = (req) => /^Bearer at-/.test(req.headers.authorization ?? '');

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;
    const body = await readBody(req);
    console.log(req.method, path + url.search.slice(0, 80));

    // ---- OAuth
    if (path === '/auth') {
      const back = new URL(url.searchParams.get('redirect_uri'));
      for (const sc of (url.searchParams.get('scope') ?? '').split(' ')) if (sc) granted.add(sc);
      back.searchParams.set('code', 'mock-code');
      back.searchParams.set('state', url.searchParams.get('state'));
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }
    if (path === '/token') {
      const f = new URLSearchParams(body);
      if (f.get('client_secret') !== 'mock-secret') return send(res, 401, { error: 'invalid_client' });
      if (f.get('grant_type') === 'authorization_code') {
        if (!f.get('code_verifier')) return send(res, 400, { error: 'invalid_request', error_description: 'missing verifier' });
        return send(res, 200, { access_token: `at-${Date.now()}`, refresh_token: 'rt-mock', expires_in: 3600, scope: [...granted].join(' '), id_token: ID_TOKEN });
      }
      if (f.get('grant_type') === 'refresh_token') return send(res, 200, { access_token: `at-${Date.now()}`, expires_in: 3600, scope: [...granted].join(' ') });
      return send(res, 400, { error: 'unsupported_grant_type' });
    }

    // ---- a stand-in for OpenStreetMap’s geocoder: Portland, Oregon places, made up but stable
    if (path === '/geo/search') {
      const q = Object.fromEntries(url.searchParams);
      const text = [q.q, q.street, q.city, q.state, q.postalcode].filter(Boolean).join(' ').toLowerCase();
      if (/nowhere/.test(text)) return send(res, 200, []);
      // Like the real thing, a street with its ZIP or apartment often finds nothing.
      if (q.street && (q.postalcode || /apt|suite|#/i.test(q.street))) return send(res, 200, []);
      let h = 0;
      for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      const hoods = { sellwood: [45.4638, -122.653], hawthorne: [45.512, -122.625], alberta: [45.559, -122.644] };
      const hood = Object.entries(hoods).find(([n]) => text.includes(n));
      const [lat, lng] = q.street || (q.q && /\d/.test(q.q))
        ? [45.52 + ((h % 1000) / 1000 - 0.5) * 0.16, -122.66 + (((h >> 10) % 1000) / 1000 - 0.5) * 0.2]
        : hood ? hood[1] : /boston/.test(text) ? [42.3601, -71.0589] : [45.5152, -122.6784];
      geoCalls++;
      return send(res, 200, [{ lat: String(lat), lon: String(lng), display_name: text }]);
    }
    if (path === '/_mock/geocalls') return send(res, 200, { calls: geoCalls });

    // ---- test hooks
    if (path.startsWith('/_mock/edit/')) {
      const p = people.get(`people/${path.split('/').pop()}`);
      p.names[0].familyName += '!';
      put(p);
      return send(res, 200, pub(p));
    }
    if (path === '/_mock/merge') {
      const { from, into } = JSON.parse(body);
      const a = people.get(from);
      const b = people.get(into);
      b.clientData = [...(b.clientData ?? []), ...(a.clientData ?? [])];
      b.phoneNumbers = [...b.phoneNumbers, ...a.phoneNumbers];
      put(b);
      a.metadata = { deleted: true };
      put(a);
      return send(res, 200, { ok: true });
    }
    if (path === '/_mock/state') return send(res, 200, [...people.values()].map(pub));
    if (path === '/_mock/sent') return send(res, 200, sent);
    if (path === '/_mock/revoke-gmail') {
      granted.delete('https://www.googleapis.com/auth/gmail.send');
      return send(res, 200, { ok: true });
    }

    // ---- People API
    if (!authed(req)) return send(res, 401, { error: { code: 401, status: 'UNAUTHENTICATED', message: 'bad token' } });
    if (path === '/gmail/v1/users/me/messages/send') {
      if (!granted.has('https://www.googleapis.com/auth/gmail.send')) {
        return send(res, 403, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Request had insufficient authentication scopes.' } });
      }
      const raw = Buffer.from(JSON.parse(body).raw, 'base64url').toString('latin1');
      sent.push(raw);
      return send(res, 200, { id: `msg-${sent.length}`, threadId: `t-${sent.length}` });
    }
    if (path === '/v1/people/me') return send(res, 200, { resourceName: 'people/1234', etag: 'x', emailAddresses: [{ value: 'ligature.test@gmail.com' }] });
    // ---- contact groups (labels)
    const membersOf = (id) => [...people.values()].filter((p) => !p.metadata?.deleted && (p.memberships ?? []).some((m) => m.contactGroupMembership?.contactGroupResourceName === id));
    const withCount = (g) => ({ ...g, memberCount: membersOf(g.resourceName).length });
    const notFound = () => send(res, 404, { error: { code: 404, status: 'NOT_FOUND', message: 'Requested entity was not found.' } });
    if (path === '/v1/contactGroups' && req.method === 'GET') return send(res, 200, { contactGroups: groups.map(withCount) });
    if (path === '/v1/contactGroups' && req.method === 'POST') {
      const name = JSON.parse(body).contactGroup.name.trim();
      if (groups.some((g) => (g.formattedName || g.name).toLowerCase() === name.toLowerCase())) {
        return send(res, 409, { error: { code: 409, status: 'ALREADY_EXISTS', message: 'Contact group name already exists' } });
      }
      const g = { resourceName: `contactGroups/g${nextId++}`, etag: `ge${version++}`, groupType: 'USER_CONTACT_GROUP', name, formattedName: name };
      groups.push(g);
      return send(res, 200, withCount(g));
    }
    const gm = path.match(/^\/v1\/(contactGroups\/[\w]+)(\/members:modify)?$/);
    if (gm) {
      const g = groups.find((x) => x.resourceName === gm[1]);
      if (!g) return notFound();
      const memberOf = (p, id) => (p.memberships ?? []).some((m) => m.contactGroupMembership?.contactGroupResourceName === id);
      if (gm[2]) {
        const { resourceNamesToAdd = [], resourceNamesToRemove = [] } = JSON.parse(body);
        const missing = [];
        for (const n of resourceNamesToAdd) {
          const p = people.get(n);
          if (!p || p.metadata?.deleted) { missing.push(n); continue; }
          if (!memberOf(p, g.resourceName)) { p.memberships = [...(p.memberships ?? []), { contactGroupMembership: { contactGroupResourceName: g.resourceName } }]; put(p); }
        }
        for (const n of resourceNamesToRemove) {
          const p = people.get(n);
          if (!p || p.metadata?.deleted) { missing.push(n); continue; }
          if (memberOf(p, g.resourceName)) { p.memberships = p.memberships.filter((m) => m.contactGroupMembership?.contactGroupResourceName !== g.resourceName); put(p); }
        }
        return send(res, 200, missing.length ? { notFoundResourceNames: missing } : {});
      }
      if (req.method === 'GET') {
        const max = Number(url.searchParams.get('maxMembers') || 0);
        return send(res, 200, { ...withCount(g), etag: g.etag ?? 'ge0', memberResourceNames: max ? membersOf(g.resourceName).slice(0, max).map((p) => p.resourceName) : undefined });
      }
      if (g.groupType === 'SYSTEM_CONTACT_GROUP') return send(res, 400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Cannot modify system contact group' } });
      if (req.method === 'PUT') {
        const { contactGroup } = JSON.parse(body);
        if ((contactGroup.etag ?? '') !== (g.etag ?? 'ge0')) return send(res, 400, { error: { code: 400, status: 'FAILED_PRECONDITION', message: 'Request contactGroup.etag is different than the current contactGroup.etag.' } });
        g.name = g.formattedName = contactGroup.name.trim();
        g.etag = `ge${version++}`;
        return send(res, 200, withCount(g));
      }
      if (req.method === 'DELETE') {
        for (const p of membersOf(g.resourceName)) { p.memberships = p.memberships.filter((m) => m.contactGroupMembership?.contactGroupResourceName !== g.resourceName); put(p); }
        groups.splice(groups.indexOf(g), 1);
        return send(res, 200, {});
      }
    }
    if (path === '/v1/people/me/connections') {
      const st = url.searchParams.get('syncToken');
      const since = st ? Number(st.slice(1)) : 0;
      const list = [...people.values()].filter((p) => (st ? p._v >= since : !p.metadata?.deleted));
      return send(res, 200, { connections: list.map(pub), nextSyncToken: `v${version}`, totalItems: list.length });
    }
    if (path === '/v1/people:createContact') {
      const p = JSON.parse(body);
      p.resourceName = `people/c${nextId++}`;
      return send(res, 200, pub(put(p)));
    }
    if (path === '/v1/people:batchGet') {
      const names = url.searchParams.getAll('resourceNames');
      return send(res, 200, { responses: names.map((n) => {
        const p = people.get(n);
        // Like Google, the etag depends on which fields you ask for: only the full set
        // (what sync and edits use) gives the etag Ligature has stored.
        const full = (url.searchParams.get('personFields') || '').split(',').length > 5;
        const etag = full ? p?.etag : `${p?.etag}-partial`;
        return p && !p.metadata?.deleted ? { requestedResourceName: n, person: { ...pub(p), etag } } : { requestedResourceName: n, status: { code: 5 } };
      }) });
    }
    if (path === '/v1/people:batchDeleteContacts') {
      for (const n of JSON.parse(body).resourceNames) {
        const p = people.get(n);
        if (p) { p.metadata = { deleted: true }; put(p); }
      }
      return send(res, 200, {});
    }
    const ph = path.match(/^\/v1\/(people\/c\d+):(updateContactPhoto|deleteContactPhoto)$/);
    if (ph) {
      const p = people.get(ph[1]);
      if (!p) return send(res, 404, { error: { code: 404, status: 'NOT_FOUND', message: 'Not found' } });
      p.photos = ph[2] === 'updateContactPhoto'
        ? [{ url: `data:image/jpeg;base64,${JSON.parse(body).photoBytes}`, metadata: { primary: true } }]
        : [{ url: '', default: true }];
      return send(res, 200, { person: pub(put(p)) });
    }
    const m = path.match(/^\/v1\/(people\/c\d+)(:updateContact)?$/);
    if (m) {
      const p = people.get(m[1]);
      if (!p || p.metadata?.deleted) return send(res, 404, { error: { code: 404, status: 'NOT_FOUND', message: 'Not found' } });
      if (!m[2]) return send(res, 200, pub(p));
      const patch = JSON.parse(body);
      if (patch.etag !== p.etag) {
        return send(res, 400, {
          error: { code: 400, status: 'FAILED_PRECONDITION', message: 'Request person.etag is different than the current person.etag. Clear local cache and get the latest person.' },
        });
      }
      for (const f of url.searchParams.get('updatePersonFields').split(',')) p[f] = patch[f];
      return send(res, 200, pub(put(p)));
    }
    send(res, 404, { error: { code: 404, message: `mock: no route ${path}` } });
  })
  .listen(PORT, () => console.log(`mock google on :${PORT}`));
