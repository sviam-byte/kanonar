
import React from 'react';
import { Tabs } from './Tabs';

const Chapter: React.FC<{id: string, title: string; children: React.ReactNode}> = ({id, title, children}) => (
    <section id={id} className="pt-6 mt-6 border-t border-canon-border scroll-mt-20 first:border-t-0 first:pt-0 first:mt-0">
        <h2 className="text-2xl font-bold text-canon-text mb-4">{title}</h2>
        <div className="space-y-4">{children}</div>
    </section>
);

const Section: React.FC<{id: string, title: string; children: React.ReactNode}> = ({id, title, children}) => (
    <div id={id} className="pt-4 mt-4 border-t border-canon-border/50 scroll-mt-20">
        <h3 className="text-xl font-bold text-canon-accent mb-3">{title}</h3>
        <div className="space-y-3">{children}</div>
    </div>
);

const Formula: React.FC<{ children: React.ReactNode; title?: string }> = ({ children, title }) => (
    <>
        {title && <p className="mt-2 text-sm text-canon-text font-semibold">{title}</p>}
        <pre className="bg-canon-bg text-xs p-3 rounded mt-1 font-mono overflow-x-auto"><code>
            {children}
        </code></pre>
    </>
);

const ListItem: React.FC<{children: React.ReactNode}> = ({children}) => (
    <li className="ml-4 list-decimal">{children}</li>
)

