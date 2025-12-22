import React, { useMemo } from 'react';
import { Slider } from '../Slider';

type Props = {
  selfId: string;
  atoms: Array<{ id: string; magnitude: number }>;
  setManualAtom: (id: string, magnitude: number) => void;
};

function get(atoms: Props['atoms'], id: string, fb = 0) {
  const a = atoms.find(x => x.id === id);
  const m = (a as any)?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

export function EmotionInspector({ selfId, atoms, setManualAtom }: Props) {
  const ids = useMemo(() => ({
    // appraisals
    threat: `app:threat:${selfId}`,
    uncertainty: `app:uncertainty:${selfId}`,
    control: `app:control:${selfId}`,
    pressure: `app:pressure:${selfId}`,
    attachment: `app:attachment:${selfId}`,
    loss: `app:loss:${selfId}`,
    goalBlock: `app:goalBlock:${selfId}`,

    // emotions
    fear: `emo:fear:${selfId}`,
    anger: `emo:anger:${selfId}`,
    shame: `emo:shame:${selfId}`,
    relief: `emo:relief:${selfId}`,
    resolve: `emo:resolve:${selfId}`,
    care: `emo:care:${selfId}`,
    arousal: `emo:arousal:${selfId}`,
  }), [selfId]);

  return (
    <div className="bg-canon-bg border border-canon-border/50 rounded-xl p-4">
      <h3 className="text-xs font-bold text-canon-text-light uppercase tracking-widest mb-3 border-b border-canon-border/30 pb-2">
        Emotion Inspector
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="text-[10px] text-canon-text-light uppercase tracking-widest">Appraisals</div>
          {Object.entries({
            threat: ids.threat,
            uncertainty: ids.uncertainty,
            control: ids.control,
            pressure: ids.pressure,
            attachment: ids.attachment,
            loss: ids.loss,
            goalBlock: ids.goalBlock,
          }).map(([k, id]) => (
            <Slider
              key={id}
              label={`app.${k}`}
              value={get(atoms, id, 0)}
              setValue={(v) => setManualAtom(id, v)}
              min={0}
              max={1}
              step={0.01}
            />
          ))}
        </div>

        <div className="space-y-3">
          <div className="text-[10px] text-canon-text-light uppercase tracking-widest">Emotions</div>
          {Object.entries({
            fear: ids.fear,
            anger: ids.anger,
            shame: ids.shame,
            relief: ids.relief,
            resolve: ids.resolve,
            care: ids.care,
            arousal: ids.arousal,
          }).map(([k, id]) => (
            <Slider
              key={id}
              label={`emo.${k}`}
              value={get(atoms, id, 0)}
              setValue={(v) => setManualAtom(id, v)}
              min={0}
              max={1}
              step={0.01}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 text-[9px] text-canon-text-light italic">
        Эти значения пишутся как override-атомы <code>app:*</code>/<code>emo:*</code> и должны побеждать деривацию.
      </div>
    </div>
  );
}
