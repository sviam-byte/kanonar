
import { AgentContextFrame } from "../frame/types";
import { ContextAtom, ContextAtomKind } from "../v2/types";
import { WorldState } from "../../../types";
import { getLocationForAgent, getLocationMapCell, getLocalMapMetrics } from "../../world/locations";
import { EmotionAtom } from '../../emotions/types';
import { normalizeAtom } from '../v2/infer';
import { computeRelationshipLabels } from '../../relations/relationshipLabels';
import { deriveRelationshipLabel } from '../../social/relationshipLabels';
import { extractLocationAtoms } from '../sources/locationAtoms';
import { safeNum } from '../../util/safe';

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function mkId(parts: (string | number | null | undefined)[]) {
  return parts.filter(Boolean).join(':');
}

function getCharacterById(world: any, id: string): any | null {
  if (!id) return null;
  if (world?.agents) return world.agents.find((a: any) => a.entityId === id) || null;
  // Fallback for non-agent entities if necessary, though deriveRelationshipLabel expects characters
  if (typeof world?.getEntityById === 'function') return world.getEntityById(id);
  if (world?.entities && Array.isArray(world.entities)) return world.entities.find((e: any) => e?.entityId === id) || null;
  return null;
}

/**
 * Canonical atomization of the FULL v4 frame.
 * Decomposes high-level state into granular atoms including ToM Biases, Detailed Body State, and Rich Location Context.
 */
