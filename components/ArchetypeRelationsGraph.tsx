
// components/ArchetypeRelationsGraph.tsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ARCHETYPE_NODES, ARCHETYPE_INFLUENCES, SOCIAL_ROLES, ALL_INDIVIDUAL_ARCHETYPES } from '../data/archetype-relations';

export interface NodeData {
    id: string;
    name: string;
    description: string;
    type: 'core' | 'role' | 'human' | 'divine' | 'other';
    weights?: Record<string, number>;
    metrics?: Record<string, number>;
    fx?: number | null;
    fy?: number | null;
    vx: number;
    vy: number;
    x: number;
    y: number;
}

interface EdgeData {
    source: NodeData;
    target: NodeData;
    value: number;
    description?: string;
}

const SIM_CONFIG = {
    chargeStrength: -4000,
    linkStrength: 0.1,
    centerGravity: 0.04,
    velocityDecay: 0.5,
    dragVelocityFactor: 0.1,
};

const NODE_COLORS: Record<NodeData['type'], string> = {
    core: '#33ff99',
    role: '#00ccff',
    human: '#87CEFA',
    divine: '#FFD700',
    other: '#9370DB',
};

function hash01(key: string): number {
    // FNV-1a -> [0,1)
    let h = 2166136261 >>> 0;
    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
}

