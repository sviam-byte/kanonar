
// components/LocationMapEditor.tsx

import React, { useState } from "react";
import { LocationMap, LocationMapCell } from "../types";
import { LocationVectorMap } from "./locations/LocationVectorMap";

type Brush =
  | "walkable"
  | "wall"
  | "obstacle"
  | "danger"
  | "hazard"
  | "clear_hazard"
  | "safe"
  | "cover"
  | "elevation_up"
  | "elevation_down";

interface Props {
  map: LocationMap;
  onChange: (map: LocationMap) => void;
  cellSize?: number;
}

export const LocationMapEditor: React.FC<Props> = ({ map, onChange, cellSize = 16 }) => {
  const [brush, setBrush] = useState<Brush>("walkable");
  const [showVector, setShowVector] = useState(true);
  const [activeLevel, setActiveLevel] = useState(0);

  const handleCellClick = (cell: LocationMapCell) => {
    const updated: LocationMapCell = { ...cell };
    
    // Only edit if same level
    if ((updated.level || 0) !== activeLevel) {
        updated.level = activeLevel;
    }

    if (brush === "walkable") {
      updated.walkable = true;
      if (updated.danger < 0.2) updated.danger = 0;
      updated.cover = 0;
      updated.elevation = 0;
    } else if (brush === "wall") {
      updated.walkable = false;
      updated.danger = 0;
      updated.cover = 1.0;
      updated.elevation = 2; // Walls are high by default
    } else if (brush === "obstacle") {
      updated.walkable = false;
      updated.cover = 0.8;
      updated.danger = 0;
      updated.elevation = 1;
    } else if (brush === "danger") {
      updated.walkable = true;
      updated.danger = Math.min(1, (updated.danger ?? 0.3) + 0.3);
    } else if (brush === "hazard") {
      updated.walkable = true;
      updated.danger = 1;
      const tags = new Set<string>(Array.isArray(updated.tags) ? updated.tags : []);
      tags.add("hazard");
      updated.tags = Array.from(tags);
    } else if (brush === "clear_hazard") {
      const tags = new Set<string>(Array.isArray(updated.tags) ? updated.tags : []);
      tags.delete("hazard");
      updated.tags = Array.from(tags);
    } else if (brush === "safe") {
      updated.walkable = true;
      updated.danger = 0;
      updated.cover = Math.min(1, (updated.cover ?? 0.3) + 0.3);
    } else if (brush === "cover") {
      updated.walkable = true;
      updated.cover = Math.min(1, (updated.cover ?? 0) + 0.5);
    } else if (brush === "elevation_up") {
      updated.elevation = Math.min(5, (updated.elevation ?? 0) + 0.5);
    } else if (brush === "elevation_down") {
      updated.elevation = Math.max(-5, (updated.elevation ?? 0) - 0.5);
    }

    const cells = map.cells.map(c =>
      c.x === cell.x && c.y === cell.y ? updated : c
    );

    onChange({ ...map, cells });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 items-center justify-between">
        <div className="flex flex-col gap-1">
            <div className="flex flex-wrap gap-1 text-[10px]">
            {(["walkable", "wall", "obstacle", "cover", "danger", "hazard", "clear_hazard", "safe"] as Brush[]).map(b => (
                <button
                key={b}
                onClick={() => setBrush(b)}
                className={
                    "px-2 py-1 rounded border text-xs uppercase transition-colors " +
                    (brush === b ? "border-canon-accent text-canon-accent bg-canon-accent/10" : "border-canon-border text-canon-text-light bg-canon-bg hover:border-canon-text-light")
                }
                >
                {b}
                </button>
            ))}
            </div>
            <div className="flex flex-wrap gap-1 text-[10px]">
                <button
                    onClick={() => setBrush("elevation_up")}
                    className={`px-2 py-1 rounded border text-xs uppercase transition-colors ${brush === 'elevation_up' ? "border-blue-400 text-blue-400 bg-blue-400/10" : "border-canon-border text-canon-text-light"}`}
                >
                    Raise (+0.5)
                </button>
                <button
                    onClick={() => setBrush("elevation_down")}
                    className={`px-2 py-1 rounded border text-xs uppercase transition-colors ${brush === 'elevation_down' ? "border-red-400 text-red-400 bg-red-400/10" : "border-canon-border text-canon-text-light"}`}
                >
                    Lower (-0.5)
                </button>
                <div className="ml-2 flex items-center gap-1 bg-canon-bg border border-canon-border rounded px-2">
                    <span className="text-xs text-canon-text-light">Level:</span>
                    <input 
                        type="number" 
                        value={activeLevel} 
                        onChange={e => setActiveLevel(Number(e.target.value))}
                        className="w-8 bg-transparent text-xs text-canon-text font-mono focus:outline-none"
                    />
                </div>
            </div>
        </div>
        
        {map.visuals && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={showVector} onChange={e => setShowVector(e.target.checked)} className="accent-canon-accent" />
                <span className="text-xs text-canon-text-light">Visuals</span>
            </label>
        )}
      </div>

      <div 
        className="relative border border-canon-border bg-black overflow-hidden select-none shadow-inner" 
        style={{ width: map.width * cellSize, height: map.height * cellSize }}
      >
           {/* Vector Layer (Background) */}
           {showVector && map.visuals && (
               <div className="absolute inset-0 pointer-events-none opacity-60">
                   <LocationVectorMap map={map} showGrid={false} scale={cellSize} />
               </div>
           )}

           {/* Interactive Grid Layer */}
           {map.cells.map(cell => {
                // Only show cells on active level? Or simple overlay?
                // For simplified 2.5D, we show all, but visually distinct
                const left = cell.x * cellSize;
                const top = cell.y * cellSize;

                let bg = "transparent";
                const tags = Array.isArray((cell as any).tags) ? (cell as any).tags : [];
                // Only show overlay if it has logic attached, otherwise let vector show through
                if (!cell.walkable) {
                    if (cell.cover >= 0.9) bg = "rgba(100,100,100,0.7)"; // Wall
                    else bg = "rgba(80,50,50,0.6)"; // Obstacle
                }
                else if (cell.danger > 0.6) bg = "rgba(220, 38, 38, 0.4)";
                else if (cell.danger > 0.2) bg = "rgba(185, 28, 28, 0.2)";
                else if (cell.cover > 0.4) bg = "rgba(6, 78, 59, 0.4)";

                // Height tint
                const elev = cell.elevation || 0;
                if (elev !== 0) {
                     if (elev > 0) bg = `rgba(255,255,255,${Math.min(0.3, elev*0.1)})`;
                     else bg = `rgba(0,0,0,${Math.min(0.5, Math.abs(elev)*0.2)})`;
                }

                // Final override: hazard-tag should be visually unambiguous
                if (tags.includes("hazard")) bg = "rgba(236, 72, 153, 0.55)";

                // Always show faint border for editing
                const border = '1px solid rgba(255,255,255,0.05)';

                return (
                <div
                    key={`${cell.x}:${cell.y}`}
                    onClick={() => handleCellClick(cell)}
                    style={{
                        position: "absolute",
                        left,
                        top,
                        width: cellSize,
                        height: cellSize,
                        backgroundColor: bg,
                        border: border,
                        cursor: "pointer",
                        zIndex: 10
                    }}
                    title={`(${cell.x},${cell.y}) W:${cell.walkable} D:${cell.danger} C:${cell.cover} H:${elev} tags:${Array.isArray((cell as any).tags) ? (cell as any).tags.join(",") : ""}`}
                />
                );
            })}
      </div>
    </div>
  );
};