export function atomizeFrame(frame: AgentContextFrame, t: number, world?: WorldState): ContextAtom[] {
  const atoms: ContextAtom[] = [];
  const selfId = frame.who.agentId;
  const subj = selfId;
  
  // Track IDs to prevent duplicates within a single frame generation
  const seenIds = new Set<string>();

  // --- 0a. Canonical Location Atoms (New) ---
  const loc = world ? getLocationForAgent(world, selfId) : null;
  const locAtoms = extractLocationAtoms({ selfId, location: loc });
  for (const a of locAtoms) {
      if (!seenIds.has(a.id)) {
          seenIds.add(a.id);
          atoms.push(a);
      }
  }

  // --- Helper to add atoms quickly and prevent duplicates ---
  const add = (
    kind: ContextAtomKind,
    magnitude: number,
    label: string,
    source: any = 'location',
    idSuffix?: string,
    extra?: any
  ) => {
    // IMPORTANT: GoalLab UI uses atom.id as React key → must be unique per atom
    const suffix = (idSuffix ?? mkId([label])).toString();
    const id = `${kind}:${selfId}${suffix ? ':' + suffix : ''}`;
    
    if (seenIds.has(id)) return; // Deduplication check
    seenIds.add(id);

    const raw: ContextAtom = {
      id,
      kind,
      source,
      magnitude: clamp01(magnitude),
      label,
      timestamp: t,
      ...extra
    } as any;
    
    // Apply normalization immediately
    atoms.push(normalizeAtom(raw));
  };

  // ==================================================================================
  // 0. LOCATION CONTEXT (Rich - Legacy & Detailed)
  // ==================================================================================
  
  if (world && frame.where.locationId) {
      const loc = getLocationForAgent(world, selfId);
      
      if (loc) {
          // 1) Identity
          add('loc_id', 1, loc.entityId);
          add('loc_type', 1, loc.kind || 'unknown');
          
          if (loc.tags) {
              loc.tags.forEach(tag => add('loc_tag', 1, tag));
          }
          if (loc.ownership?.ownerFaction) {
               add('loc_owner', 1, `Faction: ${loc.ownership.ownerFaction}`, 'location');
          }

          // 2) Environment & Danger
          const hazard = loc.hazards?.reduce((max, h) => Math.max(max, h.intensity), 0) ?? 0;
          add('env_hazard', hazard, 'Environmental Hazard');
          add('env_visibility', loc.properties?.visibility ?? 0.5, 'Visibility');
          add('env_noise', loc.properties?.noise ?? 0.5, 'Noise Level');
          // Structural integrity (if available in state or physics)
          const structInt = (loc.state as any)?.structuralIntegrity ?? 1.0;
          add('env_structural_integrity', structInt, 'Structural Integrity');

          // 3) Navigation & Cover
          if (loc.map) {
              const exits = loc.map.exits?.length ?? 0;
              add('nav_exits_count', clamp01(exits / 6), `Exits: ${exits}`);
              if (exits > 0) add('nav_exit_nearby', 1, 'Exit Available'); // simplified
              
              // Calculate map metrics if map exists
              let totalCover = 0;
              let obstacleCount = 0;
              let cellCount = loc.map.cells.length;
              if (cellCount > 0) {
                  loc.map.cells.forEach(c => {
                      totalCover += c.cover ?? 0;
                      if (!c.walkable) obstacleCount++;
                  });
                  add('nav_cover_mean', totalCover / cellCount, 'Mean Cover');
                  add('nav_obstacles_density', obstacleCount / cellCount, 'Obstacle Density');
              }
          }

          // 4) Social Geometry
          const isPrivate = loc.properties?.privacy === 'private';
          const isPublic = loc.properties?.privacy === 'public';
          add('soc_publicness', isPublic ? 1 : (isPrivate ? 0 : 0.5), isPublic ? 'Public' : 'Private');
          add('soc_surveillance', loc.properties?.control_level ?? 0, 'Surveillance');
          
          // Crowd density from state
          const crowd = loc.state?.crowd_level ?? 0;
          add('soc_crowd_density', crowd, 'Crowd Density');
          
          // Norm pressure implied by control level + active norms
          const normPressure = (loc.properties?.control_level ?? 0) * 0.5 + (loc.norms?.requiredBehavior?.length ?? 0) * 0.1;
          add('soc_norm_pressure', clamp01(normPressure), 'Norm Pressure');

          // 5) Local Cellular Atoms (Grid)
          if (loc.map && frame.where.map?.cell) {
              const { x, y } = frame.where.map.cell;
              const cell = getLocationMapCell(loc, x, y);
              
              if (cell) {
                  add('cell_hazard', cell.danger ?? 0, 'Cell Hazard', 'map');
                  add('cell_cover', cell.cover ?? 0, 'Cell Cover', 'map');
                  add('cell_obstacle', cell.walkable ? 0 : 1, cell.walkable ? 'Walkable' : 'Blocked', 'map');
                  if (cell.elevation !== undefined) add('cell_height', clamp01((cell.elevation + 5)/10), `Elevation: ${cell.elevation}`, 'map');
                  
                  // Radius scan for local bests
                  const localMetrics = getLocalMapMetrics(loc, x, y, 3); // 3 cell radius
                  add('local_max_hazard', localMetrics.avgDanger, 'Local Avg Danger', 'map'); // Avg is proxy for max/risk
                  add('local_best_cover', localMetrics.avgCover, 'Local Avg Cover', 'map');
              }
              
              // Nearest Exit (already in frame)
              // Exits list is in frame
              if (frame.where.map.exits.length > 0) {
                   // Calculate real dist to closest exit
                   let minDist = Infinity;
                   frame.where.map.exits.forEach(e => {
                       const d = Math.sqrt(Math.pow(e.x - x, 2) + Math.pow(e.y - y, 2));
                       if (d < minDist) minDist = d;
                   });
                   const distNorm = clamp01(1 - minDist / 20);
                   add('local_nearest_exit_distNorm', distNorm, 'Exit Proximity', 'map');
              }
          }

          // 6) Affordances (Derived)
          // Hide: Cover + Low Surveillance
          const canHide = ((frame.where.map?.cover ?? 0) > 0.5) && ((loc.properties?.control_level ?? 0) < 0.5);
          if (canHide) add('afford_hide', 1, 'Can Hide');
          
          // Escape: Exits available
          if ((frame.where.map?.exits?.length ?? 0) > 0) add('afford_escape', 1, 'Can Escape');
          
          // Observe: Visibility
          if ((loc.properties?.visibility ?? 0) > 0.6) add('afford_observe', 1, 'Good Vantage');
          
          // Talk: Private vs Public
          if (isPrivate) add('afford_talk_private', 1, 'Private Talk');
          if (isPublic) add('afford_talk_public', 1, 'Public Speech');
          
          // Rest: Safe/Private/Bed
          if (loc.tags?.includes('safe_hub') || loc.tags?.includes('residential')) add('afford_rest', 1, 'Can Rest');
          
          // Medical
          if (loc.tags?.includes('medical') || loc.resources?.medical) add('afford_treat_wounds', 1, 'Medical Facilities');
          
          // Command
          if (loc.tags?.includes('command') || loc.properties?.control_level > 0.8) add('afford_command', 1, 'Command Post');
          
          // Ritual
          if (loc.tags?.includes('sacred') || loc.tags?.includes('ritual')) add('afford_ritual', 1, 'Ritual Site');

          // Explicit Affordances from Location Entity
          if (loc.affordances) {
              if (loc.affordances.allowedActions?.includes('trade')) add('afford_trade', 1, 'Trade Area');
              if (loc.affordances.allowedActions?.includes('search_route')) add('afford_search', 1, 'Search Area');
          }
      }
  }

  // ==================================================================================
  // 1. WHERE: Spatial & Map (Legacy Fallbacks)
  // ==================================================================================
  const where = frame.where;
  if (where?.locationId) {
    add('location', 1, where.locationName ?? where.locationId, 'where');
  }

  const tagsList: string[] = where?.locationTags ?? [];
  for (const tag of tagsList) {
    add('location_tag', 1, tag, 'where');
  }
  
  // Deduped safe zone check
  if (tagsList.includes('safe_hub') || tagsList.includes('private')) {
      add('safe_zone_hint', 1, 'Safe Zone', 'where');
  }
  
  if (where?.map) {
      if (typeof where.map.hazard === "number") {
          add('map_hazard', where.map.hazard, 'Hazard Level', 'where');
           if (where.map.hazard > 0) {
             add('hazard_local', where.map.hazard, 'Hazard Here', 'map');
          }
      }
      if (typeof where.map.cover === "number") {
          add('map_cover', where.map.cover, 'Cover', 'where');
      }
      if (where.map.exits.length > 0) {
          add('map_exits', clamp01(where.map.exits.length / 6), `Exits: ${where.map.exits.length}`, 'where');
      }
  }

  // ==================================================================================
  // 2. HOW: Detailed Interoception (Body & Affect)
  // ==================================================================================
  const how = frame.how ?? {};
  const phys = how?.physical ?? {};
  
  const hpRaw = phys.hp ?? 100;
  const hpNorm = clamp01(hpRaw / 100);
  const painDerived = clamp01((100 - hpRaw) / 100); 

  add('self_hp', hpNorm, `HP: ${hpRaw}`, 'body');

  if (hpNorm < 0.7) {
      add('body_wounded', 1 - hpNorm, 'Injured', 'body');
      add('self_pain', painDerived, 'Pain', 'body');
  } else {
       add('body_ok', hpNorm, 'Body OK', 'body');
  }
  
  if (typeof phys?.stamina === "number") {
    add('self_stamina', clamp01(phys.stamina / 100), `Stamina: ${phys.stamina.toFixed(0)}`, 'body');
    if (phys.stamina < 30) {
        add('self_fatigue', clamp01((30 - phys.stamina) / 30), 'High Fatigue', 'body');
    }
  }

  if (phys.canMove === false) {
      add('self_mobility_restricted', 1.0, 'Immobilized', 'body');
  }

  const affect = how?.affect ?? {};
  const fear = affect.fear ?? 0;
  const anger = affect.anger ?? 0;
  const shame = affect.shame ?? 0;
  const arousal = affect.arousal ?? 0;
  
  const selfStress = clamp01(Math.max(fear, anger, arousal));
  if (selfStress > 0.2) {
      add('self_stress', selfStress, 'Stress State', 'body');
  }

  // emotions: already computed in buildFullAgentContextFrame()
  const emotionAtoms = (frame as any)?.derived?.emotionAtoms as EmotionAtom[] | undefined;
  if (emotionAtoms?.length) {
    for (const ea of emotionAtoms) {
      // Use the helper to ensure ID uniqueness even if emotion kinds repeat (unlikely but safe)
      const emotionId = `emotion:${selfId}:${ea.emotion}`;
      if (!seenIds.has(emotionId)) {
          seenIds.add(emotionId);
          atoms.push(normalizeAtom({
            id: emotionId, 
            kind: 'emotion',
            source: 'how',
            timestamp: t,
            tags: ['affect'],
            emotion: ea.emotion,
            magnitude: ea.intensity,
            label: `${ea.emotion} (${(ea.intensity * 100).toFixed(0)}%)`,
            meta: { valence: ea.valence, arousal: ea.arousal, why: ea.why },
          } as any));
      }
    }
  }

  // ==================================================================================
  // 3. WHAT/WHO: Nearby Agents & Social Context
  // ==================================================================================
  const nearby = frame.what?.nearbyAgents ?? [];
  let woundedCount = 0;

  for (const a of nearby) {
    const otherId = a?.id ?? "unknown";
    const distNorm = typeof a?.distanceNorm === "number" ? clamp01(a.distanceNorm) : 1;
    const closeness = clamp01(1 - distNorm);

    add('nearby_agent', closeness, a?.name ?? otherId, 'who', `:${otherId}`);
    
    // Proximity target
    if (closeness > 0.1) {
         const presenceId = `target_presence:${otherId}`;
         if (!seenIds.has(presenceId)) {
             seenIds.add(presenceId);
             atoms.push(normalizeAtom({
                id: presenceId,
                kind: 'target_presence',
                source: 'proximity',
                magnitude: closeness,
                label: `Target: ${a?.name}`,
                relatedAgentId: otherId,
                distance: a.distance,
                timestamp: t
             } as any));
         }
    }
    
    // Role Atom
    if (typeof a?.role === "string" && a.role.length) {
      add('nearby_agent_role', 1, a.role, 'who', `:${otherId}:${a.role}`);
    }

    // Wounded status
    if (a?.isWounded === true) {
      woundedCount++;
      add('wounded', 1, 'Is Wounded', 'who', `:${otherId}`);
      
      const careId = `care_need:${otherId}`;
      if (!seenIds.has(careId)) {
          seenIds.add(careId);
          atoms.push(normalizeAtom({
              id: careId,
              kind: 'care_need',
              source: 'who',
              magnitude: 1,
              label: 'Needs Care',
              relatedAgentId: otherId,
              timestamp: t
          } as any));
      }
    }
  }
  
  // --- 4a. Эмоции (Affect) ---
  const aff = frame.how.affect;
  if (aff) {
    const pushEmotion = (id: string, kind: string, value: number) => {
      if (!value || seenIds.has(id)) return;
      seenIds.add(id);
      atoms.push(normalizeAtom({
        id,
        kind: 'emotion',
        source: 'derived', // or 'tom_emotion'
        magnitude: value,
        label: kind,
        selfAgentId: subj,
        emotion: kind,
        intensity: value,
        timestamp: t,
      } as any));
    };

    pushEmotion(mkId(['emotion:fear', subj]), 'fear', aff.fear ?? 0);
    pushEmotion(mkId(['emotion:anger', subj]), 'anger', aff.anger ?? 0);
    pushEmotion(mkId(['emotion:shame', subj]), 'shame', aff.shame ?? 0);
    // Hope is positive valence approximation
    pushEmotion(mkId(['emotion:hope', subj]), 'hope', aff.valence > 0 ? aff.valence : 0);
  }

  // 5) ToM: доверие/угроза + Physical ToM + Relations
  if (frame.tom) {
      // Physical Self ToM
      if (frame.tom.physicalSelf) {
          if (frame.tom.physicalSelf.isCombatCapable) {
              add('body_ok', frame.tom.physicalSelf.confidence, 'Self feels capable', 'tom', 'self_capable');
          }
          if (frame.tom.physicalSelf.isSeverelyWounded) {
              add('body_wounded', frame.tom.physicalSelf.confidence, 'Self feels severely wounded', 'tom', 'self_severe');
          }
      }

      // Physical Others ToM
      if (frame.tom.physicalOthers) {
          for (const other of frame.tom.physicalOthers) {
              const baseId = mkId(['tom', 'other', other.targetId]);
              
              if (other.isCombatCapable) {
                   const atomId = `${baseId}:capable`;
                   if (!seenIds.has(atomId)) {
                       seenIds.add(atomId);
                       atoms.push(normalizeAtom({
                          id: atomId,
                          kind: 'body_ok', 
                          source: 'tom',
                          magnitude: other.confidence,
                          label: `${other.name} looks capable`,
                          relatedAgentId: other.targetId,
                          timestamp: t
                      } as any));
                   }
              }
              
              if (other.isSeverelyWounded) {
                   const atomId = `${baseId}:severe`;
                   if (!seenIds.has(atomId)) {
                       seenIds.add(atomId);
                       atoms.push(normalizeAtom({
                          id: atomId,
                          kind: 'tom_other_severely_wounded',
                          source: 'tom',
                          magnitude: other.confidence,
                          label: `${other.name} looks critical`,
                          relatedAgentId: other.targetId,
                          timestamp: t
                      } as any));
                   }
              } else if (!other.isCombatCapable) {
                   const atomId = `${baseId}:incapable`;
                   if (!seenIds.has(atomId)) {
                       seenIds.add(atomId);
                       atoms.push(normalizeAtom({
                          id: atomId,
                          kind: 'tom_other_not_combat_capable',
                          source: 'tom',
                          magnitude: other.confidence,
                          label: `${other.name} unfit`,
                          relatedAgentId: other.targetId,
                          timestamp: t
                      } as any));
                   }
              }
          }
      }

      // Relations (Expanded)
      if (frame.tom.relations) {
        // --- ToM atoms (surface dyadic state into context atoms for GoalLab) ---
        const rels = frame.tom?.relations ?? [];
        const nearby = frame.what?.nearbyAgents ?? [];
        const distMap = new Map<string, number>();
        for (const n of nearby as any[]) distMap.set(n.id, typeof n.distanceNorm === 'number' ? n.distanceNorm : 1);
        
        // Prioritize closest relations
        const relSorted = [...rels].sort((a: any, b: any) => {
            const da = distMap.get(a.targetId) ?? 1;
            const db = distMap.get(b.targetId) ?? 1;
            return da - db;
        }).slice(0, 3);

        const selfChar = getCharacterById(world, selfId);
        const selfAgent: any =
          (world as any)?.agents?.find((a: any) => a?.entityId === selfId) ?? null;
        const acqMap: Record<string, any> | null = selfAgent?.acquaintances ?? null;
        const acqTierToMag = (tier: any) => {
          switch (tier) {
            case 'intimate':
              return 1;
            case 'known':
              return 0.75;
            case 'acquaintance':
              return 0.5;
            case 'seen':
              return 0.25;
            default:
              return 0;
          }
        };

        for (const r of relSorted as any[]) {
            const otherId = r.targetId;
            const label = r.label || r.name || otherId;
            const suf = mkId([otherId]);

            // --- ACQUAINTANCE / RECOGNITION ATOMS ---
            const e: any = acqMap?.[otherId];
            if (e) {
              const tierMag = clamp01(acqTierToMag(e.tier));
              const idc = clamp01(safeNum(e.idConfidence, 0));
              add('soc_acq_tier', tierMag, `Acq tier: ${e.tier} (${label})`, 'social', `acq_tier_${suf}`, {
                ns: 'soc',
                targetId: otherId,
                tags: ['acq', String(e.tier || 'unknown'), String(e.kind || 'stranger')],
                meta: { tier: e.tier, kind: e.kind, idConfidence: e.idConfidence, familiarity: e.familiarity },
              });
              add('soc_acq_idconf', idc, `Acq idConf: ${label}`, 'social', `acq_id_${suf}`, {
                ns: 'soc',
                targetId: otherId,
                tags: ['acq', 'idConfidence'],
              });

              // --- EXPLICIT IDENTIFICATION STATEMENT ---
              // "I recognize N as M" as a first-class atom (human-readable).
              // N = how the agent currently refers to the observed person (fallback: label/otherId)
              // M = the identity label we map them to (fallback: otherChar.title/name/label)
              const otherChar = getCharacterById(world, otherId);
              const seenAs = String(
                (e as any)?.seenAsLabel ??
                  (otherChar as any)?.appearanceLabel ??
                  label ??
                  otherId,
              );
              const recognizedAs = String(
                (e as any)?.recognizedAsLabel ??
                  otherChar?.title ??
                  otherChar?.name ??
                  label ??
                  otherId,
              );

              add(
                'soc_identify_as',
                idc,
                `Я опознаю ${seenAs} как ${recognizedAs}`,
                'social',
                `identify_${suf}`,
                {
                  ns: 'soc',
                  targetId: otherId,
                  tags: ['acq', 'identify'],
                  meta: {
                    seenAs,
                    recognizedAs,
                    idConfidence: idc,
                    tier: e.tier,
                    kind: e.kind,
                  },
                }
              );
              add(
                'soc_acq_familiarity',
                clamp01(safeNum(e.familiarity, 0)),
                `Acq familiarity: ${label}`,
                'social',
                `acq_fam_${suf}`,
                {
                  ns: 'soc',
                  targetId: otherId,
                  tags: ['acq', 'familiarity'],
                }
              );
              if (e.kind && e.kind !== 'stranger' && e.kind !== 'none') {
                add('soc_acq_kind', 1, `Acq kind: ${e.kind} (${label})`, 'social', `acq_kind_${String(e.kind)}_${suf}`, {
                  ns: 'soc',
                  targetId: otherId,
                  tags: ['acq', 'kind', String(e.kind)],
                });
              }
            }
            
            // Generate atom set for meaningful relations
            if (r.trust > 0.1) add('tom_trust', clamp01(r.trust ?? 0), `ToM trust: ${label}`, 'tom', `trust_${suf}`);
            if (r.threat > 0.1) add('tom_threat', clamp01(r.threat ?? 0), `ToM threat: ${label}`, 'tom', `threat_${suf}`);
            if (r.support > 0.1) add('tom_support', clamp01(r.support ?? 0), `ToM support: ${label}`, 'tom', `support_${suf}`);
            if (r.closeness > 0.1 || r.attachment > 0.1) add('tom_closeness', clamp01(r.closeness ?? r.attachment ?? 0), `ToM closeness: ${label}`, 'tom', `close_${suf}`);
        
            // --- RELATIONSHIP LABELS (High Level) ---
            const otherChar = getCharacterById(world, otherId);
            if (selfChar && otherChar && otherChar.type === 'character') {
              const rel = deriveRelationshipLabel(world as any, selfChar, otherChar);

              const relAtom = normalizeAtom({
                id: `rel:label:${selfId}:${otherId}`,
                kind: 'rel_label',
                magnitude: rel.strength,
                label: `Relationship: ${rel.label}`,
                source: 'tom',
                tags: ['rel', rel.label, 'tom'],
                confidence: 1,
                origin: 'profile',
                ns: 'tom',
                targetId: otherId,
                subject: selfId,
                meta: { scores: rel.scores, why: rel.why, label: rel.label }
              } as any);

              atoms.push(relAtom);

              // отдельные score-атомы (чтобы threat/tom_ctx могли их использовать)
              const scoreKeys = Object.keys(rel.scores) as (keyof typeof rel.scores)[];
              for (const k of scoreKeys) {
                atoms.push(normalizeAtom({
                  id: `rel:score:${k}:${selfId}:${otherId}`,
                  kind: 'tom_belief', // Using generic tom_belief for scores or could add new kind
                  magnitude: (rel.scores as any)[k],
                  label: `Rel score: ${k}`,
                  source: 'tom',
                  tags: ['rel', 'tom', 'score', String(k)],
                  confidence: 1,
                  origin: 'profile',
                  ns: 'tom',
                  relatedAgentId: otherId,
                  meta: { key: k, label: rel.label }
                } as any));
              }
            }
        }
        

        for (const rel of frame.tom.relations) {
            const other = rel.targetId;

            // Role Tags
            if (rel.roleTag) {
                const atomId = mkId(['relationship_role', rel.roleTag, subj, other]);
                if (!seenIds.has(atomId)) {
                    seenIds.add(atomId);
                    atoms.push(normalizeAtom({
                      id: atomId,
                      kind: 'tom_belief', 
                      beliefKind: 'relation_role',
                      source: 'tom',
                      magnitude: 1,
                      label: rel.label || rel.roleTag,
                      relatedAgentId: other,
                      timestamp: t,
                    } as any));
                }
            }
            
            // Additional atoms for high-level traits
            if (rel.trust > 0.6 && rel.threat < 0.3) {
                const atomId = mkId(['tom', 'trusted_ally_near', subj, rel.targetId]);
                if (!seenIds.has(atomId)) {
                    seenIds.add(atomId);
                    atoms.push(normalizeAtom({
                        id: atomId,
                        kind: 'tom_trusted_ally_near',
                        source: 'tom',
                        magnitude: rel.trust,
                        label: `Trusted: ${rel.targetId}`,
                        relatedAgentId: rel.targetId,
                        timestamp: t
                    } as any));
                }
            }

            if (rel.threat > 0.4) {
                const atomId = mkId(['tom', 'threat_near', subj, rel.targetId]);
                if (!seenIds.has(atomId)) {
                    seenIds.add(atomId);
                    atoms.push(normalizeAtom({
                        id: atomId,
                        kind: 'tom_threatening_other_near',
                        source: 'tom',
                        magnitude: rel.threat,
                        label: `Threat: ${rel.targetId}`,
                        relatedAgentId: rel.targetId,
                        timestamp: t
                    } as any));
                }
            }
        }

        // Also emit acquaintance atoms for top nearby agents even if ToM.relations is sparse.
        if (acqMap && Array.isArray(nearby)) {
          const nearSorted = [...nearby]
            .sort((a: any, b: any) => safeNum(a?.distanceNorm, 1) - safeNum(b?.distanceNorm, 1))
            .slice(0, 5);

          for (const n of nearSorted as any[]) {
            const otherId = n?.id;
            if (!otherId || otherId === selfId) continue;
            if (!acqMap[otherId]) continue;

            const label = n?.name || otherId;
            const suf = mkId([otherId]);
            const e: any = acqMap[otherId];
            const tierMag = clamp01(acqTierToMag(e.tier));

            add(
              'soc_acq_tier',
              tierMag,
              `Acq tier: ${e.tier} (nearby ${label})`,
              'social',
              `acq_tier_near_${suf}`,
              {
                ns: 'soc',
                targetId: otherId,
                tags: ['acq', String(e.tier || 'unknown'), String(e.kind || 'stranger')],
                meta: { tier: e.tier, kind: e.kind, idConfidence: e.idConfidence, familiarity: e.familiarity },
              }
            );
            add(
              'soc_acq_idconf',
              clamp01(safeNum(e.idConfidence, 0)),
              `Acq idConf: nearby ${label}`,
              'social',
              `acq_id_near_${suf}`,
              {
                ns: 'soc',
                targetId: otherId,
                tags: ['acq', 'idConfidence'],
              }
            );
            add(
              'soc_acq_familiarity',
              clamp01(safeNum(e.familiarity, 0)),
              `Acq familiarity: nearby ${label}`,
              'social',
              `acq_fam_near_${suf}`,
              {
                ns: 'soc',
                targetId: otherId,
                tags: ['acq', 'familiarity'],
              }
            );
            if (e.kind && e.kind !== 'stranger' && e.kind !== 'none') {
              add(
                'soc_acq_kind',
                1,
                `Acq kind: ${e.kind} (nearby ${label})`,
                'social',
                `acq_kind_near_${String(e.kind)}_${suf}`,
                {
                  ns: 'soc',
                  targetId: otherId,
                  tags: ['acq', 'kind', String(e.kind)],
                }
              );
            }
          }
        }
      }
  }

  // 6) Глобальные derived-метрики
  if (frame.derived) {
      if (frame.derived.threatIndex > 0.3) {
          add('threat', frame.derived.threatIndex, 'High Threat Level', 'derived', 'high_threat');
      }
      
      if (frame.derived.supportIndex > 0.3) {
          add('social_support', frame.derived.supportIndex, 'Social Support Active', 'derived', 'support_active');
      }
  }

  // --- 6a. Приказы и клятвы ---
  const orders = frame.why?.activeOrders || [];
  for (const order of orders) {
    const targetId = (order as any).targetAgentId || (order as any).targetId || null;
    const kind = (order as any).kind || 'order';
    const strength = (order as any).priority ?? (order as any).strength ?? 1;
    
    // Explicit add for complex objects to ensure ID consistency
    const id = mkId([kind, order.id, subj, targetId]);
    if (!seenIds.has(id)) {
        seenIds.add(id);
        atoms.push(normalizeAtom({
          id,
          kind: order.kind === 'oath' ? 'norm_pressure' : 'authority_presence',
          source: 'life',
          magnitude: strength,
          label: order.summary || order.id,
          relatedAgentId: targetId,
          timestamp: t,
        } as any));
    }

    if (kind === 'oath' && targetId) {
      const oathId = mkId(['order:oath_serve_lord', subj, targetId]);
      if (!seenIds.has(oathId)) {
          seenIds.add(oathId);
          atoms.push(normalizeAtom({
            id: oathId,
            kind: 'norm_pressure',
            source: 'life',
            magnitude: strength,
            label: `Oath to serve ${targetId}`,
            relatedAgentId: targetId,
            timestamp: t,
          } as any));
      }
    }
  }

  // 7) Context Seed
  if (world && world.scenario?.contextConfig?.contextSeed) {
      const seed = world.scenario.contextConfig.contextSeed;
      for (const fact of seed) {
          if (fact.id && !seenIds.has(fact.id)) {
              seenIds.add(fact.id);
              atoms.push(normalizeAtom({
                  id: fact.id,
                  kind: fact.kind, 
                  source: 'manual', 
                  magnitude: fact.confidence ?? 1.0,
                  label: (fact as any).label || fact.id,
                  timestamp: t
              } as ContextAtom));
          }
      }
  }

  // 8) History / Recent Events
  if (frame.what.recentEvents) {
      for (const ev of frame.what.recentEvents) {
          // Identify recent significant events
          if (t - ev.tick < 10) { // Recent
               // Always emit event_recent
               add('event_recent', ev.intensity || 0.5, `Recent: ${ev.kind}`, 'history', `recent_${ev.id}`);

               if (ev.tags?.includes('trauma') || ev.tags?.includes('betrayal') || ev.tags?.includes('attack') || ev.tags?.includes('danger')) {
                   add('event_threat', ev.intensity || 0.8, `Recent Threat: ${ev.kind}`, 'history', `threat_${ev.id}`);
                   add('threat_local', ev.intensity || 0.8, `Recent Trauma: ${ev.kind}`, 'history', `trauma_${ev.id}`); // Legacy
               }
               
               if (ev.tags?.includes('support') || ev.tags?.includes('care') || ev.tags?.includes('rescue')) {
                   add('event_support', ev.intensity || 0.8, `Recent Support: ${ev.kind}`, 'history', `support_${ev.id}`);
               }
               
               if (ev.tags?.includes('order') || ev.tags?.includes('command')) {
                    add('authority_presence', ev.intensity || 0.8, `Recent Order`, 'history', `order_${ev.id}`);
               }
               
               if (ev.tags?.includes('oath') || ev.tags?.includes('shame')) {
                   add('event_norm_violation', ev.intensity || 0.8, `Recent Norm Event`, 'history', `norm_${ev.id}`);
               }
          }
      }
  }

  return atoms;
}
