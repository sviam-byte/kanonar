import React from 'react';

type Props = {
  world: any;
  onChange: (w: any) => void;
};

/**
 * Минимальная панель модификации мира.
 * Сейчас нужна в первую очередь, чтобы проект компилировался и GoalLab открывался.
 * Дальше можно расширять (HP/позиции/флаги/отношения).
 */
export const WorldModifierPanel: React.FC<Props> = ({ world }) => {
  if (!world) return null;

  const agents = Array.isArray(world.agents) ? world.agents : [];

  return (
    <div className="bg-canon-bg border border-canon-border rounded p-2">
      <div className="text-xs font-bold uppercase tracking-widest text-canon-accent mb-2">
        World (debug)
      </div>

      <div className="text-[11px] opacity-80 mb-2">
        tick: <span className="font-mono">{String(world.tick ?? 0)}</span>
      </div>

      <div className="text-[11px] opacity-80 mb-2">
        agents: <span className="font-mono">{agents.length}</span>
      </div>

      <div className="max-h-64 overflow-auto custom-scrollbar">
        <pre className="text-[10px] font-mono whitespace-pre-wrap opacity-70">
          {JSON.stringify(
            {
              tick: world.tick,
              scenario: world.scenario?.id,
              location: world.locationId,
              agents: agents.map((a: any) => ({
                id: a.entityId,
                hp: a.hp,
                pos: a.position,
                role: a.sceneRoleId,
              })),
            },
            null,
            2
          )}
        </pre>
      </div>
    </div>
  );
};
