export {
  CONFLICT_ACTION_PROJECTION_SCHEMA_VERSION,
  CONFLICT_DEFINITION_SCHEMA_VERSION,
  type ConflictActionProjectionProvenance,
  type ConflictActionProjectionRow,
  type ConflictDefinition,
  type ConflictDefinitionTermination,
  type ConflictProjectionError,
} from './types';
export { TRUST_EXCHANGE_DEFINITION } from './trustExchangeDefinition';
export {
  projectLegalActions,
  resolveProjectedChoice,
  resolveProjectedJointChoice,
} from './projection';
