
import { TomEntry } from './state';

function sigmoid(x: number) {
    return 1 / (1 + Math.exp(-x));
}

function cosineSim(a: Record<string, number>, b: Record<string, number>) {
    let dot = 0, sa = 0, sb = 0;
    for (const k in a) {
        dot += a[k] * (b[k] ?? 0);
        sa += a[k] * a[k];
        sb += (b[k] ?? 0) * (b[k] ?? 0);
    }
    return dot / (Math.sqrt(sa) * Math.sqrt(sb) + 1e-6);
}

function dist(a: Record<string, number>, b: Record<string, number>) {
    let s = 0;
    for (const k in a) {
        s += (a[k] - (b[k] ?? 0)) ** 2;
    }
    return Math.sqrt(s);
}

export function computeShame(entry: TomEntry, groupSalience = 0.8) {
    if (!entry.secondOrderSelf || !entry.norms || !entry.selfLatents) return;

    const M = 0.5 * (
        entry.secondOrderSelf.perceivedTrustFromTarget +
        entry.secondOrderSelf.perceivedAlignFromTarget
    );

    const selfAlign = cosineSim(entry.selfLatents, entry.norms.values); 
    const delta = Math.max(0, selfAlign - M);

    if (entry.affect) {
        entry.affect.shame = sigmoid(delta * groupSalience * 1.2);
    }
}

export function computeGuilt(entry: TomEntry, outcome: Record<string, number>) {
    if (!entry.norms || !entry.affect) return;
    const d = dist(outcome, entry.norms.values);
    entry.affect.guilt = sigmoid(d * 1.1);
}
