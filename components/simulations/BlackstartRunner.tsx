import React, { useState, useCallback, useMemo } from 'react';
import { SimulationMeta } from '../../types';
import { blackstartGraph, BlackstartNode } from '../../lib/simulations/blackstart';

interface RunnerProps {
  sim: SimulationMeta;
}

type NodeStatus = 'off' | 'booting' | 'on' | 'failed';

const statusStyles = {
    off: { bg: 'bg-canon-border', text: 'text-canon-text-light' },
    booting: { bg: 'bg-yellow-500/50 animate-pulse', text: 'text-yellow-300' },
    on: { bg: 'bg-canon-green/80', text: 'text-white' },
    failed: { bg: 'bg-canon-red/80', text: 'text-white' },
};

export const BlackstartRunner: React.FC<RunnerProps> = ({ sim }) => {
    const [nodeStatus, setNodeStatus] = useState<Record<string, NodeStatus>>(() => 
        Object.fromEntries(blackstartGraph.nodes.map(n => [n.id, 'off']))
    );
    const [gameState, setGameState] = useState<'playing' | 'failed' | 'success'>('playing');

    const handleReset = useCallback(() => {
        setNodeStatus(Object.fromEntries(blackstartGraph.nodes.map(n => [n.id, 'off'])));
        setGameState('playing');
    }, []);

    const handleNodeClick = (node: BlackstartNode) => {
        if (gameState !== 'playing' || nodeStatus[node.id] !== 'off') return;

        const dependenciesMet = node.dependencies.every(depId => nodeStatus[depId] === 'on');

        if (dependenciesMet) {
            setNodeStatus(prev => ({ ...prev, [node.id]: 'on' }));

            // Check for success after state update
            const allOn = blackstartGraph.nodes.every(n => (nodeStatus[n.id] === 'on' || n.id === node.id));
            if (allOn) {
                setGameState('success');
            }

        } else {
            // Failure cascade
            setGameState('failed');
            const failedNodes: Record<string, NodeStatus> = { [node.id]: 'failed' };
            
            const findDependents = (failedId: string) => {
                 blackstartGraph.nodes.forEach(n => {
                    if (n.dependencies.includes(failedId) && nodeStatus[n.id] === 'on') {
                        failedNodes[n.id] = 'failed';
                        findDependents(n.id);
                    }
                });
            }
            findDependents(node.id);
            
            setNodeStatus(prev => ({ ...prev, ...failedNodes }));
        }
    };

    const GameStateBanner = () => {
        if (gameState === 'playing') return null;
        const isSuccess = gameState === 'success';
        return (
            <div className={`absolute inset-0 flex items-center justify-center bg-black/70 z-20`}>
                <div className="text-center">
                    <h3 className={`text-4xl font-bold ${isSuccess ? 'text-canon-green' : 'text-canon-red'}`}>
                        {isSuccess ? 'СИСТЕМА ВОССТАНОВЛЕНА' : 'КАСКАДНЫЙ СБОЙ'}
                    </h3>
                    <button onClick={handleReset} className="mt-4 bg-canon-bg border border-canon-border rounded px-6 py-2 hover:bg-canon-accent hover:text-canon-bg transition-colors">
                        Перезапуск
                    </button>
                </div>
            </div>
        )
    };

    const nodePositions = useMemo(() => {
        const positions: Record<string, {x: number, y: number}> = {};
        const levels: Record<number, string[]> = {};
        
        const getNodeLevel = (nodeId: string, visited: Set<string> = new Set()): number => {
            if (visited.has(nodeId)) return 0; // Cycle detected
            visited.add(nodeId);
            const node = blackstartGraph.nodes.find(n => n.id === nodeId);
            if (!node || node.dependencies.length === 0) return 0;
            const maxDepLevel = Math.max(...node.dependencies.map(dep => getNodeLevel(dep, visited)));
            return 1 + maxDepLevel;
        };

        blackstartGraph.nodes.forEach(n => {
            const level = getNodeLevel(n.id);
            if (!levels[level]) levels[level] = [];
            levels[level].push(n.id);
        });
        
        const levelKeys = Object.keys(levels).map(Number).sort((a,b) => a-b);
        const yStep = 1 / (levelKeys.length + 1);

        levelKeys.forEach((level, i) => {
            const nodesAtLevel = levels[level];
            const xStep = 1 / (nodesAtLevel.length + 1);
            nodesAtLevel.forEach((nodeId, j) => {
                positions[nodeId] = { x: (j + 1) * xStep * 100, y: (i + 1) * yStep * 100 };
            });
        });
        return positions;
    }, []);

    return (
        <div className="relative h-[600px] bg-canon-bg border border-canon-border rounded-lg p-4">
            <GameStateBanner />
            <svg className="absolute inset-0 w-full h-full">
                {blackstartGraph.edges.map(edge => {
                    const sourcePos = nodePositions[edge.source];
                    const targetPos = nodePositions[edge.target];
                    if (!sourcePos || !targetPos) return null;
                    const isLive = nodeStatus[edge.source] === 'on';
                    return (
                        <line 
                            key={`${edge.source}-${edge.target}`}
                            x1={`${sourcePos.x}%`} y1={`${sourcePos.y}%`}
                            x2={`${targetPos.x}%`} y2={`${targetPos.y}%`}
                            className={`stroke-current transition-colors duration-500 ${isLive ? 'text-canon-accent' : 'text-canon-border'}`}
                            strokeWidth="2"
                        />
                    );
                })}
            </svg>
            {blackstartGraph.nodes.map(node => {
                const pos = nodePositions[node.id];
                if (!pos) return null;
                const status = nodeStatus[node.id];
                const style = statusStyles[status];

                return (
                    <div 
                        key={node.id}
                        onClick={() => handleNodeClick(node)}
                        className={`absolute w-32 h-20 transform -translate-x-1/2 -translate-y-1/2 p-2 rounded-lg border-2 border-current cursor-pointer transition-all duration-500 flex flex-col justify-center items-center text-center ${style.bg} ${style.text}`}
                        style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                        title={node.description}
                    >
                        <div className="font-bold text-sm">{node.name}</div>
                    </div>
                );
            })}
        </div>
    );
};