export type AtomOrigin = 'world' | 'obs' | 'override' | 'derived';

export interface Atom {
  id: string;              // Unique and stable ID
  m: number;               // Magnitude [0,1]
  c: number;               // Confidence [0,1]
  o: AtomOrigin;           // Origin of the data
  meta?: {
    trace?: {
      usedAtomIds?: string[];
      parts?: { name: string; value: number; weight?: number }[];
      formulaId?: string;
      notes?: string;
    };
    [k: string]: any;
  };
}
