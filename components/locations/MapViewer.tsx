
import React, { useState, useRef, useEffect } from 'react';
import { LocationMap } from '../../types';
import { LocationVectorMap } from './LocationVectorMap';
import { LocationMapEditor } from '../LocationMapEditor';

interface MapViewerProps {
    map: LocationMap;
    onCellClick?: (x: number, y: number) => void;
    highlights?: Array<{x: number, y: number, color: string}>;
    isEditor?: boolean;
    onMapChange?: (map: LocationMap) => void;
}

export const MapViewer: React.FC<MapViewerProps> = ({ map, onCellClick, highlights, isEditor, onMapChange }) => {
    const [scale, setScale] = useState(1);
    const containerRef = useRef<HTMLDivElement>(null);
    const safeHighlights = Array.isArray(highlights) ? highlights : [];
    
    // Auto-fit on mount/resize
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const recompute = () => {
            const { clientWidth, clientHeight } = el;
            const mapPxWidth = map.width * 32;
            const mapPxHeight = map.height * 32;

            const scaleX = (clientWidth - 40) / mapPxWidth;
            const scaleY = (clientHeight - 40) / mapPxHeight;
            const fitScale = Math.min(scaleX, scaleY, 1.0);

            setScale(Math.max(0.2, fitScale));
        };

        recompute();

        const ro = new ResizeObserver(() => recompute());
        ro.observe(el);
        return () => ro.disconnect();
    }, [map.width, map.height]);

    const handleZoomIn = () => setScale(s => Math.min(3, s + 0.1));
    const handleZoomOut = () => setScale(s => Math.max(0.2, s - 0.1));

    return (
        <div className="flex flex-col h-full bg-black border border-canon-border rounded-lg overflow-hidden relative">
            {/* Controls */}
            <div className="absolute top-2 right-2 z-20 flex flex-col gap-1">
                <button onClick={handleZoomIn} className="w-6 h-6 bg-canon-bg border border-canon-border rounded text-canon-text hover:bg-canon-accent hover:text-black font-bold">+</button>
                <button onClick={handleZoomOut} className="w-6 h-6 bg-canon-bg border border-canon-border rounded text-canon-text hover:bg-canon-accent hover:text-black font-bold">-</button>
                <div className="bg-black/50 text-[9px] text-center text-white rounded px-1 mt-1 font-mono">
                    {(scale * 100).toFixed(0)}%
                </div>
            </div>

            {/* Map Area */}
            <div 
                ref={containerRef} 
                className="flex-1 overflow-auto flex items-center justify-center p-4 custom-scrollbar bg-dots"
            >
                <div 
                    style={{ 
                        transform: `scale(${scale})`, 
                        transformOrigin: 'center center',
                        transition: 'transform 0.1s ease-out'
                    }}
                    className="relative shadow-2xl"
                >
                     {isEditor && onMapChange ? (
                         <div className="relative">
                            <LocationMapEditor map={map} onChange={onMapChange} cellSize={32} />
                            <div className="absolute inset-0 pointer-events-none">
                                <LocationVectorMap map={map} showGrid={false} scale={32} highlightCells={safeHighlights} />
                            </div>
                         </div>
                     ) : (
                         <LocationVectorMap map={map} showGrid={true} scale={32} highlightCells={safeHighlights} onCellClick={onCellClick} />
                     )}
                </div>
            </div>
            
            <style>{`
                .bg-dots {
                    background-image: radial-gradient(#333 1px, transparent 1px);
                    background-size: 20px 20px;
                }
            `}</style>
        </div>
    );
};
