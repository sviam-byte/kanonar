
import React, { useState } from 'react';
import { computeDialogue } from '../lib/dialogue/engine-v4';
import { createInitialWorld } from '../lib/world/initializer';
import { useSandbox } from '../contexts/SandboxContext';
import { getEntitiesByType } from '../data';
import { EntityType, CharacterEntity } from '../types';

export const DialogueLabPage: React.FC = () => {
    const { characters } = useSandbox();
    const [speakerId, setSpeakerId] = useState('');
    const [listenerId, setListenerId] = useState('');
    const [result, setResult] = useState<any>(null);

    const handleRun = () => {
        const allChars = (getEntitiesByType(EntityType.Character) as CharacterEntity[]).concat(characters);
        const speaker = allChars.find(c => c.entityId === speakerId);
        const listener = allChars.find(c => c.entityId === listenerId);
        
        if (!speaker || !listener) return;
        
        const world = createInitialWorld(Date.now(), [speaker, listener], 'council_simple', {}, {});
        if (!world) return;

        const res = computeDialogue(world, {
            speakerId, listenerId, scenarioId: 'council_simple', tick: 0
        });
        setResult(res);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-canon-bg-light border border-canon-border rounded-lg p-5 space-y-4">
                <h2 className="text-xl font-bold">Dialogue Lab</h2>
                <input className="w-full bg-canon-bg border border-canon-border rounded p-2 text-sm" placeholder="Speaker ID" value={speakerId} onChange={e => setSpeakerId(e.target.value)} />
                <input className="w-full bg-canon-bg border border-canon-border rounded p-2 text-sm" placeholder="Listener ID" value={listenerId} onChange={e => setListenerId(e.target.value)} />
                <button onClick={handleRun} className="w-full bg-canon-accent text-canon-bg font-bold rounded p-2">Compute Utterance</button>
            </div>
            
            <div className="md:col-span-2 bg-canon-bg-light border border-canon-border rounded-lg p-5">
                <h3 className="font-bold mb-4">Recommended Speech Act</h3>
                {result ? (
                    <div className="space-y-4">
                        <div className="p-4 bg-purple-900/20 border border-purple-500/50 rounded">
                             <h1 className="text-2xl font-bold text-white mb-2">{result.chosen.label}</h1>
                             <div className="text-sm text-purple-300 font-mono uppercase tracking-wider">{result.chosen.atomId}</div>
                             <div className="mt-3 text-sm">
                                 <p><strong className="text-canon-text-light">Effect:</strong> {result.chosen.predictedEffectOnRelation}</p>
                                 <p><strong className="text-canon-text-light">Score:</strong> {result.chosen.qTotal.toFixed(3)}</p>
                             </div>
                        </div>
                        <div>
                            <h4 className="font-bold text-xs text-canon-text-light uppercase mb-2">Alternatives</h4>
                            <div className="space-y-2">
                                {result.alternatives.map((a: any) => (
                                    <div key={a.atomId} className="flex justify-between text-sm border-b border-canon-border/30 py-1">
                                        <span>{a.label}</span>
                                        <span className="font-mono opacity-60">{a.qTotal.toFixed(3)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : <div className="italic opacity-50">No result. Select speaker and listener to compute.</div>}
            </div>
        </div>
    );
}
