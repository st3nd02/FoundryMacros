import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTokenActor,
  resolveTokenReference
} from "../warhammer-40k-cogitator/scripts/token-actors.js";

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

test("resolves a v14 TokenDocument and its canvas placeable", async () => {
  const actor = { id: "synthetic" };
  const document = { id: "token-1", actor };
  const placeable = { id: "token-1", document, actor };
  document.object = placeable;

  const resolved = await resolveTokenReference("Scene.scene-1.Token.token-1", {
    fromUuid: async () => document,
    canvas: null,
    scenes: null,
    actors: null
  });

  assert.equal(resolved.document, document);
  assert.equal(resolved.placeable, placeable);
  assert.equal(resolved.actor, actor);
});

test("falls back from a stale UUID to the Scene TokenDocument", async () => {
  const actor = { id: "scene-actor" };
  const document = { id: "token-2", actor };
  const tokens = new Map([["token-2", document]]);
  const scenes = new Map([["scene-2", { tokens }]]);

  const resolved = await resolveTokenReference("Scene.scene-2.Token.token-2", {
    fromUuid: async () => null,
    canvas: null,
    scenes,
    actors: null
  });

  assert.equal(resolved.document, document);
  assert.equal(resolved.actor, actor);
});

test("falls back from a bare token ID to the active canvas placeable", async () => {
  const actor = { id: "canvas-actor" };
  const document = { id: "token-3", actor };
  const placeable = { id: "token-3", document, actor };
  const canvas = { tokens: new Map([["token-3", placeable]]) };

  const resolved = await resolveTokenReference("token-3", {
    fromUuid: async () => null,
    canvas,
    scenes: null,
    actors: null
  });

  assert.equal(resolved.placeable, placeable);
  assert.equal(resolved.actor, actor);
});
