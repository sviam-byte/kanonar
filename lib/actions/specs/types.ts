/** Layer G: concrete execution forms for intents. */
export interface ActionSchemaV1 {
  id: string;
  label: string;
  intentIds: string[];
  simActionKind: string;
  scoreBase: number;
  scoreModifiers: Array<{ kind: 'constant'; value: number }>;
  tags?: string[];
}

export interface DerivedActionSchemaCandidateV1 {
  schemaId: string;
  intentId: string;
  simActionKind: string;
  score: number;
  reasons: string[];
  trace: {
    usedAtomIds: string[];
    notes: string[];
    parts: Record<string, unknown>;
  };
}
