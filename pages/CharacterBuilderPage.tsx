
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { characterSchema } from '../data/character-schema';
import { ParameterControl } from '../components/ParameterControl';
import { encodeCharacterToSnippet, decodeSnippetToCharacter, defaultBody, defaultIdentity } from '../lib/character-snippet';
import { Tabs } from '../components/Tabs';
import { useSandbox } from '../contexts/SandboxContext';
import { CharacterEntity, EntityType, IdentityCaps, PersonalEvent } from '../types';
import { OathsAndTaboosEditor } from '../components/OathsAndTaboosEditor';
import { HistoricalEventEditor } from '../components/HistoricalEventEditor';
import { setNestedValue, getNestedValue } from '../lib/param-utils';
import { BodyEditor } from '../components/BodyEditor';
import { applySexPreset } from '../lib/body.presets';
import { BiographyAnalysis } from '../components/BiographyAnalysis';

const HelpBlock: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-canon-bg/50 p-3 rounded-md border-l-4 border-canon-accent/50 text-xs text-canon-text-light mb-4">
        <strong className="text-canon-accent block mb-1">{title}</strong>
        {children}
    </div>
);

const PresetButton: React.FC<{ label: string, onClick: () => void }> = ({ label, onClick }) => (
    <button 
        onClick={onClick}
        className="px-3 py-1.5 bg-canon-bg border border-canon-border rounded text-[10px] text-canon-text hover:bg-canon-accent hover:text-canon-bg transition-colors whitespace-nowrap"
    >
        {label}
    </button>
);

// Group config for Vector Basis
const VECTOR_GROUPS = [
    { id: 'A', title: 'A. Ценности и Нормы', desc: 'Фундаментальные установки: что хорошо, что плохо, приоритеты.', color: 'border-blue-500' },
    { id: 'B', title: 'B. Когнитивный стиль', desc: 'Как персонаж думает, принимает решения и реагирует на новое.', color: 'border-purple-500' },
    { id: 'C', title: 'C. Социальная стратегия', desc: 'Отношение к людям, иерархии, доверию и предательству.', color: 'border-green-500' },
    { id: 'D', title: 'D. Био-нейро (Hardware)', desc: 'Врожденные реакции тела: стресс, боль, выносливость.', color: 'border-red-500' },
    { id: 'E', title: 'E. Знания и Навыки', desc: 'Компетенции, накопленный опыт и специализация.', color: 'border-yellow-500' },
    { id: 'F', title: 'F. Динамика и Обучение', desc: 'Пластичность: как быстро персонаж меняется и учится.', color: 'border-cyan-500' },
    { id: 'G', title: 'G. Мета-сознание', desc: 'Саморефлексия, сила "Я", нарративная агентность.', color: 'border-fuchsia-500' },
];

const SYSTEM_GROUPS = [
    { id: 'body_capacity', title: 'Способности' },
    { id: 'body_reserves', title: 'Резервы и Гомеостаз' },
    { id: 'body_acute', title: 'Острое состояние' },
    { id: 'body_regulation', title: 'Регуляция' },
    { id: 'legacy_state', title: 'Состояние (Legacy)' },
    { id: 'legacy_competencies', title: 'Компетенции (Legacy)' },
    { id: 'legacy_memory', title: 'Память (Legacy)' },
    { id: 'resources', title: 'Ресурсы' },
    { id: 'identity', title: 'Идентичность' },
    { id: 'authority', title: 'Авторитет (Authority)' },
    { id: 'evidence', title: 'Evidence' },
    { id: 'observation', title: 'Observation' },
    { id: 'compute', title: 'Compute' },
];

