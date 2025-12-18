
import { AnyEntity, LintIssue, Parameter } from '../types';

function checkParameterRanges(entity: AnyEntity): LintIssue[] {
  const issues: LintIssue[] = [];
  if (!('parameters' in entity) || !entity.parameters) {
    return issues;
  }
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
  if ('relations' in entity && entity.relations) {
    entity.relations.forEach((relation: any) => {
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
  }
  return issues;
}

const normalizeParam = (value: number, param: Parameter): number => {
    if (param.max === param.min) return 0;
    return (value - param.min) / (param.max - param.min);
};

function checkBranchDrift(entity: AnyEntity, allEntities: AnyEntity[]): LintIssue[] {
    const issues: LintIssue[] = [];
    const allVersions = allEntities.filter(e => e.entityId === entity.entityId);
    if (allVersions.length < 2) return [];

    const branchPairs: [AnyEntity, AnyEntity][] = [];
    for (let i = 0; i < allVersions.length; i++) {
        for (let j = i + 1; j < allVersions.length; j++) {
            branchPairs.push([allVersions[i], allVersions[j]]);
        }
    }
    
    const DRIFT_THRESHOLD = 15; // as a percentage

    for (const [entityA, entityB] of branchPairs) {
        if (!('versionTags' in entityA) || !entityA.versionTags || !('versionTags' in entityB) || !entityB.versionTags || !('parameters' in entityA) || !entityA.parameters || !('parameters' in entityB) || !entityB.parameters) {
            continue;
        }

        const branchA = entityA.versionTags[0];
        const branchB = entityB.versionTags[0];

        let sumOfSquares = 0;
        const paramsA: Map<string, Parameter> = new Map(entityA.parameters.map((p: Parameter) => [p.key, p]));
        const paramsB: Map<string, Parameter> = new Map(entityB.parameters.map((p: Parameter) => [p.key, p]));
        const allKeys = new Set([...paramsA.keys(), ...paramsB.keys()]);

        for (const key of allKeys) {
            const paramA = paramsA.get(key);
            const paramB = paramsB.get(key);

            if (paramA && paramB) {
                const valA = normalizeParam(paramA.canonValue, paramA);
                const valB = normalizeParam(paramB.canonValue, paramB);
                sumOfSquares += (valA - valB) ** 2;
            } else {
                sumOfSquares += 1; // max divergence (1^2) for a missing/added param
            }
        }
        
        const divergence = allKeys.size > 0 ? Math.sqrt(sumOfSquares / allKeys.size) * 100 : 0;
        
        if (divergence > DRIFT_THRESHOLD) {
            issues.push({
                id: `${entity.entityId}-drift-${branchA}-vs-${branchB}`,
                entityId: entity.entityId,
                entityTitle: entity.title,
                type: 'branch_drift',
                severity: 'warn',
                message: `Significant parameter drift (${divergence.toFixed(1)}%) detected between branches '${branchA}' and '${branchB}'.`,
                location: `parameters`
            });
        }
    }
    return issues;
}


export function runCanonLinter(allEntities: AnyEntity[], entityMap: Map<string, AnyEntity>): LintIssue[] {
  let issues: LintIssue[] = [];
  const processedDrift = new Set<string>();

  for (const entity of allEntities) {
    issues = issues.concat(checkParameterRanges(entity));
    issues = issues.concat(checkMissingRelations(entity, entityMap));
    
    if (!processedDrift.has(entity.entityId)) {
        issues = issues.concat(checkBranchDrift(entity, allEntities));
        processedDrift.add(entity.entityId);
    }
  }

  return issues.sort((a, b) => {
      const severityOrder = { 'error': 0, 'warn': 1, 'info': 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return a.entityTitle.localeCompare(b.entityTitle);
  });
}
