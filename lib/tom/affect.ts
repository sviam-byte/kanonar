
import { TomEntry } from './state';

function sigmoid(x: number) {
    return 1 / (1 + Math.exp(-x));
}

export function initAffect(entry: TomEntry) {
    entry.affect = entry.affect || {
        fear: 0.3,
        anger: 0.2,
        shame: 0.1,
        hope: 0.4,
        exhaustion: 0.2,
    };
}

export function updateAffectFromStress(entry: TomEntry, stress: number, uncertainty: number) {
    const a = entry.affect;
    if (!a) return;

    a.fear = sigmoid(0.8 * stress + 0.6 * uncertainty);
    a.exhaustion = sigmoid(0.7 * stress);

    // Link to traits
    const conflict = entry.traits?.conflict ?? 0.5;
    const bond     = entry.traits?.bond ?? 0.5;
    const trust    = entry.traits?.trust ?? 0.5;

    // Anger driven by conflict minus bond
    const anger_base = -2;
    a.anger = sigmoid(anger_base + 3.0 * conflict - 1.5 * bond);

    // Hope driven by trust and bond minus conflict
    const hope_base = -1;
    a.hope  = sigmoid(hope_base  + 2.0 * bond + 1.5 * trust - 1.5 * conflict);
}

export function updateAffectFromNormMismatch(entry: TomEntry, mismatch: number) {
    const a = entry.affect;
    if (!a) return;

    a.shame = sigmoid(a.shame + mismatch * 0.5);
}
