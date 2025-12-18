
import { Branch, MassNetwork, MassNodeParams, MassNodeState, MassNodeId } from '../../types';

/**
 * Общие дефолтные параметры узла массы.
 */
const DEFAULT_PARAMS: MassNodeParams = {
  tau: 5,
  bias: 0,
  gain: 1.5,
  noiseScale: 1,
};

/**
 * Примитивный билдер: для каждой ветки создаём несколько узлов,
 * задаём им метки и простую матрицу связей.
 */
export function buildDefaultMassNetwork(branch: Branch): MassNetwork {
  // Подбор узлов "по вкусу" под твой лор
  const nodesForBranch: { id: MassNodeId; label: string }[] =
    branch === Branch.PreRector
      ? [
          { id: 'capital', label: 'Столица' },
          { id: 'line-s1', label: 'Линия С-1' },
          { id: 'small-regnum', label: 'Малый Регнум' },
          { id: 'zmeevoy-korpus', label: 'Чёрные Змеи' },
        ]
      : branch === Branch.PreBorders
      ? [
          { id: 'capital', label: 'Столица' },
          { id: 'massborgh', label: 'Массборг' },
          { id: 'yatlam', label: 'Ятлам' },
        ]
      : [
          { id: 'capital', label: 'Столица' },
          { id: 'line-s1', label: 'Линия С-1' },
          { id: 'line-s2', label: 'Линия С-2' },
        ];

  const nodeOrder = nodesForBranch.map(n => n.id);

  const nodes: Record<MassNodeId, MassNodeState> = {};
  for (const { id, label } of nodesForBranch) {
    nodes[id] = {
      id,
      label,
      x: 0,              // стартуем с "спокойного" состояния
      params: { ...DEFAULT_PARAMS },
    };
  }

  const n = nodeOrder.length;
  const W: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  // Простая симметричная связь: чуть связываем всех со всеми,
  // и сильнее — соседние узлы по порядку.
  const baseCoupling = 0.15;
  const neighborBoost = 0.2;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      let w = baseCoupling;
      if (Math.abs(i - j) === 1) {
        w += neighborBoost;
      }
      W[i][j] = w;
    }
  }

  return {
    nodes,
    nodeOrder,
    W,
  };
}