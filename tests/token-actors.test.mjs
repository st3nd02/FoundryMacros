import assert from "node:assert/strict";
import test from "node:test";

import { resolveTokenActor } from "../warhammer-40k-cogitator/scripts/token-actors.js";

test("resolves actors from Token and TokenDocument shapes", () => {
  const directActor = { id: "direct" };
  const baseActor = { id: "base" };

  assert.equal(resolveTokenActor({ actor: directActor }), directActor);
  assert.equal(resolveTokenActor({ actor: null, baseActor }), baseActor);
  assert.equal(resolveTokenActor({ document: { actor: directActor } }), directActor);
});

test("falls back to the world actor collection and safely returns null", () => {
  const worldActor = { id: "world" };
  const actors = new Map([["world", worldActor]]);

  assert.equal(resolveTokenActor({ document: { actorId: "world" } }, actors), worldActor);
  assert.equal(resolveTokenActor({ document: { _source: { actorId: "missing" } } }, actors), null);
  assert.equal(resolveTokenActor(null, actors), null);
});
