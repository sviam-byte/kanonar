
import React, { useMemo } from 'react';
import { allLocations } from '../../data/locations';
import { Link } from 'react-router-dom';

interface Props {
    centerId: string;
}

export const LocationNetworkView: React.FC<Props> = ({ centerId }) => {
    
    const { nodes, edges } = useMemo(() => {
        const centerNode = allLocations.find(l => l.entityId === centerId);
        if (!centerNode) return { nodes: [], edges: [] };
        
        const nodes = [{ 
            id: centerNode.entityId, 
            x: 400, y: 300, 
            label: centerNode.title, 
            isCenter: true 
        }];
        
        const edges: any[] = [];
        
        if (centerNode.connections) {
            const keys = Object.keys(centerNode.connections);
            const count = keys.length;
            const radius = 150;
            
            keys.forEach((targetId, i) => {
                const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
                const tx = 400 + radius * Math.cos(angle);
                const ty = 300 + radius * Math.sin(angle);
                
                const targetLoc = allLocations.find(l => l.entityId === targetId);
                const label = targetLoc ? targetLoc.title : targetId;
                
                nodes.push({
                    id: targetId,
                    x: tx,
                    y: ty,
                    label: label,
                    isCenter: false
                });
                
                edges.push({
                    source: { x: 400, y: 300 },
                    target: { x: tx, y: ty },
                    dist: centerNode.connections![targetId].distance
                });
            });
        }
        
        return { nodes, edges };
    }, [centerId]);

    if (nodes.length === 0) return <div className="flex items-center justify-center h-full text-canon-text-light">Локация не найдена.</div>;

    return (
        <svg width="100%" height="100%" viewBox="0 0 800 600" className="w-full h-full">
            <defs>
                <marker id="head" orient="auto" markerWidth="6" markerHeight="6" refX="15" refY="3">
                    <path d="M0,0 V6 L6,3 Z" fill="#555" />
                </marker>
            </defs>
            
            {edges.map((e, i) => {
                if (!e.source || !e.target || typeof e.source.x !== 'number' || typeof e.target.x !== 'number') return null;
                return (
                <g key={i}>
                    <line 
                        x1={e.source.x} y1={e.source.y} 
                        x2={e.target.x} y2={e.target.y} 
                        stroke="#555" strokeWidth="1" 
                        markerEnd="url(#head)"
                    />
                    <text 
                        x={(e.source.x + e.target.x)/2} 
                        y={(e.source.y + e.target.y)/2} 
                        fill="#888" 
                        fontSize="10"
                        textAnchor="middle"
                        dy="-5"
                    >
                        {e.dist}m
                    </text>
                </g>
                );
            })}
            
            {nodes.map(n => (
                <Link key={n.id} to={`/location/${n.id}`}>
                    <g className="cursor-pointer hover:opacity-80 transition-opacity">
                        <circle 
                            cx={n.x} cy={n.y} r={n.isCenter ? 25 : 15} 
                            fill={n.isCenter ? '#00aaff' : '#1e1e1e'} 
                            stroke={n.isCenter ? '#fff' : '#00aaff'} 
                            strokeWidth="2"
                        />
                        <text 
                            x={n.x} y={n.y} dy={n.isCenter ? 40 : 30} 
                            textAnchor="middle" 
                            fill={n.isCenter ? '#fff' : '#ccc'} 
                            fontSize={n.isCenter ? 14 : 12}
                            fontWeight="bold"
                        >
                            {n.label}
                        </text>
                    </g>
                </Link>
            ))}
        </svg>
    );
};
