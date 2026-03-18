// lib/simkit/perception/speechFilter.ts
// Volume-based speech routing: who hears what, based on SpeechEventV1.volume.

import type { SimWorld, SimEvent } from '../core/types';
import { FCS } from '../../config/formulaConfigSim';

export type SpeechRecipient = {
  agentId: string;
  confidence: number;
  channel: 'direct' | 'overheard' | 'distant';
};

function getAgentLoc(world: SimWorld, id: string): string {
  return String((world.characters[id] as any)?.locId ?? '');
}

function getLocationNeighbors(world: SimWorld, locId: string): string[] {
  const loc = world.locations[locId];
  return Array.isArray(loc?.neighbors) ? loc.neighbors : [];
}

function navNodeDistance(world: SimWorld, a: string, b: string): number {
  const ca = world.characters[a];
  const cb = world.characters[b];
  if (!ca || !cb) return Infinity;
  if ((ca as any).locId !== (cb as any).locId) return Infinity;
  const na = (ca as any).pos?.nodeId;
  const nb = (cb as any).pos?.nodeId;
  if (!na || !nb) return 0;
  if (na === nb) return 0;
  return 1;
}

export function routeSpeechEvent(world: SimWorld, event: SimEvent): SpeechRecipient[] {
  const payload = (event as any)?.payload;
  if (!payload || payload.schema !== 'SpeechEventV1') return [];

  const actorId = String(payload.actorId ?? '');
  const targetId = String(payload.targetId ?? '');
  const volume: string = String(payload.volume ?? 'normal');
  const actorLoc = getAgentLoc(world, actorId);
  if (!actorLoc) return [];

  const cfg = FCS.infoChannels.hearing;
  const allIds = Object.keys(world.characters || {}).sort();
  const recipients: SpeechRecipient[] = [];

  for (const id of allIds) {
    if (id === actorId) continue;
    const idLoc = getAgentLoc(world, id);
    if (!idLoc) continue;

    if (volume === 'whisper') {
      if (id === targetId) {
        recipients.push({ agentId: id, confidence: 0.95, channel: 'direct' });
        continue;
      }
      if (idLoc === actorLoc) {
        const dist = navNodeDistance(world, actorId, id);
        if (dist <= cfg.whisperRange) {
          const conf = Math.max(0.15, 0.6 - 0.2 * dist);
          recipients.push({ agentId: id, confidence: conf, channel: 'overheard' });
        }
      }
    } else if (volume === 'shout') {
      if (idLoc === actorLoc) {
        const isDirect = id === targetId;
        recipients.push({
          agentId: id,
          confidence: isDirect ? 0.95 : 0.85,
          channel: isDirect ? 'direct' : 'overheard',
        });
      } else if (getLocationNeighbors(world, actorLoc).includes(idLoc)) {
        recipients.push({ agentId: id, confidence: 0.5, channel: 'distant' });
      }
    } else {
      if (idLoc === actorLoc) {
        const isDirect = id === targetId;
        recipients.push({
          agentId: id,
          confidence: isDirect ? 0.95 : 0.75,
          channel: isDirect ? 'direct' : 'overheard',
        });
      }
    }
  }
  return recipients;
}
