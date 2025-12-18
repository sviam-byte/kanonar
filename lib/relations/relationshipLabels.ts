
// lib/relations/relationshipLabels.ts

import { CharacterEntity } from '../../types';
import { extractRelationalBioFeatures } from '../biography/features';
import { TomBeliefTraits } from '../tom/state';
import { getNestedValue } from '../param-utils';

export type RelationshipLabel =
  | 'stranger'
  | 'acquaintance'
  | 'ally'
  | 'friend'
  | 'close_friend'
  | 'lover'
  | 'spouse'
  | 'kin'
  | 'rival'
  | 'enemy'
  | 'nemesis'
  | 'mentor'
  | 'student'
  | 'superior'
  | 'subordinate'
  | 'idol'
  | 'tool'
  | 'protector'
  | 'ward';

export interface RelationshipAnalysis {
  label: RelationshipLabel;
  strength: number; // 0..1 intensity of this label
  scores: Record<RelationshipLabel, number>;
  why: string[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function computeRelationshipLabels(
  self: CharacterEntity,
  target: CharacterEntity,
  traits?: TomBeliefTraits // from ToM
): RelationshipAnalysis {
  const scores: Record<string, number> = {};
  const why: string[] = [];

  const selfId = self.entityId;
  const targetId = target.entityId;

  // 1. Identity & Structural Roles (Hard)
  const roleRels = self.roles?.relations || [];
  const structRel = roleRels.find(r => r.other_id === targetId);

  if (structRel) {
    const role = structRel.role;
    if (role === 'ward_of') { scores['superior'] = 1.0; scores['idol'] = 0.6; why.push('role:ward_of'); }
    if (role === 'caretaker_of') { scores['ward'] = 1.0; scores['protector'] = 0.8; why.push('role:caretaker_of'); }
    if (role === 'mentor_of') { scores['student'] = 1.0; why.push('role:mentor_of'); }
    if (role === 'protege_of') { scores['mentor'] = 1.0; why.push('role:protege_of'); }
    if (role === 'friend_of') { scores['friend'] = 1.0; why.push('role:friend_of'); }
    if (role === 'ally_of') { scores['ally'] = 0.8; why.push('role:ally_of'); }
    if (role === 'enemy_of') { scores['enemy'] = 1.0; why.push('role:enemy_of'); }
    if (role === 'subordinate_of') { scores['superior'] = 1.0; why.push('role:subordinate_of'); }
    if (role === 'commander_of') { scores['subordinate'] = 1.0; why.push('role:commander_of'); }
  }

  // 2. Biography (Deep History)
  const bio = extractRelationalBioFeatures(self.historicalEvents || [], targetId);
  
  if (bio.B_rel_romance > 0.5) { scores['lover'] = (scores['lover'] || 0) + bio.B_rel_romance; why.push('bio:romance'); }
  if (bio.B_rel_friendship > 0.4) { scores['friend'] = (scores['friend'] || 0) + bio.B_rel_friendship; why.push('bio:friendship'); }
  if (bio.B_rel_devotion > 0.6) { scores['idol'] = (scores['idol'] || 0) + bio.B_rel_devotion; why.push('bio:devotion'); }
  if (bio.B_rel_betrayed_by > 0.6) { scores['enemy'] = (scores['enemy'] || 0) + bio.B_rel_betrayed_by; why.push('bio:betrayal'); }
  if (bio.B_rel_shared_trauma > 0.5) { scores['close_friend'] = (scores['close_friend'] || 0) + bio.B_rel_shared_trauma * 0.8; why.push('bio:trauma_bond'); }
  if (bio.B_rel_saved > 0.5) { scores['protector'] = (scores['protector'] || 0) + bio.B_rel_saved; why.push('bio:saved_them'); }
  if (bio.B_rel_care_from > 0.5) { scores['ward'] = (scores['ward'] || 0) + bio.B_rel_care_from; why.push('bio:cared_by_them'); }

  // 3. ToM Traits (Dynamic State)
  if (traits) {
    const t = traits;
    // Trust + Bond -> Friend/Ally
    if (t.trust > 0.7 && t.bond > 0.4) { 
        scores['ally'] = (scores['ally'] || 0) + 0.4; 
        if (t.bond > 0.7) scores['close_friend'] = (scores['close_friend'] || 0) + 0.4;
    }
    // Conflict + Threat -> Enemy/Rival
    if (t.conflict > 0.6) {
        if (t.respect > 0.6) scores['rival'] = (scores['rival'] || 0) + 0.6;
        else scores['enemy'] = (scores['enemy'] || 0) + 0.6;
    }
    // Dominance -> Hierarchy
    if (t.dominance > 0.7) scores['subordinate'] = (scores['subordinate'] || 0) + 0.5;
    if (t.dominance < 0.3) scores['superior'] = (scores['superior'] || 0) + 0.5;
    
    // Attachment -> Lover/Kin
    if (t.bond > 0.8 && t.trust > 0.8) {
        // Hard to distinguish lover vs kin without bio/tags, boost generally
        scores['kin'] = (scores['kin'] || 0) + 0.3;
    }
  }

  // 4. Resolve Best Label
  let bestLabel: RelationshipLabel = 'stranger';
  let bestScore = 0;
  
  // Baseline for acquaintance if some history exists but no strong label
  if (bio.B_rel_friendship > 0.1 || (traits && traits.trust > 0.4)) {
      scores['acquaintance'] = 0.2;
  }

  for (const [label, val] of Object.entries(scores)) {
    const clamped = clamp01(val);
    scores[label as RelationshipLabel] = clamped;
    if (clamped > bestScore) {
      bestScore = clamped;
      bestLabel = label as RelationshipLabel;
    }
  }

  // Fallback to stranger if score is too low
  if (bestScore < 0.15) {
      bestLabel = 'stranger';
      bestScore = 1.0;
  }

  return {
    label: bestLabel,
    strength: bestScore,
    scores: scores as any,
    why
  };
}
