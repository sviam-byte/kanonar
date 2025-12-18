
import {
  SocialEventEntity,
  PersonalEvent,
  DomainEvent,
  CharacterEntity,
  EventEffects as LegacyEventEffects,
  EventEpistemics as LegacyEventEpistemics,
  EventStructure,
  EventGoalEffects,
  EventParticipants,
  EntitySecurity,
  LocationId,
} from '../types';
import { 
  Event, 
  EventCheck, 
  EventEffects as NewEventEffects, 
  EventEpistemics as NewEventEpistemics 
} from './types'; 

export type UnifiedEventKind = 'social' | 'personal' | 'domain' | 'system';

// Use a loose union for effects to avoid intersection conflicts
export type UnifiedEventEffects = LegacyEventEffects | NewEventEffects | any;
export type UnifiedEventEpistemics = LegacyEventEpistemics | NewEventEpistemics | any;

export interface UnifiedEventView {
  id: string;
  kind: UnifiedEventKind;
  t: number;
  label: string;
  domain: string;
  tags: string[];

  actorId?: string;
  targetId?: string;
  locationId?: LocationId;

  // Human-readable names
  actorName?: string;
  targetName?: string;

  intensity?: number;
  valence?: number; // -1 to +1
  importance?: number; // 0 to 1

  // Extended blocks (Unified types)
  effects?: Partial<UnifiedEventEffects>;
  epistemics?: Partial<UnifiedEventEpistemics>;
  
  structure?: EventStructure;
  goalEffects?: EventGoalEffects;
  participants?: EventParticipants;
  
  // New System Logic
  check?: EventCheck;
  causedBy?: string[];
  causes?: string[];
  
  // Access Control
  security?: EntitySecurity;

  // Raw object access
  raw: any;
}

function resolveName(characters: CharacterEntity[], id?: string): string | undefined {
  if (!id) return undefined;
  const ch = characters.find(c => c.entityId === id);
  return ch?.title || id; // Fallback to ID if title missing
}

export function buildUnifiedEventsView(params: {
  characters: CharacterEntity[];
  socialEvents: SocialEventEntity[];
  personalEvents: PersonalEvent[];
  domainEvents: DomainEvent[];
  systemEvents?: Event[]; 
}): UnifiedEventView[] {
  const { characters, socialEvents, personalEvents, domainEvents, systemEvents = [] } = params;
  const list: UnifiedEventView[] = [];

  // 1. Social Events (Legacy)
  for (const ev of socialEvents) {
    list.push({
      id: ev.entityId,
      kind: 'social',
      t: ev.t,
      label: ev.title || ev.domain,
      domain: ev.domain,
      tags: ev.tags ?? [],
      actorId: ev.actorId,
      targetId: ev.targetId,
      locationId: ev.locationId as LocationId | undefined,
      actorName: resolveName(characters, ev.actorId),
      targetName: resolveName(characters, ev.targetId),
      intensity: ev.intensity,
      valence: ev.polarity,
      effects: ev.effects as Partial<UnifiedEventEffects>,
      epistemics: ev.epistemics ? {
          ...ev.epistemics,
          // Polyfill new fields
          witnesses: ev.epistemics.observers?.map(o => o.actorId) || [],
          visibility: 1
      } : undefined,
      structure: ev.structure,
      goalEffects: ev.goalEffects,
      participants: ev.participants,
      security: ev.security,
      raw: ev,
    });
  }

  // 2. Personal Events (Legacy Bio)
  for (const ev of personalEvents) {
    list.push({
      id: ev.id,
      kind: 'personal',
      t: ev.t,
      label: ev.name,
      domain: ev.domain,
      tags: ev.tags ?? [],
      actorId: ev.participants?.[0],
      locationId: ev.locationId as LocationId | undefined,
      actorName: resolveName(characters, ev.participants?.[0]),
      intensity: ev.intensity,
      valence: ev.valence,
      effects: ev.effects as Partial<UnifiedEventEffects>,
      security: ev.security,
      raw: ev,
    });
  }

  // 3. Domain Events (Scenario Engine)
  for (const ev of domainEvents) {
    list.push({
      id: ev.id,
      kind: 'domain',
      t: ev.t ?? 0,
      label: ev.actionId,
      domain: ev.ctx?.scenarioKind ?? 'scenario',
      tags: ev.tags || [],
      actorId: ev.actorId,
      targetId: ev.targetId,
      locationId: ev.locationId as LocationId | undefined,
      actorName: resolveName(characters, ev.actorId),
      targetName: resolveName(characters, ev.targetId),
      intensity: ev.intensity,
      valence: ev.polarity,
      effects: ev.effects as Partial<UnifiedEventEffects>,
      epistemics: ev.epistemics ? {
          ...ev.epistemics,
           // Polyfill new fields
          witnesses: ev.epistemics.observers?.map(o => o.actorId) || [],
          visibility: 1
      } : undefined,
      raw: ev,
    });
  }

  // 4. System Events (New Event Layer)
  for (const ev of systemEvents) {
      list.push({
          id: ev.id,
          kind: 'system',
          t: ev.timestamp,
          label: ev.kind.toUpperCase(), 
          domain: ev.channel,
          tags: ev.tags,
          actorId: ev.actors[0],
          targetId: ev.targets[0],
          locationId: ev.locationId,
          actorName: resolveName(characters, ev.actors[0]),
          targetName: resolveName(characters, ev.targets[0]),
          intensity: 1.0, // Default for now
          importance: ev.importance,
          effects: ev.effects as Partial<UnifiedEventEffects>,
          epistemics: ev.epistemics ? {
              ...ev.epistemics,
              // Polyfill legacy fields
              observers: ev.epistemics.witnesses?.map(w => ({ actorId: w, channel: 'visual' })) || []
          } : undefined,
          check: ev.check,
          causedBy: ev.causedBy,
          causes: ev.causes,
          raw: ev
      });
  }

  // Sort by time descending
  return list.sort((a, b) => b.t - a.t);
}