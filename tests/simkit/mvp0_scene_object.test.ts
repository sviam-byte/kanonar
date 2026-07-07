// tests/simkit/mvp0_scene_object.test.ts
//
// I-1.1 (scene) + I-1.2 (object v0) contracts.
//
// A4 PROTO-PREDICTION (frozen with this file, BEFORE the observation runs):
// ablating the object REMOVES take from the first-tick menu (≥1 candidate
// disappears) for both agents. Direction of any outcome shift is NOT graded
// here — thresholds and outcome-level A4 belong to I-2.

import { describe, it, expect } from 'vitest';
import { makeMvp0World, MVP0_AGENT_A, MVP0_AGENT_B, MVP0_LOCATION_ID, MVP0_OBJECT_ID } from '../../lib/simkit/scenarios/mvp0Scene';
import { proposeActions, applyAction } from '../../lib/simkit/core/rules';
import { objectFactKey, listObjectsV0 } from '../../lib/simkit/actions/objectSpec';
import { removeObjectTransform } from '../../lib/simkit/mvp0/runTwins';
import { cloneWorld } from '../../lib/simkit/core/world';

describe('mvp0 scene (I-1.1)', () => {
  it('builds: both agents placed in the location, object on the floor, menu non-empty', () => {
    const world = makeMvp0World(1);
    expect(world.characters[MVP0_AGENT_A]?.locId).toBe(MVP0_LOCATION_ID);
    expect(world.characters[MVP0_AGENT_B]?.locId).toBe(MVP0_LOCATION_ID);

    const objects = listObjectsV0(world);
    expect(objects).toHaveLength(1);
    expect(objects[0]).toEqual({ objId: MVP0_OBJECT_ID, state: { holderId: null, locId: MVP0_LOCATION_ID } });

    const offers = proposeActions(world);
    for (const id of [MVP0_AGENT_A, MVP0_AGENT_B]) {
      const menu = offers.filter((o) => o.actorId === id && !o.blocked);
      expect(menu.length, `menu of ${id}`).toBeGreaterThan(0);
      expect(menu.some((o) => o.kind === 'take'), `take offered to ${id}`).toBe(true);
    }
  });

  it('is deterministic: same seed ⇒ identical world', () => {
    expect(JSON.stringify(makeMvp0World(3))).toBe(JSON.stringify(makeMvp0World(3)));
  });
});

describe('object v0 (I-1.2)', () => {
  it('A4 menu proto: object ablation removes take from the menu (≥1 candidate disappears)', () => {
    const world = makeMvp0World(1);
    const ablated = removeObjectTransform(MVP0_OBJECT_ID)(world);

    const withObj = proposeActions(world);
    const withoutObj = proposeActions(ablated);
    for (const id of [MVP0_AGENT_A, MVP0_AGENT_B]) {
      const before = withObj.filter((o) => o.actorId === id && !o.blocked);
      const after = withoutObj.filter((o) => o.actorId === id && !o.blocked);
      expect(before.some((o) => o.kind === 'take')).toBe(true);
      expect(after.some((o) => o.kind === 'take')).toBe(false);
      expect(after.length).toBeLessThan(before.length);
    }
  });

  it('take: holder becomes the actor, obj:transfer emitted (objectId inferred without meta)', () => {
    const world = makeMvp0World(1);
    const { events } = applyAction(world, {
      id: 'act:take:test',
      kind: 'take',
      actorId: MVP0_AGENT_A,
      targetId: null,
    });
    expect((world.facts as any)[objectFactKey(MVP0_OBJECT_ID)]).toEqual({
      holderId: MVP0_AGENT_A,
      locId: MVP0_LOCATION_ID,
    });
    const transfer = events.find((e) => e.type === 'obj:transfer');
    expect(transfer?.payload).toMatchObject({ kind: 'take', objectId: MVP0_OBJECT_ID, toId: MVP0_AGENT_A });
  });

  it('holding changes the menu: holder loses take, gains give; the other gains seize', () => {
    const world = makeMvp0World(1);
    (world.facts as any)[objectFactKey(MVP0_OBJECT_ID)] = { holderId: MVP0_AGENT_A, locId: MVP0_LOCATION_ID };

    const offers = proposeActions(world);
    const menuA = offers.filter((o) => o.actorId === MVP0_AGENT_A && !o.blocked);
    const menuB = offers.filter((o) => o.actorId === MVP0_AGENT_B && !o.blocked);

    expect(menuA.some((o) => o.kind === 'take')).toBe(false);
    expect(menuA.some((o) => o.kind === 'give' && o.targetId === MVP0_AGENT_B)).toBe(true);
    expect(menuB.some((o) => o.kind === 'seize' && o.targetId === MVP0_AGENT_A)).toBe(true);
    expect(menuB.some((o) => o.kind === 'give')).toBe(false);
  });

  it('seize: ownership flips, obj:transfer emitted, victim stress rises', () => {
    const world = makeMvp0World(1);
    (world.facts as any)[objectFactKey(MVP0_OBJECT_ID)] = { holderId: MVP0_AGENT_A, locId: MVP0_LOCATION_ID };
    const stressBefore = world.characters[MVP0_AGENT_A].stress;

    const { events } = applyAction(world, {
      id: 'act:seize:test',
      kind: 'seize',
      actorId: MVP0_AGENT_B,
      targetId: MVP0_AGENT_A,
    });

    expect((world.facts as any)[objectFactKey(MVP0_OBJECT_ID)].holderId).toBe(MVP0_AGENT_B);
    const transfer = events.find((e) => e.type === 'obj:transfer');
    expect(transfer?.payload).toMatchObject({
      kind: 'seize',
      objectId: MVP0_OBJECT_ID,
      fromId: MVP0_AGENT_A,
      toId: MVP0_AGENT_B,
    });
    expect(world.characters[MVP0_AGENT_A].stress).toBeGreaterThan(stressBefore);
  });

  it('give: transfers to the recipient in range and emits obj:transfer', () => {
    const world = makeMvp0World(1);
    (world.facts as any)[objectFactKey(MVP0_OBJECT_ID)] = { holderId: MVP0_AGENT_A, locId: MVP0_LOCATION_ID };

    const { events } = applyAction(world, {
      id: 'act:give:test',
      kind: 'give',
      actorId: MVP0_AGENT_A,
      targetId: MVP0_AGENT_B,
    });

    expect((world.facts as any)[objectFactKey(MVP0_OBJECT_ID)].holderId).toBe(MVP0_AGENT_B);
    expect(events.find((e) => e.type === 'obj:transfer')?.payload).toMatchObject({
      kind: 'give',
      fromId: MVP0_AGENT_A,
      toId: MVP0_AGENT_B,
    });
  });

  it('apply is deterministic on cloned worlds', () => {
    const w1 = makeMvp0World(2);
    const w2 = cloneWorld(w1);
    const act = { id: 'act:take:d', kind: 'take' as const, actorId: MVP0_AGENT_B, targetId: null };
    applyAction(w1, { ...act });
    applyAction(w2, { ...act });
    expect(JSON.stringify(w1.facts[objectFactKey(MVP0_OBJECT_ID)])).toBe(
      JSON.stringify(w2.facts[objectFactKey(MVP0_OBJECT_ID)]),
    );
  });
});
