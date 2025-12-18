
import React from 'react';
import {
  BodyModel,
  BodyStructural,
  BodyFunctional,
  BodyAdipose,
  BodyHormonal,
  BodyReproductiveState,
  SexPhenotype,
  FatDistribution,
} from '../types';
import { applySexPreset } from '../lib/body.presets';

interface BodyEditorProps {
  body: BodyModel;
  onChange: (body: BodyModel) => void;
}

export const BodyEditor: React.FC<BodyEditorProps> = ({ body, onChange }) => {
  const setSex = (sex: SexPhenotype) => {
    const next = applySexPreset(body, sex);
    onChange(next);
  };

  // helpers для nested-обновлений

  const updateStructural = <K extends keyof BodyStructural>(
    key: K,
    value: BodyStructural[K],
  ) => {
    onChange({
      ...body,
      structural: {
        ...body.structural,
        [key]: value,
      },
    });
  };

  const updateStructuralCenterOfMass = (
    key: 'height_rel' | 'depth_rel',
    value: number,
  ) => {
    onChange({
      ...body,
      structural: {
        ...body.structural,
        center_of_mass: {
          ...body.structural.center_of_mass,
          [key]: value,
        },
      },
    });
  };

  const updateStructuralLimb = (key: 'arm_cm' | 'leg_cm', value: number) => {
    onChange({
      ...body,
      structural: {
        ...body.structural,
        limb_lengths: {
          ...body.structural.limb_lengths,
          [key]: value,
        },
      },
    });
  };

  const updateFunctional = <K extends keyof BodyFunctional>(
    key: K,
    value: BodyFunctional[K],
  ) => {
    onChange({
      ...body,
      functional: {
        ...body.functional,
        [key]: value,
      },
    });
  };

  const updateFunctionalInjury = (
    key: keyof BodyFunctional['injury_risk'],
    value: number,
  ) => {
    onChange({
      ...body,
      functional: {
        ...body.functional,
        injury_risk: {
          ...body.functional.injury_risk,
          [key]: value,
        },
      },
    });
  };

  const updateAdipose = <K extends keyof BodyAdipose>(
    key: K,
    value: BodyAdipose[K],
  ) => {
    onChange({
      ...body,
      adipose: {
        ...body.adipose,
        [key]: value,
      },
    });
  };

  const updateHormonal = <K extends keyof BodyHormonal>(
    key: K,
    value: BodyHormonal[K],
  ) => {
    onChange({
      ...body,
      hormonal: {
        ...body.hormonal,
        [key]: value,
      },
    });
  };

  const updateReproductive = <K extends keyof BodyReproductiveState>(
    key: K,
    value: BodyReproductiveState[K],
  ) => {
    onChange({
      ...body,
      reproductive: {
        ...body.reproductive,
        [key]: value,
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Переключатель фенотипа тела */}
      <section className="border border-canon-border rounded-md p-3 bg-canon-bg/30">
        <div className="flex flex-col gap-2 mb-2">
          <h3 className="text-sm font-bold text-canon-accent uppercase tracking-wider">Пол / Фенотип</h3>
          <div className="flex p-1 bg-canon-bg border border-canon-border rounded gap-1">
            <button
              type="button"
              onClick={() => setSex('typical_female')}
              className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${
                body.sex_phenotype === 'typical_female'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                  : 'text-canon-text-light hover:bg-canon-bg-light'
              }`}
            >
              Женский
            </button>
            <button
              type="button"
              onClick={() => setSex('typical_male')}
              className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${
                body.sex_phenotype === 'typical_male'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/50'
                  : 'text-canon-text-light hover:bg-canon-bg-light'
              }`}
            >
              Мужской
            </button>
            <button
              type="button"
              onClick={() => setSex('intermediate')}
              className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${
                body.sex_phenotype === 'intermediate'
                  ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50'
                  : 'text-canon-text-light hover:bg-canon-bg-light'
              }`}
            >
              Смешанный
            </button>
            <button
              type="button"
              onClick={() => setSex('custom')}
              className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${
                body.sex_phenotype === 'custom'
                  ? 'bg-canon-border text-canon-text'
                  : 'text-canon-text-light hover:bg-canon-bg-light'
              }`}
            >
              Свой
            </button>
          </div>
        </div>
        <p className="text-[10px] text-canon-text-light mt-2">
            Выбор фенотипа применяет базовые настройки геометрии скелета (таз/плечи), распределения жировой ткани и гормональной цикличности.
        </p>
      </section>

      {/* Структура */}
      <section className="border border-canon-border rounded-md p-3 space-y-2">
        <h3 className="text-sm font-semibold mb-1">Структура</h3>
        <p className="text-xs text-canon-text-muted mb-2">
          Геометрия и механика тела.
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          {/* рост / масса */}
          <div>
            <label className="block mb-1">Рост (см)</label>
            <input
              type="number"
              value={body.structural.height_cm}
              onChange={e =>
                updateStructural('height_cm', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>
          <div>
            <label className="block mb-1">Масса (кг)</label>
            <input
              type="number"
              value={body.structural.mass_kg}
              onChange={e =>
                updateStructural('mass_kg', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>

          {/* плечи / таз */}
          <div>
            <label className="block mb-1">Ширина плеч (см)</label>
            <input
              type="number"
              value={body.structural.shoulder_width_cm}
              onChange={e =>
                updateStructural('shoulder_width_cm', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>
          <div>
            <label className="block mb-1">Ширина таза (см)</label>
            <input
              type="number"
              value={body.structural.pelvis_width_cm}
              onChange={e =>
                updateStructural('pelvis_width_cm', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>

          {/* длины конечностей */}
          <div>
            <label className="block mb-1">Длина руки (см)</label>
            <input
              type="number"
              value={body.structural.limb_lengths.arm_cm}
              onChange={e =>
                updateStructuralLimb('arm_cm', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>
          <div>
            <label className="block mb-1">Длина ноги (см)</label>
            <input
              type="number"
              value={body.structural.limb_lengths.leg_cm}
              onChange={e =>
                updateStructuralLimb('leg_cm', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>

          {/* кисть/стопа */}
          <div>
            <label className="block mb-1">Размах кисти (см)</label>
            <input
              type="number"
              value={body.structural.hand_span_cm}
              onChange={e =>
                updateStructural('hand_span_cm', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>
          <div>
            <label className="block mb-1">Длина стопы (см)</label>
            <input
              type="number"
              value={body.structural.foot_length_cm}
              onChange={e =>
                updateStructural('foot_length_cm', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>

          {/* центр масс */}
          <div>
            <label className="block mb-1">Центр масс — высота (0–1)</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.structural.center_of_mass.height_rel}
              onChange={e =>
                updateStructuralCenterOfMass(
                  'height_rel',
                  Number(e.target.value) || 0,
                )
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>
          <div>
            <label className="block mb-1">Центр масс — глубина (0–1)</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.structural.center_of_mass.depth_rel}
              onChange={e =>
                updateStructuralCenterOfMass(
                  'depth_rel',
                  Number(e.target.value) || 0,
                )
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>

          {/* подвижность суставов */}
          <div>
            <label className="block mb-1">Подвижность суставов (0–1)</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.structural.joint_laxity}
              onChange={e =>
                updateStructural('joint_laxity', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>
        </div>
      </section>

      {/* Функциональность */}
      <section className="border border-canon-border rounded-md p-3 space-y-2">
        <h3 className="text-sm font-semibold mb-1">Функциональность</h3>
        <p className="text-xs text-canon-text-muted mb-2">
          Сила, скорость, восстановление.
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block mb-1">Сила (верх)</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.functional.strength_upper}
              onChange={e =>
                updateFunctional('strength_upper', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>
          <div>
            <label className="block mb-1">Сила (низ)</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.functional.strength_lower}
              onChange={e =>
                updateFunctional('strength_lower', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>

          <div>
            <label className="block mb-1">Взрывная сила</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.functional.explosive_power}
              onChange={e =>
                updateFunctional('explosive_power', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>
          <div>
            <label className="block mb-1">Аэробная ёмкость</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.functional.aerobic_capacity}
              onChange={e =>
                updateFunctional('aerobic_capacity', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>

          <div>
            <label className="block mb-1">Скорость восстановления</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.functional.recovery_speed}
              onChange={e =>
                updateFunctional('recovery_speed', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>

          <div>
            <label className="block mb-1">Профиль усталости (0–1)</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.functional.strength_endurance_profile}
              onChange={e =>
                updateFunctional(
                  'strength_endurance_profile',
                  Number(e.target.value) || 0,
                )
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>

          {/* Риски травм */}
          <div>
            <label className="block mb-1">Риск травм — колени</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.functional.injury_risk.knees}
              onChange={e =>
                updateFunctionalInjury('knees', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>
          <div>
            <label className="block mb-1">Риск травм — голеностопы</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.functional.injury_risk.ankles}
              onChange={e =>
                updateFunctionalInjury('ankles', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>
          <div>
            <label className="block mb-1">Риск травм — поясница</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.functional.injury_risk.lower_back}
              onChange={e =>
                updateFunctionalInjury('lower_back', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>
          <div>
            <label className="block mb-1">Риск травм — плечи</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.functional.injury_risk.shoulders}
              onChange={e =>
                updateFunctionalInjury('shoulders', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>
        </div>
      </section>

      {/* Ткани и Метаболизм */}
      <section className="border border-canon-border rounded-md p-3 space-y-2">
        <h3 className="text-sm font-semibold mb-1">Ткани и Метаболизм</h3>
        <p className="text-xs text-canon-text-muted mb-2">
          Жировая прослойка и запасы.
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block mb-1">Процент жира</label>
            <input
              type="number"
              value={body.adipose.body_fat_percent}
              onChange={e =>
                updateAdipose('body_fat_percent', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>
          <div>
            <label className="block mb-1">Метаболический резерв (0–1)</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.adipose.metabolic_reserve}
              onChange={e =>
                updateAdipose('metabolic_reserve', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>

          <div className="col-span-2">
            <label className="block mb-1">Распределение жира</label>
            <select
              value={body.adipose.fat_distribution}
              onChange={e =>
                updateAdipose('fat_distribution', e.target.value as FatDistribution)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            >
              <option value="gynoid">Гиноидное (бёдра/таз)</option>
              <option value="android">Андроидное (живот/грудь)</option>
              <option value="mixed">Смешанное</option>
            </select>
          </div>
        </div>
      </section>

      {/* Гормоны и Циклы */}
      <section className="border border-canon-border rounded-md p-3 space-y-2">
        <h3 className="text-sm font-semibold mb-1">Гормоны и Циклы</h3>
        <p className="text-xs text-canon-text-muted mb-2">
          Эндокринология и биоритмы.
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block mb-1">Базовый андроген</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.hormonal.androgen_baseline}
              onChange={e =>
                updateHormonal('androgen_baseline', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>
          <div>
            <label className="block mb-1">Циркадная амплитуда</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.hormonal.androgen_circadian_amplitude}
              onChange={e =>
                updateHormonal(
                  'androgen_circadian_amplitude',
                  Number(e.target.value) || 0,
                )
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>

          <div>
            <label className="block mb-1">Чувствительность к стрессу</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.hormonal.stress_sensitivity}
              onChange={e =>
                updateHormonal('stress_sensitivity', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>
          <div>
            <label className="block mb-1">Чувствительность к недосыпу</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.hormonal.sleep_sensitivity}
              onChange={e =>
                updateHormonal('sleep_sensitivity', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>

          <div>
            <label className="block mb-1">Длина цикла (дни)</label>
            <input
              type="number"
              value={body.hormonal.cycle_length_days ?? ''}
              onChange={e =>
                updateHormonal(
                  'cycle_length_days',
                  e.target.value === '' ? undefined : Number(e.target.value),
                )
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>
        </div>
      </section>

      {/* Репродуктивный блок (опционально) */}
      <section className="border border-canon-border rounded-md p-3 space-y-2">
        <h3 className="text-sm font-semibold mb-1">Репродуктивное состояние</h3>
        <p className="text-xs text-canon-text-muted mb-2">
          Опциональный блок: беременность, её влияние на выносливость и риски.
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <input
              id="can_be_pregnant"
              type="checkbox"
              checked={body.reproductive.can_be_pregnant}
              onChange={e =>
                updateReproductive('can_be_pregnant', e.target.checked)
              }
            />
            <label htmlFor="can_be_pregnant">Может быть беременной</label>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="is_pregnant"
              type="checkbox"
              checked={body.reproductive.is_pregnant}
              onChange={e => updateReproductive('is_pregnant', e.target.checked)}
              disabled={!body.reproductive.can_be_pregnant}
            />
            <label htmlFor="is_pregnant">Сейчас беременна</label>
          </div>

          <div>
            <label className="block mb-1">Неделя гестации (0–40)</label>
            <input
              type="number"
              min={0}
              max={40}
              value={body.reproductive.gestation_week ?? ''}
              onChange={e =>
                updateReproductive(
                  'gestation_week',
                  e.target.value === '' ? undefined : Number(e.target.value),
                )
              }
              disabled={!body.reproductive.is_pregnant}
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block mb-1">Пенальти усталости (0–1)</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.reproductive.fatigue_penalty}
              onChange={e =>
                updateReproductive('fatigue_penalty', Number(e.target.value) || 0)
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>

          <div>
            <label className="block mb-1">Рост ЧСС (0–1)</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.reproductive.heart_rate_increase}
              onChange={e =>
                updateReproductive(
                  'heart_rate_increase',
                  Number(e.target.value) || 0,
                )
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>

          <div>
            <label className="block mb-1">Рост риска травм (0–1)</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.reproductive.injury_risk_increase}
              onChange={e =>
                updateReproductive(
                  'injury_risk_increase',
                  Number(e.target.value) || 0,
                )
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>

          <div>
            <label className="block mb-1">Эмоциональная лабильность (0–1)</label>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={body.reproductive.emotional_lability}
              onChange={e =>
                updateReproductive(
                  'emotional_lability',
                  Number(e.target.value) || 0,
                )
              }
              className="w-full px-2 py-1 rounded bg-canon-bg-light border border-canon-border"
            />
          </div>
        </div>
      </section>
    </div>
  );
};
