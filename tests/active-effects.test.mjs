import assert from "node:assert/strict";
import test from "node:test";

globalThis.game = {
  release: { generation: 14 },
  version: "14.0",
  combat: {
    id: "combat-id",
    round: 4,
    turn: 2,
    turns: [
      { id: "combatant-a", actor: { id: "actor-a" }, initiative: 40 },
      { id: "combatant-b", actor: { id: "actor-b" }, initiative: 30 },
      { id: "combatant-c", actor: { id: "actor-c" }, initiative: 20 }
    ]
  }
};
globalThis.foundry = {
  documents: {
    ActiveEffect: {
      implementation: {
        getEffectStart: () => ({ combat: "combat-id", round: 4, turn: 2, time: 100 })
      }
    }
  }
};

const { incrementEffectCounter, readEffectCounter } = await import("../warhammer-40k-cogitator/scripts/active-effects.js");

test("uses the public Status Icon Counters API", async () => {
  const updates = [];
  const counterCalls = [];
  const effect = {
    duration: { remaining: 3, units: "rounds", expiry: "turnStart" },
    _source: { duration: { value: 3 } },
    update: async update => { updates.push(update); },
    statusCounter: {
      displayValue: 2,
      setValue: async value => { counterCalls.push(["value", value]); },
      setDuration: async value => { counterCalls.push(["duration", value]); }
    }
  };

  assert.equal(readEffectCounter(effect), 2);
  assert.deepEqual(await incrementEffectCounter(effect, 2), { value: 4, duration: 4 });
  assert.deepEqual(updates, [{
    "flags.statuscounter.config.type": "default",
    "flags.statuscounter.config.dataSource": "flags.statuscounter.value",
    "flags.statuscounter.config.modifyDuration": true
  }]);
  assert.deepEqual(counterCalls, [["value", 4], ["duration", 4]]);
});

test("writes the Foundry v14 duration schema when the counter API is unavailable", async () => {
  const updates = [];
  const effect = {
    duration: { remaining: null, units: null, expiry: null },
    _source: { duration: { value: 2 } },
    flags: { statusIconCounters: { counter: 3 } },
    update: async update => { updates.push(update); }
  };

  assert.equal(readEffectCounter(effect), 3);
  assert.deepEqual(await incrementEffectCounter(effect, 1), { value: 4, duration: 4 });
  assert.deepEqual(updates[1], {
    "flags.statuscounter.value": 4,
    "flags.statuscounter.visible": true,
    duration: { value: 4, units: "rounds", expired: false, expiry: "turnStart" },
    start: { combat: "combat-id", round: 4, turn: 2, time: 100 }
  });
});

test("preserves target-turn expiry for effects applied by the GM workflow", async () => {
  const updates = [];
  const counterCalls = [];
  const effect = {
    duration: { remaining: 1, units: "rounds", expiry: null },
    _source: { duration: { value: 1 } },
    update: async update => { updates.push(update); },
    statusCounter: {
      displayValue: 1,
      setValue: async value => { counterCalls.push(["value", value]); },
      setDuration: async value => { counterCalls.push(["duration", value]); }
    }
  };

  await incrementEffectCounter(effect, 2, { expiryActor: { id: "actor-b" } });
  assert.deepEqual(counterCalls, [["value", 3]]);
  assert.deepEqual(updates[1], {
    duration: { value: 3, units: "rounds", expired: false, expiry: "turnStart" },
    start: {
      combat: "combat-id",
      combatant: "combatant-b",
      initiative: 30,
      round: 5,
      turn: 1,
      time: 100
    }
  });
});

test("keeps the Foundry v13 fallback isolated from the v14 schema", async () => {
  game.release.generation = 13;
  const updates = [];
  const effect = {
    duration: { rounds: 2 },
    _source: { duration: { rounds: 2 } },
    flags: { statuscounter: { value: 1 } },
    update: async update => { updates.push(update); }
  };

  await incrementEffectCounter(effect, 2);
  assert.equal(updates[1]["duration.rounds"], 3);
  assert.equal(updates[1]["duration.startRound"], 4);
  assert.equal(updates[1]["duration.startTurn"], 2);
  assert.equal(updates[1].duration, undefined);
  game.release.generation = 14;
});
