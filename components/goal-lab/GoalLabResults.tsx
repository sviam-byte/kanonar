
import React, { useEffect, useMemo, useState } from 'react';
import type { ContextSnapshot, ContextualGoalScore, ContextAtom, TemporalContextConfig, ContextualGoalContribution } from '../../lib/context/v2/types';
import { GOAL_DEFS } from '../../lib/goals/space'; 
import { describeGoal } from '../../lib/goals/goalCatalog';
import { AffectState, GoalTuningConfig, GoalCategoryId } from '../../types';
import { AgentContextFrame, TomRelationView, TomPhysicalOther } from '../../lib/context/frame/types';
import { Tabs } from '../Tabs';
import { ContextInspector } from '../ContextInspector';
import { LocationGoalsDebugPanel } from '../goals/LocationGoalsDebugPanel';
import { TomGoalsDebugPanel } from '../goals/TomGoalsDebugPanel';
import { AffectGrid, SpecificEmotionBar } from '../visuals/AffectGrid';
import { TomEntry } from '../../lib/tom/state';
import type { ContextualMindReport } from '../../lib/tom/contextual/types';
import { ContextMindPanel } from './ContextMindPanel';
import { AccessPanel } from './AccessPanel';
import { PossibilitiesPanel } from './PossibilitiesPanel';
import { DiffPanel } from './DiffPanel';
import { AtomDiff } from '../../lib/snapshot/diffAtoms';
import { DecisionPanel } from './DecisionPanel';
import { AtomBrowser } from './AtomBrowser';
import { ThreatPanel } from './ThreatPanel';
import { ToMPanel } from './ToMPanel';
import { CoveragePanel } from './CoveragePanel';
import { DecisionGraphView } from './DecisionGraphView';
import { GoalActionGraphView } from './GoalActionGraphView';
import { GoalLabSnapshotV1 } from '../../lib/goal-lab/snapshotTypes';
import { AtomInspector } from './AtomInspector';
import { EmotionExplainPanel } from './EmotionExplainPanel';
import { atomLabelRu } from '../../lib/i18n/atom_ru';
import { PipelinePanel } from './PipelinePanel';
import { CurvePreview } from './CurvePreview';
import type { CurvePreset } from '../../lib/utils/curves';
import { materializeStageAtoms } from './materializePipeline';
import { arr } from '../../lib/utils/arr';
import { OrchestratorLab } from '../../lib/goal-lab/labs/OrchestratorLab';
import { SimulatorLab } from '../../lib/goal-lab/labs/SimulatorLab';
import { defaultProducers } from '../../lib/orchestrator/defaultProducers';

interface Props {
  context: ContextSnapshot | null;
  frame?: AgentContextFrame | null;
  goalScores: ContextualGoalScore[];
  situation?: any | null;
  goalPreview?: {
    goals: Array<{ id: string; label: string; priority: number; activation: number; base_ctx: number }>;
    debug: { temperature: number; d_mix: Record<string, number> };
  } | null;
  actorLabels?: Record<string, string>;
  affect?: AffectState | null;
  temporal?: TemporalContextConfig;
  locationScores?: any[];
  tomScores?: any[];
  tom?: Record<string, TomEntry>;
  contextualMind?: ContextualMindReport | null;
  atomDiff?: AtomDiff[];
  snapshotV1?: GoalLabSnapshotV1 | null;
  pipelineV1?: any | null;
  perspectiveAgentId?: string | null;
  tomRows?: Array<{ me: string; other: string; dyad: any }> | null;
  sceneDump?: any;
  onDownloadScene?: () => void;
  onImportScene?: () => void;
  manualAtoms?: ContextAtom[];
  onChangeManualAtoms?: (atoms: ContextAtom[]) => void;
  pipelineStageId?: string;
  onChangePipelineStageId?: (id: string) => void;
  onExportPipelineStage?: (stageId: string) => void;
  onExportPipelineAll?: () => void;
}

function domainToCategory(domain?: string, layer?: string): GoalCategoryId {
  const d = String(domain || '').toUpperCase();
  const l = String(layer || '').toLowerCase();
  if (l === 'body') return 'rest';
  if (l === 'learn') return 'learn';
  if (l === 'identity') return 'identity';
  if (l === 'social') return 'social';
  if (l === 'mission') return 'mission';
  if (l === 'security') return 'control';
  if (d === 'REST' || d === 'BODY') return 'rest';
  if (d === 'SOCIAL' || d === 'CARE' || d === 'STATUS') return 'social';
  if (d === 'ORDER' || d === 'OBEDIENCE') return 'control';
  if (d === 'WORK' || d === 'INFO' || d === 'JUSTICE' || d === 'CHAOS') return 'mission';
  if (d === 'IDENTITY' || d === 'AUTONOMY' || d === 'RITUAL') return 'identity';
  return 'other';
}

