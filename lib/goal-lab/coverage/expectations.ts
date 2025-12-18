
// lib/goal-lab/coverage/expectations.ts
export type Expectation = {
  id: string;
  label: string;
  anyOf: { prefix?: string; exact?: string; predicateName?: string }[];
  severity?: 'info' | 'warn' | 'error';
};

export type CoverageGroup = {
  groupId: string;
  title: string;
  expectations: Expectation[];
};

export const DEFAULT_COVERAGE_GROUPS: CoverageGroup[] = [
  {
    groupId: 'world_tick',
    title: 'World / Tick',
    expectations: [
      { id: 'tick', label: 'tick atom', anyOf: [{ prefix: 'world:tick:' }], severity: 'error' }
    ]
  },
  {
    groupId: 'location_core',
    title: 'Location / Core',
    expectations: [
      { id: 'loc_id', label: 'location identity', anyOf: [{ exact: 'loc_id' }, { prefix: 'world:loc:id:' }, { prefix: 'loc:' }], severity: 'warn' },
      { id: 'privacy', label: 'privacy', anyOf: [{ prefix: 'ctx:privacy:' }, { prefix: 'world:loc:privacy:' }, { prefix: 'feat:loc:privacy:' }], severity: 'warn' },
      { id: 'publicness', label: 'publicness', anyOf: [{ prefix: 'ctx:publicness:' }, { prefix: 'world:loc:publicness:' }], severity: 'info' },
      { id: 'surveillance', label: 'surveillance/control', anyOf: [{ prefix: 'norm:surveillance:' }, { prefix: 'world:loc:control_level:' }, { prefix: 'ctx:surveillance:' }], severity: 'warn' },
      { id: 'normPressure', label: 'norm pressure', anyOf: [{ prefix: 'world:loc:normative_pressure:' }, { prefix: 'ctx:normPressure:' }, { prefix: 'norm:normPressure:' }], severity: 'info' },
      { id: 'crowd', label: 'crowd', anyOf: [{ prefix: 'scene:crowd:' }, { prefix: 'world:loc:crowd:' }, { prefix: 'ctx:crowd:' }], severity: 'warn' }
    ]
  },
  {
    groupId: 'map_local',
    title: 'Map / Local metrics',
    expectations: [
      { id: 'cover', label: 'cover', anyOf: [{ prefix: 'world:map:cover:' }, { prefix: 'map:cover:' }, { prefix: 'local_best_cover' }], severity: 'warn' },
      { id: 'escape', label: 'escape', anyOf: [{ prefix: 'world:map:escape:' }, { prefix: 'map:escape:' }, { prefix: 'nav_exit_nearby' }], severity: 'warn' },
      { id: 'exits', label: 'exits count', anyOf: [{ prefix: 'world:map:exits:' }, { prefix: 'nav_exits_count' }], severity: 'info' },
      { id: 'visibility', label: 'visibility', anyOf: [{ prefix: 'world:map:visibility:' }, { prefix: 'env_visibility' }], severity: 'info' },
      { id: 'hazard', label: 'hazard/danger', anyOf: [{ prefix: 'world:env:hazard:' }, { prefix: 'env_hazard' }, { prefix: 'cell_hazard' }], severity: 'warn' }
    ]
  },
  {
    groupId: 'character_body',
    title: 'Character / Body features',
    expectations: [
      { id: 'fatigue', label: 'fatigue', anyOf: [{ prefix: 'feat:char:' }, { prefix: 'body:' }], severity: 'info' },
      { id: 'pain', label: 'pain', anyOf: [{ prefix: 'feat:char:' }, { prefix: 'body:' }], severity: 'info' },
      { id: 'stress', label: 'stress', anyOf: [{ prefix: 'feat:char:' }, { prefix: 'body:' }], severity: 'info' }
    ]
  },
  {
    groupId: 'ctx_axes',
    title: 'Context Axes',
    expectations: [
      { id: 'danger', label: 'ctx danger', anyOf: [{ prefix: 'ctx:danger:' }], severity: 'warn' },
      { id: 'uncertainty', label: 'ctx uncertainty', anyOf: [{ prefix: 'ctx:uncertainty:' }], severity: 'info' },
      { id: 'hierarchy', label: 'ctx hierarchy', anyOf: [{ prefix: 'ctx:hierarchy:' }], severity: 'info' }
    ]
  },
  {
    groupId: 'threat',
    title: 'Threat',
    expectations: [
      { id: 'threat_final', label: 'threat final', anyOf: [{ prefix: 'threat:final:' }], severity: 'warn' },
      { id: 'threat_channels', label: 'threat channels', anyOf: [{ prefix: 'threat:ch:' }], severity: 'info' }
    ]
  },
  {
    groupId: 'tom',
    title: 'ToM',
    expectations: [
      { id: 'tom_any', label: 'some tom atoms', anyOf: [{ prefix: 'tom:' }], severity: 'info' }
    ]
  },
  {
    groupId: 'possibilities',
    title: 'Possibilities',
    expectations: [
      { id: 'aff_any', label: 'aff:* possibilities', anyOf: [{ prefix: 'aff:' }], severity: 'info' },
      { id: 'con_any', label: 'con:* constraints', anyOf: [{ prefix: 'con:' }], severity: 'info' },
      { id: 'off_any', label: 'off:* offers', anyOf: [{ prefix: 'off:' }], severity: 'info' }
    ]
  }
];
