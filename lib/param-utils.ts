// lib/param-utils.ts
import { characterSchema } from '../data/character-schema';

export const getNestedValue = (obj: any, path: string): number | undefined => {
    if (!obj || !path) return undefined;
    const value = path.split('.').reduce((o, k) => (o || {})[k], obj);
    return typeof value === 'number' ? value : undefined;
};

export const getAxisValue = (flat: Record<string, number>, axisId: string): number => {
  return flat[`vector_base.${axisId}`] ?? 0.5; // дефолт в середину, если нет
}

export const setNestedValue = (obj: any, path: string, value: any): any => {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (current[key] === undefined || typeof current[key] !== 'object' || current[key] === null) {
            current[key] = {};
        }
        current = current[key];
    }
    current[keys[keys.length - 1]] = value;
    return obj;
};

export const flattenObject = (obj: any, prefix = ''): Record<string, any> => {
    if (!obj) return {};
    return Object.keys(obj).reduce((acc, k) => {
        const pre = prefix.length ? prefix + '.' : '';
        if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
            Object.assign(acc, flattenObject(obj[k], pre + k));
        } else {
            acc[pre + k] = obj[k];
        }
        return acc;
    }, {} as Record<string, any>);
};

export const getPathAndSchemaKey = (category: string) => {
    if (['A','B','C','D','E','F','G'].includes(category)) {
        return { schemaKey: category, pathPrefix: `vector_base` };
    }
    if (category.startsWith('body_')) {
        const pathPrefix = category.replace('_', '.');
        return { schemaKey: category, pathPrefix };
    }
    if (category.startsWith('legacy_')) {
        const pathPrefix = category.replace('legacy_', '');
        return { schemaKey: category, pathPrefix: pathPrefix };
    }
    return { schemaKey: category, pathPrefix: category };
};

export const createParamKeyToPathMap = (): Record<string, string> => {
    const map: Record<string, string> = {};
    Object.entries(characterSchema).forEach(([category, params]) => {
        const { pathPrefix } = getPathAndSchemaKey(category);
        Object.entries(params).forEach(([key, schema]) => {
            const fullKey = schema.path || (pathPrefix ? `${pathPrefix}.${key}` : key);
            map[key] = fullKey; // map simple key 'Fatigue' to 'body.acute.fatigue'
            map[fullKey] = fullKey; // also map full key to itself for convenience
            map[schema.name] = fullKey; // also map by name
        });
    });
    return map;
};