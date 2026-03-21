/** Lightweight event projection used by condition evaluation. */
export interface RecentEventView {
  id: string;
  kind: string;
  age: number;
  salience?: number;
  actorId?: string;
  targetId?: string;
  observerMode?: 'seen' | 'heard' | 'inferred';
  tags?: string[];
}

/** Compact appraisal projection used by goal conditions and priority rules. */
export interface AppraisalView {
  tag: string;
  score: number;
  eventId?: string;
  targetId?: string;
}

/**
 * Goal-spec evaluator context.
 *
 * Metrics are intentionally a string map to keep migration flexible.
 * The canonical metric keys are listed in `lib/ontology/conditions.ts`.
 */
export interface GoalEvalContext {
  selfId: string;
  targetId?: string;
  tick: number;

  metrics: Record<string, number>;
  beliefs: Set<string>;
  capabilities: Set<string>;

  recentEvents: RecentEventView[];
  appraisals: AppraisalView[];

  recentActionKinds: string[];
  cooldownReady: Set<string>;
}