function softmax(logits: number[]): number[] {
  if (!logits.length) return [];
  const safe = logits.map(x => (Number.isFinite(x) ? x : -99));
  const max = Math.max(...safe);
  const exps = safe.map(x => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map(e => e / sum);
}

function applyGoalTuningToScores(
  goalScores: ContextualGoalScore[],
  tuning: GoalTuningConfig
): ContextualGoalScore[] {
  const tuned: ContextualGoalScore[] = goalScores.map(gs => {
    const defId = (gs as any).defId || gs.goalId;
    const cat = domainToCategory((gs as any).domain, (gs as any).layer);
    let logit = gs.totalLogit ?? 0;
    const contributions: ContextualGoalContribution[] = [...arr(gs.contributions || [])];

    // Global knobs apply first so category/goal knobs can override the baseline.
    const globalKnob = tuning?.global;
    if (globalKnob?.slope != null && Number.isFinite(globalKnob.slope) && globalKnob.slope !== 1) {
      logit *= globalKnob.slope;
      contributions.push({
        source: 'derived',
        value: 0,
        explanation: `Tuning: global.slope=${globalKnob.slope}`,
      });
    }
    if (globalKnob?.bias != null && Number.isFinite(globalKnob.bias) && globalKnob.bias !== 0) {
      logit += globalKnob.bias;
      contributions.push({
        source: 'derived',
        value: 0,
        explanation: `Tuning: global.bias=${globalKnob.bias}`,
      });
    }

    if (tuning?.veto?.[defId]) {
      logit = -99;
      contributions.push({
        source: 'derived',
        value: 0,
        explanation: `Tuning: veto ${defId}`
      });
      return { ...gs, totalLogit: logit, contributions };
    }

    const catKnob = tuning?.categories?.[cat];
    if (catKnob?.slope != null && Number.isFinite(catKnob.slope) && catKnob.slope !== 1) {
      logit *= catKnob.slope;
      contributions.push({ source: 'derived', value: 0, explanation: `Tuning: ${cat}.slope=${catKnob.slope}` });
    }
    if (catKnob?.bias != null && Number.isFinite(catKnob.bias) && catKnob.bias !== 0) {
      logit += catKnob.bias;
      contributions.push({ source: 'derived', value: 0, explanation: `Tuning: ${cat}.bias=${catKnob.bias}` });
    }

    const g = tuning?.goals?.[defId];
    if (g?.slope != null && Number.isFinite(g.slope) && g.slope !== 1) {
      logit *= g.slope;
      contributions.push({ source: 'derived', value: 0, explanation: `Tuning: ${defId}.slope=${g.slope}` });
    }
    if (g?.bias != null && Number.isFinite(g.bias) && g.bias !== 0) {
      logit += g.bias;
      contributions.push({ source: 'derived', value: 0, explanation: `Tuning: ${defId}.bias=${g.bias}` });
    }

    return { ...gs, totalLogit: logit, contributions };
  });

  const probs = softmax(tuned.map(t => t.totalLogit ?? 0));
  for (let i = 0; i < tuned.length; i++) tuned[i] = { ...tuned[i], probability: probs[i] ?? 0 };
  return tuned;
}

interface AtomStyle {
    label: string;
    bg: string;
    border: string;
    text: string;
    icon: string;
}

const ATOM_CONFIG: Record<string, AtomStyle> = {
    'physical_risk': { label: 'Физ. угроза', bg: 'bg-red-900/40', border: 'border-red-500/50', text: 'text-red-300', icon: '⚔️' },
    'threat': { label: 'Угроза', bg: 'bg-red-900/40', border: 'border-red-500/50', text: 'text-red-300', icon: '⚠️' },
    'threat_local': { label: 'Лок. угроза', bg: 'bg-red-900/40', border: 'border-red-500/50', text: 'text-red-300', icon: '⚔️' },
    'proximity_enemy': { label: 'Враг рядом', bg: 'bg-orange-900/40', border: 'border-orange-500/50', text: 'text-orange-300', icon: '👹' },
    'belief_target_hostile': { label: 'Враждебность', bg: 'bg-orange-900/30', border: 'border-orange-500/30', text: 'text-orange-200', icon: '💢' },
    'social_support': { label: 'Поддержка', bg: 'bg-green-900/40', border: 'border-green-500/50', text: 'text-green-300', icon: '🤝' },
    'support_available': { label: 'Есть помощь', bg: 'bg-green-900/40', border: 'border-green-500/50', text: 'text-green-300', icon: '🚑' },
    'proximity_friend': { label: 'Друг рядом', bg: 'bg-emerald-900/40', border: 'border-emerald-500/50', text: 'text-emerald-300', icon: '🛡️' },
    'care_need': { label: 'Нужна помощь', bg: 'bg-teal-900/40', border: 'border-teal-500/50', text: 'text-teal-300', icon: '🆘' },
    'intimacy': { label: 'Близость', bg: 'bg-pink-900/40', border: 'border-pink-500/50', text: 'text-pink-300', icon: '❤️' },
    'authority_presence': { label: 'Власть', bg: 'bg-purple-900/40', border: 'border-purple-500/50', text: 'text-purple-300', icon: '👑' },
    'norm_pressure': { label: 'Давление норм', bg: 'bg-indigo-900/40', border: 'border-indigo-500/50', text: 'text-indigo-300', icon: '⚖️' },
    'low_visibility_zone': { label: 'Скрытность', bg: 'bg-gray-800', border: 'border-gray-500', text: 'text-gray-300', icon: '🌫️' },
    'crowding_pressure': { label: 'Толкучка', bg: 'bg-yellow-900/40', border: 'border-yellow-500/50', text: 'text-yellow-300', icon: '👥' },
    'safe_zone_hint': { label: 'Безопасно', bg: 'bg-blue-900/40', border: 'border-blue-500/50', text: 'text-blue-300', icon: '🏰' },
    'body_ok': { label: 'Тело OK', bg: 'bg-green-900/20', border: 'border-green-500/30', text: 'text-green-300', icon: '💪' },
    'body_wounded': { label: 'Ранен', bg: 'bg-red-900/40', border: 'border-red-500/50', text: 'text-red-300', icon: '🩸' },
    'self_pain': { label: 'Боль', bg: 'bg-red-900/30', border: 'border-red-500/40', text: 'text-red-300', icon: '⚡' },
    'time_pressure': { label: 'Цейтнот', bg: 'bg-amber-900/40', border: 'border-amber-500/50', text: 'text-amber-300', icon: '⏳' },
    'social_visibility': { label: 'На виду', bg: 'bg-cyan-900/40', border: 'border-cyan-500/50', text: 'text-cyan-300', icon: '👀' },
    'ctx_priority': { label: 'Приоритет', bg: 'bg-slate-900/40', border: 'border-slate-500/40', text: 'text-slate-200', icon: '🎛️' },
    'default': { label: 'Атом', bg: 'bg-canon-bg', border: 'border-canon-border', text: 'text-canon-text-light', icon: '🔹' }
};

function getAtomStyle(kind: string): AtomStyle {
    return ATOM_CONFIG[kind] || ATOM_CONFIG['default'];
}

function getGoalLabel(goalId: string): string {
    const def = GOAL_DEFS[goalId as keyof typeof GOAL_DEFS];
    return def?.label_ru || goalId;
}

export const ValueBadge: React.FC<{ label: string, value: number, color?: string }> = ({ label, value, color = "text-canon-text" }) => (
    <div className="flex flex-col bg-canon-bg border border-canon-border/40 rounded p-2 text-center min-w-[70px]">
        <span className="text-[10px] text-canon-text-light uppercase tracking-wider mb-1">{label}</span>
        <div className="relative h-1.5 w-full bg-canon-bg-light rounded-full overflow-hidden mb-1">
             <div className={`absolute top-0 left-0 h-full ${color.replace('text-', 'bg-')}`} style={{ width: `${Math.min(100, value * 100)}%` }}></div>
        </div>
        <span className={`font-mono font-bold text-sm ${color}`}>{value.toFixed(2)}</span>
    </div>
);

const AtomBadge: React.FC<{ atom: ContextAtom }> = ({ atom }) => {
    const style = getAtomStyle(atom.kind);
    return (
        <div className={`flex-shrink-0 flex items-center gap-2 px-2 py-1.5 rounded border ${style.bg} ${style.border} ${style.text} text-xs transition-transform hover:scale-105 select-none`} title={atom.id}>
            <span className="text-sm">{style.icon}</span>
            <div className="flex flex-col leading-none">
                <span className="font-bold whitespace-nowrap">{atomLabelRu(atom) || style.label}</span>
                <span className="text-[9px] opacity-70 font-mono mt-0.5">
                    {(atom.magnitude ?? 0).toFixed(2)} • {atom.source}
                </span>
            </div>
        </div>
    )
}

export const ContextRibbon: React.FC<{ atoms: ContextAtom[] }> = ({ atoms }) => {
    if (atoms.length === 0) return <div className="p-4 text-center text-xs text-canon-text-light italic bg-canon-bg-light/30 rounded border border-canon-border/30">Контекст чист. Нет активных факторов.</div>;
    
    // Sort atoms by magnitude descending
    const sorted = [...atoms].sort((a,b) => (b.magnitude ?? 0) - (a.magnitude ?? 0));

    return (
        <div className="w-full bg-black/20 border-y border-canon-border/30 p-2 overflow-x-auto custom-scrollbar">
            <div className="flex gap-2">
                {arr(sorted).map((atom) => (
                    <AtomBadge key={atom.id} atom={atom} />
                ))}
            </div>
        </div>
    );
};

export const ContextPrioritiesRibbon: React.FC<{ atoms: ContextAtom[] }> = ({ atoms }) => {
    const prios = atoms.filter((a) => String((a as any).id || '').startsWith('ctx:prio:'));
    if (!prios.length) return null;
    const sorted = [...prios].sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0));
    return (
        <div className="w-full bg-black/10 border-y border-canon-border/20 p-2 overflow-x-auto custom-scrollbar">
            <div className="flex items-center gap-2">
                <div className="text-[10px] uppercase tracking-wider text-canon-text-light/80 px-1 whitespace-nowrap">Приоритеты</div>
                {arr(sorted).map((atom) => (
                    <AtomBadge key={atom.id} atom={atom} />
                ))}
            </div>
        </div>
    );
};

// ... AnalysisView, GoalRow, EcologyView, ToMEntityCard helper components ...

