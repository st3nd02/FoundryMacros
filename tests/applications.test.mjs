import assert from "node:assert/strict";
import test from "node:test";

class FakeDiv {
  constructor() {
    this.innerHTML = "";
    this.attributes = [];
    this.classList = {
      values: [],
      add: value => {
        this.classList.values.push(value);
        this.attributes.push({ name: "class", value });
      }
    };
  }
}

class FakeDialogV2 {
  constructor(options) {
    this.options = options;
    this.dialogContent = { scrollTop: 100 };
    this.element = {
      id: "dialog-root",
      querySelector: selector => selector === ".dialog-content" ? this.dialogContent : null
    };
    this.window = { content: { scrollTop: 100 } };
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
  assert.deepEqual(dialog.options.classes, ["warhammer-40k-cogitator-dialog-v2", "theme-light", "custom-class"]);
  assert.equal(dialog.options.content.innerHTML, "<input name=\"value\">");
  assert.equal(dialog.options.content.attributes.length, 0);
  assert.equal(dialog.options.buttons.length, 2);
  assert.equal(dialog.options.buttons[0].action, "accept");
  assert.equal(dialog.options.buttons[0].default, true);

  await dialog._onRender({}, {});
  assert.equal(renderHtml.element, dialog.element);
  assert.equal(dialog.dialogContent.scrollTop, 0);

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

test("uses a readable default width and preserves controls while removing legacy forms", () => {
  const dialog = new CogitatorDialogV2({
    content: "<form><h3>Skills</h3><select id=\"skill\"></select><h3>Operate</h3></form>",
    buttons: { close: { label: "Close" } }
  });

  assert.equal(dialog.options.position.width, 480);
  assert.doesNotMatch(dialog.options.content.innerHTML, /<\/?form\b/i);
  assert.match(dialog.options.content.innerHTML, /<h3>Skills<\/h3>/);
  assert.match(dialog.options.content.innerHTML, /<h3>Operate<\/h3>/);
});
