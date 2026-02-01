export type AtomRuOptions = { actorLabels?: Record<string, string> };

const NS: Record<string, string> = {
  ctx: 'контекст',
  threat: 'угроза',
  app: 'оценка',
  emo: 'эмоция',
  world: 'мир',
  map: 'карта',
};
const KEY: Record<string, string> = {
  fear: 'страх',
  anger: 'гнев',
  shame: 'стыд',
  relief: 'облегчение',
  resolve: 'решимость',
  care: 'забота',
  valence: 'валентность',
  arousal: 'возбуждение',
  control: 'контроль',
  pressure: 'давление',
  attachment: 'привязанность',
  uncertainty: 'неопределённость',
  publicness: 'публичность',
  surveillance: 'надзор',
  intimacy: 'близость',
  cover: 'укрытие',
  escape: 'отход',
  final: 'итог',
};

/**
 * Build a Russian-friendly label + subtitle for an atom id.
 */
export function atomLabelRu(id: string, opt: AtomRuOptions = {}): { title: string; subtitle: string } {
  const raw = String(id || '');
  const parts = raw.split(':');
  if (parts.length < 2) return { title: raw, subtitle: '' };
  const ns = parts[0];
  const key = parts[1];
  const tail = parts.slice(2);
  const who = tail[tail.length - 1] || '';
  const whoLabel = (opt.actorLabels && opt.actorLabels[who]) ? opt.actorLabels[who] : who;
  const nsRu = NS[ns] || ns;
  const keyRu = KEY[key] || key;
  const extras = tail.length > 1 ? (` · ${tail.slice(0, -1).map(x => KEY[x] || x).join(' / ')}`) : '';
  const title = `${nsRu}: ${keyRu}${extras}`;
  const subtitle = whoLabel ? `агент: ${whoLabel}` : '';
  return { title, subtitle };
}
