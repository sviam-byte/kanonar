
// lib/social/relationshipLabels.ts
import { CharacterEntity, WorldState } from '../../types';
import { extractRelationalBioFeatures } from '../biography/features';

export type RelationshipLabel =
  | 'lover'
  | 'friend'
  | 'ally'
  | 'rival'
  | 'enemy'
  | 'subordinate'
  | 'superior'
  | 'neutral';

export type RelationshipScore = {
  romance: number;     // 0..1
  friendship: number;  // 0..1
  devotion: number;    // 0..1
  harm: number;        // 0..1
  betrayal: number;    // 0..1
  obedience: number;   // 0..1
};

export type RelationshipResult = {
  label: RelationshipLabel;
  strength: number; // 0..1
  scores: RelationshipScore;
  why: string[];
};

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

export function deriveRelationshipLabel(world: WorldState, me: CharacterEntity, other: CharacterEntity): RelationshipResult {
  // 1) биография как самый стабильный слой
  const bio = extractRelationalBioFeatures(me.historicalEvents || [], other.entityId);

  const scores: RelationshipScore = {
    romance: clamp01(bio.B_rel_romance ?? 0),
    friendship: clamp01(bio.B_rel_friendship ?? 0),
    devotion: clamp01(bio.B_rel_devotion ?? 0),
    harm: clamp01(bio.B_rel_harmed ?? 0),
    betrayal: clamp01(bio.B_rel_betrayed_by ?? 0),
    obedience: clamp01(bio.B_rel_obeyed ?? 0),
  };

  // 2) иерархия из identity (если есть)
  // Assuming IdentityCaps might have hierarchy info or using roles
  const roleRels = me.roles?.relations || [];
  const structRel = roleRels.find(r => r.other_id === other.entityId);
  const otherRoleRels = other.roles?.relations || [];
  const structRelOther = otherRoleRels.find(r => r.other_id === me.entityId);

  const isSuperior = structRel?.role === 'subordinate_of' || structRelOther?.role === 'commander_of';
  const isSubordinate = structRel?.role === 'commander_of' || structRelOther?.role === 'subordinate_of';

  // 3) решаем label
  const why: string[] = [];

  if (isSuperior) {
    why.push('identity: chain_of_command -> superior');
    return { label: 'superior', strength: 0.7, scores, why };
  }
  if (isSubordinate) {
    why.push('identity: chain_of_command -> subordinate');
    return { label: 'subordinate', strength: 0.7, scores, why };
  }

  const pos = Math.max(scores.romance * 1.2, scores.friendship, scores.devotion);
  const neg = Math.max(scores.harm, scores.betrayal);

  if (scores.romance >= 0.65 && neg < 0.35) {
    why.push('bio: romance high, negative low');
    return { label: 'lover', strength: clamp01((scores.romance * 0.8 + scores.devotion * 0.2)), scores, why };
  }
  if (scores.friendship >= 0.6 && neg < 0.4) {
    why.push('bio: friendship high, negative low');
    return { label: 'friend', strength: clamp01(scores.friendship * 0.85 + scores.devotion * 0.15), scores, why };
  }
  if (scores.devotion >= 0.6 && neg < 0.45) {
    why.push('bio: devotion high');
    return { label: 'ally', strength: clamp01(scores.devotion * 0.9 + scores.friendship * 0.1), scores, why };
  }
  if (neg >= 0.6 && pos < 0.35) {
    why.push('bio: negative high, positive low');
    return { label: 'enemy', strength: clamp01(neg), scores, why };
  }
  if (neg >= 0.45 && pos >= 0.35) {
    why.push('bio: mixed signals -> rival');
    return { label: 'rival', strength: clamp01((neg + pos) / 2), scores, why };
  }

  why.push('default neutral');
  return { label: 'neutral', strength: clamp01(pos * 0.5 + (1 - neg) * 0.1), scores, why };
}