const SdeModelTab: React.FC = () => (
    <>
        <Chapter id="core-params" title="1. Основные параметры">
            <p>Это фундаментальные, «сырые» параметры, которые описывают персонажа. Они редактируются напрямую на панели управления и служат основой для всех дальнейших расчетов.</p>
            <Section id="vector-basis" title="1.1. Векторный Базис (Оси A-G)">
                <p>Набор из ~45 нормализованных параметров [0, 1], описывающих ценности, когнитивные стили и базовые предрасположенности персонажа. Являются основным «генетическим кодом» для расчета латентов.</p>
                <p><strong>Назначение:</strong> Позволяет тонко настроить личность и поведенческие паттерны, которые затем агрегируются в более высокоуровневые латентные переменные.</p>
            </Section>
            <Section id="body-block" title="1.2. Блок «Тело»">
                <p>Детальная модель физического состояния, разделенная на слои. Напрямую влияет на производительность, доступность действий и симуляцию стресса и усталости.</p>
                <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Конституция:</strong> Статические параметры (рост, вес, макс. сила).</li>
                    <li><strong>Резервы:</strong> Внутренние «батарейки» (энергия, гидратация, сон).</li>
                    <li><strong>Острое состояние:</strong> Быстро меняющиеся показатели (усталость, стресс, боль, травмы).</li>
                    <li><strong>Регуляция:</strong> Активность стрессовой оси (HPA), уровень возбуждения (arousal).</li>
                </ul>
                <p><strong>Назначение:</strong> Вводит в модель физиологические ограничения. Высокая усталость или долг сна снижают качество решений (DQ) и рабочую память (WMcap). Стресс и моральная травма напрямую увеличивают риск катастрофических сбоев (TailRisk, Pr[monstro]).</p>
            </Section>
            <Section id="system-patches" title="1.3. Системные «Патчи»">
                <p>Дополнительные структурированные блоки данных, описывающие системные взаимодействия персонажа.</p>
                <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Identity:</strong> Сигиллы, клятвы, уровень допуска.</li>
                    <li><strong>Authority:</strong> Веса подписи в разных доменах.</li>
                    <li><strong>Resources:</strong> Бюджеты внимания, риска, инфраструктуры.</li>
                    <li><strong>Evidence & Observation:</strong> Качество доказательств, шум наблюдения.</li>
                    <li><strong>Context & Compute:</strong> Возраст, вычислительный бюджет.</li>
                </ul>
                <p><strong>Назначение:</strong> Определяют права доступа персонажа, его ресурсы и ограничения в рамках глобальной системы Kanonar.</p>
            </Section>
        </Chapter>
        
        <Chapter id="latents" title="2. Латентные переменные">
            <p>Латентные переменные — это производные, не наблюдаемые напрямую характеристики, которые рассчитываются как взвешенная сумма параметров из Векторного Базиса. Они представляют собой высокоуровневые концепции (например, «дисциплина», «аппетит к риску») и являются основными входными данными для модели стабильности и метрик.</p>
            
            <Section id="latent-ch" title="Каузальная гигиена (CH)">
                <p><strong>Назначение:</strong> Отражает приверженность персонажа причинной строгости, логической последовательности и избеганию ошибочных рассуждений (апофении). Высокий CH критичен для точного моделирования мира, снижения рисков от неверных интерпретаций и позволяет проводить сложные каузальные вмешательства.</p>
                <Formula>CH = 0.32*A_CS + 0.22*E_Cal + 0.18*A_KT + 0.12*A_JF + 0.08*B_cooldown + 0.08*E_causal_skill</Formula>
            </Section>
            <Section id="latent-sd" title="Дисциплина стабильности (SD)">
                <p><strong>Назначение:</strong> Характеризует склонность следовать процедурам, соблюдать кулдауны и минимизировать операционный шум. Высокая SD напрямую повышает жесткость системы (κ) и снижает разрушающее воздействие (h), делая стабильность более предсказуемой.</p>
                <Formula>SD = 0.35*A_LG + 0.20*A_TC + 0.18*B_cooldown + 0.12*E_KB_civic + 0.15*G_Metacog</Formula>
            </Section>
            <Section id="latent-rp" title="Риск-поза (RP)">
                <p><strong>Назначение:</strong> Определяет аппетит персонажа к риску и склонность к действиям с потенциально «хвостатыми» (непредсказуемыми и опасными) исходами. Высокий RP напрямую увеличивает Vσ и TailRisk.</p>
                <Formula>RP = 0.30*B_discount + 0.22*A_LA + 0.18*A_PS - 0.12*A_SC - 0.10*A_RV - 0.08*C_rep_sens</Formula>
            </Section>
            <Section id="latent-so" title="Открытость сигналу (SO)">
                <p><strong>Назначение:</strong> Способность воспринимать новую, в том числе противоречивую, информацию, не теряя при этом когерентности. Высокая SO повышает Валентность (V), но в сочетании с низким CH может привести к апофении — поиску ложных закономерностей.</p>
                <Formula>SO = 0.34*A_KT + 0.22*B_explore + 0.14*B_ambiguity_tol + 0.12*E_Epi_recency + ...</Formula>
            </Section>
            <Section id="latent-ew" title="Этическая масса (EW)">
                <p><strong>Назначение:</strong> Внутренняя «цена» действий, которые могут причинить вред или нарушить справедливость. Высокий EW служит внутренним тормозом против рискованных или аморальных действий, снижая вероятность Pr[monstro].</p>
                <Formula>EW = 0.28*A_JF + 0.22*A_SC + 0.16*A_AM + 0.14*C_betrayal_cost + ...</Formula>
            </Section>
            <Section id="latent-cl" title="Сетевой множитель (CL)">
                <p><strong>Назначение:</strong> Прокси-метрика социального капитала, доверия и способности к кооперации. Высокий CL увеличивает Pv и является ключевым компонентом социальной стабильности.</p>
                <Formula>CL = 0.26*C_coalition_loyalty + 0.20*C_reciprocity + 0.16*E_diplomacy + ...</Formula>
            </Section>
        </Chapter>
        
        <Chapter id="stability-model" title="3. Модель стабильности (SDE)">
            <p>Динамика Стабильности (S) описывается стохастическим дифференциальным уравнением (SDE) второго порядка. Модель описывает S как «частицу», движущуюся в потенциальном поле, которое определяется тремя опорами и подвергается воздействию разрушающих сил и случайных шоков.</p>
            <Section id="sde-pillars" title="3.1. Три Опоры (N, H, C)">
                <p>Три опоры определяют «целевую» стабильность (μ), к которой система стремится вернуться.</p>
                <ul className="list-disc pl-5 space-y-2">
                    <li><strong>N (Normative):</strong> Нормативный корсет. Насколько действия персонажа соответствуют процедурам, этике и мандатам. Зависит от SD, EW, CH.</li>
                    <li><strong>H (Homeostasis):</strong> Гомеостаз ресурсов. Способность справляться с нагрузкой (DR) и противостоять истощению.</li>
                    <li><strong>C (Coherence):</strong> Когерентность. Внутренняя согласованность целей, самооценки и картины мира. Зависит от goal_coherence, Self_concept_strength.</li>
                </ul>
                <Formula title="N_inst = σ( 2.5 * (0.40*SD + 0.25*EW + 0.20*CH + 0.15*Opt - 0.5) )">{`N_inst = σ( 2.5 * (0.40*SD + 0.25*EW + 0.20*CH + 0.15*Opt - 0.5) )`}</Formula>
                <Formula title="H_inst = σ( 2.5 * (0.40*DR + 0.25*SI - 0.20*FD - 0.15*SR - 0.5) )">{`H_inst = σ( 2.5 * (0.40*DR + 0.25*SI - 0.20*FD - 0.15*SR - 0.5) )`}</Formula>
                <Formula title="C_inst = σ( 2.5 * (0.35*goal_coh + 0.25*Self_str + 0.15*ToM_Q - 0.15*apophenia - 0.10*tension - 0.5) )">{`C_inst = σ( 2.5 * (0.35*goal_coh + 0.25*Self_str + 0.15*ToM_Q - 0.15*apophenia - 0.10*tension - 0.5) )`}</Formula>
            </Section>
            <Section id="sde-params" title="3.2. Динамические параметры (μ, κ, h, ζ)">
                <ul className="list-disc pl-5 space-y-2">
                    <li><strong>μ (mu):</strong> Целевая точка равновесия (аттрактор). Рассчитывается как soft-минимум из трех опор (N, H, C). Куда система стремится.</li>
                    <li><strong>κ (kappa):</strong> Жесткость. Сила, с которой система возвращается к μ. Зависит от SD, CH, T_topo.</li>
                    <li><strong>h (h):</strong> Разрушитель. Сила, тянущая стабильность к нулю. Пропорциональна Vσ, DS, C_causal.</li>
                    <li><strong>ζ (zeta):</strong> Демпфирование/инерция. Насколько система сохраняет свою предыдущую скорость изменения.</li>
                </ul>
                <Formula>{`μ = softmin(N_ema, H_ema, C_ema) + circadian_term + weekly_term`}</Formula>
                <Formula>{`κ = κ₀ * σ(0.35*SD + 0.20*CH + 0.20*T_topo + 0.15*CL + 0.10*DR)`}</Formula>
                <Formula>{`h = h₀ * σ(log_H_core) * (1+0.5*Vσ) * (1+0.6*BP+0.4*(1-Opt)) * (1+misalign)`}</Formula>
            </Section>
            <Section id="sde-equation" title="3.3. Основное уравнение">
                <p><strong>Назначение:</strong> Уравнение описывает изменение скорости (v) стабильности (S) во времени. Оно показывает, как конкурируют восстанавливающие (κ), разрушающие (h), инерционные (ζ) силы и внешние шоки (J).</p>
                <Formula>{`dS/dt = v`}</Formula>
                <Formula title="dv/dt = κ(μ - S) - h*S + (1-ζ)v + ξ + J">dv/dt = [Сила восстановления] - [Сила разрушения] + [Инерция] + [Шум] + [Шок]</Formula>
            </Section>
        </Chapter>
    </>
);

