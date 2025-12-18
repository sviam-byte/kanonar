
// lib/features/extractLocation.ts
import { Features } from './types';
import { clamp01, num } from './scale';

export function extractLocationFeatures(args: { location: any; locationId: string }): Features {
  const loc = args.location || {};
  const id = args.locationId;

  const values: Record<string, number> = {};
  const trace: any = {};

  const set = (k: string, v: number, source: string) => {
    values[k] = clamp01(v);
    trace[k] = { source };
  };

  const props = loc.properties || {};
  const state = loc.state || {};
  const map = loc.map || {};

  set('loc.privacy', props.privacy === 'private' ? 1 : 0, 'location.properties.privacy');
  set('loc.visibility', clamp01(num(props.visibility, 0)), 'location.properties.visibility');
  set('loc.noise', clamp01(num(props.noise, 0)), 'location.properties.noise');
  set('loc.socialVisibility', clamp01(num(props.social_visibility, 0)), 'location.properties.social_visibility');
  set('loc.normPressure', clamp01(num(props.normative_pressure, 0)), 'location.properties.normative_pressure');
  set('loc.controlLevel', clamp01(num(props.control_level, 0)), 'location.properties.control_level');

  set('loc.crowd', clamp01(num(state.crowd_level, 0)), 'location.state.crowd_level');

  // map rough features (if precomputed)
  set('map.width', clamp01(num(map.width ? map.width / 64 : 0, 0)), 'location.map.width');
  set('map.height', clamp01(num(map.height ? map.height / 64 : 0, 0)), 'location.map.height');

  // tags to features
  const tags: string[] = Array.isArray(loc.tags) ? loc.tags : [];
  set('tag.private', tags.includes('private') ? 1 : 0, 'location.tags');
  set('tag.safeHub', tags.includes('safe_hub') ? 1 : 0, 'location.tags');
  set('tag.public', tags.includes('public') ? 1 : 0, 'location.tags');

  return { schemaVersion: 1, kind: 'location', entityId: id, values, trace };
}