export const ArchetypeRelationsGraph: React.FC<{ onNodeSelect: (node: NodeData | null) => void; filters: Record<string, boolean> }> = ({ onNodeSelect, filters }) => {
    const [nodes, setNodes] = useState<NodeData[]>([]);
    const [edges, setEdges] = useState<EdgeData[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const svgRef = useRef<SVGSVGElement>(null);
    const animationFrameRef = useRef<number | null>(null);
    const dragNodeRef = useRef<{ node: NodeData, lastPos: { x: number, y: number } } | null>(null);
    const nodesRef = useRef<NodeData[]>([]);

    useEffect(() => {
        nodesRef.current = nodes || [];
    }, [nodes]);

    useEffect(() => {
        const width = svgRef.current?.clientWidth || 800;
        const height = svgRef.current?.clientHeight || 600;

        const filteredNodesData = [];
        if (filters.core) filteredNodesData.push(...ARCHETYPE_NODES);
        if (filters.roles) filteredNodesData.push(...SOCIAL_ROLES);
        if (filters.human) filteredNodesData.push(...ALL_INDIVIDUAL_ARCHETYPES.filter(a => a.type === 'human'));
        if (filters.divine) filteredNodesData.push(...ALL_INDIVIDUAL_ARCHETYPES.filter(a => a.type === 'divine'));
        if (filters.other) filteredNodesData.push(...ALL_INDIVIDUAL_ARCHETYPES.filter(a => a.type === 'other'));

        const newNodes = filteredNodesData.map(d => ({
            ...d,
            x: width / 2 + (hash01(`${d.id}:x`) - 0.5) * width * 0.5,
            y: height / 2 + (hash01(`${d.id}:y`) - 0.5) * height * 0.5,
            vx: 0, vy: 0, fx: null, fy: null,
        }));
        setNodes(newNodes);

        const nodeMap = new Map(newNodes.map(n => [n.id, n]));
        const newEdges: EdgeData[] = [];
        if (filters.core) {
            newEdges.push(...ARCHETYPE_INFLUENCES.map(link => {
                const s = nodeMap.get(link.source);
                const t = nodeMap.get(link.target);
                if (!s || !t) return null;
                return { source: s, target: t, value: link.value, description: link.description, };
            }).filter(Boolean) as EdgeData[]);
        }
        if (filters.roles && filters.core) {
            newEdges.push(...SOCIAL_ROLES.flatMap(role => Object.entries(role.weights).map(([archId, weight]) => {
                 const s = nodeMap.get(role.id);
                 const t = nodeMap.get(archId);
                 if (!s || !t) return null;
                 return { source: s, target: t, value: weight };
            })).filter(Boolean) as EdgeData[]);
        }
        setEdges(newEdges);
    }, [filters]);
    
    const contextualEdges = useMemo(() => {
        if (!selectedId || !nodes.length) return [];
        const selectedNode = nodes.find(n => n.id === selectedId);
        if (!selectedNode || !selectedNode.metrics) return [];
        const coreNodes = nodes.filter(n => n.type === 'core');
        if (coreNodes.length === 0) return [];
        return Object.entries(selectedNode.metrics).map(([coreId, weight]) => {
            const coreNode = coreNodes.find(n => n.id === coreId);
            if (!coreNode) return null;
            return { source: selectedNode, target: coreNode, value: weight };
        }).filter(Boolean) as EdgeData[];
    }, [selectedId, nodes]);

    useEffect(() => {
        const width = svgRef.current?.clientWidth || 800;
        const height = svgRef.current?.clientHeight || 600;

        const simulationStep = () => {
            const currentNodes = nodesRef.current;
            if (!currentNodes || currentNodes.length === 0) {
                animationFrameRef.current = requestAnimationFrame(simulationStep);
                return;
            }

            const newNodes = currentNodes.map(node => {
                const newNode = { ...node };

                // Ensure coordinates exist
                if (newNode.x === undefined || isNaN(newNode.x)) newNode.x = width/2;
                if (newNode.y === undefined || isNaN(newNode.y)) newNode.y = height/2;

                if (!newNode.fx && !newNode.fy) {
                    newNode.vx += (width / 2 - newNode.x) * SIM_CONFIG.centerGravity * 0.01;
                    newNode.vy += (height / 2 - newNode.y) * SIM_CONFIG.centerGravity * 0.01;
                }

                for (const otherNode of currentNodes) {
                    if (newNode.id === otherNode.id) continue;
                    if (otherNode.x === undefined || otherNode.y === undefined) continue;
                    
                    const dx = otherNode.x - newNode.x;
                    const dy = otherNode.y - newNode.y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < 1) distance = 1;
                    const force = SIM_CONFIG.chargeStrength / (distance * distance);
                    newNode.vx += (dx / distance) * force * 0.01;
                    newNode.vy += (dy / distance) * force * 0.01;
                }
                return newNode;
            });

            const allEdges = [...edges, ...contextualEdges];
            for (const edge of allEdges) {
                const sourceNode = newNodes.find(n => n.id === edge.source.id);
                const targetNode = newNodes.find(n => n.id === edge.target.id);
                if (!sourceNode || !targetNode) continue;
                
                if (targetNode.x === undefined || sourceNode.x === undefined) continue;

                const dx = targetNode.x - sourceNode.x;
                const dy = targetNode.y - sourceNode.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                const isIndividualLink = sourceNode.type !== 'core' && sourceNode.type !== 'role';
                const idealDist = isIndividualLink ? 120 : (sourceNode.type === 'role' || targetNode.type === 'role') ? 80 : 250;
                const strength = isIndividualLink ? 0.4 : SIM_CONFIG.linkStrength;
                const force = (distance - idealDist) * strength * 0.1;

                if (!sourceNode.fx) { sourceNode.vx += (dx / distance) * force; sourceNode.vy += (dy / distance) * force; }
                if (!targetNode.fx) { targetNode.vx -= (dx / distance) * force; targetNode.vy -= (dy / distance) * force; }
            }

            for (const node of newNodes) {
                if (!node.fx) { node.vx *= SIM_CONFIG.velocityDecay; node.x += node.vx; } else { node.x = node.fx; }
                if (!node.fy) { node.vy *= SIM_CONFIG.velocityDecay; node.y += node.vy; } else { node.y = node.fy; }
                
                // Clamp coordinates
                node.x = Math.max(30, Math.min(width - 30, node.x));
                node.y = Math.max(30, Math.min(height - 30, node.y));
            }

            setNodes(newNodes);
            animationFrameRef.current = requestAnimationFrame(simulationStep);
        };
        animationFrameRef.current = requestAnimationFrame(simulationStep);
        return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
    }, [edges, contextualEdges]);

    const handleMouseDown = useCallback((e: React.MouseEvent, node: NodeData) => {
        dragNodeRef.current = { node, lastPos: { x: e.clientX, y: e.clientY } };
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!dragNodeRef.current || !dragNodeRef.current.lastPos || !svgRef.current) return;
        const { node } = dragNodeRef.current;
        const pt = svgRef.current.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        
        const screenCTM = svgRef.current.getScreenCTM();
        if (!screenCTM) return;

        const { x, y } = pt.matrixTransform(screenCTM.inverse());
        
        const dx = e.clientX - dragNodeRef.current.lastPos.x;
        const dy = e.clientY - dragNodeRef.current.lastPos.y;

        setNodes(prev => prev.map(n => n.id === node.id ? { ...n, fx: x, fy: y, vx: dx * SIM_CONFIG.dragVelocityFactor, vy: dy * SIM_CONFIG.dragVelocityFactor } : n));
        dragNodeRef.current.lastPos = { x: e.clientX, y: e.clientY };
    }, []);
    
    const handleMouseUp = useCallback(() => {
        if (dragNodeRef.current) {
            const { node } = dragNodeRef.current;
            setNodes(prev => prev.map(n => n.id === node.id ? { ...n, fx: null, fy: null } : n));
        }
        dragNodeRef.current = null;
    }, []);
    
    const handleNodeClick = useCallback((node: NodeData) => {
        setSelectedId(prev => {
            const newId = prev === node.id ? null : node.id;
            onNodeSelect(newId ? nodesRef.current.find(n => n.id === newId) || null : null);
            return newId;
        });
    }, [onNodeSelect]);

    return (
        <svg ref={svgRef} width="100%" height="100%" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
            <g className="edges">
                {[...edges, ...contextualEdges].map(({ source, target, value, description }, i) => {
                    // Safety check for source/target and coordinates
                    if (!source || !target || typeof source.x !== 'number' || typeof source.y !== 'number' || typeof target.x !== 'number' || typeof target.y !== 'number') return null;

                    const isContextual = !description;
                    const color = isContextual ? NODE_COLORS[source.type] : (value > 0 ? '#33ff99' : '#ff4444');
                    return (
                        <g key={`${source.id}-${target.id}-${i}`}>
                            <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={color} strokeWidth={isContextual ? value * 5 : Math.abs(value) * 3} strokeOpacity={isContextual ? 0.6 : 0.4} />
                            {description && <title>{description}</title>}
                        </g>
                    );
                })}
            </g>
            <g className="nodes">
                {nodes.map(node => {
                    // Safety check for coordinates
                    if (typeof node.x !== 'number' || typeof node.y !== 'number' || isNaN(node.x) || isNaN(node.y)) return null;

                    const isSelected = selectedId === node.id;
                    const color = NODE_COLORS[node.type];
                    return (
                        <g key={node.id} transform={`translate(${node.x}, ${node.y})`} onMouseDown={e => handleMouseDown(e, node)} onClick={() => handleNodeClick(node)} className="cursor-grab active:cursor-grabbing">
                            <circle r={node.type === 'core' ? 18 : (node.type === 'role' ? 14 : 10)} fill={color} fillOpacity={0.5} stroke={isSelected ? '#fff' : color} strokeWidth={isSelected ? 3 : 1.5} />
                            <text textAnchor="middle" dy=".3em" fill="#fff" fontSize={node.type === 'core' ? 10 : (node.type === 'role' ? 8 : 7)} className="font-bold pointer-events-none select-none">{node.name}</text>
                            <title>{node.description}</title>
                        </g>
                    );
                })}
            </g>
        </svg>
    );
};
