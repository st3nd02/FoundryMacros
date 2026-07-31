import assert from "node:assert/strict";
import test from "node:test";

class FakeDiv {
  constructor() {
    this.innerHTML = "";
    this.classList = { values: [], add: value => this.classList.values.push(value) };
  }
}

class FakeDialogV2 {
  constructor(options) {
    this.options = options;
    this.element = { id: "dialog-root" };
  }

  async _onRender() {}

  _onClose() {}

  render(options) {
    this.renderOptions = options;
    return Promise.resolve(this);
  }
}

globalThis.HTMLDivElement = FakeDiv;
globalThis.document = { createElement: () => new FakeDiv() };
globalThis.foundry = { applications: { api: { DialogV2: FakeDialogV2 } } };
globalThis.jQuery = element => ({ jquery: true, element });

const { CogitatorDialogV2 } = await import("../warhammer-40k-cogitator/scripts/applications.js");

test("maps legacy dialog configuration to a real DialogV2", async () => {
  let buttonHtml;
  let renderHtml;
  let closeHtml;
  const dialog = new CogitatorDialogV2({
    title: "Test Dialog",
    content: "<form><input name=\"value\"></form>",
    buttons: {
      accept: { label: "Accept", callback: html => { buttonHtml = html; } },
      cancel: { label: "Cancel" }
    },
    default: "accept",
    render: html => { renderHtml = html; },
    close: html => { closeHtml = html; }
  }, { width: 420, classes: ["custom-class"] });

  assert.ok(dialog instanceof FakeDialogV2);
  assert.equal(dialog.options.window.title, "Test Dialog");
  assert.equal(dialog.options.position.width, 420);
  assert.deepEqual(dialog.options.classes, ["warhammer-40k-cogitator-dialog-v2", "custom-class"]);
  assert.equal(dialog.options.content.innerHTML, "<form><input name=\"value\"></form>");
  assert.equal(dialog.options.buttons.length, 2);
  assert.equal(dialog.options.buttons[0].action, "accept");
  assert.equal(dialog.options.buttons[0].default, true);

  await dialog._onRender({}, {});
  assert.equal(renderHtml.element, dialog.element);

  await dialog.options.buttons[0].callback({}, {}, dialog);
  assert.equal(buttonHtml.element, dialog.element);

  await dialog.render(true, { width: 800, height: 600 });
  assert.deepEqual(dialog.renderOptions, {
    force: true,
    position: { width: 800, height: 600 }
  });

  dialog._onClose({});
  dialog._onClose({});
  assert.equal(closeHtml.element, dialog.element);
});
