// lib/dilemma/catalog.ts
//
// Dilemma specifications with scoring mappings and Kainrax narrative framing.

import type { DilemmaSpec } from './types';

export const PRISONERS_DILEMMA: DilemmaSpec = {
  id: 'prisoners_dilemma',
  name: 'Дилемма заключённого',
  cooperativeActionId: 'cooperate',
  actions: [
    {
      id: 'cooperate',
      label: 'Кооперация',
      description: 'Защитить партнёра, рискуя собственным положением.',
    },
    {
      id: 'defect',
      label: 'Предательство',
      description: 'Предать партнёра ради самосохранения.',
    },
  ],
  payoffs: {
    cooperate: {
      cooperate: [0.7, 0.7] as const,
      defect: [0.0, 1.0] as const,
    },
    defect: {
      cooperate: [1.0, 0.0] as const,
      defect: [0.3, 0.3] as const,
    },
  },
  nashEquilibria: [['defect', 'defect']],
  paretoOptimal: [['cooperate', 'cooperate']],
  scoringMap: {
    cooperate: { idPrefix: 'off:help', kind: 'off' },
    defect: { idPrefix: 'aff:confront', kind: 'aff' },
  },
  framing: {
    setup:
      'Два Меча пойманы Кадастром после провала операции. '
      + 'Допрашивают раздельно. У каждого один выбор.',
    actionLabels: {
      cooperate: 'Молчать на допросе',
      defect: 'Дать показания на напарника',
    },
    outcomeDescriptions: {
      cooperate: {
        cooperate: 'Оба молчали. Улики косвенные — отпущены через двое суток.',
        defect: 'Ты молчал. Он тебя сдал. Полное наказание.',
      },
      defect: {
        cooperate: 'Ты его сдал. Он молчал. Ты выходишь свободным.',
        defect: 'Оба сдали друг друга. Средний срок обоим.',
      },
    },
  },
};

export const STAG_HUNT: DilemmaSpec = {
  id: 'stag_hunt',
  name: 'Охота на оленя',
  cooperativeActionId: 'stag',
  actions: [
    {
      id: 'stag',
      label: 'Координация',
      description: 'Рискнуть ради большой цели. Работает только если оба.',
    },
    {
      id: 'hare',
      label: 'Соло',
      description: 'Взять гарантированный мелкий результат.',
    },
  ],
  payoffs: {
    stag: {
      stag: [1.0, 1.0] as const,
      hare: [0.0, 0.6] as const,
    },
    hare: {
      stag: [0.6, 0.0] as const,
      hare: [0.5, 0.5] as const,
    },
  },
  nashEquilibria: [['stag', 'stag'], ['hare', 'hare']],
  paretoOptimal: [['stag', 'stag']],
  scoringMap: {
    stag: { idPrefix: 'off:help', kind: 'off' },
    hare: { idPrefix: 'cog:wait', kind: 'cog' },
  },
  framing: {
    setup:
      'Конвой входит в нестабильную зону. '
      + 'Можно координированно пробиваться к объекту, или каждый берёт гарантированную малую цель.',
    actionLabels: {
      stag: 'Координированный рывок к главной цели',
      hare: 'Взять малую цель самостоятельно',
    },
    outcomeDescriptions: {
      stag: {
        stag: 'Координация сработала. Объект взят. Максимальный результат.',
        hare: 'Ты пошёл на прорыв один. Он взял мелочь. Провал.',
      },
      hare: {
        stag: 'Он пошёл на прорыв один. Ты взял мелочь. Он провалился.',
        hare: 'Оба взяли малые цели. Нормально, но без прорыва.',
      },
    },
  },
};

export const CHICKEN: DilemmaSpec = {
  id: 'chicken',
  name: 'Ястреб и голубь',
  cooperativeActionId: 'dove',
  actions: [
    {
      id: 'hawk',
      label: 'Эскалировать',
      description: 'Давить. Не уступать. Забрать всё.',
    },
    {
      id: 'dove',
      label: 'Уступить',
      description: 'Отступить. Избежать столкновения.',
    },
  ],
  payoffs: {
    hawk: {
      hawk: [0.0, 0.0] as const,
      dove: [0.9, 0.2] as const,
    },
    dove: {
      hawk: [0.2, 0.9] as const,
      dove: [0.5, 0.5] as const,
    },
  },
  nashEquilibria: [['hawk', 'dove'], ['dove', 'hawk']],
  paretoOptimal: [['hawk', 'dove'], ['dove', 'hawk'], ['dove', 'dove']],
  scoringMap: {
    hawk: { idPrefix: 'aff:attack', kind: 'aff' },
    dove: { idPrefix: 'aff:hide', kind: 'aff' },
  },
  framing: {
    setup:
      'Два Изгнанника столкнулись на спорной территории. Ресурс один на двоих.',
    actionLabels: {
      hawk: 'Давить. Не уступать.',
      dove: 'Уступить и уйти.',
    },
    outcomeDescriptions: {
      hawk: {
        hawk: 'Оба давят. Столкновение. Оба теряют больше, чем стоит ресурс.',
        dove: 'Ты давишь, он уступает. Ресурс твой.',
      },
      dove: {
        hawk: 'Он давит, ты уступаешь. Ресурс его.',
        dove: 'Оба уступают. Делят поровну.',
      },
    },
  },
};

export const TRUST_GAME: DilemmaSpec = {
  id: 'trust_game',
  name: 'Игра доверия',
  cooperativeActionId: 'cooperate',
  actions: [
    {
      id: 'cooperate',
      label: 'Довериться',
      description: 'Передать ресурс / вернуть справедливую долю.',
    },
    {
      id: 'exploit',
      label: 'Эксплуатировать',
      description: 'Оставить всё себе / забрать переданное.',
    },
  ],
  payoffs: {
    cooperate: {
      cooperate: [0.8, 0.8] as const,
      exploit: [0.0, 1.0] as const,
    },
    exploit: {
      cooperate: [1.0, 0.0] as const,
      exploit: [0.3, 0.3] as const,
    },
  },
  nashEquilibria: [['exploit', 'exploit']],
  paretoOptimal: [['cooperate', 'cooperate']],
  scoringMap: {
    cooperate: { idPrefix: 'off:help', kind: 'off' },
    exploit: { idPrefix: 'aff:confront', kind: 'aff' },
  },
  framing: {
    setup:
      'Ресурсная передача через Опекуна. '
      + 'Можно довериться и разделить, или попытаться забрать всё.',
    actionLabels: {
      cooperate: 'Передать ресурс / вернуть справедливую долю',
      exploit: 'Оставить всё себе',
    },
    outcomeDescriptions: {
      cooperate: {
        cooperate: 'Оба доверились. Ресурс удвоился и поделён. Оптимальный результат.',
        exploit: 'Ты доверился. Он забрал всё. Ты с пустыми руками.',
      },
      exploit: {
        cooperate: 'Он доверился. Ты забрал всё.',
        exploit: 'Никто не доверился. Ресурс пропал в накладных.',
      },
    },
  },
};

export const CATALOG: Record<string, DilemmaSpec> = {
  prisoners_dilemma: PRISONERS_DILEMMA,
  stag_hunt: STAG_HUNT,
  chicken: CHICKEN,
  trust_game: TRUST_GAME,
};

export function getSpec(id: string): DilemmaSpec {
  const spec = CATALOG[id];
  if (!spec) throw new Error(`Unknown dilemma: ${id}`);
  return spec;
}

export function allSpecs(): DilemmaSpec[] {
  return Object.values(CATALOG);
}
