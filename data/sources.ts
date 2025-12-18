

import { Source } from '../types';

export const allSources: Source[] = [
  {
    id: 'source-rectorate-archives',
    type: 'archive',
    name: 'Rectorate Archives',
    reliability: 0.95,
    bias: 0.1, // Slightly biased towards official narrative
  },
  {
    id: 'source-kainrax-memory',
    type: 'witness',
    name: "Kainrax's Memory",
    reliability: 0.75,
    bias: -0.2, // Biased by personal relationship
  },
  {
    id: 'source-field-report-a12',
    type: 'document',
    name: 'Field Report A12',
    reliability: 0.85,
    bias: 0,
  },
  {
    id: 'source-evolutor-log',
    type: 'log',
    name: 'Evolutor Synthesis Log',
    reliability: 0.98,
    bias: 0,
  },
  {
    id: 'source-university-records',
    type: 'archive',
    name: 'University Records',
    reliability: 0.90,
    bias: 0,
  }
];

const sourceMap = new Map(allSources.map(s => [s.id, s]));

export const getSourceById = (id: string) => sourceMap.get(id);