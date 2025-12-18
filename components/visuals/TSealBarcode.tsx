
import React from 'react';
import { BaseEntity, ObjectEntity } from '../../types';

interface TSealBarcodeProps {
    entity: BaseEntity;
}

const dimColors = ['#00aaff', '#33ff99', '#ffaa00']; // H0, H1, H2

export const TSealBarcode: React.FC<TSealBarcodeProps> = ({ entity }) => {
    // Use type assertion or check if property exists
    const tda = (entity as ObjectEntity).tda;
    
    if (!tda || !tda.barcode || tda.barcode.length === 0) {
        return null;
    }

    const bars = tda.barcode;
    const maxDeath = Math.max(...bars.map(b => b[1]));

    return (
        <div className="w-full h-24 bg-canon-bg p-2 rounded border border-canon-border" title="T-Seal Persistence Barcode">
            <div className="relative w-full h-full">
                {bars.map(([birth, death, dim], i) => {
                    const left = (birth / maxDeath) * 100;
                    const width = ((death - birth) / maxDeath) * 100;
                    const top = (i * (100 / bars.length));
                    const height = (100 / bars.length) * 0.8;

                    return (
                        <div
                            key={i}
                            className="absolute rounded"
                            style={{
                                left: `${left}%`,
                                width: `${width}%`,
                                top: `${top}%`,
                                height: `${height}%`,
                                backgroundColor: dimColors[dim] || '#888888',
                                opacity: 0.8
                            }}
                            title={`Dim ${dim}: [${birth.toFixed(1)}, ${death.toFixed(1)}]`}
                        />
                    );
                })}
            </div>
        </div>
    );
};
