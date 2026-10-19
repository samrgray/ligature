// Builds a plain-text email as an RFC 2822 message for the Gmail API.
// Everything non-ASCII (curly quotes, accents, emoji) is UTF-8: headers as RFC 2047
// encoded-words, the body as base64.

import { HttpError } from './http';

export interface Address {
  name: string;
  email: string;
}

const utf8 = new TextEncoder();
const ASCII = /^[\x20-\x7e]*$/;
const EMAIL = /^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\]+$/;

export function isEmail(s: string): boolean {
  return EMAIL.test(s) && s.length <= 254;
}

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** One line: no CR/LF, so nothing can be smuggled into another header. */
function oneLine(s: string): string {
  return s.replace(/[\r\n\t]+/g, ' ').trim();
}

/** RFC 2047 encoded-words, each at most 75 characters, split on whole characters. */
function encodeWords(s: string, joiner: string): string {
  if (ASCII.test(s)) return s;
  const words: string[] = [];
  let chunk = '';
  for (const ch of s) {
    if (utf8.encode(chunk + ch).length > 45) {
      words.push(chunk);
      chunk = '';
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${b64(utf8.encode(w))}?=`).join(joiner);
}

function formatAddress(a: Address): string {
  const name = oneLine(a.name);
  if (!name) return a.email;
  if (ASCII.test(name)) return `"${name.replace(/["\\]/g, '\\$&')}" <${a.email}>`;
  return `${encodeWords(name, ' ')} <${a.email}>`;
}

function addressList(list: Address[]): string {
  return list.map(formatAddress).join(',\r\n ');
}

/**
 * Returns the message as base64url, ready for `users.messages.send`.
 * With only `bcc`, there is no To header; recipients see “undisclosed recipients”.
 */
export function buildEmail(msg: { to: Address[]; bcc?: Address[]; subject: string; body: string }): string {
  const all = [...msg.to, ...(msg.bcc ?? [])];
  if (!all.length) throw new HttpError(400, 'No recipients.');
  for (const a of all) if (!isEmail(a.email)) throw new HttpError(400, `“${a.email}” isn’t an email address.`);

  const headers = ['MIME-Version: 1.0'];
  if (msg.to.length) headers.push(`To: ${addressList(msg.to)}`);
  if (msg.bcc?.length) headers.push(`Bcc: ${addressList(msg.bcc)}`);
  headers.push(`Subject: ${encodeWords(oneLine(msg.subject), '\r\n ')}`);
  headers.push('Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64');

  const body = b64(utf8.encode(msg.body.replace(/\r?\n/g, '\r\n'))).replace(/.{76}/g, '$&\r\n');
  const message = `${headers.join('\r\n')}\r\n\r\n${body}`;
  return btoa(message).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
