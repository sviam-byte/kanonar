/**
 * Canonical app route registry.
 * Keep this as the single source of truth for internal navigation paths.
 */
export const ROUTES = {
  home: '/',
  inspector: '/inspector',
  access: '/access',
  entities: {
    character: '/character',
    object: '/object',
    concept: '/concept',
    socialEvents: '/social-events',
    events: '/events',
  },
  narrative: {
    narrative: '/narrative',
    archetypes: '/archetypes',
    archetypeRelations: '/archetype-relations',
    mass: '/mass',
  },
  labs: {
    builder: '/builder',
    presets: '/presets',
    characterLab: '/character-lab',
    planningLab: '/planning-lab',
    dialogueLab: '/dialogue-lab',
    goalLab: '/goal-lab',
    goalLabConsole: '/goal-lab-console',
    compare: '/compare',
    biographyLab: '/biography-lab',
    relationsLab: '/relations-lab',
    locationConstructor: '/location-constructor',
    linter: '/linter',
  },
  simulation: {
    hub: '/scenarios',
    solver: '/solver',
    live: '/simulator',
    list: '/simulations',
    matrix: '/runner',
    diagnostics: '/diagnostics',
  },
  compat: {
    dialogueLabV2: '/dialogue-lab-v2',
    goalLabV2: '/goal-lab-v2',
    goalLabConsoleV2: '/goal-lab-console-v2',
    simulationHub: '/simulation-hub',
    socialSimulator: '/social-simulator',
    goalSandbox: '/goal-sandbox',
  },
  legacy: {
    dialogueLab: '/legacy/dialogue-lab',
    goalLab: '/legacy/goal-lab',
    goalLabConsole: '/legacy/goal-lab-console',
  },
} as const;

/**
 * Backward-compatible aliases that should transparently redirect to canonical routes.
 */
export const COMPAT_REDIRECTS: Record<string, string> = {
  [ROUTES.compat.dialogueLabV2]: ROUTES.labs.dialogueLab,
  [ROUTES.compat.goalLabV2]: ROUTES.labs.goalLab,
  [ROUTES.compat.goalLabConsoleV2]: ROUTES.labs.goalLabConsole,
  [ROUTES.compat.simulationHub]: ROUTES.simulation.hub,
  [ROUTES.compat.socialSimulator]: ROUTES.simulation.live,
  [ROUTES.compat.goalSandbox]: ROUTES.labs.goalLab,
};

export function withQuery(
  path: string,
  params?: URLSearchParams | Record<string, string | number | boolean | null | undefined>,
): string {
  if (!params) return path;

  const search = params instanceof URLSearchParams
    ? params
    : Object.entries(params).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          acc.set(key, String(value));
        }
        return acc;
      }, new URLSearchParams());

  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}
