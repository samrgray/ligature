// Relationships between contacts, and which people show as one entry in the list.
// A relationship is { id, a, b, kind, label, combined }. For parent and manager, a is the
// parent or manager. The iOS app mirrors this in Relations.swift.

/** What the other person is to you. `other` says which end they are for one-way kinds. */
export const ROLES = [
  { id: 'spouse', label: 'Spouse', kind: 'spouse', together: true },
  { id: 'partner', label: 'Partner', kind: 'partner', together: true },
  { id: 'parent', label: 'Parent', kind: 'parent', other: 'a' },
  { id: 'child', label: 'Child', kind: 'parent', other: 'b' },
  { id: 'sibling', label: 'Sibling', kind: 'sibling' },
  { id: 'relative', label: 'Relative', kind: 'relative' },
  { id: 'friend', label: 'Friend', kind: 'friend' },
  { id: 'colleague', label: 'Colleague', kind: 'colleague' },
  { id: 'manager', label: 'Manager', kind: 'manager', other: 'a' },
  { id: 'report', label: 'Reports to you', kind: 'manager', other: 'b' },
  { id: 'other', label: 'Other', kind: 'other' },
];

export const otherId = (r, me) => (r.a === me ? r.b : r.a);

/** The role the other person in `r` has, seen from `me`. */
export function roleOf(r, me) {
  const otherEnd = r.a === me ? 'b' : 'a';
  return ROLES.find((x) => x.kind === r.kind && (!x.other || x.other === otherEnd)) ?? ROLES[ROLES.length - 1];
}

export function roleLabel(r, me) {
  if (r.kind === 'other') return r.label || 'Related';
  return roleOf(r, me).label;
}

/** The request body for “`other` is `me`’s <role>”. */
export function relationshipBody(me, other, roleId, label, combined) {
  const role = ROLES.find((x) => x.id === roleId) ?? ROLES[ROLES.length - 1];
  const [a, b] = role.other === 'a' ? [other, me] : [me, other];
  return { a, b, kind: role.kind, label: role.kind === 'other' ? label : '', combined: Boolean(combined) };
}

/**
 * People shown together: everyone joined by relationships marked `combined`, directly or
 * through someone else. Returns Map(contact id → members, in display order).
 */
export function togetherGroups(contacts, rels) {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const joined = rels.filter((r) => r.combined && byId.has(r.a) && byId.has(r.b));
  for (const r of joined) {
    for (const x of [r.a, r.b]) if (!parent.has(x)) parent.set(x, x);
    parent.set(find(r.a), find(r.b));
  }
  const sets = new Map();
  for (const x of parent.keys()) {
    const root = find(x);
    if (!sets.has(root)) sets.set(root, []);
    sets.get(root).push(byId.get(x));
  }
  const out = new Map();
  for (const members of sets.values()) {
    const ordered = orderMembers(members, joined);
    for (const m of ordered) out.set(m.id, ordered);
  }
  return out;
}

/** Parents before their children, managers before reports, then by first name. */
function orderMembers(members, rels) {
  const ids = new Set(members.map((m) => m.id));
  const above = rels.filter((r) => (r.kind === 'parent' || r.kind === 'manager') && ids.has(r.a) && ids.has(r.b));
  const depth = new Map(members.map((m) => [m.id, 0]));
  for (let i = 0; i < members.length; i++) {
    for (const r of above) depth.set(r.b, Math.max(depth.get(r.b), depth.get(r.a) + 1));
  }
  const first = (m) => (m.givenName || m.displayName || '').toLowerCase();
  return [...members].sort((x, y) => depth.get(x.id) - depth.get(y.id) || first(x).localeCompare(first(y)));
}

function joinNames(names) {
  if (names.length <= 2) return names.join(' & ');
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

/** “Alex & Jamie Smith”, or “Alex Smith & Jamie Ortiz” when the last names differ. */
export function togetherName(members) {
  const family = members[0]?.familyName;
  if (family && members.every((m) => m.givenName && m.familyName === family)) {
    return `${joinNames(members.map((m) => m.givenName))} ${family}`;
  }
  return joinNames(members.map((m) => m.displayName || 'No name'));
}
