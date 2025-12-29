import { CTX_AXIS_IDS, QUARK_CODEX, type QuarkCode } from './quarkCodex';

export type InferResult = {
  code: QuarkCode;
  params?: Record<string, string | number | boolean | null | undefined>;
};

const CTX_AXIS_SET = new Set<string>(CTX_AXIS_IDS as unknown as string[]);

function hasCodex(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(QUARK_CODEX, code);
}

export function inferQuarkFromId(id: string): InferResult | null {
  if (typeof id !== 'string' || !id.includes(':')) return null;
  const p = id.split(':');
  const ns = p[0];

  if (ns === 'ctx' && p.length >= 2) {
    const axisOrSignal = p[1];
    const selfId = p.length >= 3 ? p[p.length - 1] : undefined;
    const code = CTX_AXIS_SET.has(axisOrSignal) ? `ctx.axis.${axisOrSignal}` : `ctx.signal.${axisOrSignal}`;
    return { code: hasCodex(code) ? code : `ctx.signal.${axisOrSignal}`, params: selfId ? { selfId, axis: axisOrSignal } : { axis: axisOrSignal } };
  }

  if (ns === 'world' && p.length >= 3) {
    const domain = p[1];
    const metric = p[2];

    // Special: world:tick:<tick>
    if (domain === 'tick' && p.length >= 3) {
      const tick = Number(p[2]);
      if (hasCodex('world.tick')) return { code: 'world.tick', params: { tick } };
    }

    // Special: world:location:<selfId> (locationId usually lives in atom.target/meta)
    if (domain === 'location' && p.length >= 3) {
      const selfId = p[2];
      if (hasCodex('world.location')) return { code: 'world.location', params: { selfId } };
    }

    const selfId = p.length >= 4 ? p[3] : undefined;
    const code = `${ns}.${domain}.${metric}`;

    // world:loc:kind:<selfId>:<kind>  / world:loc:owner:... / world:loc:tag:...
    if (domain === 'loc' && selfId) {
      const extra = p.length >= 5 ? p[4] : undefined;
      const params: any = { selfId };
      if (metric === 'kind' && extra) params.kind = extra;
      if (metric === 'owner' && extra) params.owner = extra;
      if (metric === 'tag' && extra) params.tag = extra;
      if (metric === 'id' && extra) params.locId = extra;
      if (hasCodex(code)) return { code, params };
    }

    // world:map:hazardProximity:<selfId>[:<otherId>]
    if (domain === 'map' && metric === 'hazardProximity' && selfId) {
      const otherId = p.length >= 5 ? p[4] : undefined;
      const code2 = 'world.map.hazardProximity';
      if (hasCodex(code2)) return { code: code2, params: { selfId, otherId } };
    }

    if (hasCodex(code)) return { code, params: selfId ? { selfId } : undefined };
    if (domain === 'env' && metric) {
      const c2 = `world.env.${metric}`;
      if (hasCodex(c2)) return { code: c2, params: selfId ? { selfId } : undefined };
    }
  }

  if (ns === 'obs' && p.length >= 2) {
    const metric = p[1];
    const selfId = p[2];
    const otherId = p[3];
    const code = `obs.${metric}`;
    if (hasCodex(code)) {
      const params: any = { selfId };
      if (otherId) params.otherId = otherId;
      return { code, params };
    }
  }

  if (ns === 'app' && p.length >= 2) {
    const ch = p[1];
    const selfId = p[2];
    const code = `app.${ch}`;
    if (hasCodex(code)) return { code, params: selfId ? { selfId } : undefined };
  }

  if (ns === 'emo' && p.length >= 2) {
    const ch = p[1];
    const selfId = p[2];
    const code = `emo.${ch}`;
    if (hasCodex(code)) return { code, params: selfId ? { selfId } : undefined };
  }

  if (ns === 'tom' && p.length >= 2) {
    if (p[1] === 'dyad' && p.length >= 5) {
      const selfId = p[2];
      const otherId = p[3];
      const metric = p[4];
      const code = `tom.dyad.${metric}`;
      if (hasCodex(code)) return { code, params: { selfId, otherId, metric } };
    }
  }

  return null;
}
