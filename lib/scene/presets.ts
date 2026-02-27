
import { ScenePreset } from './types';

export const SCENE_PRESETS: Record<string, ScenePreset> = {
  'safe_hub': {
    schemaVersion: 1,
    presetId: 'safe_hub',
    title: 'Safe Hub',
    description: 'Low threat, low surveillance, high privacy, recovery-friendly.',
    defaultMetrics: {
      crowd: 0.15, hostility: 0.05, chaos: 0.05, urgency: 0.10,
      scarcity: 0.10, loss: 0.05, novelty: 0.10, resourceAccess: 0.75
    },
    defaultNorms: {
      publicExposure: 0.20, privacy: 0.70, surveillance: 0.15,
      normPressure: 0.25, proceduralStrict: 0.20
    },
    entryPhaseId: 'idle',
    phases: [
      {
        id: 'idle',
        label: 'Idle',
        injections: [
          { id: 'scene:mode:safeHub', ns: 'scene', kind: 'scene_flag', magnitude: 1, label: 'safe hub' },
          { id: 'off:npc:help', ns: 'off', kind: 'offer', magnitude: 0.6, label: 'help available' }
        ],
        transitions: []
      }
    ],
    globalInjections: []
  },

  'crackdown': {
    schemaVersion: 1,
    presetId: 'crackdown',
    title: 'Crackdown',
    description: 'High surveillance, strict protocol, authority pressure.',
    defaultMetrics: {
      crowd: 0.55, hostility: 0.45, chaos: 0.35, urgency: 0.55,
      scarcity: 0.35, loss: 0.25, novelty: 0.35, resourceAccess: 0.35
    },
    defaultNorms: {
      publicExposure: 0.75, privacy: 0.20, surveillance: 0.85,
      normPressure: 0.70, proceduralStrict: 0.85
    },
    entryPhaseId: 'patrol',
    phases: [
      {
        id: 'patrol',
        label: 'Patrol presence',
        injections: [
          { id: 'scene:mode:crackdown', ns: 'scene', kind: 'scene_flag', magnitude: 1, label: 'crackdown' },
          { id: 'con:protocol:noViolence', ns: 'con', kind: 'constraint', magnitude: 1, label: 'no violence' }
        ],
        transitions: [
          {
            to: 'detain',
            when: [{ atomId: 'threat:final', op: '>=', value: 0.75 }],
            afterTicksInPhase: 0
          }
        ]
      },
      {
        id: 'detain',
        label: 'Detain suspects',
        injections: [
          { id: 'off:authority:check', ns: 'off', kind: 'offer', magnitude: 0.8, label: 'authority demands check-in' },
          { id: 'scene:timer:detain', ns: 'scene', kind: 'scene_timer', magnitude: 1, label: 'detain timer', meta: { ttl: 6 } }
        ],
        transitions: []
      }
    ],
    globalInjections: []
  },

  'pomdp_prototype': {
    schemaVersion: 1,
    presetId: 'pomdp_prototype',
    title: 'POMDP Prototype',
    description: 'Mid-range scene designed for POMDP lookahead testing. Moderate threat + social pressure.',
    defaultMetrics: {
      crowd: 0.30, hostility: 0.25, chaos: 0.20, urgency: 0.35,
      scarcity: 0.20, loss: 0.15, novelty: 0.40, resourceAccess: 0.55
    },
    defaultNorms: {
      publicExposure: 0.40, privacy: 0.50, surveillance: 0.35,
      normPressure: 0.35, proceduralStrict: 0.30
    },
    entryPhaseId: 'observe',
    phases: [
      {
        id: 'observe',
        label: 'Observation',
        injections: [
          { id: 'scene:mode:pomdpProto', ns: 'scene', kind: 'scene_flag', magnitude: 1, label: 'POMDP prototype' },
          { id: 'off:npc:info', ns: 'off', kind: 'offer', magnitude: 0.5, label: 'info available' },
          { id: 'threat:ambient', ns: 'threat', kind: 'ambient', magnitude: 0.25, label: 'ambient threat' }
        ],
        transitions: [
          {
            to: 'escalate',
            when: [{ atomId: 'threat:final', op: '>=', value: 0.6 }],
            afterTicksInPhase: 0
          }
        ]
      },
      {
        id: 'escalate',
        label: 'Escalation',
        injections: [
          { id: 'threat:escalation', ns: 'threat', kind: 'escalation', magnitude: 0.6, label: 'threat escalated' },
          { id: 'off:authority:intervention', ns: 'off', kind: 'offer', magnitude: 0.7, label: 'authority intervenes' }
        ],
        transitions: []
      }
    ],
    globalInjections: []
  }
};
