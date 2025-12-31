
// components/locations/LocationVectorMap.tsx

import React, { useMemo } from 'react';
import { LocationMap, SvgShape } from '../../types';
import { arr } from '../../lib/utils/arr';

interface Props {
    map: LocationMap;
    showGrid?: boolean;
    scale?: number;
    highlightCells?: Array<{x: number, y: number, color: string, size?: number}>; // size is a multiplier of scale
    onCellClick?: (x: number, y: number) => void;
}

const renderSvgShape = (shape: SvgShape, keyPrefix: string): React.ReactNode => {
    const Tag = shape.tag as any;
    
    // Convert hyphenated attributes to camelCase for React
    const props: any = {};
    const attrs = (shape as any)?.attrs;
    const entries =
      attrs && typeof attrs === 'object'
        ? Object.entries(attrs as Record<string, any>)
        : [];
    for (const [k, v] of entries) {
        const camelKey = k.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        props[camelKey] = v;
    }
    
    return (
        <Tag key={keyPrefix} {...props}>
            {shape.content}
            {arr((shape as any).children)
                .filter(Boolean)
                .map((child, i) => renderSvgShape(child as any, `${keyPrefix}-${i}`))}
        </Tag>
    );
};

export const LocationVectorMap: React.FC<Props> = ({ map, showGrid = true, scale = 30, highlightCells = [], onCellClick }) => {
    const { width, height, visuals, cells, exits } = map;

    // Grid Overlay - Always render interactive layer if onCellClick is present
    const gridOverlay = useMemo(() => {
        return arr(cells)
            .filter(Boolean)
            .map((cell: any) => {
            const elevation = cell.elevation || 0;
            const isWalkable = cell.walkable;

            // Visual style
            let bg = 'transparent';
            let border = showGrid ? 'rgba(255, 255, 255, 0.05)' : 'transparent';
            let zIndex = 20;

            if (showGrid) {
                 if (!isWalkable) {
                    bg = 'rgba(50, 0, 0, 0.3)';
                    border = 'rgba(255, 50, 50, 0.1)';
                    // Walls
                    if (elevation > 1) {
                         bg = `rgba(60, 60, 60, 0.6)`;
                         border = `rgba(100, 100, 100, 0.4)`;
                    } else if (elevation > 0) {
                         // Low obstacles like tables
                         bg = `rgba(80, 50, 50, 0.4)`;
                    }
                } else if (cell.danger > 0.5) {
                    bg = 'rgba(255, 100, 0, 0.2)';
                } else if (cell.cover > 0.5) {
                    bg = 'rgba(0, 255, 100, 0.1)';
                }
                
                // Pit Visualization
                if (elevation < 0) {
                     bg = `rgba(0, 0, 0, 0.5)`;
                     border = `rgba(50, 0, 0, 0.5)`;
                }
            }
            
            // 2.5D Elevation Visualization
            const brightnessStyle: React.CSSProperties = {};
            
            if (elevation > 0) {
                 // Simulate height with lightness
                 const opacity = Math.min(0.4, elevation * 0.15);
                 brightnessStyle.backgroundColor = `rgba(255, 255, 255, ${opacity})`;
                 
                 if (!isWalkable && elevation >= 1) {
                      // Blocky look for walls
                      brightnessStyle.boxShadow = `1px 1px 2px rgba(0,0,0,0.8), inset 1px 1px 0 rgba(255,255,255,0.2)`;
                      brightnessStyle.border = '1px solid rgba(200,200,200,0.3)';
                 } else {
                      // Subtle rise for platforms
                      brightnessStyle.boxShadow = `inset 0 0 5px rgba(255,255,255,${opacity})`;
                 }
            } else if (elevation < 0) {
                 // Pits / Depressions
                 const opacity = Math.min(0.8, Math.abs(elevation) * 0.25);
                 brightnessStyle.backgroundColor = `rgba(0, 0, 0, ${opacity})`;
                 brightnessStyle.boxShadow = `inset 2px 2px 5px rgba(0,0,0,0.8)`;
            }

            const isInteractive = !!onCellClick;

            return (
                <div 
                    key={`${cell.x}-${cell.y}`} 
                    className="absolute box-border transition-colors"
                    style={{ 
                        left: cell.x * scale, 
                        top: cell.y * scale, 
                        width: scale, 
                        height: scale,
                        backgroundColor: bg,
                        border: `0.5px solid ${border}`,
                        zIndex: zIndex + Math.floor(elevation), // Higher objects on top
                        pointerEvents: isInteractive ? 'auto' : 'none',
                        cursor: isInteractive ? 'pointer' : 'default'
                    }}
                    onClick={(e) => {
                        e.stopPropagation(); 
                        onCellClick?.(cell.x, cell.y);
                    }}
                    title={`(${cell.x},${cell.y}) W:${isWalkable ? 'Y' : 'N'} H:${elevation}`}
                >
                    {/* Elevation Overlay */}
                    {elevation !== 0 && (
                        <div className="absolute inset-0 pointer-events-none" style={brightnessStyle}>
                             {elevation > 0 && <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/30"></div>}
                        </div>
                    )}
                    
                    {cell.maxOccupancy !== undefined && cell.maxOccupancy < 1 && showGrid && (
                        <div className="absolute bottom-0 right-0 text-[8px] text-gray-500 font-mono px-0.5">
                            narrow
                        </div>
                    )}
                </div>
            );
        });
    }, [cells, showGrid, scale, onCellClick]);

    const highlightOverlay = useMemo(() => {
        return arr(highlightCells)
            .filter(Boolean)
            .map((h: any, i: number) => {
            if (!h) return null;
            // Apply scale multiplier for body size (default 0.6)
            const sizeMultiplier = h.size || 0.6; 
            const pixelSize = scale * sizeMultiplier;
            const offset = (scale - pixelSize) / 2;

            return (
                <div 
                    key={`hl-${i}`}
                    className="absolute rounded-full shadow-md transition-all duration-300 pointer-events-none"
                    style={{
                        left: h.x * scale + offset,
                        top: h.y * scale + offset,
                        width: pixelSize,
                        height: pixelSize,
                        backgroundColor: h.color,
                        zIndex: 50, // Always on top
                        border: '1px solid rgba(255,255,255,0.6)',
                        boxShadow: `0 0 ${pixelSize/2}px ${h.color}`
                    }}
                />
            );
        });
    }, [highlightCells, scale]);

    return (
        <div 
            className="relative bg-black overflow-hidden border border-canon-border rounded shadow-inner"
            style={{ width: width * scale, height: height * scale }}
        >
            {/* Vector Layer (SVG) - Background Z-Index */}
            <svg 
                width="100%" 
                height="100%" 
                viewBox={`0 0 ${width} ${height}`} 
                preserveAspectRatio="none"
                className="absolute inset-0 z-0 pointer-events-none"
            >
                {arr(visuals)
                    .filter(Boolean)
                    .map((shape: any, i: number) => renderSvgShape(shape, `vec-${i}`))}
                
                {arr(exits)
                    .filter(Boolean)
                    .map((exit: any, i: number) => (
                    <g key={`exit-${i}`} transform={`translate(${exit.x}, ${exit.y})`}>
                        <rect x="0.1" y="0.1" width="0.8" height="0.8" fill="none" stroke="#00aaff" strokeWidth="0.05" strokeDasharray="0.1 0.05" rx="0.1" />
                        <text x="0.5" y="0.6" fontSize="0.25" fill="#00aaff" textAnchor="middle" style={{ pointerEvents: 'none', fontWeight: 'bold' }}>EXIT</text>
                    </g>
                ))}
            </svg>
            
            {gridOverlay}
            {highlightOverlay}
        </div>
    );
};