const AdvancedModelsTab: React.FC = () => (
     <>
        <Chapter id="tom-model" title="4. Теория Разума (ToM)">
            <p><strong>Назначение:</strong> Моделирование способности персонажа строить предположения об убеждениях, намерениях и латентных параметрах других агентов. Это позволяет симулировать более сложные социальные взаимодействия, такие как обман, кооперация или эксплуатация.</p>
            <p>Симуляция применяет случайный шум к «истинным» латентам целевого персонажа. Величина шума зависит от когнитивных навыков наблюдателя (Metacog_accuracy, Model_calibration) и глубины симуляции.</p>
            <Formula title="1. Точность наблюдателя (Observer's Accuracy)">
{`skillReduction = (G_Metacog_accuracy + E_Model_calibration) / 2
depthBonus = 0.05 * (depth - 1)`}
            </Formula>
            <Formula title="2. Уровень шума (Noise Level)">
{`// Базовая неточность (0.8) снижается за счет навыков
noiseLevel = max(0, 0.8 - (skillReduction * 0.7) - depthBonus)`}
            </Formula>
            <Formula title="3. Прогнозируемый латент (Predicted Latent)">
{`// К истинному латенту цели добавляется случайный шум
noise = (random() - 0.5) * noiseLevel
predictedValue = clamp(trueValue + noise, 0, 1)`}
            </Formula>
        </Chapter>
        <Chapter id="goals-model" title="5. Экология Целей">
            <p><strong>Назначение:</strong> Динамическая генерация набора активных целей персонажа на основе его текущего состояния, ценностей и контекста. Это позволяет моделировать внутренние конфликты и мотивацию.</p>
            <p>Каждая цель из общего каталога получает «вес активации» на основе параметров персонажа. Если вес превышает порог и все «гейты» (условия) пройдены, цель становится активной. «Напряжение» системы рассчитывается как сумма произведений весов конфликтующих между собой активных целей.</p>
            <Formula title="1. Вес цели (Weight)">{`W(g) = base_weight + Σ (param_value * component_weight)`}</Formula>
            <Formula title="2. Активация">{`A(g|s) = W(g). Цель активна если A(g|s) >= activation_threshold И пройдены все gates.`}</Formula>
            <Formula title="3. Напряжение (Tension)">{`Tension = Σ (A(g_i) * A(g_j)) для всех пар конфликтующих целей i, j`}</Formula>
        </Chapter>
        <Chapter id="rules-model" title="6. Модель правил (Клятвы, Табу, Капы)">
            <p><strong>Назначение:</strong> Определение жестких и мягких ограничений на поведение персонажа, основанных на его идентичности, ценностях и системных правилах.</p>
             <Section id="rules-sacred" title="6.1. Замкнутые классы табу (sacred_set)">
                <p>Набор действий, которые персонаж считает абсолютно недопустимыми. Нарушение этих табу приводит к серьезной моральной травме и системным последствиям. Пример: `erase:memory.chronicle` (стирание хроники).</p>
            </Section>
            <Section id="rules-oaths" title="6.2. Клятвы (oaths)">
                <p>Параметрические обязательства, которые персонаж на себя взял. Они действуют как «гейты» для определенных действий, требуя выполнения условий (например, ко-подписи или аудита). Пример: «Не искажать/не стирать memory.chronicle без co_sign≥2 и audit_pass».</p>
            </Section>
            <Section id="rules-caps" title="6.3. Жёсткие капы (hard_caps)">
                <p>Системные или личные «предохранители», которые накладывают вето на действия при достижении критических порогов. Пример: `Pr[monstro] &gt; 0.35 → вето на каузальные/тёмные действия`.</p>
            </Section>
        </Chapter>
    </>
);

