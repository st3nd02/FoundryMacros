import assert from "node:assert/strict";
import test from "node:test";

class FakeApplicationV2 {}
class FakeDialogV2 extends FakeApplicationV2 {}

const onceHooks = [];
globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: FakeApplicationV2,
      DialogV2: FakeDialogV2,
      HandlebarsApplicationMixin: Base => class extends Base {}
    }
  }
};
globalThis.Hooks = {
  once: (name, callback) => { onceHooks.push([name, callback]); },
  on: () => {}
};

await import("../warhammer-40k-cogitator/scripts/main.js");

test("the complete v14 ES-module graph loads and registers its lifecycle hooks", () => {
  assert.deepEqual(onceHooks.map(([name]) => name), ["init", "ready"]);
  assert.ok(onceHooks.every(([, callback]) => typeof callback === "function"));
});