const VECTOR_PRESETS: Record<string, { label: string, values: Record<string, number> }> = {
  'soldier': { 
      label: 'Солдат', 
      values: { 
          'A_Safety_Care': 0.7, 'A_Legitimacy_Procedure': 0.8, 'A_Power_Sovereignty': 0.6,
          'C_coalition_loyalty': 0.9, 'E_Skill_ops_fieldcraft': 0.9, 'D_pain_tolerance': 0.8,
          'B_cooldown_discipline': 0.8, 'G_Identity_rigidity': 0.7
      } 
  },
  'leader': { 
      label: 'Лидер', 
      values: { 
          'A_Legitimacy_Procedure': 0.8, 'A_Power_Sovereignty': 0.9, 'C_reputation_sensitivity': 0.8, 
          'G_Narrative_agency': 0.9, 'E_Skill_diplomacy_negotiation': 0.8, 'B_goal_coherence': 0.9 
      } 
  },
  'scientist': { 
      label: 'Ученый', 
      values: { 
          'A_Knowledge_Truth': 0.95, 'E_KB_stem': 0.9, 'E_Model_calibration': 0.9, 
          'B_exploration_rate': 0.8, 'A_Tradition_Continuity': 0.3, 'A_Transparency_Secrecy': 0.2
      } 
  },
  'rogue': { 
      label: 'Изгой', 
      values: { 
          'A_Liberty_Autonomy': 0.9, 'C_betrayal_cost': 0.2, 'E_Skill_opsec_hacking': 0.9, 
          'A_Transparency_Secrecy': 0.1, 'C_reciprocity_index': 0.4, 'G_Self_consistency_drive': 0.8
      } 
  },
  'medic': { 
      label: 'Медик', 
      values: { 
          'A_Safety_Care': 0.95, 'C_dominance_empathy': 0.1, 'E_KB_stem': 0.8, 
          'D_fine_motor': 0.85, 'A_Justice_Fairness': 0.7
      } 
  },
  'bureaucrat': {
      label: 'Бюрократ',
      values: {
          'A_Legitimacy_Procedure': 0.95, 'E_KB_civic': 0.9, 'B_exploration_rate': 0.1,
          'A_Tradition_Continuity': 0.9, 'G_Metacog_accuracy': 0.4
      }
  }
};

const SystemGroup: React.FC<{ id: string, title: string, bodyState: any, systemState: any, onParamChange: (key: string, val: number) => void }> = ({ id, title, bodyState, systemState, onParamChange }) => {
    const groupSchema = (characterSchema as any)[id] || {};
    const keys = Object.keys(groupSchema);
    
    if(keys.length === 0) return null;

    return (
        <div className="mb-6 bg-canon-bg/20 border border-canon-border/30 rounded p-3">
            <h4 className="font-bold text-sm text-canon-accent mb-3 border-b border-canon-border/20 pb-1">{title}</h4>
            <div className="space-y-2">
                {keys.map(key => {
                    const p = groupSchema[key];
                    const fullKey = p.path || `${id}.${key}`;
                    // Determine value from either bodyState or systemState depending on path
                    let val = 0.5;
                    if (fullKey.startsWith('body.')) {
                        val = getNestedValue(bodyState, fullKey.substring(5)) ?? p.min;
                    } else {
                        val = getNestedValue(systemState, fullKey) ?? p.min;
                    }
                    
                    return (
                      <ParameterControl
                          key={key}
                          fullKey={fullKey}
                          name={p.name}
                          description={p.description}
                          value={val}
                          min={p.min}
                          max={p.max}
                          step={p.step}
                          canonValue={p.min} // Default to min for new chars
                          defaultValue={p.min}
                          onValueChange={v => onParamChange(fullKey, v)}
                          isReadOnly={false}
                          isLocked={false}
                          onToggleLock={() => {}}
                      />
                    )
                })}
            </div>
        </div>
    );
}

