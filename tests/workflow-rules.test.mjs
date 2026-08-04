import assert from "node:assert/strict";
import test from "node:test";

import { calculateSprayHordeBaseMagnitude } from "../warhammer-40k-cogitator/scripts/horde-rules.js";
import {
  getAvailablePrecognitiveDefenses,
  getPrecognitiveDefenseName,
  isPrecognitiveDefense
} from "../warhammer-40k-cogitator/scripts/precognitive-defense.js";

test("offers the one precognitive defense power owned by a psyker", () => {
  const forebodingActor = {
    system: { psy: { rating: 3 } },
    items: [{ type: "psychicPower", name: "Foreboding" }]
  };
  const precognitiveDodgeActor = {
    system: { psy: { rating: 2 } },
    items: [{ type: "psychicPower", name: "Precognitive Dodge" }]
  };

  assert.deepEqual(getAvailablePrecognitiveDefenses(forebodingActor).map(option => option.type), ["foreboding"]);
  assert.deepEqual(getAvailablePrecognitiveDefenses(precognitiveDodgeActor).map(option => option.type), ["precognitiveDodge"]);
  assert.equal(isPrecognitiveDefense("foreboding"), true);
  assert.equal(isPrecognitiveDefense("precognitiveDodge"), true);
  assert.equal(getPrecognitiveDefenseName("precognitiveDodge"), "Precognitive Dodge");
});

test("does not offer psychic defenses without a positive psy rating", () => {
  const actor = {
    system: { psy: { rating: 0 } },
    items: [{ type: "psychicPower", name: "Precognitive Dodge" }]
  };
  assert.deepEqual(getAvailablePrecognitiveDefenses(actor), []);
});

test("calculates Spray Horde base magnitude as 1d5 plus one quarter range", () => {
  assert.deepEqual(calculateSprayHordeBaseMagnitude({ weaponRange: 20, d5Roll: 3 }), {
    d5Roll: 3,
    rangeBonus: 5,
    baseMagnitudeHits: 8
  });
  assert.deepEqual(calculateSprayHordeBaseMagnitude({ weaponRange: 10, d5Roll: 2 }), {
    d5Roll: 2,
    rangeBonus: 3,
    baseMagnitudeHits: 5
  });
});
