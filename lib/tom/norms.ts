
import { NormativeProfile, TomEntry } from './state';

export function initNorms(entry: TomEntry, axes: string[]) {
    entry.norms = entry.norms || {
        values: {},
        thresholds: {},
        effective: {},
    };

    for (const a of axes) {
        entry.norms.values[a] = entry.norms.values[a] ?? 0.5;
        entry.norms.thresholds[a] = entry.norms.thresholds[a] ?? 0.5;
        entry.norms.effective[a] = entry.norms.effective[a] ?? 0.5;
    }
}

export function computeEffectiveNorms(entry: TomEntry, groupNorms?: Record<string, number>, contextImportance?: number) {
    if (!entry.norms) return;

    // Dynamic Lambdas
    const t = entry.traits?.trust ?? 0.5;
    const c = contextImportance ?? 0.5; // Placeholder, can come from outside

    // Base values
    let lambdaChar  = 0.4 + 0.2 * (1 - c); // Less character-driven in high-stakes context
    let lambdaRole  = 0.3 + 0.2 * c;       // More role-driven in high-stakes
    let lambdaGroup = 0.3 * t;             // More group-driven if high trust

    // Normalize lambdas
    const Z = lambdaChar + lambdaRole + lambdaGroup;
    lambdaChar /= Z;
    lambdaRole /= Z;
    lambdaGroup /= Z;

    const r = entry.roleProfile?.roles;
    let dominantRole: string | null = null;

    if (r) {
        let best = -1;
        for (const x in r) {
            if (r[x] > best) {
                best = r[x];
                dominantRole = x;
            }
        }
    }

    for (const v in entry.norms.values) {
        const Nchar = entry.norms.values[v];
        const Nrole = dominantRole ? (entry.norms.values[v] ?? Nchar) : Nchar; // Placeholder logic for role norm lookup
        const Ng = groupNorms?.[v] ?? Nchar;
        entry.norms.effective[v] =
            lambdaChar * Nchar +
            lambdaRole * Nrole +
            lambdaGroup * Ng;
    }
}
