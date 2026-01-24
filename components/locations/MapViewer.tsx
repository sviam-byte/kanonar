import React, { useState, useRef, useEffect, useMemo } from 'react';
import { LocationMap } from '../../types';
import { LocationVectorMap } from './LocationVectorMap';
import { LocationMapEditor } from '../LocationMapEditor';

interface MapViewerProps {
  map: LocationMap;

  onCellClick?: (x: number, y: number) => void;
  highlights?: Array<{ x: number; y: number; color: string; size?: number }>;

  /** If true, shows the editor UI instead of a pure viewer. */
  isEditor?: boolean;
  onMapChange?: (map: LocationMap) => void;

  hideTextVisuals?: boolean;

  /** Cell pixel size for rendering. */
  cellPx?: number;

  /**
   * "fill" — растягивается на контейнер (твой текущий гигантский чёрный экран)
   * "map"  — контейнер ровно по размеру карты (то что тебе нужно)
   */
  sizeMode?: 'fill' | 'map';

  /** In fill-mode, auto-fit map into container. */
  autoFit?: boolean;
}

export const MapViewer: React.FC<MapViewerProps> = ({
  map,
  onCellClick,
  highlights,
  isEditor,
  onMapChange,
  hideTextVisuals,
  cellPx = 32,
  sizeMode = 'fill',
  autoFit = true,
}) => {
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const mapPxWidth = map.width * cellPx;
  const mapPxHeight = map.height * cellPx;

  // Auto-fit only in fill mode (иначе размер карты должен быть "как есть")
  useEffect(() => {
    if (sizeMode !== 'fill') return;
    if (!autoFit) return;

    const el = containerRef.current;
    if (!el) return;

    const recompute = () => {
      const { clientWidth, clientHeight } = el;
      const scaleX = (clientWidth - 40) / mapPxWidth;
      const scaleY = (clientHeight - 40) / mapPxHeight;
      const fitScale = Math.min(scaleX, scaleY, 1.0);
      setScale(Math.max(0.2, fitScale));
    };

    recompute();
    const ro = new ResizeObserver(() => recompute());
    ro.observe(el);
    return () => ro.disconnect();
  }, [sizeMode, autoFit, mapPxWidth, mapPxHeight]);

  // In map mode: start at 1 and don't auto-fit
  useEffect(() => {
    if (sizeMode === 'map') setScale(1);
  }, [sizeMode]);

  const handleZoomIn = () => setScale((s) => Math.min(3, s + 0.1));
  const handleZoomOut = () => setScale((s) => Math.max(0.2, s - 0.1));

  const outerStyle = useMemo(() => {
    if (sizeMode === 'map') {
      // контейнер строго под карту (+ рамка/паддинг)
      const w = Math.round(mapPxWidth * scale) + 2;
      const h = Math.round(mapPxHeight * scale) + 2;
      return {
        width: w,
        height: h,
      } as React.CSSProperties;
    }
    return { width: '100%', height: '100%' } as React.CSSProperties;
  }, [sizeMode, mapPxWidth, mapPxHeight, scale]);

  const outerClass =
    sizeMode === 'map'
      ? 'inline-block border border-canon-border rounded-lg overflow-hidden relative bg-transparent'
      : 'flex flex-col w-full h-full bg-black border border-canon-border rounded-lg overflow-hidden relative';

  return (
    <div ref={containerRef} className={outerClass} style={outerStyle}>
      {/* Controls */}
      <div className="absolute top-2 right-2 z-20 flex flex-col gap-1">
        <button
          onClick={handleZoomIn}
          className="w-6 h-6 bg-canon-bg/80 border border-canon-border rounded text-xs text-canon-text-light hover:border-canon-text"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="w-6 h-6 bg-canon-bg/80 border border-canon-border rounded text-xs text-canon-text-light hover:border-canon-text"
          title="Zoom out"
        >
          –
        </button>
      </div>

      {/* Render */}
      <div
        className={sizeMode === 'map' ? 'w-full h-full' : 'w-full h-full p-2'}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {isEditor ? (
          <LocationMapEditor map={map} onChange={(m) => onMapChange?.(m)} cellSize={cellPx} />
        ) : (
          <LocationVectorMap
            map={map}
            onCellClick={onCellClick}
            highlights={highlights}
            hideTextVisuals={hideTextVisuals}
            cellSize={cellPx}
          />
        )}
      </div>
    </div>
  );
};