const V42MetricsTab: React.FC = () => (
    <>
        <Chapter id="v42-metrics" title="5. Справочник по модели метрик персонажа (v4.2)">
             <p>Этот документ описывает набор из 15 ключевых метрик, используемых для детального анализа состояния и производительности персонажа. Модель основана на AR(1) процессах для сглаживания и учитывает нелинейные взаимодействия между физиологическими, когнитивными и социальными параметрами.</p>
            <Section id="v42-notation" title="Общие обозначения">
                <Formula>{`σ(x)=1/(1+e^{−x}), tanh(x) — гиперболический тангенс.

relu(x)=max(0,x), clamp01(x)=min(max(x,0),1).

H(x,y)=2xy/(x+y+ε) — гармоническое среднее, ε=1e−6.

GM(x,y)=√(x·y) — геометрическое среднее.

yerkes(A)=exp(−(A−μ)^2/(2σ_A^2)), μ=0.55, σ_A=0.18.

AR(1): M_t = α·M_{t−1} + (1−α)·M*_t, α=0.7.

Нотация: SleepDebt, Stress, Fatigue, Pain, Arousal=«Возбуждение», HPA=HPA_reactivity, OPSEC=Skill_opsec_hacking, ChronV=Skill_chronicle_verify, Cal=Model_calibration, MFid=Memory_Fidelity, Dose=E/A*, Overshoot=relu(Dose−1), Pv_norm∈[0,1].`}</Formula>
            </Section>

             <Section id="v42-formulas" title="Формулы метрик">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <div>
                        <h4 className="font-bold text-canon-accent">1. V — Валентность</h4>
                        <Formula title="raw_V">{`+0.22·AM +0.16·SO +0.12·exp_rate +0.12·Epi_recency +0.10·sleep_res −0.14·Stress −0.10·Fatigue −0.08·SleepDebt −0.08·Pain −0.08·MI_load`}</Formula>
                        <Formula>V* = 0.5 + 0.5·tanh( 2.2·(raw_V − 0.5) )</Formula>
                    </div>
                    <div>
                        <h4 className="font-bold text-canon-accent">2. A — Активация</h4>
                        <Formula title="raw_A">{`0.62·Arousal +0.20·HPA −0.10·SleepDebt −0.08·Fatigue`}</Formula>
                        <Formula>A* = σ( 3.0·(raw_A − 0.5) )</Formula>
                    </div>
                     <div>
                        <h4 className="font-bold text-canon-accent">3. WMcap — Рабочая память</h4>
                        <Formula title="core">{`+0.30·CompBudget +0.22·sleep_res +0.18·goal_coh −0.16·Stress −0.07·Fatigue −0.07·SleepDebt`}</Formula>
                        <Formula>WMcap* = σ( 3.0·(core − 0.5) ) · yerkes(A_t)</Formula>
                    </div>
                     <div>
                        <h4 className="font-bold text-canon-accent">4. DQ — Качество решений</h4>
                        <Formula title="lin">{`+0.30·CH +0.22·Metacog +0.18·SD +0.10·KB_stem −0.10·dec_temp −0.05·Stress −0.05·SleepDebt`}</Formula>
                        <Formula>DQ* = σ( 3.0·(lin − 0.5) ) · (0.6 + 0.4·WMcap_t)</Formula>
                    </div>
                     <div>
                        <h4 className="font-bold text-canon-accent">5. Habit — Привычный контроль</h4>
                        <Formula title="drive">{`+0.28·dec_temp +0.22·SleepDebt +0.18·Stress +0.16·Epi_schema −0.10·Cal −0.10·cooldown`}</Formula>
                        <Formula>Habit* = σ( 2.8·(drive − 0.5) )</Formula>
                    </div>
                     <div>
                        <h4 className="font-bold text-canon-accent">6. Agency — Агентность</h4>
                        <Formula title="base">{`+0.34·Narrative +0.22·Self_concept +0.18·goal_coh +0.10·SD −0.08·Drift −0.06·Overshoot`}</Formula>
                        <Formula>Agency* = σ( 3.0·(base − 0.5) ) · (1 − 0.45·Habit_t)</Formula>
                    </div>
                    <div>
                        <h4 className="font-bold text-canon-accent">7. TailRisk — Хвостовой риск</h4>
                        <Formula title="MetaU">{`σ( 2.8·( +0.30·ObsNoise +0.22·RepNoise +0.22·(1−Cal) +0.16·(1−MFid) −0.20·CH ) )`}</Formula>
                        <Formula title="risklin">{`+0.30·RP +0.20·A_t +0.15·dec_temp +0.15·HPA +0.10·MetaU −0.20·SD −0.10·OPSEC`}</Formula>
                        <Formula>TailRisk* = σ( 3.0·(risklin − 0.5) )</Formula>
                    </div>
                    <div>
                        <h4 className="font-bold text-canon-accent">8. Rmargin — Запас обратимости</h4>
                        <Formula>Rmargin* = clamp01(σ( 3.0·( H(RV,SD) − 0.25·RP − 0.15·dec_temp − 0.5 ) ) + 0.5)</Formula>
                    </div>
                    <div>
                        <h4 className="font-bold text-canon-accent">9. PlanRobust — Робастность планов</h4>
                        <Formula title="DoseFrag">{`σ( 3.0·( +0.45·Overshoot +0.25·HPA −0.30·SD ) )`}</Formula>
                         <Formula title="pr_lin">{`+0.28·SD +0.22·CH +0.22·WMcap_t −0.18·TailRisk_t −0.10·DoseFrag`}</Formula>
                        <Formula>PlanRobust* = σ( 3.0·(pr_lin − 0.5) )</Formula>
                    </div>
                    <div>
                        <h4 className="font-bold text-canon-accent">10. DriveU — Гомеостатическая потребность</h4>
                        <Formula title="Load">{`0.28·DefE +0.18·DefH +0.16·DefG +0.16·DefO +0.12·Pain +0.10·SleepP`}</Formula>
                        <Formula>DriveU* = 1 − exp( −2.2·Load )</Formula>
                    </div>
                     <div>
                        <h4 className="font-bold text-canon-accent">11. ExhaustRisk — Риск истощения</h4>
                         <Formula title="ex_lin">{`+0.30·SleepDebt +0.25·Fatigue +0.18·HPA −0.18·stamina −0.09·sleep_res`}</Formula>
                        <Formula>ExhaustRisk* = σ( 3.2·(ex_lin − 0.5) + 1.2·synergy )</Formula>
                    </div>
                     <div>
                        <h4 className="font-bold text-canon-accent">12. Recovery — Скорость восстановления</h4>
                         <Formula title="rec_lin">{`+0.34·sleep_res +0.24·stamina +0.16·Extinction −0.18·SleepDebt −0.10·Stress`}</Formula>
                        <Formula>Recovery* = σ( 3.0·(rec_lin − 0.5) ) · (1 − 0.5·ExhaustRisk_t)</Formula>
                    </div>
                     <div>
                        <h4 className="font-bold text-canon-accent">13. ImpulseCtl — Контроль импульсов</h4>
                         <Formula title="lin">{`+0.30·SD +0.26·cooldown +0.10·KB_civic −0.18·dec_temp −0.12·HPA`}</Formula>
                        <Formula>ImpulseCtl* = σ( 3.0·(lin − 0.5) ) · (0.7 + 0.3·WMcap_t)</Formula>
                    </div>
                     <div>
                        <h4 className="font-bold text-canon-accent">14. InfoHyg — Инфо-гигиена</h4>
                         <Formula title="ih_lin">{`+0.50·GM(CH, 0.6+0.4·OPSEC) +0.18·ChronV ...`}</Formula>
                        <Formula>InfoHyg* = σ( 3.0·(ih_lin − 0.5) )</Formula>
                    </div>
                     <div>
                        <h4 className="font-bold text-canon-accent">15. RAP — Risk-Adjusted Performance</h4>
                        <Formula>RAP* = clamp01( Perf · RiskPenalty · PlanBoost )</Formula>
                    </div>
                </div>
            </Section>
        </Chapter>
    </>
);

