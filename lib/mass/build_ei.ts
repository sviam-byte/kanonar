
import { Branch, MassNetworkEI, MassNodeId, MassNodeParamsEI, MassNodeStateEI } from '../../types';

const DEFAULT_PARAMS_EI: MassNodeParamsEI = {
  tauE: 5,    // Инерция возбуждения
  tauI: 10,   // Инерция торможения (контроль отстает от паники)
  biasE: -2,  // По умолчанию узлы спокойны
  biasI: -1,
  gainE: 1.5,
  gainI: 1.2,
  noiseScaleE: 0.5,
  noiseScaleI: 0.2,
};

// Параметры для нестабильных узлов (Периферия)
const UNSTABLE_PARAMS: MassNodeParamsEI = {
  ...DEFAULT_PARAMS_EI,
  biasE: -1.0, // Легче возбуждаются
  noiseScaleE: 1.0, // Больше шума
};

// Параметры для жестких узлов (Столица, Гвардия)
const RIGID_PARAMS: MassNodeParamsEI = {
  ...DEFAULT_PARAMS_EI,
  tauE: 8, // Медленнее разгоняются
  gainI: 2.0, // Сильное подавление
};

export function buildDefaultMassNetworkEI(branch: Branch): MassNetworkEI {
  // Определяем узлы в зависимости от ветки
  const baseNodes: { id: MassNodeId; label: string; type: 'geo' | 'faction'; params: MassNodeParamsEI }[] =
    branch === Branch.PreRector
      ? [
          { id: 'geo:capital', label: 'Столица (Pre)', type: 'geo', params: RIGID_PARAMS },
          { id: 'geo:line-s1', label: 'Линия С-1', type: 'geo', params: UNSTABLE_PARAMS },
          { id: 'inst:small-regnum', label: 'Малый Регнум', type: 'faction', params: RIGID_PARAMS },
          { id: 'corp:snakes', label: 'Чёрные Змеи', type: 'faction', params: UNSTABLE_PARAMS },
        ]
      : [
          // Current Era Nodes
          { id: 'geo:capital', label: 'Столица', type: 'geo', params: RIGID_PARAMS },
          { id: 'geo:periphery', label: 'Периферия', type: 'geo', params: UNSTABLE_PARAMS },
          { id: 'geo:tunnels', label: 'Нижние Туннели', type: 'geo', params: UNSTABLE_PARAMS },
          
          { id: 'faction:royal_guard', label: 'Королевская Гвардия', type: 'faction', params: RIGID_PARAMS },
          { id: 'faction:independent', label: 'Независимые', type: 'faction', params: DEFAULT_PARAMS_EI },
          { id: 'inst:rectorate', label: 'Ректорат', type: 'faction', params: RIGID_PARAMS },
        ];

  const nodeOrder = baseNodes.map(n => n.id);
  const nodes: Record<MassNodeId, MassNodeStateEI> = {};
  
  for (const n of baseNodes) {
    nodes[n.id] = {
      id: n.id,
      label: n.label,
      E: 0.05, // Низкий старт
      I: 0.2,  // Базовый контроль
      params: n.params,
    };
  }

  const n = nodeOrder.length;
  const W_EE = Array.from({ length: n }, () => Array(n).fill(0));
  const W_EI = Array.from({ length: n }, () => Array(n).fill(0));
  const W_IE = Array.from({ length: n }, () => Array(n).fill(0));
  const W_II = Array.from({ length: n }, () => Array(n).fill(0));

  // Хелпер для установки весов
  const setLink = (srcId: string, tgtId: string, wExc: number, wInh: number = 0) => {
      const i = nodeOrder.indexOf(srcId);
      const j = nodeOrder.indexOf(tgtId);
      if (i >= 0 && j >= 0) {
          W_EE[j][i] = wExc; // src(i) влияет на E target(j)
          W_IE[j][i] = wExc * 0.5; // src(i) также будит I target(j) (реактивный контроль)
          if (wInh > 0) {
             W_EI[j][i] = wInh; // src(i) тормозит E target(j) (редко, но возможно)
          }
      }
  };

  // --- Топология Связей ---
  
  if (branch === Branch.Current) {
      // 1. География: Столица <-> Периферия
      setLink('geo:capital', 'geo:periphery', 0.2); // Столица влияет на периферию
      setLink('geo:periphery', 'geo:capital', 0.4); // Паника на периферии сильно пугает столицу

      // 2. Туннели <-> Периферия (просачивание)
      setLink('geo:tunnels', 'geo:periphery', 0.3);
      setLink('geo:periphery', 'geo:tunnels', 0.1);

      // 3. Фракции в Географии
      // Гвардия базируется в Столице
      setLink('faction:royal_guard', 'geo:capital', 0.5, 0); // Гвардия возбуждает/мобилизует столицу
      setLink('geo:capital', 'faction:royal_guard', 0.3, 0); // Проблемы в столице мобилизуют гвардию

      // Независимые на периферии/в туннелях
      setLink('faction:independent', 'geo:tunnels', 0.4);
      setLink('geo:tunnels', 'faction:independent', 0.4);

      // Ректорат (Институт) влияет на всех через торможение (Контроль)
      // Это особый случай: Ректорат излучает I (Inhibition)
      const rectorateIdx = nodeOrder.indexOf('inst:rectorate');
      if (rectorateIdx >= 0) {
          // Ректорат подавляет панику в Столице и Гвардии
          const capIdx = nodeOrder.indexOf('geo:capital');
          const guardIdx = nodeOrder.indexOf('faction:royal_guard');
          
          // В данном движке W_IE[tgt][src] означает: E источника повышает I цели.
          // Если Ректорат возбужден (мобилизован), он повышает контроль в Столице.
          W_IE[capIdx][rectorateIdx] = 0.8; 
          W_IE[guardIdx][rectorateIdx] = 0.5;
      }
  } else {
      // Простая цепочка для других веток
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          if (Math.abs(i - j) === 1) {
            W_EE[i][j] = 0.3;
            W_IE[i][j] = 0.1;
          }
        }
      }
  }

  return {
    nodes,
    nodeOrder,
    W_EE,
    W_EI,
    W_IE,
    W_II,
  };
}