export const CharacterBuilderPage: React.FC = () => {
  const navigate = useNavigate();
  const { addCharacter } = useSandbox();

  const [meta, setMeta] = useState({
    id: '',
    title: 'Новый Персонаж',
    subtitle: '',
    tags: '',
  });

  // 44 Vector Axes
  const [vectorBase, setVectorBase] = useState<Record<string, number>>(() => {
    const result: Record<string, number> = {};
    for (const groupKey of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
      const group = (characterSchema as any)[groupKey];
      for (const key of Object.keys(group)) {
        const p = group[key];
        const mid = p.min + (p.max - p.min) / 2;
        result[key] = mid;
      }
    }
    return result;
  });

  // Structured State for Body & Identity
  const [bodyState, setBodyState] = useState<any>(JSON.parse(JSON.stringify(defaultBody)));
  const [identityState, setIdentityState] = useState<IdentityCaps>(JSON.parse(JSON.stringify(defaultIdentity)));
  
  // New: System State Container (for resources, authority, etc.)
  const [systemState, setSystemState] = useState<any>({
      resources: { attention: { E: 150, A_star: 150 }, time_budget_h: 50, risk_budget: { cvar: 0.3 }, infra_budget: 0.3, dark_quota: 0.6 },
      evidence: { witness_pull: 0.4, evidence_quality: 0.6 },
      authority: { signature_weight: { causal: 0.5, topo: 0.3 }, co_sign_threshold: 1 },
      observation: { noise: 0.2, report_noise: 0.2 },
      compute: { compute_budget: 100, decision_deadline_s: 1, tom_depth: 2 },
      state: { loyalty: 40, dark_exposure: 60, backlog_load: 20 },
      competencies: { topo_affinity: 70, causal_sensitivity: 90 },
      memory: { retrieval_noise: 0.3, visibility_zone: 30, visibility_lag_days: 3, memory_write_rights: 3 }
  });

  const [historicalEvents, setHistoricalEvents] = useState<PersonalEvent[]>([]);
  
  const [snippet, setSnippet] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'gui' | 'json'>('gui');

  // Helper to update identity
  const handleIdentityChange = (newIdentity: IdentityCaps) => {
      setIdentityState(newIdentity);
  };

  const handleEventsChange = (events: PersonalEvent[], newIdentity?: IdentityCaps) => {
      setHistoricalEvents(events);
      if (newIdentity) {
          setIdentityState(newIdentity);
      }
  };
  
  // Unified handler for parameter changes
  const handleParamChange = useCallback((fullKey: string, value: number) => {
      if (fullKey.startsWith('vector_base.')) {
          const key = fullKey.split('.')[1];
          setVectorBase(prev => ({ ...prev, [key]: value }));
      } else if (fullKey.startsWith('body.')) {
          setBodyState((prev: any) => {
              const newState = JSON.parse(JSON.stringify(prev));
              // Strip 'body.' prefix
              const relativePath = fullKey.substring(5);
              setNestedValue(newState, relativePath, value);
              return newState;
          });
      } else if (fullKey.startsWith('identity.clearance_level')) {
           setIdentityState(prev => ({ ...prev, clearance_level: value }));
      } else {
          // Assume system state (resources, authority, etc.)
          setSystemState((prev: any) => {
              const newState = JSON.parse(JSON.stringify(prev));
              setNestedValue(newState, fullKey, value);
              return newState;
          });
      }
  }, []);

  const generateCode = () => {
    try {
      setError(null);
      
      const code = encodeCharacterToSnippet({
        meta: {
          id: meta.id || undefined,
          title: meta.title || undefined,
          subtitle: meta.subtitle || undefined,
          tags: meta.tags ? meta.tags.split(',').map(t => t.trim()) : undefined,
        },
        vector_base: vectorBase,
        body: bodyState,
        identity: identityState,
        events: historicalEvents,
        // Flatten system state into payload props
        ...systemState
      });

      setSnippet(code);
      return code;
    } catch (e: any) {
      setError(e.message ?? 'Ошибка при генерации кода');
      return null;
    }
  };

  const handlePreview = () => {
      const code = generateCode();
      if (code) {
          const character = decodeSnippetToCharacter(code);
          navigate(`/character/preview`, { state: { character, snippet: code } });
      }
  };

  const handleAddToSession = () => {
      const code = generateCode();
      if (!code) return;
      const character = decodeSnippetToCharacter(code);
      
      const id = character.entityId || (character.title ? `session-${character.title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}` : `session-char-${Date.now()}`);
      
      const charToAdd: CharacterEntity = {
          ...character,
          entityId: id,
          type: EntityType.Character
      };

      addCharacter(charToAdd);
      alert(`Персонаж "${character.title}" добавлен в текущую сессию! Теперь он доступен в симуляторах.`);
      return id;
  };

  const handleTestInSimulator = () => {
    const id = handleAddToSession();
    if (id) {
        navigate(`/social-simulator?agentIds=${id}`);
    }
  };
  
  // --- Presets Logic ---
  const applyRoleBodyPreset = (type: string) => {
      const b = JSON.parse(JSON.stringify(bodyState || defaultBody));
      // Ensure structure
      ['capacity', 'constitution', 'reserves', 'acute', 'regulation', 'functional', 'structural', 'hormonal', 'adipose', 'reproductive'].forEach(k => {
          if (!b[k]) b[k] = {};
      });

      switch(type) {
          case 'soldier':
            b.functional.strength_upper = Math.min(1, (b.functional.strength_upper || 0.5) + 0.2);
            b.functional.aerobic_capacity = Math.min(1, (b.functional.aerobic_capacity || 0.5) + 0.2);
            b.constitution.pain_tolerance = 0.8;
            b.capacity.VO2max = 65;
            break;
          case 'scholar':
            b.functional.strength_upper = Math.max(0, (b.functional.strength_upper || 0.5) - 0.1);
            b.capacity.fine_motor = 0.9;
            b.constitution.vision_acuity = 0.6;
            break;
          case 'tank':
            b.structural.mass_kg = (b.structural.mass_kg || 80) + 10;
            b.constitution.mass_kg = b.structural.mass_kg;
            b.functional.strength_upper = 0.9;
            b.constitution.pain_tolerance = 1.0;
            break;
          case 'scout':
            b.structural.joint_laxity = (b.structural.joint_laxity || 0.5) + 0.1;
            b.functional.aerobic_capacity = (b.functional.aerobic_capacity || 0.5) + 0.3;
            b.capacity.VO2max = 80;
            b.constitution.hearing_db = -5;
            break;
          case 'worker':
            b.functional.strength_upper = (b.functional.strength_upper || 0.5) + 0.1;
            b.functional.strength_endurance_profile = 0.8;
            b.reserves.energy_reserve_kcal = 1800;
            break;
          case 'aristocrat':
            b.constitution.pain_tolerance = 0.3;
            b.constitution.cold_heat_tolerance = 0.3;
            b.capacity.fine_motor = 0.7;
            break;
          case 'techie':
            b.capacity.fine_motor = 1.0;
            b.constitution.vision_acuity = 0.9;
            b.reserves.sleep_debt = 0.5;
            break;
      }
      setBodyState(b);
  };

  const applyIdentityPreset = (type: string) => {
      const i = JSON.parse(JSON.stringify(defaultIdentity));
      switch (type) {
          case 'loyalist': i.clearance_level = 3; i.sigils = { rector: true }; i.oaths = [{ key: 'serve_system', description: 'Служить системе' }]; break;
          case 'rebel': i.clearance_level = 0; i.sacred_set = [{ act: 'obey', obj: 'unjust_order' }]; break;
          case 'agent': i.clearance_level = 4; i.sigils = { sword: true, iris: true }; i.param_locked = ['state.dark_exposure']; break;
          case 'fanatic': i.clearance_level = 1; i.hard_caps = [{ key: 'doubt', limit: 0 }]; i.oaths = [{ key: 'purge_heresy', description: 'Уничтожать врагов' }]; break;
          case 'bureaucrat': i.clearance_level = 2; i.sigils = { chron: true }; i.oaths = [{ key: 'uphold_protocol', description: 'Соблюдать протокол' }]; break;
          case 'mystic': i.clearance_level = 0; i.sigils = { rion: true }; i.oaths = [{ key: 'preserve_mystery', description: 'Не раскрывать тайное' }]; break;
          case 'cynic': i.clearance_level = 1; i.sacred_set = [{ act: 'trust', obj: 'authority' }]; break;
          case 'idealist': i.clearance_level = 1; i.oaths = [{ key: 'never_harm', description: 'Не причинять вред' }]; break;
      }
      setIdentityState(i);
  };
  
  const applyVectorPreset = (key: string) => {
      const preset = VECTOR_PRESETS[key];
      if (preset) {
          setVectorBase(prev => ({ ...prev, ...preset.values }));
      }
  };


  // --- TABS CONTENT ---

  const MetaTab = (
    <div className="space-y-4 pb-32">
        <HelpBlock title="Метаданные">
            Базовая информация для идентификации. ID должен быть уникальным (если оставить пустым, он сгенерируется автоматически при импорте).
        </HelpBlock>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input
            className="border border-canon-border rounded px-3 py-2 bg-canon-bg text-sm focus:border-canon-accent outline-none"
            placeholder="ID (опционально)"
            value={meta.id}
            onChange={e => setMeta(m => ({ ...m, id: e.target.value }))}
        />
        <input
            className="border border-canon-border rounded px-3 py-2 bg-canon-bg text-sm focus:border-canon-accent outline-none font-bold"
            placeholder="Имя персонажа *"
            value={meta.title}
            onChange={e => setMeta(m => ({ ...m, title: e.target.value }))}
        />
        <input
            className="border border-canon-border rounded px-3 py-2 bg-canon-bg text-sm focus:border-canon-accent outline-none"
            placeholder="Подзаголовок"
            value={meta.subtitle}
            onChange={e => setMeta(m => ({ ...m, subtitle: e.target.value }))}
        />
        <input
            className="border border-canon-border rounded px-3 py-2 bg-canon-bg text-sm focus:border-canon-accent outline-none"
            placeholder="Теги (через запятую)"
            value={meta.tags}
            onChange={e => setMeta(m => ({ ...m, tags: e.target.value }))}
        />
        </div>
    </div>
  );

  // --- VECTOR TAB ---
  const VectorGroup = ({ group }: { group: typeof VECTOR_GROUPS[0] }) => {
      const groupSchema = (characterSchema as any)[group.id];
      const keys = Object.keys(groupSchema);

      return (
          <div className={`bg-canon-bg border-l-4 ${group.color} rounded-r-lg p-4 mb-4 border border-canon-border/30`}>
              <h3 className="font-bold text-sm text-canon-text mb-1">{group.title}</h3>
              <p className="text-[10px] text-canon-text-light mb-4">{group.desc}</p>
              <div className="space-y-3">
                  {keys.map(key => {
                      const p = groupSchema[key];
                      const fullKey = p.path || `vector_base.${key}`;
                      return (
                        <ParameterControl
                            key={key}
                            fullKey={fullKey}
                            name={p.name}
                            description={p.description}
                            value={vectorBase[key] ?? 0.5}
                            min={p.min}
                            max={p.max}
                            step={p.step}
                            canonValue={0.5}
                            defaultValue={0.5}
                            onValueChange={val => handleParamChange(fullKey, val)}
                            isReadOnly={false}
                            isLocked={false}
                            onToggleLock={() => {}}
                        />
                      )
                  })}
              </div>
          </div>
      )
  }

  const VectorTab = (
      <div className="space-y-6">
          <div className="flex flex-col gap-4">
             <div>
                <h2 className="text-xl font-bold text-canon-accent mb-2">Ядро Персонажа (Векторный Базис)</h2>
                <p className="text-sm text-canon-text-light">
                    44 параметра, определяющие архетип, поведение и реакции.
                </p>
             </div>
             <div className="flex flex-wrap gap-2 items-center bg-canon-bg/30 p-2 rounded border border-canon-border/20">
                <span className="text-xs text-canon-text-light font-bold uppercase mr-2">Пресеты:</span>
                {Object.entries(VECTOR_PRESETS).map(([key, preset]) => (
                    <PresetButton key={key} label={preset.label} onClick={() => applyVectorPreset(key)} />
                ))}
             </div>
          </div>

          <div className="h-[65vh] overflow-y-auto pr-2 custom-scrollbar pb-32">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div className="space-y-2">
                      <div className="text-xs font-bold text-canon-text-light uppercase tracking-wider mb-2">Психика и Социум</div>
                      <VectorGroup group={VECTOR_GROUPS[0]} />
                      <VectorGroup group={VECTOR_GROUPS[1]} />
                      <VectorGroup group={VECTOR_GROUPS[2]} />
                  </div>
                  <div className="space-y-2">
                      <div className="text-xs font-bold text-canon-text-light uppercase tracking-wider mb-2">Система и Мета</div>
                      <VectorGroup group={VECTOR_GROUPS[3]} />
                      <VectorGroup group={VECTOR_GROUPS[4]} />
                      <VectorGroup group={VECTOR_GROUPS[5]} />
                      <VectorGroup group={VECTOR_GROUPS[6]} />
                  </div>
              </div>
          </div>
      </div>
  );

  // --- BODY TAB ---
  const BodyTab = (
      <div className="space-y-4 h-[70vh] overflow-y-auto custom-scrollbar pr-2 pb-32">
           <HelpBlock title="Физиология (Body)">
              Детальная настройка физических характеристик. Выберите базовый фенотип, затем уточните параметры.
          </HelpBlock>
          
          <div className="flex items-center justify-between bg-canon-bg/30 p-3 rounded border border-canon-border/20 mb-4">
               <div className="flex gap-2 flex-wrap items-center">
                  <span className="text-xs text-canon-text-light mr-2 font-bold uppercase">Ролевые Пресеты (Функционал):</span>
                  <PresetButton label="Солдат" onClick={() => applyRoleBodyPreset('soldier')} />
                  <PresetButton label="Тяжеловес" onClick={() => applyRoleBodyPreset('tank')} />
                  <PresetButton label="Разведчик" onClick={() => applyRoleBodyPreset('scout')} />
                  <PresetButton label="Ученый" onClick={() => applyRoleBodyPreset('scholar')} />
                  <PresetButton label="Рабочий" onClick={() => applyRoleBodyPreset('worker')} />
                  <PresetButton label="Технарь" onClick={() => applyRoleBodyPreset('techie')} />
              </div>
          </div>

          <BodyEditor body={bodyState} onChange={setBodyState} />

      </div>
  );

  // --- BIOGRAPHY TAB ---
  const BiographyTab = (
      <div className="space-y-6 h-[70vh] overflow-y-auto custom-scrollbar pr-2 pb-32">
           <HelpBlock title="Биография и Травмы">
              Добавляйте события прошлого, чтобы увидеть, как они "гнут" личность персонажа и формируют его уникальный латент (b(t)).
          </HelpBlock>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-canon-bg border border-canon-border/50 rounded-lg p-4 flex-grow">
                <HistoricalEventEditor 
                    character={{ ...defaultBody, identity: identityState, historicalEvents, vector_base: vectorBase } as any}
                    events={historicalEvents} 
                    onEventsChange={handleEventsChange}
                />
            </div>
            <div className="lg:col-span-2 bg-canon-bg border border-canon-border/50 rounded-lg p-4">
                <h3 className="font-bold text-sm text-canon-accent mb-4">Анализ Влияния</h3>
                <BiographyAnalysis 
                    character={{ ...defaultBody, identity: identityState, historicalEvents, vector_base: vectorBase } as any}
                    events={historicalEvents}
                />
            </div>
          </div>
      </div>
  );

  // --- IDENTITY TAB ---
  const IdentityTab = (
      <div className="space-y-4 h-[70vh] overflow-y-auto custom-scrollbar pr-2 pb-32">
          <HelpBlock title="Идентичность и Правила">
              Настройте уровень допуска, клятвы и табу. Эти параметры определяют, что персонаж *может* и *должен* делать в системе.
          </HelpBlock>
          
          <div className="flex gap-2 mb-4 flex-wrap items-center p-2 bg-canon-bg/30 rounded border border-canon-border/20">
              <span className="text-xs text-canon-text-light mr-2 font-bold uppercase">Пресеты:</span>
              <PresetButton label="Лоялист" onClick={() => applyIdentityPreset('loyalist')} />
              <PresetButton label="Бунтарь" onClick={() => applyIdentityPreset('rebel')} />
              <PresetButton label="Агент" onClick={() => applyIdentityPreset('agent')} />
              <PresetButton label="Фанатик" onClick={() => applyIdentityPreset('fanatic')} />
              <PresetButton label="Бюрократ" onClick={() => applyIdentityPreset('bureaucrat')} />
              <PresetButton label="Мистик" onClick={() => applyIdentityPreset('mystic')} />
              <PresetButton label="Циник" onClick={() => applyIdentityPreset('cynic')} />
              <PresetButton label="Идеалист" onClick={() => applyIdentityPreset('idealist')} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
                <div className="bg-canon-bg border border-canon-border/50 rounded-lg p-4">
                    <h3 className="font-bold text-sm text-canon-text mb-4">Параметры Доступа</h3>
                    <ParameterControl 
                        fullKey="identity.clearance_level"
                        name="Уровень допуска"
                        description="Доступ к информации и зонам (0-5)"
                        value={identityState.clearance_level}
                        min={0} max={5} step={1}
                        canonValue={1} defaultValue={1}
                        onValueChange={v => handleParamChange('identity.clearance_level', v)}
                        isLocked={false} onToggleLock={()=>{}}
                    />
                </div>
            </div>

            <div className="bg-canon-bg border border-canon-border/50 rounded-lg p-4 h-full">
                <OathsAndTaboosEditor 
                    character={{ ...defaultBody, identity: identityState } as any} 
                    onIdentityChange={handleIdentityChange} 
                />
            </div>
          </div>
      </div>
  );

  // --- SYSTEM TAB (NEW) ---
  const SystemTab = (
      <div className="space-y-4 h-[70vh] overflow-y-auto custom-scrollbar pr-2 pb-32">
          <HelpBlock title="Системные Параметры">
              Тонкая настройка ресурсов, полномочий, памяти и вычислительных возможностей.
              Здесь же находятся Legacy-параметры (State, Competencies).
          </HelpBlock>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {SYSTEM_GROUPS.map(g => (
                  <SystemGroup 
                    key={g.id} 
                    id={g.id} 
                    title={g.title} 
                    bodyState={bodyState} 
                    systemState={systemState} 
                    onParamChange={handleParamChange} 
                  />
              ))}
          </div>
      </div>
  );

  const ExportTab = (
      <div className="space-y-6 max-w-3xl mx-auto pb-32">
        <div className="bg-canon-bg-light border border-canon-border rounded-lg p-6 text-center space-y-4 shadow-lg">
            <h2 className="text-xl font-bold text-canon-text">Готово к сборке</h2>
            <p className="text-sm text-canon-text-light">
                Персонаж будет скомпилирован в компактную base64-строку, содержащую все параметры, историю и настройки.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                <button
                    onClick={() => generateCode()}
                    className="w-full px-4 py-3 rounded bg-canon-bg border border-canon-border text-canon-text font-bold hover:bg-canon-border hover:text-white transition-all"
                >
                    Сгенерировать Код
                </button>
                <button
                    onClick={() => handleAddToSession()}
                    className="w-full px-4 py-3 rounded bg-canon-green text-black font-bold hover:bg-opacity-90 transition-all shadow-[0_0_15px_rgba(50,255,150,0.3)]"
                >
                    Добавить в сессию
                </button>
                 <button
                    onClick={handleTestInSimulator}
                    className="w-full px-4 py-3 rounded bg-canon-blue text-canon-bg font-bold hover:bg-opacity-90 transition-all shadow-[0_0_15px_rgba(0,170,255,0.3)]"
                >
                    Тест в Симуляторе &rarr;
                </button>
            </div>

             {error && (
                <div className="p-3 bg-red-900/20 border border-red-500/50 rounded text-red-400 text-sm mt-4">
                    ⚠️ {error}
                </div>
            )}

            {snippet && (
                <div className="space-y-2 text-left mt-6 animate-fade-in">
                    <h3 className="font-bold text-xs text-canon-text-light uppercase tracking-wider">Код-сниппет</h3>
                    <textarea
                        className="w-full h-32 border border-canon-border rounded px-3 py-2 font-mono text-[10px] bg-canon-bg text-canon-green focus:outline-none resize-none break-all whitespace-pre-wrap focus:border-canon-green transition-colors overflow-y-auto"
                        value={snippet}
                        readOnly
                        onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                    />
                    <p className="text-[10px] text-canon-text-light text-center">Нажмите, чтобы выделить. Скопируйте и сохраните этот код.</p>
                </div>
            )}
        </div>
      </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto h-[calc(100vh-80px)] flex flex-col">
      <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-canon-text">Конструктор Персонажа</h1>
            <p className="text-xs text-canon-text-light">Создание вечных сниппетов v1</p>
          </div>
          <div className="flex gap-2">
              <button onClick={() => setViewMode(viewMode === 'gui' ? 'json' : 'gui')} className="text-xs text-canon-text-light hover:text-canon-accent underline">
                  {viewMode === 'gui' ? 'Режим JSON (Advanced)' : 'Режим GUI'}
              </button>
          </div>
      </div>

      <div className="flex-grow bg-canon-bg-light border border-canon-border rounded-lg p-4 overflow-hidden flex flex-col shadow-sm">
          {viewMode === 'gui' ? (
              <Tabs tabs={[
                  { label: '1. Метаданные', content: MetaTab },
                  { label: '2. Ядро (Вектор)', content: VectorTab },
                  { label: '3. Биография', content: BiographyTab },
                  { label: '4. Тело', content: BodyTab },
                  { label: '5. Legacy & Система', content: SystemTab }, 
                  { label: '6. Идентичность', content: IdentityTab },
                  { label: '7. Экспорт', content: ExportTab },
              ]} />
          ) : (
              // Legacy JSON Mode Fallback
              <div className="grid grid-cols-2 gap-4 h-full">
                  <textarea className="bg-canon-bg border border-canon-border text-xs font-mono p-2 text-canon-text" value={JSON.stringify(bodyState, null, 2)} onChange={e => { try { setBodyState(JSON.parse(e.target.value)) } catch {} }} placeholder="Body JSON" />
                  <textarea className="bg-canon-bg border border-canon-border text-xs font-mono p-2 text-canon-text" value={JSON.stringify(identityState, null, 2)} onChange={e => { try { setIdentityState(JSON.parse(e.target.value)) } catch {} }} placeholder="Identity JSON" />
              </div>
          )}
      </div>
    </div>
  );
};
