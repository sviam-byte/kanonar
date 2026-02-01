import type { ContextAtom } from '../context/v2/types';

function last(parts: string[]): string {
  return parts.length ? parts[parts.length - 1] : '';
}

const EMO_RU: Record<string, string> = {
  fear: 'страх',
  anger: 'злость',
  shame: 'стыд',
  relief: 'облегчение',
  resolve: 'решимость',
  care: 'забота',
  arousal: 'возбуждение',
  valence: 'валентность',
};

const APP_RU: Record<string, string> = {
  threat: 'оценка угрозы',
  uncertainty: 'оценка неопределённости',
  control: 'оценка контроля',
  pressure: 'оценка давления',
  attachment: 'оценка привязанности',
};

const NS_RU: Record<string, string> = {
  ctx: 'контекст',
  threat: 'угроза',
  emo: 'эмоции',
  goal: 'цели',
  tom: 'ToM',
  rel: 'отношения',
  soc: 'социальное',
  obs: 'наблюдение',
  self: 'я',
  world: 'мир',
  scene: 'сцена',
  map: 'карта',
  misc: 'прочее',
};

/**
 * Translate namespaces into Russian labels (fallbacks to raw key).
 */
export function atomNamespaceRu(ns?: string | null): string {
  if (!ns) return 'прочее';
  return NS_RU[ns] || ns;
}

/**
 * Human-friendly Russian label for an atom id/label pair.
 */
export function atomLabelRu(atom: ContextAtom): string {
  const id = String((atom as any)?.id || '');
  const label = String((atom as any)?.label || '');

  // If a human-friendly label is already set, preserve it.
  if (label && label !== id && !label.startsWith('emo:') && !label.startsWith('app:')) return label;

  const parts = id.split(':');
  const ns = parts[0] || '';

  if (ns === 'emo') {
    const key = parts[1] || '';
    const who = last(parts);
    const ru = EMO_RU[key] || key;
    return who ? `${ru} (${who})` : ru;
  }
  if (ns === 'app') {
    const key = parts[1] || '';
    const who = last(parts);
    const ru = APP_RU[key] || key;
    return who ? `${ru} (${who})` : ru;
  }

  if (ns === 'ctx') {
    const key = parts[1] || '';
    const who = last(parts);
    const map: Record<string, string> = {
      danger: 'опасность',
      crowd: 'толпа/скученность',
      publicness: 'публичность',
      surveillance: 'наблюдение',
      intimacy: 'близость',
      normPressure: 'давление норм',
      uncertainty: 'неопределённость',
    };
    const ru = map[key] || key;
    return who ? `${ru} (${who})` : ru;
  }
  if (ns === 'threat') {
    const key = parts[1] || '';
    const who = last(parts);
    const map: Record<string, string> = {
      final: 'угроза (итог)',
      unc: 'угроза: неопределённость',
      local: 'угроза (локальная)',
    };
    const ru = map[key] || 'угроза';
    return who ? `${ru} (${who})` : ru;
  }

  return label || id;
}
