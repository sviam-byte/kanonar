export interface MapIncidentPayload {
    grid: { w: number, h: number, D: number, dt: number };
    sources: { x: number, y: number, rate: number, days: number }[];
    quarantine: { rect: [number, number, number, number], k: number, from: number }[];
    thresholds: { safe: number, alert: number };
    days: number;
}

export function createInitialGrid(w: number, h: number): number[][] {
    return Array(h).fill(0).map(() => Array(w).fill(0));
}

export function runSimulationStep(
    currentGrid: number[][],
    payload: MapIncidentPayload,
    day: number
): number[][] {
    const { w, h, D } = payload.grid;
    const nextGrid = createInitialGrid(w, h);

    // Apply sources
    const sources = createInitialGrid(w, h);
    payload.sources.forEach(source => {
        if (day < source.days) {
            sources[source.y][source.x] = source.rate;
        }
    });

    // Apply quarantine
    const quarantine = createInitialGrid(w, h);
    payload.quarantine.forEach(q => {
        if (day >= q.from) {
            const [x, y, qw, qh] = q.rect;
            for (let i = y; i < y + qh; i++) {
                for (let j = x; j < x + qw; j++) {
                    if (i < h && j < w) {
                        quarantine[i][j] = q.k;
                    }
                }
            }
        }
    });

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const C = currentGrid[y][x];
            
            // Laplacian operator for diffusion
            const laplacian = (
                (currentGrid[y][x + 1] || C) +
                (currentGrid[y][x - 1] || C) +
                ((currentGrid[y + 1] || [])[x] || C) +
                ((currentGrid[y - 1] || [])[x] || C) -
                4 * C
            );

            const diffusion = D * laplacian;
            const sourceTerm = sources[y][x];
            const quarantineTerm = quarantine[y][x] * C;

            const nextC = C + diffusion + sourceTerm - quarantineTerm;
            nextGrid[y][x] = Math.max(0, nextC);
        }
    }

    return nextGrid;
}