const ContributionRow: React.FC<{ contrib: ContextualGoalContribution }> = ({ contrib }) => {
    const style = getAtomStyle(contrib.atomKind || 'default');
    
    return (
        <div className="flex justify-between items-center text-xs bg-black/20 p-2 rounded hover:bg-white/5 border border-transparent hover:border-canon-border/30 transition-colors">
            <div className="flex items-center gap-2 overflow-hidden">
                {/* Visual Indicator of Source */}
                {contrib.atomKind ? (
                     <div className={`w-1.5 h-6 rounded-full ${style.bg.replace('/40', '')}`} title={contrib.atomKind}></div>
                ) : (
                     <div className="w-1.5 h-6 rounded-full bg-gray-600"></div>
                )}
                
                <div className="flex flex-col min-w-0">
                    <span className="font-medium text-canon-text truncate" title={contrib.explanation}>
                        {contrib.explanation || contrib.source}
                    </span>
                    {contrib.atomLabel && (
                        <span className="text-[9px] text-canon-text-light/70 truncate font-mono">
                           {contrib.atomLabel} {contrib.formula ? `• ${contrib.formula}` : ''}
                        </span>
                    )}
                    {!contrib.atomLabel && (
                         <span className="text-[9px] text-canon-text-light/70 truncate font-mono">
                           {contrib.source}
                        </span>
                    )}
                </div>
            </div>
            
            <span className={`font-mono font-bold whitespace-nowrap ml-2 ${contrib.value > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {contrib.value > 0 ? '+' : ''}{contrib.value.toFixed(2)}
            </span>
        </div>
    );
}

export const AnalysisView: React.FC<{ score: ContextualGoalScore }> = ({ score }) => {
    const contributions = arr(score.contributions);
    const groups = {
        'Внешние Факторы (Атомы)': contributions.filter(c => c.source !== 'life'),
        'Внутренние (Личность)': contributions.filter(c => c.source === 'life')
    };

    return (
        <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-4 space-y-4 pb-20">
            <div className="flex-shrink-0 p-4 bg-canon-bg border border-canon-border rounded mb-4">
                 <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-xl font-bold text-canon-text">{getGoalLabel(score.goalId)}</h3>
                        <div className="text-xs text-canon-text-light font-mono mt-1">{score.goalId}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-mono font-bold text-canon-accent">{score.totalLogit.toFixed(2)}</div>
                        <div className="text-[10px] uppercase text-canon-text-light tracking-wider">Total Logit</div>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {groups['Внешние Факторы (Атомы)'].length > 0 && (
                    <div>
                        <h5 className="text-[10px] font-bold text-canon-text-light uppercase mb-2 px-1">Контекст и Окружение</h5>
                        <div className="space-y-1">
                            {groups['Внешние Факторы (Атомы)'].sort((a,b) => Math.abs(b.value) - Math.abs(a.value)).map((c, i) => (
                                <ContributionRow key={i} contrib={c} />
                            ))}
                        </div>
                    </div>
                )}
                
                {groups['Внутренние (Личность)'].length > 0 && (
                     <div>
                        <h5 className="text-[10px] font-bold text-canon-text-light uppercase mb-2 px-1 border-t border-canon-border/20 pt-4">Личность и Драйвы</h5>
                        <div className="space-y-1">
                            {groups['Внутренние (Личность)'].sort((a,b) => Math.abs(b.value) - Math.abs(a.value)).map((c, i) => (
                                <ContributionRow key={i} contrib={c} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const GoalRow: React.FC<{ 
    score: ContextualGoalScore; 
    onSelect: () => void; 
    isSelected: boolean;
}> = ({ score, onSelect, isSelected }) => {
    const label = getGoalLabel(score.goalId);
    const entry = describeGoal(score.goalId);
    const description = entry?.description ?? '';
    const debug = (score as any)?.debug as
      | { inputValues?: Record<string, number>; traits?: string[]; roomTags?: string[] }
      | undefined;
    const debugModifiers = arr((score as any)?._debugModifiers);
    const traitList = arr(debug?.traits);
    const roomTags = arr(debug?.roomTags);
    
    return (
        <div 
            onClick={onSelect}
            className={`
                group cursor-pointer rounded-lg border p-2.5 mb-2 transition-all relative overflow-hidden
                ${isSelected 
                    ? 'bg-canon-bg-light border-canon-accent shadow-md' 
                    : 'bg-canon-bg border-canon-border/40 hover:border-canon-border hover:bg-canon-bg-light/50'
                }
            `}
        >
             {/* Progress Bar Background */}
             <div className="absolute bottom-0 left-0 h-1 bg-canon-accent/20 transition-all duration-500" style={{ width: `${score.probability * 100}%` }}></div>
             
             <div className="flex justify-between items-center relative z-10">
                <div className="flex items-center gap-1 min-w-0">
                  <span className={`text-xs font-bold truncate ${isSelected ? 'text-canon-text' : 'text-canon-text/80'}`}>{label}</span>
                  <GoalHelp entry={entry} />
                </div>
                <span className={`font-mono text-xs font-bold ${isSelected ? 'text-canon-accent' : 'text-canon-text-light'}`}>
                    {(score.probability * 100).toFixed(0)}%
                </span>
             </div>

             {description ? (
               <div className="text-[10px] text-canon-text-light/70 mt-1 leading-snug">{description}</div>
             ) : null}

             {/* Debug: why this goal moved (GoalLab-only) */}
             {(debug || debugModifiers.length > 0) && (
               <div className="mt-2 text-[10px] text-canon-text-light/70 space-y-1">
                 {debug?.inputValues ? (
                   <div>
                     <span className="font-semibold text-canon-text-light">Stats:</span>{' '}
                     {JSON.stringify(debug.inputValues)}
                   </div>
                 ) : null}
                 {traitList.length > 0 ? (
                   <div className="flex flex-wrap gap-1">
                     {traitList.map(trait => (
                       <span key={trait} className="text-blue-400">
                         Trait: {trait}
                       </span>
                     ))}
                   </div>
                 ) : null}
                 {roomTags.length > 0 ? (
                   <div className="flex flex-wrap gap-1">
                     {roomTags.map(tag => (
                       <span key={tag} className="text-green-400">
                         Room: {tag}
                       </span>
                     ))}
                   </div>
                 ) : null}
                 {debugModifiers.length > 0 ? (
                   <div className="flex flex-wrap gap-1">
                     {debugModifiers.map(mod => (
                       <span key={mod} className="text-canon-accent">
                         Modifier: {mod}
                       </span>
                     ))}
                   </div>
                 ) : null}
               </div>
             )}

             {/* UI personalization multiplier (debug) */}
             {Number.isFinite((score as any).uiMultiplier) &&
             Math.abs(((score as any).uiMultiplier ?? 1) - 1) > 1e-3 ? (
               <div className="text-[10px] text-canon-text-light/70 mt-1">
                 ui×{Number((score as any).uiMultiplier).toFixed(2)}
                 {Array.isArray((score as any).uiReasons) && (score as any).uiReasons.length ? (
                   <span className="ml-2 font-mono text-[10px] text-canon-text-light/60">
                     {(score as any).uiReasons.join(', ')}
                   </span>
                 ) : null}
               </div>
             ) : null}
             
             {/* Key Contributors Dots */}
             <div className="flex gap-1 mt-1.5 h-1.5">
                 {arr(score.contributions).filter(c => c.value > 0.5).slice(0, 5).map((c, i) => {
                      const style = getAtomStyle(c.atomKind || 'default');
                      return <div key={i} className={`w-1.5 h-1.5 rounded-full ${style.bg.replace('/40', '')}`} title={c.explanation} />
                 })}
             </div>
        </div>
    );
}

function GoalHelp({ entry }: { entry: ReturnType<typeof describeGoal> }) {
  const [open, setOpen] = useState(false);
  const h = entry?.help;
  if (!h) return null;
  return (
    <span className="relative inline-block">
      <button
        className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded border border-canon-border/60 bg-black/30 text-canon-text-light hover:text-white hover:bg-black/40"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Что это значит?"
      >
        ?
      </button>
      {open && (
        <div
          className="absolute z-[200] right-0 mt-2 w-[420px] max-w-[80vw] rounded border border-canon-border/60 bg-[#050b18] shadow-lg p-3"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div className="text-[11px] font-bold text-canon-text mb-2">{entry?.label ?? 'Goal help'}</div>
          <div className="text-[11px] text-canon-text-light">
            <div className="text-[10px] uppercase font-bold text-canon-text-light/70 mb-1">что</div>
            <div className="mb-2">{h.what}</div>
            <div className="text-[10px] uppercase font-bold text-canon-text-light/70 mb-1">зачем</div>
            <div className="mb-2">{h.why}</div>
            <div className="text-[10px] uppercase font-bold text-canon-text-light/70 mb-1">стационарная точка</div>
            <div className="mb-2 font-mono text-[10px] text-canon-accent whitespace-pre-wrap">{h.stationaryPoint}</div>
            <div className="text-[10px] uppercase font-bold text-canon-text-light/70 mb-1">фрактальная декомпозиция</div>
            <ul className="list-disc pl-5 text-[11px] text-canon-text mb-2">
              {(h.decomposesTo || []).map((s: string, i: number) => (
                <li key={i} className="mb-1 font-mono text-[10px]">{s}</li>
              ))}
            </ul>
            {Array.isArray(h.notes) && h.notes.length > 0 && (
              <>
                <div className="text-[10px] uppercase font-bold text-canon-text-light/70 mb-1">заметки</div>
                <ul className="list-disc pl-5 text-[11px] text-canon-text-light">
                  {h.notes.map((s: string, i: number) => (
                    <li key={i} className="mb-1">{s}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="mt-3 flex justify-end">
            <button
              className="px-2 py-1 text-[10px] rounded border border-canon-border/60 bg-black/30 text-canon-text-light hover:text-white hover:bg-black/40"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

export const EcologyView: React.FC<{ goals: ContextualGoalScore[], onSelect: (id: string) => void, selectedId: string | null }> = ({ goals, onSelect, selectedId }) => {
    const activeGoals = goals.filter(g => g.probability > 0.05).sort((a,b) => b.probability - a.probability);
    const latentGoals = goals.filter(g => g.probability <= 0.05 && g.probability > 0.01).sort((a,b) => b.probability - a.probability);
    
    return (
        <div className="p-3 space-y-4 pb-12">
             <div>
                <h4 className="text-[10px] font-bold text-canon-green uppercase mb-2 px-1">Execute ({activeGoals.length})</h4>
                {arr(activeGoals).map(g => (
                    <GoalRow key={g.goalId + (g.targetAgentId||'')} score={g} onSelect={() => onSelect(g.goalId)} isSelected={selectedId === g.goalId} />
                ))}
                {activeGoals.length === 0 && <div className="text-xs text-canon-text-light italic px-2">No active goals.</div>}
             </div>
             <div>
                <h4 className="text-[10px] font-bold text-yellow-400 uppercase mb-2 px-1 border-t border-canon-border/20 pt-2">Latent / Queue ({latentGoals.length})</h4>
                {arr(latentGoals).map(g => (
                    <GoalRow key={g.goalId + (g.targetAgentId||'')} score={g} onSelect={() => onSelect(g.goalId)} isSelected={selectedId === g.goalId} />
                ))}
             </div>
        </div>
    )
}

const ToMEntityCard: React.FC<{ relation: TomRelationView, body?: TomPhysicalOther }> = ({ relation, body }) => {
    const name = relation.targetId.split('-')[1] || relation.targetId;
    let stanceColor = 'border-canon-border/30';
    if (relation.trust > 0.7) { stanceColor = 'border-green-500/50'; }
    if (relation.threat > 0.5) { stanceColor = 'border-red-500/50'; }
    
    return (
        <div className={`bg-canon-bg/40 border-l-4 ${stanceColor} rounded p-2 mb-2`}>
            <div className="flex justify-between items-center mb-1">
                 <span className="font-bold text-sm text-canon-text">{name}</span>
                 {relation.label && <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-canon-text-light uppercase">{relation.label}</span>}
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
                <div className="flex flex-col">
                    <span className="text-canon-text-light">Trust</span>
                    <span className={`font-mono font-bold ${relation.trust > 0.5 ? 'text-green-400' : 'text-gray-500'}`}>{relation.trust.toFixed(2)}</span>
                </div>
                 <div className="flex flex-col">
                    <span className="text-canon-text-light">Threat</span>
                    <span className={`font-mono font-bold ${relation.threat > 0.4 ? 'text-red-400' : 'text-gray-500'}`}>{relation.threat.toFixed(2)}</span>
                </div>
                 <div className="flex flex-col">
                    <span className="text-canon-text-light">Align</span>
                    <span className="font-mono font-bold text-blue-400">{relation.align.toFixed(2)}</span>
                </div>
            </div>
            {body && (
                 <div className="bg-black/20 p-1.5 rounded flex justify-between items-center text-[10px]">
                     <span className="text-canon-text-light">Condition:</span>
                     <div className="flex gap-2">
                         <span className={body.isSeverelyWounded ? 'text-red-400 font-bold' : 'text-green-400'}>{body.isSeverelyWounded ? 'CRITICAL' : 'OK'}</span>
                         <span className="text-canon-border">|</span>
                         <span className={body.isCombatCapable ? 'text-blue-400' : 'text-gray-500'}>{body.isCombatCapable ? 'ARMED' : 'HARMLESS'}</span>
                     </div>
                 </div>
            )}
        </div>
    )
}

export const GoalLabResults: React.FC<Props> = ({
  context,
  frame,
  goalScores,
  situation,
  goalPreview,
  actorLabels,
  affect,
  contextualMind,
  locationScores,
  tomScores,
  tom,
  atomDiff,
  snapshotV1,
  pipelineV1,
  perspectiveAgentId,
  tomRows,
  sceneDump,
  onDownloadScene,
  onImportScene,
  manualAtoms,
  onChangeManualAtoms,
  pipelineStageId: pipelineStageIdProp,
  onChangePipelineStageId,
  onExportPipelineStage,
  onExportPipelineAll,
}) => {
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [selectedAtomId, setSelectedAtomId] = useState<string | null>(null);
  const [headersCollapsed, setHeadersCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('goalLab.headersCollapsed') === '1';
    } catch {
      return false;
    }
  });
  const safeGoalScores = arr(goalScores);

  const [goalTuning, setGoalTuning] = useState<GoalTuningConfig>(() => {
    try {
      const raw = localStorage.getItem('goalLab.goalTuning.v1');
      return raw ? (JSON.parse(raw) as GoalTuningConfig) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('goalLab.goalTuning.v1', JSON.stringify(goalTuning || {}));
    } catch {}
  }, [goalTuning]);

  const tunedGoalScores = applyGoalTuningToScores(safeGoalScores, goalTuning || {});

  // Persist header collapse for consistent compare workflows.
  useEffect(() => {
    try {
      localStorage.setItem('goalLab.headersCollapsed', headersCollapsed ? '1' : '0');
    } catch {}
  }, [headersCollapsed]);

    const canDownload = Boolean(onDownloadScene || sceneDump);

    const handleDownloadScene = () => {
        if (onDownloadScene) {
            onDownloadScene();
            return;
        }

        if (!sceneDump) return;

        const dump = sceneDump ?? { snapshotV1, context, goalScores, situation, goalPreview, contextualMind, atomDiff, tomRows };
        const replacer = (_k: string, v: any) => {
            if (v instanceof Map) return Object.fromEntries(Array.from(v.entries()));
            if (v instanceof Set) return Array.from(v.values());
            if (typeof v === 'function') return undefined;
            return v;
        };
        try {
            const json = JSON.stringify(dump, replacer, 2);
            const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const focus = (dump as any)?.focus?.perspectiveId || (dump as any)?.focus?.selectedAgentId || (context as any)?.agentId || 'agent';
            a.href = url;
            a.download = `goal-lab-scene__${String(focus)}__${ts}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('[GoalLabResults] failed to export scene JSON', e);
        }
    };

    const effectiveSelectedId = selectedGoalId || (tunedGoalScores.length > 0 ? tunedGoalScores[0].goalId : null);
    const selectedScore = tunedGoalScores.find(g => g.goalId === effectiveSelectedId);

    // Aggregates from snapshot or legacy context
    const stats = {
        threat: snapshotV1?.contextMind?.metrics?.find((m: any) => m.key === 'threat')?.value ?? context?.aggregates?.threatLevel ?? context?.summary.physicalRisk ?? 0,
        support: snapshotV1?.contextMind?.metrics?.find((m: any) => m.key === 'support')?.value ?? context?.aggregates?.socialSupport ?? context?.summary.socialSupport ?? 0,
        pressure: snapshotV1?.contextMind?.metrics?.find((m: any) => m.key === 'pressure')?.value ?? ((context?.summary.timePressure ?? 0) + (context?.summary.normPressure ?? 0)) / 2,
        crowd: snapshotV1?.contextMind?.metrics?.find((m: any) => m.key === 'crowd')?.value ?? context?.aggregates?.crowding ?? context?.summary.crowding ?? 0
    };

    const tomSummaries = arr(tomRows)
        .slice(0, 8)
        .map(row => {
            const dyad = (row as any)?.dyad || row;
            const contextual = (dyad as any)?.contextual || (row as any)?.contextual;
            const state = contextual?.state || (dyad as any)?.state || {};
            return {
                id: row.other,
                label: (actorLabels && actorLabels[row.other]) || row.other,
                trust: (state as any).trust,
                threat: (state as any).threat,
            };
        });

    const pipelineStages = ((): any[] => {
        // Prefer staged debug pipeline (pipelineV1) if provided; fallback to snapshotV1.meta.pipelineDeltas
        if (pipelineV1 && Array.isArray((pipelineV1 as any).stages)) {
            const frames = (pipelineV1 as any).stages as any[];
            const out: any[] = [];
            for (let i = 0; i < frames.length; i++) {
                const f = frames[i];
                const id = String(f?.stage || f?.id || `S${i}`);
                const label = String(f?.title || f?.label || id);
                const atoms = Array.isArray(f?.atoms) ? f.atoms : [];
                const addedIds = Array.isArray(f?.atomsAddedIds) ? f.atomsAddedIds : [];
                const added = addedIds.length ? atoms.filter((a: any) => addedIds.includes(String(a?.id))) : [];
                const overriddenIds = Array.isArray((f as any)?.artifacts?.overriddenIds)
                    ? ((f as any).artifacts.overriddenIds as any[]).map((x: any) => String(x)).filter(Boolean)
                    : [];
                out.push({
                    id,
                    label,
                    baseId: i > 0 ? String(frames[i - 1]?.stage || frames[i - 1]?.id || `S${i-1}`) : undefined,
                    atomCount: atoms.length,
                    full: i === 0 ? atoms : undefined,
                    added: i === 0 ? undefined : added,
                    changed: [],
                    removedIds: [],
                    artifacts: (f as any)?.artifacts ?? null,
                    notes: [
                        ...(Array.isArray(f?.warnings) ? f.warnings : []),
                        overriddenIds.length ? `overrides=${overriddenIds.length}` : '',
                        f?.stats
                            ? `atoms=${f.stats.atomCount}, +${f.stats.addedCount}, missingCode=${f.stats.missingCodeCount}, missingTraceDerived=${f.stats.missingTraceDerivedCount}`
                            : ''
                    ].filter(Boolean)
                });
            }
            return out;
        }
        const pipelineStagesRaw = (snapshotV1 as any)?.meta?.pipelineDeltas;
        return Array.isArray(pipelineStagesRaw) ? pipelineStagesRaw : [];
    })();
    const pipelineStageId =
        pipelineStageIdProp ||
        (pipelineStages.length ? pipelineStages[pipelineStages.length - 1]?.id : null) ||
        'S5';
    const currentAtoms = (() => {
        try {
            if (pipelineV1 && Array.isArray((pipelineV1 as any).stages) && pipelineStageId) {
                const st = (pipelineV1 as any).stages.find((s: any) => String(s?.stage || s?.id) === String(pipelineStageId));
                if (st && Array.isArray(st.atoms)) return st.atoms;
            }
            if (Array.isArray(pipelineStages) && pipelineStages.length && pipelineStageId) {
                const mat = materializeStageAtoms(pipelineStages as any, String(pipelineStageId));
                if (Array.isArray(mat) && mat.length) return mat;
            }
        } catch {}
        const a = (snapshotV1 as any)?.atoms ?? context?.atoms;
        return Array.isArray(a) ? a : [];
    })();

    const topAtoms = [...currentAtoms]
        .sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0))
        .slice(0, 12);

    if (!context) {
        return <div className="flex items-center justify-center h-full text-canon-text-light text-xs opacity-50">Выберите агента для анализа.</div>;
    }

    const AnalysisTab = () => (
        selectedScore ? <AnalysisView score={selectedScore} /> : <div className="flex h-full items-center justify-center text-canon-text-light/50 text-xs"><div className="text-center"><div className="text-3xl mb-2">🎯</div><p>Выберите цель слева<br/>для детального анализа.</p></div></div>
    );
    
    const AtomsTab = () => {
        const selectedAtom = currentAtoms.find(a => a.id === selectedAtomId) || null;

        return (
          <div className="h-full min-h-0">
            <AtomBrowser
              atoms={currentAtoms}
              selectedAtomId={selectedAtomId}
              onSelectedAtomIdChange={setSelectedAtomId}
              renderDetails={(atom) => (
                <div className="p-4">
                  <AtomInspector
                    atom={atom}
                    allAtoms={currentAtoms}
                    onJumpToAtomId={(id) => setSelectedAtomId(id)}
                  />
                </div>
              )}
            />
          </div>
        );
    };

    const PipelineTab = () => (
        <PipelinePanel
            stages={pipelineStages}
            selectedId={pipelineStageId}
            onSelect={(id) => onChangePipelineStageId?.(id)}
            onExportStage={(id) => onExportPipelineStage?.(id)}
        />
    );

    const ThreatTab = () => (
        <ThreatPanel atoms={currentAtoms} />
    );

    const ToMTab = () => (
        <ToMPanel atoms={currentAtoms} />
    );

    const MindTab = () => (
        <ContextMindPanel cm={snapshotV1?.contextMind} atoms={currentAtoms} selfId={snapshotV1?.selfId} />
    );

    const EmotionsTab = () => {
        const selfId = (snapshotV1 as any)?.selfId || (context as any)?.agentId;
        const get = (id: string, fb = 0) => currentAtoms.find(a => a.id === id)?.magnitude ?? fb;
        const metric = (a: any) => a.magnitude ?? (a as any)?.m ?? 0;
        const app = currentAtoms
          .filter(a => typeof a.id === 'string' && a.id.startsWith('app:') && a.id.endsWith(`:${selfId}`))
          .sort((x, y) => metric(y) - metric(x));
        const emo = currentAtoms
          .filter(a => typeof a.id === 'string' && a.id.startsWith('emo:') && a.id.endsWith(`:${selfId}`))
          .sort((x, y) => metric(y) - metric(x));

        // Dyadic emotions: emo:dyad:<key>:<selfId>:<otherId>
        const dyadAll = currentAtoms
          .filter(a => {
            const id = String((a as any)?.id || '');
            if (!id.startsWith('emo:dyad:')) return false;
            const parts = id.split(':');
            return parts.length >= 5 && parts[3] === String(selfId);
          })
          .map(a => {
            const parts = String((a as any)?.id || '').split(':');
            return { a, key: parts[2] || 'dyad', otherId: parts[4] || '' };
          })
          .filter(x => x.otherId);

        const dyadTargets = arr(dyadAll)
          .map(x => x.otherId)
          .filter((id, idx, list) => id && list.indexOf(id) === idx)
          .sort();
        const [dyadOtherId, setDyadOtherId] = useState<string>(() => dyadTargets[0] || '');
        React.useEffect(() => {
          if (!dyadOtherId && dyadTargets[0]) setDyadOtherId(dyadTargets[0]);
          if (dyadOtherId && dyadTargets.length && !dyadTargets.includes(dyadOtherId)) {
            setDyadOtherId(dyadTargets[0] || '');
          }
        }, [dyadOtherId, dyadTargets]);

        const dyadForOther = dyadAll
          .filter(x => x.otherId === dyadOtherId)
          .sort((x, y) => metric(y.a) - metric(x.a));

        const valenceSigned = get(`emo:valence:${selfId}`, 0);
        const valence01 = (Number.isFinite(valenceSigned) ? (valenceSigned + 1) / 2 : 0.5);
        const arousal = get(`emo:arousal:${selfId}`, 0);
        const fear = get(`emo:fear:${selfId}`, 0);
        const anger = get(`emo:anger:${selfId}`, 0);
        const shame = get(`emo:shame:${selfId}`, 0);
        const relief = get(`emo:relief:${selfId}`, 0);
        const resolve = get(`emo:resolve:${selfId}`, 0);
        const care = get(`emo:care:${selfId}`, 0);

        /**
         * Extract curve preset + raw input from emotion trace parts when available.
         */
        const curveParts = (key: string) => {
          const a = atoms.find(x => x.id === `emo:${key}:${selfId}`) as any;
          const trace = a?.meta?.trace || (a as any)?.trace;
          const parts = trace?.parts || {};
          const raw = typeof parts?.raw === 'number' ? parts.raw : null;
          const presetStr = String(parts?.preset || '');
          const ok: CurvePreset[] = ['linear', 'smoothstep', 'sqrt', 'sigmoid', 'pow2', 'pow4'];
          const preset = ok.includes(presetStr as CurvePreset) ? (presetStr as CurvePreset) : null;
          const curved = typeof a?.magnitude === 'number' ? a.magnitude : null;
          if (raw === null || !preset || curved === null) return null;
          return { raw, preset, curved };
        };

        const Row = ({ a }: { a: any }) => {
          const val = metric(a);
          return (
            <div className="border border-canon-border/40 rounded bg-black/20 p-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[12px] font-semibold text-canon-text truncate">{a.id}</div>
                <div className="text-[11px] font-mono text-canon-text-light">{Number(val ?? 0).toFixed(3)}</div>
              </div>
              <div className="h-1.5 w-full bg-canon-bg-light rounded-full overflow-hidden mt-2">
                <div className="h-full bg-canon-accent" style={{ width: `${Math.min(100, Math.max(0, Number(val ?? 0) * 100))}%` }} />
              </div>
              {(a.meta?.trace || (a as any).trace)?.usedAtomIds?.length ? (
                <div className="text-[10px] text-canon-text-light/70 mt-2">
                  used: {((a.meta?.trace || (a as any).trace) as any).usedAtomIds.slice(0, 6).join(', ')}
                  {(((a.meta?.trace || (a as any).trace) as any).usedAtomIds.length > 6) ? '…' : ''}
                </div>
              ) : null}
            </div>
          );
        };

        return (
          <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-4 space-y-4 pb-20">
            <div className="border border-canon-border/40 rounded bg-black/15 p-3">
              <div className="text-xs font-bold text-canon-text uppercase tracking-wider">How emotions are computed</div>
              <div className="text-[12px] text-canon-text-light mt-2 space-y-1">
                <div><span className="font-mono">app:*</span> — оценка ситуации (угроза/контроль/давление/неопределённость).</div>
                <div><span className="font-mono">emo:*</span> — эмоции как функция <span className="font-mono">app:*</span>.</div>
                <div className="text-[11px] text-canon-text-light/80 mt-2">
                  Пример: <span className="font-mono">emo:fear</span> растёт при угрозе и падает при контроле; усиливается неопределённостью.
                </div>
                <div className="text-[11px] text-canon-text-light/80">
                  Каждая эмоция должна иметь <span className="font-mono">trace.usedAtomIds</span> и <span className="font-mono">trace.parts</span> (веса/вклад).
                </div>
              </div>
            </div>

            <div className="border border-canon-border/40 rounded bg-black/15 p-3">
              <div className="text-xs font-bold text-canon-text uppercase tracking-wider">Core affect (quick)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div className="border border-canon-border/30 rounded bg-black/10 p-2">
                  <div className="text-[12px] text-canon-text-light">
                    valence: <span className="font-mono text-canon-text">{Number(valenceSigned).toFixed(2)}</span>{' '}
                    <span className="text-[11px] text-canon-text-light">(0..1: {Number(valence01).toFixed(2)})</span>
                  </div>
                  <div className="text-[12px] text-canon-text-light mt-1">
                    arousal: <span className="font-mono text-canon-text">{Number(arousal).toFixed(2)}</span>
                  </div>
                </div>

                {(['fear', 'anger', 'shame', 'relief', 'resolve', 'care'] as const).map((k) => {
                  const cp = curveParts(k);
                  const value = get(`emo:${k}:${selfId}`, 0);
                  return (
                    <div key={k} className="border border-canon-border/30 rounded bg-black/10 p-2">
                      <div className="flex items-center justify-between">
                        <div className="text-[12px] text-canon-text-light">{k}:</div>
                        <div className="font-mono text-[12px] text-canon-text">{Number(value).toFixed(2)}</div>
                      </div>
                      {cp ? (
                        <div className="mt-2">
                          <CurvePreview preset={cp.preset} x={cp.raw} y={cp.curved} />
                        </div>
                      ) : (
                        <div className="mt-2 text-[10px] text-canon-text-light/70">нет trace.parts.raw/preset</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-canon-text-light/70 mt-2">
                valence хранится как -1..1 (в UI для удобства показана и шкала 0..1 справа).
              </div>
            </div>

            <div className="border border-canon-border/40 rounded bg-black/15 p-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-canon-text uppercase tracking-wider">Dyadic emotions (emo:dyad:*)</div>
                  <div className="text-[11px] text-canon-text-light/80 mt-1">
                    Эмоции по отношению к конкретному человеку (из effective dyads + proximity).
                  </div>
                </div>
                <div className="min-w-[220px]">
                  <div className="text-[10px] uppercase text-canon-text-light mb-1">Target</div>
                  <select
                    className="w-full bg-black/20 border border-canon-border/40 rounded px-2 py-1 text-xs"
                    value={dyadOtherId}
                    onChange={e => setDyadOtherId(e.target.value)}
                    disabled={!dyadTargets.length}
                  >
                    {!dyadTargets.length ? <option value="">(none)</option> : null}
                    {arr(dyadTargets).map(id => (
                      <option key={id} value={id}>
                        {actorLabels?.[id] ? `${actorLabels[id]} (${id})` : id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                {dyadTargets.length ? (
                  dyadForOther.length ? (
                    arr(dyadForOther).map(x => <Row key={x.a.id} a={x.a} />)
                  ) : (
                    <div className="text-[12px] text-canon-text-light/70">Нет dyadic эмоций для выбранного target.</div>
                  )
                ) : (
                  <div className="text-[12px] text-canon-text-light/70">
                    Нет <span className="font-mono">emo:dyad:*</span> атомов. Проверь, что вызывается{' '}
                    <span className="font-mono">deriveDyadicEmotionAtoms()</span> и в атомах есть{' '}
                    <span className="font-mono">tom:effective:dyad</span> для этого self.
                  </div>
                )}
              </div>
            </div>

            <div className="text-xs font-bold text-canon-text uppercase tracking-wider">Appraisals (app:*)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {arr(app).length ? arr(app).map(a => <Row key={a.id} a={a} />) : <div className="text-[12px] text-canon-text-light/70">Нет app:* атомов.</div>}
            </div>
            <div className="text-xs font-bold text-canon-text uppercase tracking-wider mt-4">Emotions (emo:*)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {arr(emo).length ? arr(emo).map(a => <Row key={a.id} a={a} />) : <div className="text-[12px] text-canon-text-light/70">Нет emo:* атомов.</div>}
            </div>
          </div>
        );
    };

    const EmotionExplainTab = () => {
      const selfId = (snapshotV1 as any)?.selfId || (context as any)?.agentId;
      return (
        <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-4 pb-20">
          <EmotionExplainPanel
            selfId={selfId}
            atoms={currentAtoms}
            manualAtoms={manualAtoms ?? []}
            onChangeManualAtoms={onChangeManualAtoms}
          />
        </div>
      );
    };

    const CoverageTab = () => (
        <CoveragePanel coverage={snapshotV1?.coverage} />
    );

    const CastTab = () => {
      // Summarize per-agent atoms to quickly spot differences across the cast.
      const castRowsRaw = arr((sceneDump as any)?.castRows);
      const cast = castRowsRaw
        .map((r: any) => {
          const id = String(r?.id || '');
          return { id, label: (actorLabels && actorLabels[id]) ? actorLabels[id] : id, atoms: arr(r?.snapshot?.atoms) };
        })
        .filter(x => x.id);

      // Diagnostics: detect emotions being suspiciously identical across agents.
      const emoKeys = ['fear', 'anger', 'shame', 'relief', 'resolve', 'care', 'arousal'] as const;
      const emoStats = (() => {
        if (cast.length < 3) return { flat: [] as Array<{ key: string; sd: number }> };
        const getEmo = (atoms: any[], id: string, key: string) => {
          const atomId = `emo:${key}:${id}`;
          const a = arr(atoms).find(x => String(x?.id || '') === atomId);
          return Number((a as any)?.magnitude ?? 0) || 0;
        };
        const sd = (vals: number[]) => {
          const n = vals.length;
          if (n < 2) return 0;
          const mean = vals.reduce((s, v) => s + v, 0) / n;
          const v = vals.reduce((s, x) => s + (x - mean) * (x - mean), 0) / (n - 1);
          return Math.sqrt(v);
        };
        const flat: Array<{ key: string; sd: number }> = [];
        for (const k of emoKeys) {
          const vals = cast.map(c => getEmo(c.atoms, c.id, k));
          const s = sd(vals);
          if (s < 0.03) flat.push({ key: k, sd: s });
        }
        return { flat };
      })();

      const metric = (a: any) => Number((a as any)?.magnitude ?? (a as any)?.m ?? 0) || 0;
      const pick = (atoms: any[], prefix: string, selfId: string, limit = 6) => {
        const suffix = `:${selfId}`;
        return arr(atoms)
          .filter(a => {
            const id = String((a as any)?.id || '');
            return id.startsWith(prefix) && id.endsWith(suffix);
          })
          .sort((x, y) => metric(y) - metric(x))
          .slice(0, limit);
      };

      if (!cast.length) {
        return (
          <div className="absolute inset-0 p-4 text-[12px] text-canon-text-light/70">
            Нет castRows в sceneDump. Включи экспорт debug (BOTH) или передай castRows в GoalLabResults.
          </div>
        );
      }

      return (
        <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-4 pb-20">
          <div className="text-xs font-bold text-canon-text uppercase tracking-wider mb-3">Cast compare</div>
          <div className="text-[11px] text-canon-text-light/70 mb-4">
            Быстрый способ увидеть различия между персонажами: top контекст-оси, эмоции, драйверы и цели по каждому self.
          </div>

          {emoStats.flat.length > 0 && (
            <div className="mb-4 p-3 rounded border border-amber-500/30 bg-amber-900/10">
              <div className="text-[10px] uppercase tracking-wider font-bold text-amber-200">Diagnostics</div>
              <div className="mt-1 text-[11px] text-amber-100/90">
                Emotions look too similar across cast (sd &lt; 0.03):{' '}
                {emoStats.flat.map(x => `${x.key}: ${x.sd.toFixed(3)}`).join(' • ')}.
              </div>
            </div>
          )}

          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(4, cast.length)}, minmax(220px, 1fr))` }}>
            {cast.map(c => (
              <div key={c.id} className="border border-canon-border/40 rounded bg-black/15 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-[12px] font-semibold text-canon-text truncate" title={c.id}>{c.label}</div>
                  <div className="text-[10px] font-mono text-canon-text-light/70">{c.id}</div>
                </div>
                <div className="mt-3">
                  <div className="text-[10px] font-bold text-canon-text-light uppercase tracking-wider">ctx:*</div>
                  <div className="mt-1 space-y-1">{pick(c.atoms, 'ctx:', c.id, 7).map(a => (
                    <div key={a.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="truncate text-canon-text-light" title={a.id}>{a.id}</div>
                      <div className="font-mono text-canon-text">{metric(a).toFixed(2)}</div>
                    </div>
                  ))}</div>
                </div>
                <div className="mt-3">
                  <div className="text-[10px] font-bold text-canon-text-light uppercase tracking-wider">emo:*</div>
                  <div className="mt-1 space-y-1">{pick(c.atoms, 'emo:', c.id, 7).map(a => (
                    <div key={a.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="truncate text-canon-text-light" title={a.id}>{a.id}</div>
                      <div className="font-mono text-canon-text">{metric(a).toFixed(2)}</div>
                    </div>
                  ))}</div>
                </div>
                <div className="mt-3">
                  <div className="text-[10px] font-bold text-canon-text-light uppercase tracking-wider">drv:*</div>
                  <div className="mt-1 space-y-1">{pick(c.atoms, 'drv:', c.id, 6).map(a => (
                    <div key={a.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="truncate text-canon-text-light" title={a.id}>{a.id}</div>
                      <div className="font-mono text-canon-text">{metric(a).toFixed(2)}</div>
                    </div>
                  ))}</div>
                </div>
                <div className="mt-3">
                  <div className="text-[10px] font-bold text-canon-text-light uppercase tracking-wider">goal:*</div>
                  <div className="mt-1 space-y-1">{pick(c.atoms, 'goal:', c.id, 6).map(a => (
                    <div key={a.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="truncate text-canon-text-light" title={a.id}>{a.id}</div>
                      <div className="font-mono text-canon-text">{metric(a).toFixed(2)}</div>
                    </div>
                  ))}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    };
    
    const DebugTab = () => (
         <div className="p-4 space-y-4 h-full overflow-y-auto custom-scrollbar pb-20 absolute inset-0">
            <ContextInspector snapshot={context} goals={tunedGoalScores} title="Global Inspector (Legacy)"/>
            {locationScores && <LocationGoalsDebugPanel scores={locationScores} />}
            {tomScores && <TomGoalsDebugPanel scores={tomScores} />}
         </div>
    );

    const accessDecisions = (context as any).access ?? [];
    const possibilities = (context as any).possibilities ?? snapshotV1?.possibilities;
    const diffs = atomDiff ?? snapshotV1?.atomDiff;
    const decision = (context as any).decision ?? snapshotV1?.decision;
    const focusSelfId = (snapshotV1 as any)?.selfId || (context as any)?.agentId || (context as any)?.selfId || null;
    const castDecisions = arr((sceneDump as any)?.castRows)
      .map((r: any) => r?.snapshot?.decision)
      .filter(Boolean);
    const AccessTab = () => <AccessPanel decisions={accessDecisions} />;
    const PossibilitiesTab = () => <PossibilitiesPanel possibilities={possibilities} />;
    const DiffTab = () => <DiffPanel diffs={diffs} />;
    const DecisionTab = () => <DecisionPanel decision={decision} selfId={focusSelfId ?? undefined} castDecisions={castDecisions} />;
    const DecisionGraphTab = () => (
        <DecisionGraphView
            frame={frame}
            goalScores={tunedGoalScores}
            selectedGoalId={effectiveSelectedId}
        />
    );
    const OrchestratorTab = () => <OrchestratorLab snapshot={snapshotV1 ?? null} />;
    // Simulator uses SimKit; pass real producers to wire up orchestrator output.
    const SimulatorTab = () => <SimulatorLab orchestratorRegistry={defaultProducers} />;
    const explainStats = {
        threat: Number(stats.threat) || 0,
        pressure: Number(stats.pressure) || 0,
        support: Number(stats.support) || 0,
        crowd: Number(stats.crowd) || 0,
    };

    const fmt = (v: any) => (Number.isFinite(v) ? Number(v).toFixed(2) : '—');

    const ExplainTab = () => (
        <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-4 space-y-4 pb-20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <ValueBadge label="Угроза" value={explainStats.threat} color="text-red-400" />
                <ValueBadge label="Давление" value={explainStats.pressure} color="text-amber-400" />
                <ValueBadge label="Поддержка" value={explainStats.support} color="text-emerald-400" />
                <ValueBadge label="Толпа" value={explainStats.crowd} color="text-blue-400" />
            </div>

            <div className="border border-canon-border/50 rounded-lg bg-black/20 p-3">
                <div className="text-xs font-bold text-canon-text uppercase tracking-wider mb-2">Топ атомов (по magnitude)</div>
                {topAtoms.length ? (
                    <div className="flex flex-wrap gap-2">
                        {arr(topAtoms).map(atom => (
                            <AtomBadge key={atom.id} atom={atom} />
                        ))}
                    </div>
                ) : (
                    <div className="text-[12px] text-canon-text-light/70">Нет активных атомов.</div>
                )}
            </div>

            <div className="border border-canon-border/50 rounded-lg bg-black/20 p-3">
                <div className="text-xs font-bold text-canon-text uppercase tracking-wider mb-2">Восприятие других (ToM)</div>
                {tomSummaries.length ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {arr(tomSummaries).map(row => (
                            <div key={row.id} className="border border-canon-border/40 rounded bg-black/30 p-2">
                                <div className="text-sm font-semibold text-canon-text">{row.label}</div>
                                <div className="text-[10px] font-mono text-canon-text-light/80 mt-1">trust: {fmt(row.trust)} • threat: {fmt(row.threat)}</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-[12px] text-canon-text-light/70">Dyad-слой пуст.</div>
                )}
            </div>
        </div>
    );

    const TuningTab = () => {
        const defId = ((selectedScore as any)?.defId || effectiveSelectedId || '') as string;
        const domain = (selectedScore as any)?.domain;
        const layer = (selectedScore as any)?.layer;
        const category = domainToCategory(domain, layer);

        const goalKnob = (goalTuning?.goals?.[defId] || {}) as any;
        const catKnob = (goalTuning?.categories?.[category] || {}) as any;
        const globalKnob = (goalTuning?.global || {}) as any;
        const isVeto = Boolean(goalTuning?.veto?.[defId]);

        const setGoalKnob = (patch: { slope?: number; bias?: number }) => {
            setGoalTuning(prev => {
                const next = { ...(prev || {}) } as GoalTuningConfig;
                next.goals = { ...(next.goals || {}) };
                next.goals[defId] = { ...(next.goals[defId] || {}), ...patch };
                return next;
            });
        };
        const setCatKnob = (patch: { slope?: number; bias?: number }) => {
            setGoalTuning(prev => {
                const next = { ...(prev || {}) } as GoalTuningConfig;
                next.categories = { ...(next.categories || {}) } as any;
                (next.categories as any)[category] = { ...((next.categories as any)[category] || {}), ...patch };
                return next;
            });
        };
        const setGlobalKnob = (patch: { slope?: number; bias?: number }) => {
            setGoalTuning(prev => {
                const next = { ...(prev || {}) } as GoalTuningConfig;
                next.global = { ...(next.global || {}), ...patch };
                return next;
            });
        };
        const toggleVeto = () => {
            setGoalTuning(prev => {
                const next = { ...(prev || {}) } as GoalTuningConfig;
                next.veto = { ...(next.veto || {}) };
                next.veto[defId] = !Boolean(next.veto[defId]);
                return next;
            });
        };

        const copyJson = async () => {
            const json = JSON.stringify(goalTuning || {}, null, 2);
            try {
                await navigator.clipboard.writeText(json);
            } catch {
                // fallback: no-op
            }
        };

        const slider = (
            label: string,
            value: number,
            min: number,
            max: number,
            step: number,
            onChange: (v: number) => void
        ) => (
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <div className="text-xs text-canon-text-light">{label}</div>
                    <div className="text-[11px] font-mono text-canon-text">{Number(value).toFixed(2)}</div>
                </div>
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={e => onChange(parseFloat(e.target.value))}
                    className="w-full"
                />
            </div>
        );

        return (
            <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-4 space-y-4 pb-20">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-sm font-bold text-canon-text">Mixer / Live Curve Tuning</div>
                        <div className="text-[11px] text-canon-text-light mt-1">
                            Selected: <span className="font-mono">{defId || '—'}</span>
                            {domain ? <span className="ml-2 text-canon-text-light/70">domain={domain}</span> : null}
                            {category ? <span className="ml-2 text-canon-text-light/70">cat={category}</span> : null}
                        </div>
                    </div>
                    <button
                        onClick={copyJson}
                        className="px-2 py-1 text-xs bg-canon-accent/20 text-canon-accent border border-canon-accent/40 rounded hover:bg-canon-accent/30"
                    >
                        Copy JSON
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-canon-border/40 rounded bg-black/20 p-3 space-y-3">
                        <div className="text-xs font-bold text-canon-text-light uppercase">Global Knobs</div>
                        {slider('Global Slope', Number(globalKnob.slope ?? 1), 0.1, 5, 0.1, v => setGlobalKnob({ slope: v }))}
                        {slider('Global Bias', Number(globalKnob.bias ?? 0), -3, 3, 0.05, v => setGlobalKnob({ bias: v }))}
                        <div className="text-[11px] text-canon-text-light/70">
                            Global knobs apply to all goals (macro-handle #0).
                        </div>
                    </div>

                    <div className="border border-canon-border/40 rounded bg-black/20 p-3 space-y-3">
                        <div className="text-xs font-bold text-canon-text-light uppercase">Goal Knobs</div>
                        {slider('Slope (Sensitivity)', Number(goalKnob.slope ?? 1), 0.1, 5, 0.1, v => setGoalKnob({ slope: v }))}
                        {slider('Bias (Base Preference)', Number(goalKnob.bias ?? 0), -3, 3, 0.05, v => setGoalKnob({ bias: v }))}
                        <div className="flex items-center gap-2 pt-1">
                            <input id="veto" type="checkbox" checked={isVeto} onChange={toggleVeto} />
                            <label htmlFor="veto" className="text-xs text-canon-text-light">Veto (disable this goal)</label>
                        </div>
                    </div>

                    <div className="border border-canon-border/40 rounded bg-black/20 p-3 space-y-3">
                        <div className="text-xs font-bold text-canon-text-light uppercase">Category Knobs</div>
                        {slider('Category Slope', Number(catKnob.slope ?? 1), 0.1, 5, 0.1, v => setCatKnob({ slope: v }))}
                        {slider('Category Bias', Number(catKnob.bias ?? 0), -3, 3, 0.05, v => setCatKnob({ bias: v }))}
                        <div className="text-[11px] text-canon-text-light/70">
                            Category knobs apply to all goals in the category (macro-handles).
                        </div>
                    </div>
                </div>

                <div className="border border-canon-border/40 rounded bg-black/20 p-3">
                    <div className="text-xs font-bold text-canon-text-light uppercase mb-2">Export / Paste into JSON</div>
                    <textarea
                        value={JSON.stringify(goalTuning || {}, null, 2)}
                        readOnly
                        className="w-full h-56 text-[11px] font-mono bg-black/40 border border-canon-border/40 rounded p-2 text-canon-text-light"
                    />
                    <div className="text-[11px] text-canon-text-light/70 mt-2">
                        Tip: copy these values into your scenario/agent config after tuning.
                    </div>
                </div>
            </div>
        );
    };

    const renderContent = () => {
        switch(activeTabIndex) {
            case 0: return <ExplainTab />;
            case 1: return <AnalysisTab />;
            case 2: return <AtomsTab />;
            case 3: return <PipelineTab />;
            case 4: return <CastTab />;
            case 5: return <ThreatTab />;
            case 6: return <ToMTab />;
            case 7: return <MindTab />;
            case 8: return <EmotionsTab />;
            case 9: return <CoverageTab />;
            case 10: return <PossibilitiesTab />;
            case 11: return <DecisionTab />;
            case 12: return <DecisionGraphTab />;
            case 13: return <GoalActionGraphView />;
            case 14: return <AccessTab />;
            case 15: return <DiffTab />;
            case 16: return <EmotionExplainTab />;
            case 17: return <DebugTab />;
            case 18: return <OrchestratorTab />;
            case 19: return <SimulatorTab />;
            case 20: return <TuningTab />;
            default: return <ExplainTab />;
        }
    };

  const tabsList = ['Explain', 'Analysis', 'Atoms', 'Pipeline', 'Cast', 'Threat', 'ToM', 'CtxMind', 'Emotions', 'Coverage', 'Possibilities', 'Decision', 'Decision Graph', 'Goal Graph', 'Access', 'Diff', 'EmotionExplain', 'Debug', 'Orchestrator', 'Simulation', 'Tuning'];

  const focusId = (context as any)?.agentId;
  const focusLabel = (focusId && actorLabels?.[focusId]) ? actorLabels[focusId] : focusId;
  const perspectiveLabel = perspectiveAgentId
    ? (actorLabels?.[perspectiveAgentId] || perspectiveAgentId)
    : null;

    return (
        <div className="flex flex-col h-full overflow-hidden bg-canon-bg-light border border-canon-border rounded-lg shadow-xl">
            {perspectiveAgentId && (
                <div className="bg-canon-bg border-b border-canon-border/60 p-3">
                    <div className="text-xs font-bold text-canon-text uppercase tracking-wider">Perspective</div>
                    <div className="text-sm text-canon-text-light">
                      {perspectiveLabel}
                      <span className="text-[10px] font-mono text-canon-text-light/70 ml-2">agentId: {perspectiveAgentId}</span>
                      <div className="text-[10px] text-canon-text-light/60 mt-1">Все расчёты ниже — из этой перспективы.</div>
                    </div>
                </div>
            )}
            {context && (
                <div className="bg-canon-bg border-b border-canon-border/60 p-3">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="text-xs font-bold text-canon-text uppercase tracking-wider">Фокус</div>
                        <div className="text-sm text-canon-text-light">
                            {focusLabel || '—'}
                            {focusId ? (
                              <span className="text-[10px] font-mono text-canon-text-light/70 ml-2">
                                agentId: {focusId}
                                {(context as any)?.locationId ? ` • locationId: ${(context as any).locationId}` : ''}
                              </span>
                            ) : null}
                        </div>
                      </div>
                    </div>
                </div>
            )}
            <div className="bg-canon-bg border-b border-canon-border/60 p-2 flex items-center justify-end gap-2 shrink-0">
              <button
                onClick={() => setHeadersCollapsed(v => !v)}
                className="px-3 py-1 text-[11px] font-semibold border border-canon-border/60 rounded bg-canon-bg-light hover:bg-canon-bg-light/70 transition-colors"
                title="Свернуть/развернуть верхние панели (summary ribbons, preview, ...)"
              >
                {headersCollapsed ? 'Show headers' : 'Hide headers'}
              </button>
            </div>
            {!headersCollapsed ? (
              <>
                <div className="bg-canon-bg border-b border-canon-border p-3 grid grid-cols-4 gap-3 shadow-sm z-10 shrink-0">
                  <ValueBadge label="Угроза" value={stats.threat} color="text-red-400" />
                  <ValueBadge label="Давление" value={stats.pressure} color="text-amber-400" />
                  <ValueBadge label="Поддержка" value={stats.support} color="text-emerald-400" />
                  <ValueBadge label="Толпа" value={stats.crowd} color="text-blue-400" />
                </div>

                <div className="bg-black/30 border-b border-canon-border/50 shrink-0">
                  <ContextRibbon atoms={currentAtoms} />
                  <ContextPrioritiesRibbon atoms={currentAtoms} />
                </div>

                {tomRows && tomRows.length > 0 && (
                  <div className="bg-canon-bg border-b border-canon-border/30 p-2 shrink-0">
                    <div className="text-[11px] font-bold mb-2">ToM (X думает про Y)</div>
                    <div className="flex flex-col gap-1">
                      {arr(tomRows).map(r => (
                        <div key={`${r.me}__${r.other}`} className="text-[10px] border border-canon-border/30 rounded p-1">
                          <div className="font-semibold">{r.me} → {r.other}</div>
                          <div className="opacity-80">
                            trust: {String((r.dyad as any)?.trust ?? '—')} · threat: {String((r.dyad as any)?.threat ?? '—')} · intent: {String((r.dyad as any)?.intent ?? '—')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {goalPreview?.goals?.length ? (
                  <div className="bg-canon-bg border-b border-canon-border/30 p-2 shrink-0">
                    <button onClick={() => setPreviewOpen(!isPreviewOpen)} className="w-full flex items-center justify-between text-[10px] font-bold text-canon-text-light uppercase tracking-wider hover:text-canon-accent transition-colors">
                      <div className="flex items-center gap-2"><span>Contextual priorities</span><span className="font-mono text-[9px] opacity-70 bg-black/30 px-1 rounded">{arr(goalPreview?.goals).length}</span></div>
                      <span>{isPreviewOpen ? '▼' : '▶'}</span>
                    </button>
                    {isPreviewOpen && (
                      <div className="mt-2 animate-fade-in">
                        {situation ? (
                          <div className="mb-2 flex flex-wrap gap-1 text-[10px] text-canon-text-light/80">
                            <span className="px-2 py-0.5 rounded bg-black/20 border border-canon-border/30">kind: {String(situation.scenarioKind || 'other')}</span>
                            <span className="px-2 py-0.5 rounded bg-black/20 border border-canon-border/30">threat: {Number(situation.threatLevel ?? 0).toFixed(2)}</span>
                            <span className="px-2 py-0.5 rounded bg-black/20 border border-canon-border/30">pressure: {Number(situation.timePressure ?? 0).toFixed(2)}</span>
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          {arr(goalPreview?.goals).slice(0, 10).map(g => (
                            <div key={g.id} className="px-2 py-1 rounded border border-canon-border/40 bg-black/20">
                              <div className="text-[11px] font-semibold text-canon-text truncate max-w-[220px]" title={g.id}>{g.label}</div>
                              <div className="text-[9px] font-mono text-canon-text-light/70">p={g.priority.toFixed(2)} • a={g.activation.toFixed(2)}</div>
                            </div>
                          ))}
                        </div>
                        <div className="text-[9px] font-mono text-canon-text-light/60 mt-1 text-right">
                          {goalPreview.debug?.temperature != null ? `T=${Number(goalPreview.debug.temperature).toFixed(2)}` : ''}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="flex-1 flex min-h-0">
                <div className="w-5/12 min-w-[220px] border-r border-canon-border bg-canon-bg/30 flex flex-col overflow-hidden">
                    <div className="p-3 border-b border-canon-border/20 bg-canon-bg/50 shrink-0 flex justify-between items-center">
                        <h4 className="text-[10px] font-bold text-canon-text-light uppercase px-1">Goal Ecology</h4>
                        <span className="text-[9px] font-mono text-canon-text-light">{tunedGoalScores.length} Goals</span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 pb-12">
                         <EcologyView goals={tunedGoalScores} onSelect={setSelectedGoalId} selectedId={effectiveSelectedId} />
                    </div>
                </div>

                <div className="flex-1 flex flex-col overflow-hidden bg-canon-bg">
                    <div className="border-b border-canon-border flex-shrink-0 flex items-center justify-between gap-2 px-2">
                        <div className="flex overflow-x-auto custom-scrollbar no-scrollbar">
                            {arr(tabsList).map((label, index) => (
                                <button key={label} onClick={() => setActiveTabIndex(index)} className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${activeTabIndex === index ? 'border-b-2 border-canon-accent text-canon-accent' : 'text-canon-text-light hover:text-white'}`}>
                                {label}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            {onExportPipelineAll && (
                                <button
                                    onClick={onExportPipelineAll}
                                    className="px-4 py-2 text-[12px] font-extrabold border-2 border-canon-accent rounded bg-canon-accent/20 hover:bg-canon-accent/30 transition-colors"
                                    title="Скачать полный debug: все стадии пайплайна + дельты"
                                >
                                    ⬇ EXPORT DEBUG (pipeline JSON)
                                </button>
                            )}
                            {canDownload && (
                                <button
                                    onClick={handleDownloadScene}
                                    className="px-3 py-1 text-[11px] font-semibold border border-canon-border/60 rounded bg-canon-bg-light hover:bg-canon-bg-light/70 transition-colors"
                                >
                                    Скачать всю сцену (JSON)
                                </button>
                            )}
                            {onImportScene && (
                                <button
                                    onClick={onImportScene}
                                    className="px-3 py-1 text-[11px] font-semibold border border-canon-border/60 rounded bg-canon-bg-light hover:bg-canon-bg-light/70 transition-colors"
                                >
                                    Импорт сцены (JSON)
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 min-h-0 relative">
                        {renderContent()}
                    </div>
                </div>
            </div>
        </div>
    );
};
