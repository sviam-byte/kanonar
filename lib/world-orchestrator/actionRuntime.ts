// lib/world-orchestrator/actionRuntime.ts
// Runtime semantics for actions: validation, classification, and application.

import type { WorldSnapshot, PerAgentView } from './contracts';
import type { WorldEvent } from '../events/types';

export type ActionInstance = {
  actionType: string;
  actorId: string;
  targetId?: string;
  args?: Record<string, any>;
};

export type ApplyContext = {
  world: WorldSnapshot;
  actorId: string;
  targetId?: string;
  args?: Record<string, any>;
  rngSeed: number;
};

export type ApplyResult = {
  events: WorldEvent[];
  nextWorld: WorldSnapshot;
};

export type ActionRuntimeDef = {
  actionType: string;

  // Однотиковость — часть семантики действия.
  classify: (ctx: { view: PerAgentView; inst: ActionInstance }) => 'single' | 'intent';

  // Строгая семантическая валидация для применения.
  validate: (ctx: { view: PerAgentView; inst: ActionInstance }) => { ok: boolean; reasons: string[] };

  // Единственный источник истины о том, что произошло.
  apply: (ctx: ApplyContext) => ApplyResult;

  // Преобразование события в наблюдаемые атомы для свидетеля.
  toPerceptionAtoms?: (ctx: {
    event: WorldEvent;
    observerId: string;
    observerLocId: string;
    worldAfter: WorldSnapshot;
  }) => any[];
};
