import { serialize, deserialize } from './state.js';

function toBase64Url(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function pipe(bytes, stream) {
  const blob = await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(blob);
}

export async function encodeShare(project) {
  const json = JSON.stringify(serialize(project));
  const raw = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'function') {
    try {
      return 'z' + toBase64Url(await pipe(raw, new CompressionStream('deflate-raw')));
    } catch {
      /* fall through to the uncompressed form */
    }
  }
  return 'j' + toBase64Url(raw);
}

export async function decodeShare(token) {
  if (!token || token.length < 2) return null;
  const kind = token[0];
  const bytes = fromBase64Url(token.slice(1));
  let json;
  if (kind === 'z') {
    if (typeof DecompressionStream !== 'function') return null;
    json = new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw')));
  } else if (kind === 'j') {
    json = new TextDecoder().decode(bytes);
  } else {
    return null;
  }
  return deserialize(JSON.parse(json));
}

export async function shareUrl(project) {
  const token = await encodeShare(project);
  const url = new URL(window.location.href);
  url.hash = token;
  return url.toString();
}

export async function readHash() {
  const token = window.location.hash.replace(/^#/, '');
  if (!token) return null;
  try {
    return await decodeShare(decodeURIComponent(token));
  } catch {
    return null;
  }
}
