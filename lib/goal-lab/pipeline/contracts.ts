// Goal Lab pipeline contracts (Level 1)
//
// Purpose: provide a strict, typed envelope for stage outputs that the UI can rely on.
// Strategy: do NOT rewrite the existing pipeline yet; instead, adapt V1 to this contract.

import type { ContextAtom } from '../../context/v2/types';

export type ArtifactKind =
  | 'truth'
  | 'observation'
  | 'belief'
  | 'domains'
  | 'logits'
  | 'goals'
  | 'atoms'
  | 'tom'
  | 'decision'
  | 'transition'
  | 'stabilizers'
  | 'modes'
  | 'debug'
  | 'unknown';

export type ProvenanceGroup =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L'
  | 'M'
  | 'X';

export type ProvenanceTransform = {
  type: 'clip' | 'softmax' | 'scale' | 'noise' | 'topk' | 'normalize' | 'other';
  params?: Record<string, any>;
};

export type Provenance = {
  group: ProvenanceGroup;
  /** Structural pointer to the originating knob/signal, e.g. 'A.world.scene.metrics.threat'. */
  path: string;
  stageId: string;
  producer: string;
  note?: string;
  transform?: ProvenanceTransform;
};

export type ArtifactRef<T = any> = {
  /** Stable id within a run. */
  id: string;
  kind: ArtifactKind;
  label: string;
  data: T;
  provenance?: Provenance[];
  /** Optional directed links to other artifacts/atoms. */
  links?: { rel: string; to: string }[];
};

export type PipelineStage = {
  id: string;
  title: string;
  summary?: string;
  warnings: string[];
  stats?: Record<string, number>;
  artifacts: ArtifactRef[];
};

export type PipelineRun = {
  schemaVersion: 2;
  selfId: string;
  tick: number;
  participantIds: string[];
  stages: PipelineStage[];
};

export type AtomView = ContextAtom & {
  provenance?: Provenance[];
};
