export const NOTE_MAX = 120;

export function clampNote(text) {
  return Array.from(String(text).replace(/\s+/g, ' ').trim()).slice(0, NOTE_MAX).join('');
}

export function encodeNote(text) {
  const bytes = new TextEncoder().encode(clampNote(text));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeNote(encoded) {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return clampNote(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}
