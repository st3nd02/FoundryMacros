const { DialogV2 } = foundry.applications.api;

const POSITION_KEYS = ["top", "left", "width", "height", "scale", "zIndex"];

function normalizePosition(...sources) {
  const position = {};
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const key of POSITION_KEYS) {
      if (source[key] !== undefined) position[key] = source[key];
    }
    if (source.position && typeof source.position === "object") {
      for (const key of POSITION_KEYS) {
        if (source.position[key] !== undefined) position[key] = source.position[key];
      }
    }
  }
  return position;
}

function normalizeClasses(classes) {
  if (Array.isArray(classes)) return classes.filter(Boolean);
  if (typeof classes === "string") return classes.split(/\s+/).filter(Boolean);
  return [];
}

function createTrustedDialogContent(content) {
  const container = document.createElement("div");
  container.innerHTML = content instanceof HTMLDivElement
    ? content.innerHTML
    : String(content ?? "");
  return container;
}

function asLegacyHtml(dialog) {
  const jquery = globalThis.jQuery ?? globalThis.$;
  if (typeof jquery !== "function") {
    throw new Error("Warhammer 40k Cogitator requires Foundry's bundled jQuery compatibility layer for migrated dialog callbacks.");
  }
  return jquery(dialog.element);
}

/**
 * ApplicationV2-backed replacement for the legacy Dialog constructor.
 *
 * Existing workflow callbacks retain their jQuery contract at this one boundary,
 * keeping rules behavior stable while every rendered window moves to DialogV2.
 */
export class CogitatorDialogV2 extends DialogV2 {
  constructor(data = {}, applicationOptions = {}) {
    const buttons = Object.entries(data.buttons ?? {}).map(([action, legacyButton]) => {
      const button = {
        action,
        label: legacyButton.label ?? action,
        default: action === data.default
      };

      for (const key of ["icon", "class", "style", "type", "disabled", "tooltip"]) {
        if (legacyButton[key] !== undefined) button[key] = legacyButton[key];
      }

      if (typeof legacyButton.callback === "function") {
        button.callback = (_event, _button, dialog) => legacyButton.callback(asLegacyHtml(dialog));
      }
      return button;
    });

    const options = {
      classes: [
        "warhammer-40k-cogitator-dialog-v2",
        ...normalizeClasses(applicationOptions.classes)
      ],
      window: {
        title: data.title ?? "Warhammer 40k Cogitator",
        resizable: applicationOptions.resizable ?? false
      },
      position: normalizePosition(applicationOptions),
      content: createTrustedDialogContent(data.content),
      buttons,
      modal: data.modal ?? false
    };

    if (applicationOptions.id) options.id = applicationOptions.id;
    super(options);

    this._cogitatorLegacyRender = typeof data.render === "function" ? data.render : null;
    this._cogitatorLegacyClose = typeof data.close === "function" ? data.close : null;
    this._cogitatorLegacyHtml = null;
    this._cogitatorCloseHandled = false;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._cogitatorLegacyHtml = asLegacyHtml(this);
    await this._cogitatorLegacyRender?.(this._cogitatorLegacyHtml);
  }

  _onClose(options) {
    try {
      super._onClose(options);
    } finally {
      if (!this._cogitatorCloseHandled) {
        this._cogitatorCloseHandled = true;
        this._cogitatorLegacyClose?.(this._cogitatorLegacyHtml);
      }
    }
  }

  render(force = true, legacyOptions = {}) {
    const renderOptions = typeof force === "object"
      ? { ...force }
      : { force: Boolean(force) };
    const position = normalizePosition(legacyOptions, renderOptions);
    if (Object.keys(position).length) renderOptions.position = position;
    return super.render(renderOptions);
  }
}
