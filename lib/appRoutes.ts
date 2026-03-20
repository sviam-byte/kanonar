/**
 * Centralized canonical routes for app navigation.
 *
 * Why:
 * - Avoid stringly-typed route drift across UI/pages.
 * - Keep compatibility redirects explicit and easy to audit.
 * - Hide alternate entry points from UI while preserving old URLs.
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
  },

  simulation: {
    hub: '/scenarios',
    live: '/simulator',
    catalog: '/simulations',
    runner: '/runner',
    diagnostics: '/diagnostics',
    solver: '/solver',
  },

  labs: {
    builder: '/builder',
    locationBuilder: '/location-constructor',
    characterLab: '/character-lab',
    goalLab: '/goal-lab',
    goalLabConsole: '/goal-lab-console',
    dialogueLab: '/dialogue-lab',
    compare: '/compare',
    relationsLab: '/relations-lab',
    planningLab: '/planning-lab',
    biographyLab: '/biography-lab',
    presets: '/presets',
    linter: '/linter',
  },

  narrative: {
    canvas: '/narrative',
    archetypes: '/archetypes',
    archetypeRelations: '/archetype-relations',
    mass: '/mass',
  },

  legacy: {
    dialogueLab: '/legacy/dialogue-lab',
    goalLab: '/legacy/goal-lab',
    goalLabConsole: '/legacy/goal-lab-console',
  },
} as const;

export const COMPAT_REDIRECTS = [
  ['/dialogue-lab-v2', ROUTES.labs.dialogueLab],
  ['/goal-lab-v2', ROUTES.labs.goalLab],
  ['/goal-lab-console-v2', ROUTES.labs.goalLabConsole],
  ['/social-simulator', ROUTES.simulation.live],
  ['/simulation-hub', ROUTES.simulation.hub],
  ['/goal-sandbox', ROUTES.labs.goalLab],
] as const;

/** Safely appends query params, skipping empty values. */
export function withQuery(path: string, params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}
