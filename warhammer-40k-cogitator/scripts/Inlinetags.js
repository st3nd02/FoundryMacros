const OUTLINED_TARGET_STYLE = "font-weight:700;color:#3aa0ff;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;";
const OUTLINED_ROLL_STYLE = "font-weight:700;color:#ff9f1a;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;";

export const CHARACTERISTIC_TEST_TAGS = Object.freeze({
  wstest: "Weapon Skill",
  bstest: "Ballistic Skill",
  strtest: "Strength",
  agtest: "Agility",
  tgtest: "Toughness",
  inttest: "Intelligence",
  pertest: "Perception",
  wptest: "Willpower",
  feltest: "Fellowship"
});

export const EFFECT_TAGS = Object.freeze({
  fire: "On Fire",
  bleed: "Bleeding",
  bleeding: "Bleeding",
  prone: "Prone",
  stunned: "Stunned",
  unconscious: "Unconscious",
  pinned: "Pinned",
  grappled: "Grappled",
  deafened: "Deafened",
  blinded: "Blinded",
  fear: "Fear",
  dead: "Dead"
});

export const CHARACTERISTIC_VALUE_TAGS = Object.freeze({
  WS: "Weapon Skill",
  BS: "Ballistic Skill",
  STR: "Strength",
  AG: "Agility",
  TG: "Toughness",
  INT: "Intelligence",
  PER: "Perception",
  WP: "Willpower",
  FEL: "Fellowship"
});

export const INLINE_TEST_TAG_REGEX = /\[\[(wstest|bstest|strtest|agtest|tgtest|inttest|pertest|wptest|feltest):([+-]?\d+)\]\]/gi;
export const INLINE_EFFECT_TAG_REGEX = /\[\[tag:([a-z][a-z0-9_-]*)\]\]/gi;
export const INLINE_VALUE_EFFECT_TAG_REGEX = /\[\[tag:(Fatigue|Wounds|Meters|WS|BS|STR|AG|TG|INT|PER|WP|FEL)\(([-+]?[^\]()]+)\)\]\]/gi;

export function getInlineTestLabel(testKey) {
  return CHARACTERISTIC_TEST_TAGS[String(testKey ?? "").toLowerCase()] ?? null;
}

export function formatSignedModifier(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? "0");
  if (num > 0) return `+${num}`;
  if (num < 0) return `${num}`;
  return "+0";
}

export function formatInlineTestPlaceholder(testKey, modifier) {
  const label = getInlineTestLabel(testKey);
  if (!label) return null;
  const modText = formatSignedModifier(modifier);
  return `(${label} Test (${modText}): <span style="${OUTLINED_TARGET_STYLE}">Roll Target</span> vs <span style="${OUTLINED_ROLL_STYLE}">Roll Result</span>)`;
}

export function parseInlineTags(text) {
  const source = String(text ?? "");
  const tests = [];
  const effects = [];
  const values = [];

  for (const match of source.matchAll(new RegExp(INLINE_TEST_TAG_REGEX.source, "gi"))) {
    tests.push({
      raw: match[0],
      tag: String(match[1]).toLowerCase(),
      characteristic: getInlineTestLabel(match[1]),
      modifier: Number(match[2]),
      formattedModifier: formatSignedModifier(match[2]),
      preview: formatInlineTestPlaceholder(match[1], match[2])
    });
  }

  for (const match of source.matchAll(new RegExp(INLINE_EFFECT_TAG_REGEX.source, "gi"))) {
    effects.push({
      raw: match[0],
      tag: String(match[1]).toLowerCase(),
      effectName: EFFECT_TAGS[String(match[1]).toLowerCase()] ?? null
    });
  }

  for (const match of source.matchAll(new RegExp(INLINE_VALUE_EFFECT_TAG_REGEX.source, "gi"))) {
    const keyword = String(match[1]);
    const amount = String(match[2]).trim();
    values.push({
      raw: match[0],
      keyword,
      amount,
      acceptsDice: true,
      acceptsSignedValues: true,
      characteristicName: CHARACTERISTIC_VALUE_TAGS[keyword.toUpperCase()] ?? null
    });
  }

  return { tests, effects, values };
}

export function applyInlineTestPlaceholders(text) {
  return String(text ?? "").replace(new RegExp(INLINE_TEST_TAG_REGEX.source, "gi"), (full, key, mod) => {
    return formatInlineTestPlaceholder(key, mod) ?? full;
  });
}
