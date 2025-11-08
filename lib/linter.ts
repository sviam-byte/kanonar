import { AnyEntity, LintIssue, Parameter } from '../types';

function checkParameterRanges(entity: AnyEntity): LintIssue[] {
  const issues: LintIssue[] = [];
  entity.parameters.forEach((param: Parameter) => {
    if (param.defaultValue < param.min || param.defaultValue > param.max) {
      issues.push({
        id: `${entity.entityId}-range-default-${param.key}`,
        entityId: entity.entityId,
        entityTitle: entity.title,
        type: 'range_error',
        severity: 'warn',
        message: `Default value (${param.defaultValue}) for parameter '${param.name}' is outside the defined range [${param.min}, ${param.max}].`,
        location: `parameters.${param.key}.defaultValue`
      });
    }
    if (param.canonValue < param.min || param.canonValue > param.max) {
      issues.push({
        id: `${entity.entityId}-range-canon-${param.key}`,
        entityId: entity.entityId,
        entityTitle: entity.title,
        type: 'range_error',
        severity: 'error',
        message: `Canon value (${param.canonValue}) for parameter '${param.name}' is outside the defined range [${param.min}, ${param.max}].`,
        location: `parameters.${param.key}.canonValue`
      });
    }
  });
  return issues;
}

function checkMissingRelations(entity: AnyEntity, entityMap: Map<string, AnyEntity>): LintIssue[] {
  const issues: LintIssue[] = [];
  entity.relations.forEach(relation => {
    if (!entityMap.has(relation.entityId)) {
      issues.push({
        id: `${entity.entityId}-missing-ref-${relation.entityId}`,
        entityId: entity.entityId,
        entityTitle: entity.title,
        type: 'missing_ref',
        severity: 'error',
        message: `Relation of type '${relation.type}' points to a non-existent entity with ID '${relation.entityId}' ('${relation.entityTitle}').`,
        location: `relations`
      });
    }
  });
  return issues;
}


export function runCanonLinter(allEntities: AnyEntity[], entityMap: Map<string, AnyEntity>): LintIssue[] {
  let issues: LintIssue[] = [];

  for (const entity of allEntities) {
    issues = issues.concat(checkParameterRanges(entity));
    issues = issues.concat(checkMissingRelations(entity, entityMap));
  }

  return issues;
}