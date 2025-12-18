
// components/events/EventEditor.tsx

import * as React from "react";
import type { Event } from "../../lib/events/types";

// --- Local UI Shims to ensure standalone rendering ---
const Card = ({ className, children }: any) => <div className={`bg-canon-bg-light border border-canon-border rounded-lg shadow-sm ${className || ''}`}>{children}</div>;
const CardHeader = ({ className, children }: any) => <div className={`p-4 border-b border-canon-border/20 ${className || ''}`}>{children}</div>;
const CardTitle = ({ className, children }: any) => <h3 className={`text-sm font-bold text-canon-text uppercase tracking-wider ${className || ''}`}>{children}</h3>;
const CardContent = ({ className, children }: any) => <div className={`p-4 ${className || ''}`}>{children}</div>;

const Input = ({ className, ...props }: any) => (
  <input className={`flex h-9 w-full rounded-md border border-canon-border bg-canon-bg px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-canon-accent disabled:cursor-not-allowed disabled:opacity-50 ${className || ''}`} {...props} />
);
const Textarea = ({ className, ...props }: any) => (
  <textarea className={`flex min-h-[60px] w-full rounded-md border border-canon-border bg-canon-bg px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-canon-accent disabled:cursor-not-allowed disabled:opacity-50 ${className || ''}`} {...props} />
);
const Button = ({ className, variant, size, children, ...props }: any) => {
    let base = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
    if (variant === 'ghost') base += " hover:bg-canon-bg/50 hover:text-white";
    else base += " bg-canon-accent text-canon-bg hover:bg-canon-accent/90 shadow";
    
    if (size === 'sm') base += " h-8 rounded-md px-3 text-xs";
    else if (size === 'icon') base += " h-8 w-8";
    else base += " h-9 px-4 py-2";

    return <button className={`${base} ${className || ''}`} {...props}>{children}</button>;
};
const Badge = ({ className, variant, children, ...props }: any) => (
  <div className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-canon-bg text-canon-text-light hover:bg-canon-bg/80 ${className || ''}`} {...props}>{children}</div>
);
const Slider = ({ value, min, max, step, onValueChange, className }: any) => (
    <input 
        type="range" 
        min={min} max={max} step={step} 
        value={value?.[0] ?? min} 
        onChange={e => onValueChange([parseFloat(e.target.value)])}
        className={`w-full h-1.5 bg-canon-border rounded-lg appearance-none cursor-pointer accent-canon-accent ${className || ''}`}
    />
);


type Props = {
  event: Event;
  onChange: (ev: Event) => void;
};

export function EventEditor({ event, onChange }: Props) {
  const update = <K extends keyof Event>(key: K, value: Event[K]) => {
    onChange({ ...event, [key]: value });
  };

  const updateEffects = (patch: Partial<Event["effects"]>) => {
    onChange({ ...event, effects: { ...event.effects, ...patch } });
  };

  const updateEpistemics = (
    patch: Partial<Event["epistemics"]>
  ) => {
    onChange({
      ...event,
      epistemics: { ...event.epistemics, ...patch },
    });
  };

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[2fr,3fr] gap-4 w-full">
      <div className="flex flex-col gap-4">
        <MetaCard event={event} update={update} />
        <SpaceCard event={event} update={update} />
        <ParticipantsCard event={event} update={update} />
      </div>
      <div className="flex flex-col gap-4">
        <SemanticsCard event={event} update={update} />
        <EffectsCard
          event={event}
          updateEffects={updateEffects}
        />
        <EpistemicsCard
          event={event}
          updateEpistemics={updateEpistemics}
        />
        <StatusCard event={event} update={update} />
      </div>
    </div>
  );
}

// ---------- Subcomponents ----------

type BaseProps = {
  event: Event;
  update: <K extends keyof Event>(key: K, value: Event[K]) => void;
};

// meta

function MetaCard({ event, update }: BaseProps) {
  const [kindInput, setKindInput] = React.useState(event.kind);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Событие</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-canon-text-light">
            ID
          </label>
          <Input value={event.id} disabled className="bg-muted/40" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-canon-text-light">
              Kind
            </label>
            <Input
              value={kindInput}
              onChange={(e: any) => setKindInput(e.target.value)}
              onBlur={() =>
                update("kind", kindInput as Event["kind"])
              }
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-canon-text-light">
              Channel
            </label>
            <Input
              value={event.channel}
              onChange={(e: any) =>
                update("channel", e.target.value as any)
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-canon-text-light">
              Timestamp
            </label>
            <Input
              type="number"
              value={event.timestamp}
              onChange={(e: any) =>
                update("timestamp", Number(e.target.value))
              }
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-canon-text-light">
              Schema version
            </label>
            <Input
              type="number"
              value={event.schemaVersion}
              onChange={(e: any) =>
                update("schemaVersion", Number(e.target.value))
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// space

function SpaceCard({ event, update }: BaseProps) {
  const { locationId, zoneId } = event;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Пространство</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-canon-text-light">
            Локация (LocationID)
          </label>
          <Input
            value={locationId ?? ""}
            onChange={(e: any) =>
              update(
                "locationId",
                e.target.value ? (e.target.value as any) : null
              )
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-canon-text-light">
              Зона
            </label>
            <Input
              value={zoneId ?? ""}
              onChange={(e: any) =>
                update("zoneId", e.target.value || undefined)
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// participants

function ParticipantsCard({ event, update }: BaseProps) {
  const [actorInput, setActorInput] = React.useState("");
  const [targetInput, setTargetInput] = React.useState("");

  const addActor = () => {
    const v = actorInput.trim();
    if (!v) return;
    if (event.actors.includes(v as any)) return;
    update("actors", [...event.actors, v as any]);
    setActorInput("");
  };

  const removeActor = (id: string) => {
    update(
      "actors",
      event.actors.filter((a) => a !== (id as any))
    );
  };

  const addTarget = () => {
    const v = targetInput.trim();
    if (!v) return;
    if (event.targets.includes(v as any)) return;
    update("targets", [...event.targets, v as any]);
    setTargetInput("");
  };

  const removeTarget = (id: string) => {
    update(
      "targets",
      event.targets.filter((t) => t !== (id as any))
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Участники</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-canon-text-light">
            Actors
          </label>
          <div className="flex flex-wrap gap-1 mb-1">
            {event.actors.map((a) => (
              <Badge
                key={a}
                variant="outline"
                className="cursor-pointer"
                onClick={() => removeActor(a as any)}
              >
                {a} ×
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="agent-id"
              value={actorInput}
              onChange={(e: any) => setActorInput(e.target.value)}
              onKeyDown={(e: any) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addActor();
                }
              }}
            />
            <Button type="button" onClick={addActor}>
              +
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-canon-text-light">
            Targets
          </label>
          <div className="flex flex-wrap gap-1 mb-1">
            {event.targets.map((t) => (
              <Badge
                key={t}
                variant="outline"
                className="cursor-pointer"
                onClick={() => removeTarget(t as any)}
              >
                {t} ×
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="agent-id"
              value={targetInput}
              onChange={(e: any) => setTargetInput(e.target.value)}
              onKeyDown={(e: any) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTarget();
                }
              }}
            />
            <Button type="button" onClick={addTarget}>
              +
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-canon-text-light">
            Affordance ID
          </label>
          <Input
            value={event.affordanceId ?? ""}
            onChange={(e: any) =>
              update(
                "affordanceId",
                e.target.value || undefined
              )
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

// semantics

function SemanticsCard({ event, update }: BaseProps) {
  const [tagInput, setTagInput] = React.useState("");
  const [goalTagInput, setGoalTagInput] = React.useState("");
  const [factInput, setFactInput] = React.useState("");

  const addToList = (
    key: "tags" | "goalTags" | "facts",
    value: string
  ) => {
    const list = event[key] as string[];
    const v = value.trim();
    if (!v) return;
    if (list.includes(v)) return;
    update(key, [...list, v] as any);
  };

  const removeFromList = (
    key: "tags" | "goalTags" | "facts",
    value: string
  ) => {
    const list = event[key] as string[];
    update(
      key,
      list.filter((x) => x !== value) as any
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Семантика (tags, goals, facts)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {/* tags */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-canon-text-light">
            Tags
          </label>
          <div className="flex flex-wrap gap-1 mb-1">
            {event.tags.map((t) => (
              <Badge
                key={t}
                variant="outline"
                className="cursor-pointer"
                onClick={() => removeFromList("tags", t)}
              >
                {t} ×
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="attack / order / confession..."
              value={tagInput}
              onChange={(e: any) => setTagInput(e.target.value)}
              onKeyDown={(e: any) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addToList("tags", tagInput);
                  setTagInput("");
                }
              }}
            />
            <Button
              type="button"
              onClick={() => {
                addToList("tags", tagInput);
                setTagInput("");
              }}
            >
              +
            </Button>
          </div>
        </div>

        {/* goalTags */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-canon-text-light">
            Goal tags
          </label>
          <div className="flex flex-wrap gap-1 mb-1">
            {event.goalTags.map((t) => (
              <Badge
                key={t}
                variant="outline"
                className="cursor-pointer"
                onClick={() => removeFromList("goalTags", t)}
              >
                {t} ×
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="protect_ally / maintain_legitimacy..."
              value={goalTagInput}
              onChange={(e: any) => setGoalTagInput(e.target.value)}
              onKeyDown={(e: any) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addToList("goalTags", goalTagInput);
                  setGoalTagInput("");
                }
              }}
            />
            <Button
              type="button"
              onClick={() => {
                addToList("goalTags", goalTagInput);
                setGoalTagInput("");
              }}
            >
              +
            </Button>
          </div>
        </div>

        {/* facts */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-canon-text-light">
            Facts
          </label>
          <div className="flex flex-wrap gap-1 mb-1">
            {event.facts.map((t) => (
              <Badge
                key={t}
                variant="outline"
                className="cursor-pointer"
                onClick={() => removeFromList("facts", t)}
              >
                {t} ×
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="fact-id"
              value={factInput}
              onChange={(e: any) => setFactInput(e.target.value)}
              onKeyDown={(e: any) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addToList("facts", factInput);
                  setFactInput("");
                }
              }}
            />
            <Button
              type="button"
              onClick={() => {
                addToList("facts", factInput);
                setFactInput("");
              }}
            >
              +
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// effects

function EffectsCard({
  event,
  updateEffects,
}: {
  event: Event;
  updateEffects: (patch: Partial<Event["effects"]>) => void;
}) {
  const { effects } = event;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Эффекты</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="space-y-1">
          <label className="text-xs font-medium text-canon-text-light flex justify-between">
            Δ Tension
            <span className="text-[10px] text-canon-text-light">
              {(effects.tensionDelta ?? 0).toFixed(2)}
            </span>
          </label>
          <Slider
            value={[effects.tensionDelta ?? 0]}
            min={-1}
            max={1}
            step={0.01}
            onValueChange={([v]: any) =>
              updateEffects({ tensionDelta: v })
            }
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-canon-text-light">
            worldDelta / stateDelta / goalDelta (raw JSON)
          </label>
          <textarea
            className="w-full h-40 text-[10px] font-mono bg-black/20 rounded-md p-2 text-canon-text-light"
            value={JSON.stringify(effects, null, 2)}
            onChange={() => {
              // править эти поля лучше через отдельные инструменты;
              // здесь оставляем read-only визуализацию
            }}
            readOnly
          />
        </div>
      </CardContent>
    </Card>
  );
}

// epistemics

function EpistemicsCard({
  event,
  updateEpistemics,
}: {
  event: Event;
  updateEpistemics: (patch: Partial<Event["epistemics"]>) => void;
}) {
  const { epistemics } = event;
  const [witnessInput, setWitnessInput] = React.useState("");

  const addWitness = () => {
    const v = witnessInput.trim();
    if (!v) return;
    if (epistemics.witnesses.includes(v as any)) return;
    updateEpistemics({
      witnesses: [...epistemics.witnesses, v as any],
    });
    setWitnessInput("");
  };

  const removeWitness = (id: string) => {
    updateEpistemics({
      witnesses: epistemics.witnesses.filter((w) => w !== (id as any)),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Эпистемика</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="space-y-1">
          <label className="text-xs font-medium text-canon-text-light flex justify-between">
            Visibility
            <span className="text-[10px] text-canon-text-light">
              {epistemics.visibility.toFixed(2)}
            </span>
          </label>
          <Slider
            value={[epistemics.visibility]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={([v]: any) =>
              updateEpistemics({ visibility: v })
            }
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-canon-text-light">
            Witnesses
          </label>
          <div className="flex flex-wrap gap-1 mb-1">
            {epistemics.witnesses.map((w) => (
              <Badge
                key={w}
                variant="outline"
                className="cursor-pointer"
                onClick={() => removeWitness(w as any)}
              >
                {w} ×
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="agent-id"
              value={witnessInput}
              onChange={(e: any) => setWitnessInput(e.target.value)}
              onKeyDown={(e: any) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addWitness();
                }
              }}
            />
            <Button type="button" onClick={addWitness}>
              +
            </Button>
          </div>
        </div>

        <p className="text-[10px] text-canon-text-light/70">
          beliefByAgent лучше редактировать через отдельный ToM-инспектор;
          здесь оставляем только базовый уровень (visibility + witnesses).
        </p>
      </CardContent>
    </Card>
  );
}

// status

function StatusCard({ event, update }: BaseProps) {
  const lifecycleOptions: Event["lifecycleStage"][] = [
    "planned",
    "scheduled",
    "executing",
    "completed",
    "failed",
  ];

  const statusOptions: Event["status"][] = [
    "hypothetical",
    "committed",
    "cancelled",
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Статус и приоритет</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-canon-text-light">
              Lifecycle
            </label>
            <select
              className="w-full border border-canon-border rounded px-2 py-1 bg-canon-bg text-xs text-canon-text"
              value={event.lifecycleStage}
              onChange={(e) =>
                update(
                  "lifecycleStage",
                  e.target.value as Event["lifecycleStage"]
                )
              }
            >
              {lifecycleOptions.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-canon-text-light">
              Status
            </label>
            <select
              className="w-full border border-canon-border rounded px-2 py-1 bg-canon-bg text-xs text-canon-text"
              value={event.status}
              onChange={(e) =>
                update("status", e.target.value as Event["status"])
              }
            >
              {statusOptions.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-canon-text-light flex justify-between">
            Priority
            <span className="text-[10px] text-canon-text-light">
              {event.priority}
            </span>
          </label>
          <Slider
            value={[event.priority]}
            min={-10}
            max={10}
            step={1}
            onValueChange={([v]: any) => update("priority", v)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-canon-text-light">
            Order key
          </label>
          <Input
            value={event.orderKey ?? ""}
            onChange={(e: any) =>
              update(
                "orderKey",
                e.target.value || undefined
              )
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
