import type { ActionDef, ActionId, ActionIntent, ContextWorldState } from '../types';

function moveToLocation(w: ContextWorldState, intent: ActionIntent) {
  if (intent.target?.kind === 'location') {
    w.contextEx.locationOf[intent.actorId] = intent.target.id;
  }
}

function makeAction(def: Omit<ActionDef, 'effects'> & { effects?: ActionDef['effects'] }): ActionDef {
  return {
    ...def,
    effects: def.effects ?? (() => []),
  };
}

export const DEFAULT_ACTION_CATALOG: Record<ActionId, ActionDef> = {
  wait: makeAction({
    id: 'wait',
    label: 'Wait',
    target: { mode: 'self' },
    gatesHard: [],
  }),
  observe: makeAction({
    id: 'observe',
    label: 'Observe',
    target: { mode: 'self' },
    gatesHard: [],
  }),
  move: makeAction({
    id: 'move',
    label: 'Move',
    target: { mode: 'location' },
    gatesHard: [],
    effects: (w, intent) => {
      moveToLocation(w, intent);
      return [];
    },
    baseRisk: 0.2,
  }),
  hide: makeAction({
    id: 'hide',
    label: 'Hide',
    target: { mode: 'self' },
    gatesHard: [],
  }),
  escape: makeAction({
    id: 'escape',
    label: 'Escape',
    target: { mode: 'location' },
    gatesHard: [],
    effects: (w, intent) => {
      moveToLocation(w, intent);
      return [];
    },
    baseRisk: 0.5,
  }),
  talk: makeAction({
    id: 'talk',
    label: 'Talk',
    target: { mode: 'agent' },
    gatesHard: [],
  }),
  negotiate: makeAction({
    id: 'negotiate',
    label: 'Negotiate',
    target: { mode: 'agent' },
    gatesHard: [],
  }),
  help: makeAction({
    id: 'help',
    label: 'Help',
    target: { mode: 'agent' },
    gatesHard: [],
  }),
  heal: makeAction({
    id: 'heal',
    label: 'Heal',
    target: { mode: 'agent' },
    gatesHard: [],
  }),
  share_secret: makeAction({
    id: 'share_secret',
    label: 'Share secret',
    target: { mode: 'agent' },
    gatesHard: [],
  }),
  request_help: makeAction({
    id: 'request_help',
    label: 'Request help',
    target: { mode: 'agent' },
    gatesHard: [],
  }),
  threaten: makeAction({
    id: 'threaten',
    label: 'Threaten',
    target: { mode: 'agent' },
    gatesHard: [],
    baseRisk: 1,
  }),
  attack: makeAction({
    id: 'attack',
    label: 'Attack',
    target: { mode: 'agent' },
    gatesHard: [],
    baseRisk: 3,
  }),
  trade: makeAction({
    id: 'trade',
    label: 'Trade',
    target: { mode: 'agent' },
    gatesHard: [],
  }),
  steal: makeAction({
    id: 'steal',
    label: 'Steal',
    target: { mode: 'agent' },
    gatesHard: [],
    baseRisk: 2,
  }),
  sabotage: makeAction({
    id: 'sabotage',
    label: 'Sabotage',
    target: { mode: 'agent' },
    gatesHard: [],
    baseRisk: 2.5,
  }),
  call_guards: makeAction({
    id: 'call_guards',
    label: 'Call guards',
    target: { mode: 'self' },
    gatesHard: [],
  }),
};
