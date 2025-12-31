import type { CharacterEntity } from '@/types';
import { listify } from '../utils/listify';

type ActiveModuleLike =
  | null
  | undefined
  | {
      id: string;
    };

export function filterCharactersForActiveModule(
  all: CharacterEntity[],
  activeModule: ActiveModuleLike,
): CharacterEntity[] {
  if (!activeModule?.id) return all;

  const moduleId = activeModule.id;

  // Strict: with an active module, only show characters that are module-only AND belong to the module
  // via security.requiredKey === moduleId or a matching module tag.
  return all.filter((c) => {
    const tags = listify(c.tags);
    const isModuleOnly = tags.includes('module_only');
    if (!isModuleOnly) return false;

    const requiredKey = (c as any).security?.requiredKey;
    if (requiredKey && requiredKey !== moduleId) return false;

    // If there's no requiredKey, allow by module tag match.
    return tags.includes(moduleId);
  });
}
