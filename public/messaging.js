// Message templates and links to messaging apps. Pure functions, no DOM.

// {{First name}} or {{First name|there}} (“there” when the value is blank).
const TAG_RE = /\{\{\s*([^{}|]+?)\s*(?:\|\s*([^{}]*?)\s*)?\}\}/g;

export const BUILTIN_TAGS = ['First name', 'Last name', 'Full name', 'Company', 'Job title'];

export const CHANNELS = {
  email: { label: 'Email', needs: 'email', group: true, app: 'Gmail' },
  text: { label: 'Text', needs: 'phone', group: true, app: 'Messages' },
  whatsapp: { label: 'WhatsApp', needs: 'phone', group: false, app: 'WhatsApp' },
  signal: { label: 'Signal', needs: 'phone', group: false, app: 'Signal' },
};

const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function formatDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

/** The value of a tag for one person: a string (maybe empty), or undefined if no such tag. */
export function tagValue(person, label, fields) {
  switch (norm(label)) {
    case 'first name':
      return person.givenName || '';
    case 'last name':
      return person.familyName || '';
    case 'full name':
    case 'name':
      return person.displayName || '';
    case 'company':
      return person.organization || '';
    case 'job title':
    case 'title':
      return person.title || '';
  }
  const f = fields.find((x) => norm(x.label) === norm(label));
  if (!f) return undefined;
  const v = person.fields?.[f.id] ?? '';
  return f.type === 'date' ? formatDate(v) : v;
}

export function findTags(text) {
  return [...String(text).matchAll(TAG_RE)].map((m) => ({ label: m[1], fallback: m[2] }));
}

export function unknownTags(texts, fields) {
  const probe = { fields: {} };
  const out = new Set();
  for (const t of texts) for (const { label } of findTags(t)) if (tagValue(probe, label, fields) === undefined) out.add(label);
  return [...out];
}

/** Fill in tags. `blanks` lists tags that were empty and had no fallback. */
export function render(text, person, fields) {
  const blanks = [];
  const out = String(text).replace(TAG_RE, (whole, label, fallback) => {
    const v = tagValue(person, label, fields);
    if (v === undefined) return whole;
    if (v.trim()) return v;
    if (fallback !== undefined) return fallback;
    blanks.push(label.trim());
    return '';
  });
  return { text: out, blanks };
}

// ---------------------------------------------------------------- addresses

const MOBILE = /mobile|cell|iphone/i;

export function defaultPhone(phones) {
  return (phones.find((p) => MOBILE.test(p.label)) ?? phones[0])?.value ?? '';
}

export function defaultEmail(emails) {
  return emails[0]?.value ?? '';
}

/** +15551234567. Numbers without a country code are assumed to be US/Canada. */
export function toE164(raw) {
  const s = String(raw).trim();
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  if (s.startsWith('+')) return `+${digits}`;
  if (s.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

export const IS_APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Opens Messages with the text filled in. Apple wants `&body=`, others `?body=`. */
export function smsHref(numbers, body) {
  const b = encodeURIComponent(body);
  const list = numbers.map(toE164);
  if (list.length === 1) return `sms:${list[0]}${IS_APPLE ? '&' : '?'}body=${b}`;
  return IS_APPLE ? `sms://open?addresses=${list.join(',')}&body=${b}` : `sms:${list.join(',')}?body=${b}`;
}

export function whatsappHref(number, body) {
  return `https://wa.me/${toE164(number).slice(1)}?text=${encodeURIComponent(body)}`;
}

/** Signal links open the chat but can’t carry a message, so it’s copied first. */
export function signalHref(number) {
  return `https://signal.me/#p/${toE164(number)}`;
}

/**
 * Formats a US number as it’s typed: 5035550142 → (503) 555-0142.
 * Only digits typed without formatting of their own (spaces, parentheses and
 * hyphens are ours to redo). Returns null to leave the value alone: a leading +,
 * dots, letters, an extension, or a leading 0 or 1. Past 10 digits it
 * isn’t a US number, so the digits are left plain.
 */
export function formatPhoneTyping(digits) {
  if (!/^\d*$/.test(digits) || /^[01]/.test(digits)) return null;
  if (digits.length > 10) return digits; // longer than a US number: drop our formatting
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
