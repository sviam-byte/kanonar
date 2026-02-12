/**
 * Minimal typed envelope for the V2 pipeline inspector adapter.
 *
 * These types intentionally stay UI-oriented and permissive: they describe
 * how stage artifacts are transported to the frontend, not simulation internals.
 */

/** Supported inspector artifact categories. */
export type ArtifactKind =
  | 'truth'
  | 'observation'
  | 'belief'
  | 'domains'
  | 'goals'
  | 'atoms'
  | 'tom'
  | 'decision'
  | 'transition'
  | 'stabilizers'
  | 'modes'
  | 'debug'
  | 'raw';

/** Stage artifact shown in the UI inspector. */
export interface Artifact {
  id: string;
  kind: ArtifactKind;
  title: string;
  payload: unknown;
  /** Optional trace/provenance references (best-effort). */
  provenance: string[];
}

/** A single pipeline stage in the inspector trace. */
export interface StageTrace {
  id: string;
  title: string;
  index: number;
  artifacts: Artifact[];
  meta?: {
    selfId: string;
    tick: number;
  };
}

/** Full inspector trace produced from the V1 pipeline report. */
export interface PipelineTrace {
  version: 'v2-adapter';
  selfId: string;
  tick: number;
  stages: StageTrace[];
  /** Raw source report is preserved for debugging/compatibility. */
  raw: unknown;
}