const ModelGoalsTab: React.FC = () => (
    <>
        <Chapter id="goals-intro" title="Цели и Визуализация Математической Модели">
            <p>Этот раздел поясняет ключевые концепции формальной математической модели и предлагает способы их визуализации для интуитивного понимания поведения агентов.</p>
        </Chapter>
        
        <Chapter id="goals-dynamics" title="1. Динамика состояний (Блок 3.1)">
            <Section id="dynamics-desc" title="Что здесь описывается">
                <p>Внутренние состояния персонажа (стресс, энергия, внимание) — это не статичные полоски, а "живые" параметры. Они постоянно стремятся к норме (sᵢ), но их постоянно "дёргают" действия (uᵢ), окружение (zₜ) и внутренний случайный шум (ηᵢ). Причём, чем хуже персонажу (стресс, недосып), тем сильнее этот шум (hᵢ(x)).</p>
            </Section>
            <Section id="dynamics-viz" title="Нормальное отображение: Графики временных рядов">
                <p>Это самый очевидный и эффективный способ. Для каждого ключевого внутреннего состояния нужен отдельный график, показывающий его изменение во времени.</p>
                <p className="font-bold mt-2">Что должно быть на графике "Уровень Стресса":</p>
                <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Плавная кривая, стремящаяся к норме:</strong> Если персонажа оставить в покое, его уровень стресса должен постепенно снижаться. Скорость снижения (τ_stress) будет разной для разных персонажей.</li>
                    <li><strong>Резкие скачки вверх:</strong> Когда в симуляции происходит что-то негативное (например, взрыв, zₜ), кривая стресса должна резко подскочить.</li>
                    <li><strong>"Дрожание" (Шум):</strong> Кривая не должна быть идеально гладкой. Она должна постоянно немного колебаться вверх-вниз, симулируя естественные флуктуации.</li>
                    <li><strong>Увеличение "Дрожания" под нагрузкой:</strong> Самое важное. Когда персонаж находится в состоянии высокого стресса или сильного недосыпа, амплитуда этих случайных колебаний должна заметно увеличиться. Кривая из "слегка волнующейся" должна превратиться в "сильно штормящую".</li>
                </ul>
                <p className="mt-2">Такие графики для стресса, энергии, внимания и силы воли мгновенно покажут разницу между выносливым ветераном и хрупким новичком.</p>
            </Section>
        </Chapter>

        <Chapter id="goals-appraisal" title="2. Appraisal и аффект (Блок 3.2)">
            <Section id="appraisal-desc" title="Что здесь описывается">
                <p>Персонаж не просто "видит" мир, он его эмоционально оценивает (валентность v, контроль c, активация A). Эта оценка напрямую влияет на его рациональность (через температуру T) и эффективность (через performance). Ключевой эффект — закон Йеркса-Додсона: и слишком низкое, и слишком высокое возбуждение (A) вредны.</p>
            </Section>
            <Section id="appraisal-viz" title="Нормальное отображение: Интерактивная «Приборная Панель» Состояния">
                 <p>Здесь нужен не просто график, а набор "датчиков", которые показывают текущее ментальное состояние персонажа в реальном времени.</p>
                <p className="font-bold mt-2">Что должно быть на "Приборной Панели":</p>
                <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Три шкалы:</strong> Валентность (от "Ужасно" до "Прекрасно"), Контроль (от "Беспомощность" до "Все под контролем"), Активация (от "Апатия" до "Паника").</li>
                    <li><strong>Индикатор Оптимальной Активации:</strong> На шкале Активация должна быть отмечена "зелёная зона" — это оптимальный уровень A* для данного персонажа.</li>
                    <li><strong>Индикатор Эффективности (performance):</strong> Отдельный датчик, показывающий текущую эффективность в процентах (100% в "зелёной зоне", падает по краям).</li>
                    <li><strong>Индикатор Температуры (T):</strong> Шкала, показывающая текущий уровень "хаотичности" решений.</li>
                </ul>
                <p className="mt-2">Эта панель мгновенно ответит на вопрос: "В каком настроении сейчас персонаж и насколько он адекватен?".</p>
            </Section>
        </Chapter>

        <Chapter id="goals-portfolio" title="3. Портфель целей и комплементарность (Блок 3.3)">
            <Section id="portfolio-desc" title="Что здесь описывается">
                <p>У персонажа есть набор целей с весами (W). Он постоянно их переоценивает (EMA). Самое важное: польза от цели (u) нелинейна — если не хватает хотя бы одного ресурса, вся затея почти бесполезна (φ(min(a/c))).</p>
            </Section>
            <Section id="portfolio-viz" title="Нормальное отображение: Динамическая диаграмма целей">
                <p>Нужна диаграмма (круговая или столбчатая), которая показывает, о чём "думает" персонаж прямо сейчас.</p>
                <p className="font-bold mt-2">Что должно быть на диаграмме:</p>
                <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Сектора/Столбцы:</strong> Каждый сектор представляет одну из целей персонажа (Выжить, Выполнить миссию, Помочь команде).</li>
                    <li><strong>Размер секторов:</strong> Размер соответствует текущему весу цели (Wᵢ). Мы должны видеть, как эти веса плавно меняются от шага к шагу.</li>
                    <li><strong>Индикатор "Блокировки":</strong> Если для какой-то цели не хватает критического ресурса (из-за комплементарности), её сектор должен становиться полупрозрачным или серым.</li>
                </ul>
                <p className="mt-2">Эта диаграмма наглядно покажет, как персонаж меняет свои приоритеты в зависимости от обстоятельств и дефицита ресурсов.</p>
            </Section>
        </Chapter>
        
        <Chapter id="goals-choice" title="4. Выбор, Социум, Шоки (Блоки 3.4 - 3.7)">
            <Section id="choice-desc" title="Что здесь описывается">
                <p>Эти блоки описывают сам процесс принятия решений и взаимодействия.</p>
            </Section>
            <Section id="choice-viz" title="Нормальное отображение: Детальный лог выполнения">
                 <p>Тот лог, который вы предоставили, и есть идеальное отображение этих процессов. Он работает как "чёрный ящик" самолёта, который записывает всю цепочку рассуждений агента.</p>
                 <p className="font-bold mt-2">Ключевые элементы, которые должны быть в логе для каждого шага:</p>
                 <ul className="list-disc pl-5 space-y-1">
                    <li><strong>INTENT:</strong> Какую долгосрочную цель он сейчас преследует?</li>
                    <li><strong>OPTIONS:</strong> Какие конкретные действия он рассматривал?</li>
                    <li><strong>ACTION:</strong> Какое действие он в итоге выбрал?</li>
                    <li><strong>Contributions:</strong> ПОЧЕМУ он его выбрал? Этот блок — самый важный. Он должен показывать разбивку Q-значения: базовая полезность (U_tagGain), все виды "затрат" (costs: -energy, -time, -legal), и отдельно — штраф за риск (-risk_cvar).</li>
                    <li><strong>GIL:</strong> Если агент был под влиянием, лог должен показать: "φ_sum=0.5. Унаследовал 50% целей от [Имя]".</li>
                </ul>
                <p className="mt-2">Такой лог позволяет "проиграть" историю и в любой момент времени точно ответить на вопрос: "Что происходило в голове у персонажа в этот самый миг?".</p>
            </Section>
        </Chapter>
    </>
);

export const UnifiedReferenceDisplay: React.FC = () => {
    const tabs = [
        { label: 'Базовая модель (SDE)', content: <SdeModelTab /> },
        { label: 'Продвинутые модели', content: <AdvancedModelsTab /> },
        { label: 'Метрики v4.2', content: <V42MetricsTab /> },
        { label: 'Цели и Визуализация', content: <ModelGoalsTab /> },
    ];

    return (
        <div className="text-canon-text-light text-sm leading-relaxed">
            <Tabs tabs={tabs} />
        </div>
    );
};
