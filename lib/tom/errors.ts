
import { TomEntry } from './state';

function sigmoid(x: number) {
    return 1 / (1 + Math.exp(-x));
}

export function computeErrorProfile(entry: TomEntry) {
    const b = entry.biases;
    if (!b) return;

    entry.errorProfile = {
        paranoia: sigmoid(b.hostile_attribution * 0.7 + b.trauma_reenactment * 0.6),
        naivete: sigmoid((1 - b.cynicism) * 0.5),
        cynicism: sigmoid(b.cynicism * 0.8 + b.confirmation * 0.4),
        self_blame: sigmoid(b.personalization * 0.5 + b.anchoring * 0.3),
    };
}
