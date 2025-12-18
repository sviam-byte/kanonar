
import { DyadRelationPresetV1, CompatibilityPresetV1 } from './types';

const REL_PREFIX = 'KANONAR4-REL::v1::';
const COMPAT_PREFIX = 'KANONAR4-COMPAT::v1::';

function toBase64Url(json: string): string {
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

export function encodeDyadPreset(preset: DyadRelationPresetV1): string {
  return REL_PREFIX + toBase64Url(JSON.stringify(preset));
}

export function decodeDyadPreset(snippet: string): DyadRelationPresetV1 {
  if (!snippet.startsWith(REL_PREFIX)) throw new Error('Invalid Relation Preset format');
  const json = fromBase64Url(snippet.slice(REL_PREFIX.length));
  const obj = JSON.parse(json);
  if (obj.v !== 'kanonar4-rel-v1') throw new Error('Unsupported Relation Preset version');
  return obj as DyadRelationPresetV1;
}

export function encodeCompatPreset(preset: CompatibilityPresetV1): string {
  return COMPAT_PREFIX + toBase64Url(JSON.stringify(preset));
}

export function decodeCompatPreset(snippet: string): CompatibilityPresetV1 {
  if (!snippet.startsWith(COMPAT_PREFIX)) throw new Error('Invalid Compatibility Preset format');
  const json = fromBase64Url(snippet.slice(COMPAT_PREFIX.length));
  const obj = JSON.parse(json);
  if (obj.v !== 'kanonar4-compat-v1') throw new Error('Unsupported Compatibility Preset version');
  return obj as CompatibilityPresetV1;
}
