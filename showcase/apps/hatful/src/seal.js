const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const cmpPair = (a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]);

export async function sealOf(event, assignment, seed) {
  const people = (event.people ?? []).map((p) => [String(p.id), String(p.name)]).sort(cmpPair);
  const bans = (event.bans ?? []).map((b) => [String(b.from), String(b.to)]).sort(cmpPair);
  const pairs = Object.keys(assignment)
    .sort(cmp)
    .map((giver) => [giver, String(assignment[giver])]);
  const canonical = JSON.stringify({ people, bans, mode: event.mode, seed: String(seed), assignment: pairs });

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw Object.assign(new Error('Web Crypto is unavailable (needs a secure context)'), { code: 'NO_CRYPTO' });
  const digest = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(canonical)));

  let v = 0;
  for (let i = 0; i < 5; i++) v = v * 256 + digest[i];
  let s = '';
  for (let i = 0; i < 8; i++) s += CROCKFORD[Math.floor(v / 2 ** (35 - 5 * i)) % 32];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
