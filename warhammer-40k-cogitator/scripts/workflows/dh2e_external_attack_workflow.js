export async function runAttackWorkflow() {
/**
 * DH2e External Attack Workflow (Foundry V13)
 * Version: 1.1
 * V13-safe flow:
 * 1) Attacker dialog (Attack) -> immediately rolls attack and creates workflow chat card.
 * 2) Defense dialogs per target with allocated hits.
 * 3) Damage dialog for attacker to roll per-target damage.
 */
try {
const WORKFLOW_NS = "warhammer-40k-cogitator";
const WORKFLOW_KEY = "dh2eExternalWorkflow";
const DOUBLE_TAP_TARGET_FLAG = "doubleTapEligibleTargetUuid";

const createTalentModifierState = () => ({
  attack: { attackRoll: 0, penetration: 0, damage: 0, defense: 0, notes: [] },
  defense: { attackRoll: 0, penetration: 0, damage: 0, defense: 0, notes: [] },
  damage: { attackRoll: 0, penetration: 0, damage: 0, defense: 0, notes: [] },
  applyDamage: { attackRoll: 0, penetration: 0, damage: 0, defense: 0, notes: [] }
});

const controlled = canvas.tokens.controlled;
if (!controlled.length) return ui.notifications.warn("Select your attacker token first.");

const attackerToken = controlled[0];
const attacker = attackerToken.actor;
if (!attacker) return ui.notifications.warn("Attacker token has no actor.");

const pendingMirrorSetup = game.warhammer40kCogitator?.consumePendingAttackContext?.() ?? null;

const updateUserTokenTargets = tokenIds => {
  if (typeof game.user?.updateTokenTargets === "function") {
    game.user.updateTokenTargets(tokenIds);
    return;
  }

  for (const existing of Array.from(game.user?.targets ?? [])) {
    existing.setTarget(false, { user: game.user, releaseOthers: false, groupSelection: true });
  }

  for (const tokenId of tokenIds) {
    const token = canvas.tokens?.get(tokenId);
    if (!token) continue;
    token.setTarget(true, { user: game.user, releaseOthers: false, groupSelection: true });
  }
};

if (pendingMirrorSetup?.targetTokenIds?.length) {
  updateUserTokenTargets(pendingMirrorSetup.targetTokenIds);
}
let targetTokens = Array.from(game.user.targets ?? []);
if (!targetTokens.length) return ui.notifications.warn("Select at least one target token.");

const weapons = attacker.items.filter(i => i.type === "weapon");
if (!weapons.length) return ui.notifications.warn("No weapons found on attacker.");

const meleeModes = {
  standard: { label: "Standard (+10)", mod: 10 },
  swift: { label: "Swift (+0)", mod: 0 },
  lightning: { label: "Lightning (-10)", mod: -10 },
  charge: { label: "Charge (+20)", mod: 20 },
  called: { label: "Called Shot (-20)", mod: -20 },
  allout: { label: "All Out (+30)", mod: 30 },
  guarded: { label: "Guarded (-10)", mod: -10 }
};

const rangedModes = {
  single: { label: "Single Shot (+10)", mod: 10 },
  semi: { label: "Semi-Auto (+0)", mod: 0 },
  full: { label: "Full-Auto (-10)", mod: -10 },
  suppressSemi: { label: "Suppressing Semi (-20)", mod: -20 },
  suppressFull: { label: "Suppressing Full (-20)", mod: -20 },
  called: { label: "Called Shot (-20)", mod: -20 }
};

const getAvailableRangedModeKeys = weaponDoc => {
  const rof = weaponDoc?.system?.rateOfFire ?? {};
  const single = Number(rof.single ?? rof.singleShot ?? rof.s ?? 0);
  const burst = Number(rof.burst ?? rof.semi ?? 0);
  const full = Number(rof.full ?? rof.auto ?? 0);
  const available = [];

  if (single > 0 || (burst <= 0 && full <= 0)) {
    available.push("single", "called");
  }
  if (burst > 0) {
    available.push("semi", "suppressSemi");
  }
  if (full > 0) {
    available.push("full", "suppressFull");
  }

  return available.length ? available : ["single", "called"];
};

const RANGE_BANDS = [
  { label: "Point Blank (+30)", mod: 30 },
  { label: "Short (+10)", mod: 10 },
  { label: "Normal (+0)", mod: 0 },
  { label: "Long (-10)", mod: -10 },
  { label: "Extreme (-30)", mod: -30 },
  { label: "Out of Range", mod: -999 }
];

const POWER_MODES = {
  1: { label: "Normal", multiplier: 1 },
  2: { label: "Overcharge", multiplier: 2 },
  3: { label: "Maximal", multiplier: 3 },
  4: { label: "Overload", multiplier: 4 }
};

const POWER_MODE_OPTIONS_BY_TYPE = {
  las: [1, 2, 4],
  plasma: [1, 3]
};

const hasTalent = (actorDoc, needle) =>
  actorDoc.items.some(i => i.type === "talent" && i.name.toLowerCase().includes(needle.toLowerCase()));

const MOD_ITEM_TYPES = ["weaponModification", "gear", "tool"];

const findItemByName = (actorDoc, name) =>
  actorDoc.items.find(i =>
    MOD_ITEM_TYPES.includes(i.type) &&
    (
      i.name.toLowerCase() === name.toLowerCase() ||
      i.name.toLowerCase().includes(`(${name.toLowerCase()})`)
    )
  );

const itemAppliesToWeapon = (item, weapon) => {
  if (!item?.system?.upgrades) return false;
  return String(item.system.upgrades).toLowerCase().includes(weapon.name.toLowerCase());
};

const detectWeaponItems = (actorDoc, weapon) => {
  const map = {
    grip: "Custom Grip",
    fluid: "Fluid Action",
    stock: "Modified Stock",
    motion: "Motion Predictor",
    reddot: "Red-Dot Laser Sight",
    targeter: "Targeter",
    scope: "Telescopic Sight",
    omni: "Omni-Scope"
  };

  const out = {};
  for (const [k, n] of Object.entries(map)) {
    const item = findItemByName(actorDoc, n);
    out[k] = !!(item && itemAppliesToWeapon(item, weapon));
  }
  return out;
};

const presentWeaponItems = detected => {
  const labels = {
    grip: "Custom Grip",
    fluid: "Fluid Action",
    stock: "Modified Stock",
    motion: "Motion Predictor",
    reddot: "Red-Dot Laser Sight",
    targeter: "Targeter",
    scope: "Telescopic Sight",
    omni: "Omni-Scope"
  };
  const present = Object.entries(detected).filter(([, v]) => v).map(([k]) => labels[k]);
  return present.length ? present : ["None"];
};

const parseWeaponTraits = weapon =>
  (weapon.system.special ?? "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
const hasTrait = (traits, key) => traits.some(t => t.includes(key));
const hasWeaponSpecial = (weapon, keyword) => String(weapon?.system?.special ?? "").toLowerCase().includes(String(keyword).toLowerCase());
const parseTraitNumber = (traits, key, fallback = 0) => {
  const trait = traits.find(t => t.includes(key));
  if (!trait) return fallback;
  const match = trait.match(/\((\d+)\)/);
  return match ? Number(match[1]) : fallback;
};

const getWeaponPenetration = weaponDoc => {
  const penData = weaponDoc?.system?.penetration;
  if (typeof penData === "number") return penData;
  if (typeof penData === "string") {
    const parsed = Number(penData);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (penData && typeof penData === "object") {
    const parsed = Number(penData.value ?? penData.total ?? penData.base ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const getHordeBonusFromMagnitude = magnitude => {
  const value = Number(magnitude ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, Math.min(60, Math.floor(value / 10) * 10));
};

const getHordeMagnitudeValue = actorDoc => {
  if (!actorDoc) return 0;
  const maxWounds = Number(actorDoc.system?.wounds?.max ?? 0);
  const currentWounds = Number(actorDoc.system?.wounds?.value ?? 0);
  const value = maxWounds - currentWounds;
  return Number.isFinite(value) && value >= 0 ? value : 0;
};

const animatedRoll = async formula => {
  const roll = await new Roll(formula).evaluate();
  if (game.dice3d?.showForRoll) {
    await game.dice3d.showForRoll(roll, game.user, true);
  }
  return roll;
};

const rollAgilityEvasionTest = async actorDoc => {
  const ag = Number(actorDoc?.system?.characteristics?.agility?.total ?? 0);
  const target = Math.max(1, ag);
  const roll = await animatedRoll("1d100");
  const success = roll.total === 1 ? true : (roll.total === 100 ? false : roll.total <= target);
  const ab = Number(actorDoc?.system?.characteristics?.agility?.bonus ?? 0);
  return { target, roll: roll.total, success, evadeMeters: ab };
};

const getHitLocation = rollValue => {
  const reversed = Number(String(rollValue).padStart(2, "0").split("").reverse().join(""));
  if (reversed <= 10) return "Head";
  if (reversed <= 20) return "Right Arm";
  if (reversed <= 30) return "Left Arm";
  if (reversed <= 70) return "Body";
  if (reversed <= 85) return "Right Leg";
  return "Left Leg";
};

const getSizeModifier = targetActor => {
  const traits = targetActor?.items?.filter(i => i.type === "trait")?.map(i => i.name.toLowerCase()) ?? [];
  const hasBlackCarapace = traits.some(t => t.includes("black carapace"));
  const sizeTrait = traits.find(t => t.startsWith("size"));
  if (!sizeTrait) return { mod: 0, label: "Normal", ignored: false, sizeValue: 4 };
  const match = sizeTrait.match(/size\s*\((\d+)\)/);
  if (!match) return { mod: 0, label: "Normal", ignored: false, sizeValue: 4 };

  const table = {
    1: { mod: -30, label: "Miniscule" }, 2: { mod: -20, label: "Puny" }, 3: { mod: -10, label: "Scrawny" },
    4: { mod: 0, label: "Normal" }, 5: { mod: 10, label: "Hulking" }, 6: { mod: 20, label: "Enormous" },
    7: { mod: 30, label: "Massive" }, 8: { mod: 40, label: "Immense" }, 9: { mod: 50, label: "Monumental" },
    10: { mod: 60, label: "Titanic" }
  };
  const data = table[Number(match[1])] ?? { mod: 0, label: "Normal" };
  if (hasBlackCarapace) return { mod: 0, label: data.label, ignored: true, sizeValue: Number(match[1]) };
  return { mod: data.mod, label: data.label, ignored: false, sizeValue: Number(match[1]) };
};

const getNormalRangeForWeapon = weapon => {
  const isMelee = (weapon.system.class ?? "").toLowerCase() === "melee";
  if (isMelee) return 1;
  const traits = parseWeaponTraits(weapon);
  if (hasTrait(traits, "grenade")) {
    const sb = attacker.system.characteristics.strength?.bonus ?? 0;
    return sb * 3;
  }
  return Number(weapon.system.range ?? 0);
};

const getAutoRangeBand = (distanceMeters, normalRange, isMelee) => {
  if (isMelee) return 0;
  if (distanceMeters <= 3) return 30;
  if (distanceMeters <= normalRange / 2) return 10;
  if (distanceMeters <= normalRange) return 0;
  if (distanceMeters <= normalRange * 2) return -10;
  if (distanceMeters <= normalRange * 3) return -30;
  return -999;
};

const allocateHits = ({ totalHits, modeKey, targets, rof, storm }) => {
  const byTarget = new Map(targets.map(t => [t.tokenUuid, 0]));
  if (totalHits <= 0 || !targets.length) return byTarget;

  const hitStep = storm ? 2 : 1;
  let remaining = totalHits;
  let idx = 0;

  while (remaining > 0) {
    const t = targets[idx % targets.length];
    const assign = Math.min(hitStep, remaining);
    byTarget.set(t.tokenUuid, (byTarget.get(t.tokenUuid) ?? 0) + assign);
    idx += 1;
    remaining -= assign;
  }

  return byTarget;
};

const getCraftData = weapon => {
  const craft = (weapon.system.craftsmanship ?? "Common").toLowerCase();
  return {
    name: craft,
    meleeBonus: craft === "poor" ? -10 : craft === "good" ? 5 : craft === "best" ? 10 : 0,
    meleeBestDamageBonus: craft === "best" ? 1 : 0,
    rangedPoor: craft === "poor",
    rangedGood: craft === "good",
    rangedBest: craft === "best",
    label: craft.charAt(0).toUpperCase() + craft.slice(1)
  };
};

const computeJam = ({ result, targetNumber, weapon, traits }) => {
  const isMelee = (weapon.system.class ?? "").toLowerCase() === "melee";
  if (isMelee) return false;

  const craft = getCraftData(weapon);
  let reliable = hasTrait(traits, "reliable");
  let unreliable = hasTrait(traits, "unreliable");

  if (craft.rangedGood || craft.rangedBest) {
    unreliable = false;
    if (!reliable) reliable = true;
  }

  let jamLow = 95;
  if (reliable) jamLow = 100;
  if (unreliable) jamLow = 91;

  if (craft.rangedBest) jamLow = 100;

  return result >= jamLow;
};

const rollScatterData = async speaker => {
  const dist = (await animatedRoll("1d5", speaker)).total;
  const dir = (await animatedRoll("1d10", speaker)).total;
  const map = {
    1: { arrow: "↖", label: "NW" },
    2: { arrow: "↑", label: "N" },
    3: { arrow: "↗", label: "NE" },
    4: { arrow: "←", label: "W" },
    5: { arrow: "→", label: "E" },
    6: { arrow: "↙", label: "SW" },
    7: { arrow: "↙", label: "SW" },
    8: { arrow: "↓", label: "S" },
    9: { arrow: "↘", label: "SE" },
    10: { arrow: "↘", label: "SE" }
  };
  return { dist, ...(map[dir] ?? { arrow: "?", label: "?" }) };
};

const rollGrenadeDamageTotal = async (weapon, speaker) => {
  const formula = String(weapon.system.damage ?? "").trim();
  if (!formula) return null;
  const roll = await animatedRoll(formula, speaker);
  return roll.total;
};

const promptAttackFateReroll = async ({ actorDoc, rollValue, bestTN }) => {
  const fate = actorDoc.system.fate?.value ?? 0;
  if (fate <= 0) return false;

  return new Promise(resolve => {
    new Dialog({
      title: "Spend Fate?",
      content: `<p><b>Attack Missed!</b></p>
                <p>Attack Roll: <b>${rollValue}</b> vs Target <b>${bestTN}</b></p>
                <p>Spend 1 Fate Point to reroll?</p>
                <p>Remaining Fate: <b>${fate}</b></p>`,
      buttons: {
        yes: { label: "Reroll (-1 Fate)", callback: () => resolve(true) },
        no: { label: "Keep Result", callback: () => resolve(false) }
      },
      default: "no"
    }).render(true);
  });
};

const evaluateAttackResult = ({ result, targets, weapon, traits }) => {
  const bestTN = Math.max(...targets.map(tg => tg.targetNumber));
  const success = result === 1 ? true : (result === 100 ? false : result <= bestTN);
  let dos = success ? 1 + Math.floor((bestTN - result) / 10) : 0;
  const jam = computeJam({ result, targetNumber: bestTN, weapon, traits });
  if (jam) dos = 0;
  return { bestTN, success, dos, jam };
};

const isD100Success = (roll, target) => roll === 1 ? true : (roll === 100 ? false : roll <= target);

const buildWorkflowHtml = state => {
  const outlined = (text, color) => `<span style="font-weight:700;color:${color};text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;">${text}</span>`;
  const statusColor = status => {
    const normalized = String(status ?? "").toLowerCase();
    if (normalized.includes("jam")) return "#b267ff";
    if (normalized.includes("miss")) return "#ff3b3b";
    if (normalized.includes("hit") || normalized.includes("ok") || normalized.includes("out of ammo")) return "#1aff1a";
    return "#d9d9d9";
  };
  const attackOutcomeVerb = () => {
    const text = String(state.statusText ?? "").toLowerCase();
    if (text.includes("miss")) return "misses";
    if (text.includes("hit") || Number(state.totalHits ?? 0) > 0) return "hits";
    return "attacks";
  };
  const joinedTargets = (predicate = null) => {
    const targets = (state.targets ?? []).filter(t => !predicate || predicate(t)).map(t => t.name);
    return targets.length ? targets.join(", ") : "the target";
  };
  const buildDescription = () => {
    const damaged = (state.targets ?? []).some(t => t.damageApplied);
    if (damaged) return `<b>${state.attackerName}</b>'s attack with <b>${state.weaponName}</b> damages <b>${joinedTargets(t => t.damageApplied)}</b>`;
    const resolved = (state.targets ?? []).some(t => t.damageResolved);
    if (resolved || String(state.statusText ?? "").toLowerCase().includes("hit") || String(state.statusText ?? "").toLowerCase().includes("miss")) {
      return `<b>${state.attackerName}</b> ${attackOutcomeVerb()} <b>${joinedTargets()}</b> with <b>${state.weaponName}</b>`;
    }
    return `<b>${state.attackerName}</b> attacks with <b>${state.weaponName}</b>`;
  };
  const styledAttackDegrees = () => {
    const value = Number(state.attackDegrees ?? 0);
    if (!value) return "";
    if (value > 0) return `<div>${outlined(`${value} Degrees of Success`, "#1aff1a")}</div>`;
    return `<div>${outlined(`${Math.abs(value)} Degrees of Failure`, "#ff2a2a")}</div>`;
  };
  const styledDegrees = target => {
    const value = Number(target.defenseDegrees ?? 0);
    if (!value) return "—";
    if (target.defenseSuccess) return outlined(`${value} Degrees of Success`, "#1aff1a");
    return outlined(`${value} Degrees of Failure`, "#ff2a2a");
  };

  const cards = state.targets.map(t => {
    const sizeTxt = t.sizeIgnored ? `${t.sizeLabel} (Black Carapace ignores)` : `${t.sizeLabel} ${t.sizeMod >= 0 ? "+" : ""}${t.sizeMod}`;
    const dmgTxt = (t.damageRolls ?? []).map(d => `${d.total} ${d.loc}`).join(", ") || "—";
    const shownHits = state.horde?.active ? (t.hordeHitsPreview ?? t.allocatedHits ?? 0) : (t.allocatedHits ?? 0);
    const hitsLabel = state.horde?.active ? "Hits vs Horde" : "Hits";
    const defenseSummary = t.defenseAction
      ? `<div style="margin-top:4px;padding:6px;border:1px solid #777;border-radius:6px;background:#151515;">
          <div><b>Defense (T vs R):</b> ${outlined(t.defenseTargetNumber ?? "—", "#3aa0ff")} vs ${outlined(t.defenseRoll ?? "—", "#ff9f1a")} (${t.defenseAction} — ${t.defenseOutcome ?? "—"})</div>
          <div><b>Difficulty:</b> ${t.defenseDifficultyLabel ?? "—"}</div>
          ${t.defenseNotes?.length ? `<div><b>Notes:</b> ${t.defenseNotes.join(" | ")}</div>` : ""}
          <div><b>Result:</b> ${styledDegrees(t)}</div>
        </div>`
      : `<div><b>Defense (T vs R):</b> ${outlined(t.defenseTargetNumber ?? "—", "#3aa0ff")} vs ${outlined(t.defenseRoll ?? "—", "#ff9f1a")} (${t.defenseOutcome ?? "—"})</div>`;

    const damageSummary = t.damageSummary
      ? `<div style="margin-top:4px;padding:6px;border:1px solid #777;border-radius:6px;">${t.damageSummary}</div>`
      : `<div style="text-align:center;"><b>Damage</b><div>—</div></div>`;

    return `<div style="border:1px solid #555;border-radius:6px;padding:6px;margin:6px 0;">
      <div><b>${t.name}</b></div>
      <div><b>Distance:</b> ${t.distanceMeters}m | <b>Range:</b> ${t.rangeLabel}</div>
      <div><b>Size:</b> ${sizeTxt}</div>
      <div><b>Target:</b> ${outlined(t.targetNumber, "#3aa0ff")} | <b>Roll:</b> ${outlined(state.attackRoll ?? "—", "#ff9f1a")}</div>
      <div><b>${hitsLabel}:</b> ${shownHits}</div>
      ${defenseSummary}
      ${damageSummary}
    </div>`;
  }).join("");

  return `<div data-workflow-id="${state.id}">
    <div style="margin:0 0 6px 0;font-size:1.05em;font-style:italic;">${buildDescription()}</div>
    <div><b>Attack Mode:</b> ${state.modeLabel} | <b>Power:</b> ${state.powerModeLabel}</div>
    <div><b>Craftsmanship:</b> ${state.craftName} | <b>Aim:</b> ${state.aimLabel}</div>
    <div><b>Modifiers:</b> ${state.modifierNotes.join(", ") || "None"}</div>
    <div><b>Talents:</b> ${state.selectedTalents?.join(", ") || "None"}</div>
    <div><b>Items:</b> ${state.weaponItems?.join(", ") || "None"}</div>
    <div><b>Attack Roll:</b> ${outlined(state.attackRoll ?? "—", "#ff9f1a")} | <b>Target:</b> ${outlined(state.bestTarget ?? Math.max(...(state.targets ?? []).map(t => Number(t.targetNumber ?? 0))), "#3aa0ff")}</div>
    <div><b>Status:</b> ${outlined(state.statusText ?? "Pending", statusColor(state.statusText))} | <b>Total ${state.horde?.active ? "Hits vs Horde" : "Hits"}:</b> ${state.totalHits ?? 0}</div>
    ${styledAttackDegrees()}
    ${state.extraText ? `<div><b>Notes:</b> ${state.extraText}</div>` : ""}
    <hr>${cards}
  </div>`;
};



const buildDamageApplicationData = ({ state, target, rolls, hitLoc }) => ({
  attacker: state.attackerName,
  target: target.name,
  targetTokenUuid: target.tokenUuid ?? target.targetTokenUuid,
  weapon: state.weaponName,
  damageType: String(state.weaponType ?? "impact").toLowerCase(),
  penetration: Number(state.weaponPen ?? 0),
  hits: rolls.length,
  hitsData: rolls.map((r, idx) => ({ hit: idx + 1, location: r.loc ?? hitLoc, damage: r.total, fury: null })),
  dos: Number(state.dos ?? 0),
  fury: [],
  properties: state.horde?.active ? ["Horde Target"] : []
});


const estimateMinimumDamage = formula => {
  const text = String(formula ?? "").replace(/\s+/g, "");
  const match = text.match(/^(\d+)d(5|10)([+-]\d+)?$/i);
  if (!match) return null;
  const dice = Number(match[1]);
  const flat = Number(match[3] ?? 0);
  return dice + flat;
};

const getHordeDefenseThreshold = (targetActor, penetration = 0) => {
  if (!targetActor) return 0;
  const tTotal = Number(targetActor.system?.characteristics?.toughness?.total ?? 0);
  const tUnnat = Number(targetActor.system?.characteristics?.toughness?.unnatural ?? 0);
  const tb = Math.floor(tTotal / 10);
  const armour = targetActor.system?.armour ?? {};
  const bodyArmour = Number(armour.body?.value ?? 0);
  const remainingArmour = Math.max(0, bodyArmour - Math.max(0, Number(penetration ?? 0)));
  return remainingArmour + tb + tUnnat;
};
const getHordeMagnitudeHits = ({ state, target }) => {
  const traits = parseWeaponTraits({ system: { special: state.weaponSpecial ?? "" } });
  const inflictedHits = Number(target?.allocatedHits ?? 0);
  const blast = parseTraitNumber(traits, "blast", 0);
  const devastating = parseTraitNumber(traits, "devastating", 0);
  const isFlame = hasTrait(traits, "flame");
  const explosive = hasTrait(traits, "explosive") || String(state.weaponType ?? "").toLowerCase().includes("explosive");
  const forceOrPower = hasTrait(traits, "force") || hasTrait(traits, "power");
  let magnitude = inflictedHits;
  if (isFlame) {
    const range = Number(state.weaponRange ?? 0);
    magnitude = Math.ceil(range / 4) + (Math.ceil(Math.random() * 5));
  }
  if (blast > 0) {
    magnitude = blast;
  }
  let bonus = (explosive || forceOrPower) ? 1 : 0;
  if (state.whirlwind?.active) {
    const wsb = Number(state.whirlwind.wsBonus ?? 0);
    bonus += Math.floor(wsb / 2);
  }
  return Math.max(0, magnitude + bonus + devastating);
};

const openDamageWorkflow = async (state, chatMessage) => {
  const hasPendingDamage = state.targets.some(t => (t.allocatedHits ?? 0) > 0 && !t.damageResolved);
  if (!hasPendingDamage) return;

  const payload = {
    ownerIds: [game.user.id],
    attackerName: state.attackerName,
    chatMessageId: chatMessage.id
  };

  if (game.warhammer40kCogitator?.setPendingDamageContext) {
    game.warhammer40kCogitator.setPendingDamageContext(payload);
  }

  if (!game.warhammer40kCogitator?.runStep) {
    ui.notifications.warn("Warhammer 40k Cogitator API is unavailable; cannot open Damage workflow.");
    return;
  }

  await game.warhammer40kCogitator.runStep("damage");
};

const getDefenseRecipients = targetDocumentOrActor => {
  const actor = targetDocumentOrActor?.actor
    ?? targetDocumentOrActor?.baseActor
    ?? (targetDocumentOrActor?.documentName === "Actor" ? targetDocumentOrActor : null);
  const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

  const activePlayerOwners = game.users
    .filter(user => user.active && !user.isGM)
    .filter(user => actor?.testUserPermission(user, ownerLevel));
  const activeGMs = game.users.filter(user => user.active && user.isGM);

  if (activePlayerOwners.length) {
    const controllingOwners = activePlayerOwners.filter(user => user.character?.id === actor?.id);
    const baseRecipients = controllingOwners.length ? controllingOwners : activePlayerOwners;
    return [...new Map([...baseRecipients, ...activeGMs].map(user => [user.id, user])).values()];
  }

  return activeGMs;
};

const requestOwnerDefense = async ({ targetState, chatMessage, state }) => {
  const targetDoc = await fromUuid(targetState.tokenUuid);
  const targetActor = targetDoc?.actor;
  if (!targetActor) return false;

  const recipientUsers = game.warhammer40kCogitator?.getDefenseRecipients
    ? game.warhammer40kCogitator.getDefenseRecipients(targetDoc ?? targetActor)
    : getDefenseRecipients(targetDoc ?? targetActor);
  if (!recipientUsers.length) return false;

  if (game.warhammer40kCogitator?.emitSocket) {
    const payload = {
      ownerIds: recipientUsers.map(u => u.id),
      chatMessageId: chatMessage.id,
      targetTokenUuid: targetState.tokenUuid,
      targetName: targetState.name,
      allocatedHits: targetState.allocatedHits,
      attackerName: state.attackerName,
      weaponName: state.weaponName
    };

    game.warhammer40kCogitator.emitSocket("requestDefense", payload);

    // Fallback for local self-defense when the Foundry socket implementation
    // does not loop module events back to the emitting client.
    if (payload.ownerIds.includes(game.user.id)) {
      if (game.warhammer40kCogitator?.promptDefenseRequest) {
        game.warhammer40kCogitator.promptDefenseRequest(payload);
      } else {
        game.warhammer40kCogitator.setPendingDefenseContext?.(payload);
        await game.warhammer40kCogitator.runStep?.("defense");
      }
    }

    return true;
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    whisper: recipientUsers.map(u => u.id),
    content: `<b>Defense Requested</b><br>${targetState.name} has ${targetState.allocatedHits} incoming hit(s).<br>
              Please resolve defense for this workflow message: <code>${chatMessage.id}</code>.`
  });
  return true;
};

const runAttackWorkflow = async setup => {
  const weapon = attacker.items.get(setup.weaponId);
  if (!weapon) return ui.notifications.error("Invalid weapon selection.");

  const traits = parseWeaponTraits(weapon);
  const isMelee = (weapon.system.class ?? "").toLowerCase() === "melee";
  const modeTable = isMelee ? meleeModes : rangedModes;
  const mode = modeTable[setup.modeKey];
  if (!mode) return ui.notifications.error("Invalid attack mode.");

  if (isMelee && setup.modeKey === "swift" && !hasTalent(attacker, "swift attack")) return ui.notifications.warn("Requires talent: Swift Attack");
  if (isMelee && setup.modeKey === "lightning" && !hasTalent(attacker, "lightning attack")) return ui.notifications.warn("Requires talent: Lightning Attack");

  const rof = weapon.system.rateOfFire ?? {};
  const isSpray = hasTrait(traits, "spray");
  const infiniteAmmo = hasTrait(traits, "living ammunition") || hasTrait(traits, "infammo");
  const isGrenade = hasTrait(traits, "grenade");
  if (!isMelee) {
    if (["semi", "suppressSemi"].includes(setup.modeKey) && (rof.burst ?? 0) <= 0) return ui.notifications.warn("Weapon lacks Semi-Auto/Burst RoF.");
    if (["full", "suppressFull"].includes(setup.modeKey) && (rof.full ?? 0) <= 0) return ui.notifications.warn("Weapon lacks Full-Auto RoF.");

    const clipValue = weapon.system.clip?.value;
    if (!infiniteAmmo && !isGrenade && clipValue != null && clipValue <= 0) {
      return ui.notifications.warn("OUT OF AMMO");
    }
  }

  const bs = attacker.system.characteristics.ballisticSkill?.total ?? 0;
  const ws = attacker.system.characteristics.weaponSkill?.total ?? 0;
  const baseSkill = isMelee ? ws : bs;

  const modifierNotes = [];
  const selectedTalents = [];
  const talentModifier = createTalentModifierState();
  let sharedMod = mode.mod + setup.manualMod + setup.aimMod;
  if (setup.manualMod) modifierNotes.push(`Manual ${setup.manualMod >= 0 ? "+" : ""}${setup.manualMod}`);
  if (setup.aimMod) modifierNotes.push(setup.aimLabel);

  if (setup.isHorde) {
    const hordeBonus = Number(setup.hordeBonus ?? 0);
    sharedMod += hordeBonus;
    modifierNotes.push(`Horde ${hordeBonus >= 0 ? "+" : ""}${hordeBonus}`);
  }

  const t = { ...(setup.toggles ?? {}), ...(setup.detectedItems ?? {}) };

  if (setup.shootingMelee) {
    if (!t.targetsel) {
      sharedMod -= 20;
      modifierNotes.push("Shooting into Melee -20");
    } else {
      talentModifier.attack.attackRoll += 20;
      talentModifier.attack.notes.push("Target Selection +20 (ignores shooting into melee penalty)");
      modifierNotes.push("Shooting into Melee (negated)");
    }
  }

  if (setup.twoWeaponAttack) {
    let penalty = -20;
    if (t.master) penalty = 0;
    else {
      const hasWielder = (isMelee && t.twmMelee) || (!isMelee && t.twmRanged);
      if (hasWielder && t.ambi) penalty = -10;
    }
    sharedMod += penalty;
    const twoWeaponTalentDelta = penalty - (-20);
    if (twoWeaponTalentDelta !== 0) {
      talentModifier.attack.attackRoll += twoWeaponTalentDelta;
      talentModifier.attack.notes.push(`Two-Weapon talent mitigation ${twoWeaponTalentDelta >= 0 ? "+" : ""}${twoWeaponTalentDelta}`);
    }
    modifierNotes.push(`Two-Weapon ${penalty}`);
  }

  const craftData = getCraftData(weapon);
  if (isMelee && craftData.meleeBonus !== 0) {
    const craftBonus = craftData.meleeBonus;
    sharedMod += craftBonus;
    selectedTalents.push(`Craftsmanship (${craftData.label}) ${craftBonus >= 0 ? "+" : ""}${craftBonus}`);
  }
  if (isMelee && craftData.meleeBestDamageBonus) {
    selectedTalents.push("Best Craftsmanship: +1 damage");
  }

  if (t.deadeye && !isMelee && setup.modeKey === "called") {
    sharedMod += 10;
    talentModifier.attack.attackRoll += 10;
    talentModifier.attack.notes.push("Deadeye Shot +10");
    selectedTalents.push("Deadeye +10");
  }
  if (t.grip) { sharedMod += 5; selectedTalents.push("Custom Grip +5"); }
  if (t.stock && !isMelee && setup.aimMod > 0) {
    const b = setup.aimMod === 20 ? 4 : 2;
    sharedMod += b;
    selectedTalents.push(`Modified Stock +${b}`);
  }
  if (t.motion && !isMelee && ["semi", "full", "suppressSemi", "suppressFull"].includes(setup.modeKey)) { sharedMod += 10; selectedTalents.push("Motion Predictor +10"); }
  if ((t.reddot || t.omni) && !isMelee && ["single", "called"].includes(setup.modeKey)) { sharedMod += 10; selectedTalents.push("Red-Dot +10"); }
  if (t.berserk && isMelee && setup.modeKey === "charge") {
    sharedMod += 10;
    talentModifier.attack.attackRoll += 10;
    talentModifier.attack.notes.push("Berserk Charge +10");
    selectedTalents.push("Berserk Charge +10");
  }
  if (t.marksman && !isMelee) selectedTalents.push("Marksman (ignore Long/Extreme penalties)");
  if (t.mighty && !isMelee) selectedTalents.push("Mighty Shot");
  if (t.crushing && isMelee) selectedTalents.push("Crushing Blow");
  if (t.hammer && isMelee) {
    selectedTalents.push("Hammer Blow");
    if (setup.modeKey === "allout") selectedTalents.push("Hammer Blow grants Concussive (2)");
  }
  if (t.flesh && isMelee) selectedTalents.push("Flesh Render");
  if (t.raptor) selectedTalents.push("Raptor");
  if (t.forceChannel) selectedTalents.push("Force Channeling");


  const doubleTapEligibleTargetUuid = attacker.getFlag(WORKFLOW_NS, DOUBLE_TAP_TARGET_FLAG) ?? null;
  const doubleTapCanApply = !!(t.doubletap && doubleTapEligibleTargetUuid && setup.targetConfigs.length === 1 && setup.targetConfigs[0]?.tokenUuid === doubleTapEligibleTargetUuid);
  if (doubleTapCanApply) {
    sharedMod += 20;
    talentModifier.attack.attackRoll += 20;
    talentModifier.attack.notes.push("Double Tap +20 (same target follow-up)");
    selectedTalents.push("Double Tap +20 (same target follow-up)");
  }

  const targets = setup.targetConfigs.map(conf => {
    const effectiveRangeMod = (!isMelee && t.marksman && conf.rangeMod < 0) ? 0 : conf.rangeMod;
    const scatterPointBlankBonus = (!isMelee && hasTrait(traits, "scatter") && conf.rangeMod === 30) ? 10 : 0;
    return ({
    tokenUuid: conf.tokenUuid,
    targetTokenUuid: conf.tokenUuid,
    name: conf.targetName,
    distanceMeters: conf.distanceMeters,
    rangeLabel: conf.rangeLabel,
    rangeMod: effectiveRangeMod,
    scatterAttackBonus: scatterPointBlankBonus,
    sizeLabel: conf.sizeLabel,
    sizeMod: conf.sizeMod,
    sizeIgnored: conf.sizeIgnored,
    targetNumber: Math.max(1, baseSkill + sharedMod + effectiveRangeMod + scatterPointBlankBonus + conf.sizeMod),
    allocatedHits: 0,
    defenseRoll: null,
    defenseOutcome: null,
    damageRolls: [],
    damageResolved: false
  });
  });

  const powerMode = POWER_MODES[setup.powerModeKey] ?? POWER_MODES[1];
  if (!isMelee && (craftData.rangedGood || craftData.rangedBest)) {
    selectedTalents.push("Good/Best Craftsmanship: Unreliable removed; Reliable gained if absent");
  }

  const state = {
    id: foundry.utils.randomID(),
    attackerActorId: attacker.id,
    attackerName: attacker.name,
    attackerTokenUuid: attackerToken.document.uuid,
    weaponId: weapon.id,
    weaponName: weapon.name,
    weaponDamage: weapon.system.damage || "1d10",
    weaponPen: getWeaponPenetration(weapon),
    weaponType: weapon.system.damageType || "impact",
    weaponSpecial: weapon.system.special || "",
    meleeBestDamageBonus: (isMelee && craftData.meleeBestDamageBonus) ? 1 : 0,
    modeKey: setup.modeKey,
    modeLabel: mode.label,
    powerModeLabel: powerMode.label,
    powerMultiplier: powerMode.multiplier,
    aimLabel: setup.aimLabel,
    craftName: (weapon.system.craftsmanship ?? "Common"),
    modifierNotes,
    selectedTalents,
    attackTalentsUsed: selectedTalents,
    weaponItems: presentWeaponItems(setup.detectedItems ?? {}),
    forceChanneling: !!setup.toggles?.forceChannel && !setup.isHorde,
    attackRoll: null,
    dos: 0,
    totalHits: 0,
    statusText: "Pending",
    extraText: "",
    grenade: { isGrenade, scatter: null, damage: null },
    horde: { active: !!setup.isHorde },
    whirlwind: { active: !!setup.toggles?.whirlwind, wsBonus: attacker.system.characteristics.weaponSkill?.bonus ?? 0 },
    setupSnapshot: foundry.utils.deepClone(setup),
    talentModifier,
    toggles: foundry.utils.deepClone(setup.toggles ?? {}),
    targets,
    flags: { immediate: true }
  };

  const chatMessage = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker, token: attackerToken.document }),
    content: buildWorkflowHtml(state),
    flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: state } }
  });

  const spendAmmoForAttack = async rawHits => {
    if (isMelee || infiniteAmmo || isGrenade || weapon.system.clip?.value == null) return { cappedHits: rawHits, spent: 0, outOfAmmo: false };
    let shotsRequired = 1;
    if (["semi", "suppressSemi"].includes(state.modeKey)) shotsRequired = rof.burst ?? 1;
    else if (["full", "suppressFull"].includes(state.modeKey)) shotsRequired = rof.full ?? 1;
    if (hasTrait(traits, "storm")) shotsRequired *= 2;
    shotsRequired *= state.powerMultiplier;

    const currentClip = weapon.system.clip.value;
    const used = Math.min(shotsRequired, currentClip);
    const newClip = Math.max(0, currentClip - used);
    await weapon.update({ "system.clip.value": newClip });
    return { cappedHits: Math.min(rawHits, used), spent: used, outOfAmmo: newClip <= 0 };
  };

  // immediate attack roll (Spray auto-hits as if attack roll were 1)
  let result = isSpray ? 1 : (await animatedRoll("1d100", chatMessage.speaker)).total;
  let { success, dos, jam, bestTN } = evaluateAttackResult({ result, targets: state.targets, weapon, traits });
  state.bestTarget = bestTN;

  if (!isSpray && !success) {
    const useFate = await promptAttackFateReroll({ actorDoc: attacker, rollValue: result, bestTN });
    if (useFate) {
      await attacker.update({ "system.fate.value": Math.max(0, (attacker.system.fate?.value ?? 0) - 1) });
      result = (await animatedRoll("1d100", chatMessage.speaker)).total;
      ({ success, dos, jam, bestTN } = evaluateAttackResult({ result, targets: state.targets, weapon, traits }));
      state.bestTarget = bestTN;
      state.extraText = [state.extraText, `${attacker.name} spent Fate to reroll attack`].filter(Boolean).join(" | ");
    }
  }

  let hits = success && !jam ? 1 : 0;
  if (success && !isMelee) {
    if (["semi", "suppressSemi"].includes(state.modeKey)) hits = Math.min(1 + Math.floor((dos - 1) / 2), rof.burst ?? 1);
    else if (["full", "suppressFull"].includes(state.modeKey)) hits = Math.min(dos, rof.full ?? 1);
  }
  if (success && isMelee) {
    const wsb = attacker.system.characteristics.weaponSkill?.bonus ?? 1;
    if (state.horde?.active && state.modeKey !== "lightning") {
      hits = Math.min(1 + Math.floor(Math.max(0, dos - 1) / 2), wsb);
    } else if (state.modeKey === "swift") hits = Math.min(1 + Math.floor(Math.max(0, dos - 1) / 2), wsb);
    else if (state.modeKey === "lightning") hits = Math.min(Math.max(1, dos), wsb);
  }
  if (success && hasTrait(traits, "storm")) {
    hits *= 2;
    if (["full", "suppressFull"].includes(state.modeKey)) {
      hits = Math.min(hits, (rof.full ?? hits) * 2);
    }
  }

  let ammoSpent = 0;
  let outOfAmmoAfter = false;
  const firstAmmo = await spendAmmoForAttack(hits);
  hits = firstAmmo.cappedHits;
  ammoSpent += firstAmmo.spent;
  outOfAmmoAfter = firstAmmo.outOfAmmo;

  const eligible = state.targets.filter(tg => isD100Success(result, tg.targetNumber));
  const sprayAlloc = isSpray && success && !jam
    ? new Map(eligible.map(tg => [tg.tokenUuid, 1]))
    : null;
  const alloc = sprayAlloc ?? allocateHits({ totalHits: hits, modeKey: state.modeKey, targets: eligible, rof, storm: hasTrait(traits, "storm") });

  state.targets = state.targets.map(tg => ({ ...tg, allocatedHits: alloc.get(tg.tokenUuid) || 0 }));

  if (t.whirlwind && isMelee) {
    state.targets = state.targets.map(tg => ({ ...tg, allocatedHits: 0 }));
    const notes = [];
    for (const tg of state.targets) {
      const wr = (await animatedRoll("1d100", chatMessage.speaker)).total;
      const hit = isD100Success(wr, tg.targetNumber);
      tg.allocatedHits = hit ? 1 : 0;
      notes.push(`${tg.name}: ${wr} ${hit ? "HIT" : "MISS"}`);
    }
    state.extraText = [state.extraText, `Whirlwind attacks: ${notes.join(", ")}`].filter(Boolean).join(" | ");
  }

  state.attackRoll = result;
  state.dos = dos;
  state.attackDegrees = success ? dos : -Math.max(1, 1 + Math.floor((result - bestTN) / 10));
  if (state.horde?.active) {
    state.targets = state.targets.map(tg => ({
      ...tg,
      hordeHitsPreview: getHordeMagnitudeHits({ state, target: tg })
    }));
  }
  state.totalHits = state.targets.reduce((sum, tg) => {
    const hitValue = state.horde?.active ? Number(tg.hordeHitsPreview ?? tg.allocatedHits ?? 0) : Number(tg.allocatedHits ?? 0);
    return sum + hitValue;
  }, 0);
  state.statusText = jam ? "JAM" : (success ? (outOfAmmoAfter ? "HIT (OUT OF AMMO)" : "HIT") : "MISS");

  const isMaximal = String(state.powerModeLabel ?? "").toLowerCase() === "maximal";
  if ((jam || isMaximal) && !isMelee && game.warhammer40kCogitator?.applyWeaponRechargingEffect) {
    await game.warhammer40kCogitator.applyWeaponRechargingEffect(attacker);
  }

  state.devastatingFollowUp = {
    available: !!(setup.toggles?.devastating && setup.modeKey === "allout" && state.totalHits > 0),
    prompted: false,
    setup: {
      ...setup,
      skipAllOutReactionConsume: true
    }
  };

  if (!success && isMelee && hasWeaponSpecial(weapon, "blade") && setup.toggles?.blademaster && !attacker.effects.some(e => String(e.name ?? "").toLowerCase().includes("blademaster used"))) {
    const reroll = (await animatedRoll("1d100", chatMessage.speaker)).total;
    const evalRe = evaluateAttackResult({ result: reroll, targets: state.targets, weapon, traits });
    state.extraText = [state.extraText, `Blademaster reroll: ${result} → ${reroll}`].filter(Boolean).join(" | ");
    result = reroll; success = evalRe.success; dos = evalRe.dos; jam = evalRe.jam; bestTN = evalRe.bestTN;
    state.bestTarget = bestTN;
    await attacker.createEmbeddedDocuments("ActiveEffect", [{ name: "Blademaster Used", img: "icons/svg/sword.svg", origin: attacker.uuid }]);
  }

  const hitTargets = state.targets.filter(tg => (tg.allocatedHits ?? 0) > 0);
  const consumedDoubleTapTarget = attacker.getFlag(WORKFLOW_NS, DOUBLE_TAP_TARGET_FLAG);
  if (consumedDoubleTapTarget) {
    await attacker.unsetFlag(WORKFLOW_NS, DOUBLE_TAP_TARGET_FLAG);
    await game.warhammer40kCogitator?.clearDoubleTapEffect?.(attacker);
  }
  if (t.doubletap && hitTargets.length === 1) {
    await attacker.setFlag(WORKFLOW_NS, DOUBLE_TAP_TARGET_FLAG, hitTargets[0].tokenUuid);
    await game.warhammer40kCogitator?.applyDoubleTapEffect?.(attacker);
    selectedTalents.push(`Double Tap primed on ${hitTargets[0].name}`);
  }

  if (ammoSpent > 0) {
    state.extraText = [state.extraText, `Ammo Spent: ${ammoSpent}`].filter(Boolean).join(" | ");
  }

  if (isGrenade) {
    if (!success) {
      const scatter = await rollScatterData(chatMessage.speaker);
      state.grenade.scatter = scatter;
      state.extraText = [state.extraText, `SCATTER: ${scatter.dist}m ${scatter.arrow} ${scatter.label}`].filter(Boolean).join(" | ");
    }

    // Grenade damage always rolls if formula exists (hit or miss)
    const grenadeDamage = await rollGrenadeDamageTotal(weapon, chatMessage.speaker);
    if (grenadeDamage != null) {
      state.grenade.damage = grenadeDamage;
      state.extraText = [state.extraText, `Grenade Damage: ${grenadeDamage}`].filter(Boolean).join(" | ");
    }
  }

  // Defense handling order: online target owner, otherwise online GM.
  // Skip when reaction has already been spent this round.
  for (const tg of state.targets) {
    if (tg.allocatedHits <= 0) continue;
    if (state.horde?.active) {
      tg.defenseOutcome = "Failed (Hordes do not defend)";
      tg.defenseRoll = "—";
      continue;
    }

    const targetDoc = await fromUuid(tg.tokenUuid);
    const targetActor = targetDoc?.actor;
    if (isSpray) {
      const sprayDefense = await rollAgilityEvasionTest(targetActor);
      tg.defenseRoll = sprayDefense.roll;
      if (sprayDefense.success) {
        tg.allocatedHits = 0;
        tg.defenseOutcome = `Success (Spray Agility test ${sprayDefense.roll}/${sprayDefense.target}; can move ${sprayDefense.evadeMeters}m)`;
        continue;
      }
      tg.defenseOutcome = `Failed (Spray Agility test ${sprayDefense.roll}/${sprayDefense.target})`;
      continue;
    }

    if (game.warhammer40kCogitator?.hasDefenseReaction?.(targetActor)) {
      tg.defenseOutcome = "Failed (Reaction already used)";
      tg.defenseRoll = "—";
      tg.damageResolved = false;
      tg.damageSummary = null;
      continue;
    }

    tg.defenseOutcome = "Awaiting target owner";
    const requested = await requestOwnerDefense({ targetState: tg, chatMessage, state });
    if (!requested) {
      tg.defenseOutcome = "No active owner/GM for defense";
    }
  }

  await chatMessage.update({
    content: buildWorkflowHtml(state),
    flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: state } }
  });

  const awaitingDefense = state.targets.some(tg => String(tg.defenseOutcome ?? "").toLowerCase().includes("awaiting target owner"));

  // For grenades, damage already exploded/resolved above; skip weapon damage prompt.
  // Also skip damage while any target is still awaiting owner defense resolution.
  if (!isGrenade && !awaitingDefense) {
    await openDamageWorkflow(state, chatMessage);
  } else if (awaitingDefense) {
    await chatMessage.update({
      content: buildWorkflowHtml(state),
      flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: state } }
    });
  }

  // Consume grenade item after use (single-use), mirroring original macro behavior.
  if (isGrenade) {
    await weapon.delete();
  }
};

const showAttackDialog = async () => {
  const weaponOptions = weapons.map(w => `<option value="${w.id}">${w.name}</option>`).join("");

  const buildModeOptions = weaponDoc => {
    const isMelee = (weaponDoc?.system.class ?? "").toLowerCase() === "melee";
    if (isMelee) {
      return Object.entries(meleeModes).map(([k, v]) => {
        const bad = (k === "swift" && !hasTalent(attacker, "swift attack")) || (k === "lightning" && !hasTalent(attacker, "lightning attack"));
        return `<option value="${k}" ${bad ? "disabled" : ""}>${v.label}</option>`;
      }).join("");
    }
    return getAvailableRangedModeKeys(weaponDoc)
      .map(k => `<option value="${k}">${rangedModes[k].label}</option>`)
      .join("");
  };

  const targetRows = weaponDoc => {
    const isMelee = (weaponDoc?.system.class ?? "").toLowerCase() === "melee";
    const normalRange = getNormalRangeForWeapon(weaponDoc);
    return targetTokens.map(t => {
      const pathMeasurement = canvas.grid.measurePath([attackerToken.center, t.center], { gridSpaces: false });
      const d = Math.round(pathMeasurement.distance ?? 0);
      const size = getSizeModifier(t.actor);
      const effectiveDistance = Math.max(0, d - Math.max(0, (size.sizeValue ?? 4) - 4));
      const rangeMod = getAutoRangeBand(effectiveDistance, normalRange, isMelee);
      const rangeCell = isMelee
        ? `<span>Melee</span><input type="hidden" class="target-range-mod" value="0"/>`
        : `<select class="target-range-mod">${RANGE_BANDS.map(b => `<option value="${b.mod}" ${b.mod===rangeMod?"selected":""}>${b.label}</option>`).join("")}</select>`;
      return `<tr class="target-row" data-uuid="${t.document.uuid}" data-name="${t.name}" data-distance="${d}" data-effective-distance="${effectiveDistance}" data-size-mod="${size.mod}" data-size-label="${size.label}" data-size-ignored="${size.ignored ? 1 : 0}">
        <td>${t.name}</td><td>${d}m</td><td>${rangeCell}</td>
      </tr>`;
    }).join("");
  };

  return new Promise(resolve => {
    const d = new Dialog({
      title: "External Attack Workflow",
      content: `<form>
        <style>
          .attack-specifics-grid { display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; align-items:center; }
          .attack-dialog-row-2col { display:grid; grid-template-columns:1fr 1fr; gap:8px 12px; }
          .attack-talents-grid { display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; align-items:start; }
          .attack-talents-col { display:grid; gap:4px; }
          .talent-unavailable { color:#8a8a8a; }
          .talent-auto input { opacity:0.65; }
        </style>
        <div class="form-group"><label><b>Weapon</b></label><select id="weaponId">${weaponOptions}</select></div>
        <div class="attack-dialog-row-2col">
          <div class="form-group"><label><b>Attack Type</b></label><select id="modeKey"></select></div>
          <div class="form-group"><label><b>Weapon Range:</b> <span id="weaponRangeDisplay">—</span></label></div>
        </div>
        <div class="attack-dialog-row-2col">
          <div class="form-group"><label><b>Aim</b></label><select id="aimMod"><option value="0">No Aim</option><option value="10">Half Aim (+10)</option><option value="20">Full Aim (+20)</option></select></div>
          <div class="form-group"><label><b>Craftsmanship:</b> <span id="weaponCraftDisplay">—</span></label></div>
        </div>
        <div class="form-group"><label><b>Modifier</b></label><input id="manualMod" type="number" value="0"/></div>
        <div class="form-group"><label><b>Weapon Modifications:</b> <span id="detectedItems">—</span></label></div>
        <div class="form-group"><label><b>Weapon Traits:</b> <span id="weaponTraitsDisplay">—</span></label></div>
        <hr><h3>Attack Specifics</h3>
        <div class="attack-specifics-grid">
          <div class="form-group"><label><input type="checkbox" id="horde"/> Horde?</label></div>
          <div class="form-group"><label><b>Horde Size Modifier</b></label><input id="hordeBonus" type="number" value="0"/></div>
          <div class="form-group"><label><input type="checkbox" id="shootMelee"/> Attacking into Melee?</label></div>
          <div class="form-group"><label><input type="checkbox" id="twoWeaponAttack"/> Two-Weapon Attack?</label></div>
        </div>
        <div class="form-group" id="powerModeGroup"><label><b>Power Mode</b></label><select id="powerMode"><option value="1">Normal</option><option value="2">Overcharge (×2)</option><option value="4">Overload (×4)</option><option value="3">Maximal (×3)</option></select></div>
        <div class="form-group" id="forceChannelGroup" style="display:none;"><label><input type="checkbox" id="talent_force_channel"/> Force Channeling</label></div>
        <hr><h3>Talents</h3>
        <div class="attack-talents-grid">
          <div class="attack-talents-col">
            <label class="talent-toggle" data-needle="double tap"><input type="checkbox" id="talent_doubletap"/> Double Tap</label>
            <label class="talent-toggle" data-needle="target selection"><input type="checkbox" id="talent_targetsel"/> Target Selection</label>
            <label class="talent-toggle talent-auto" data-needle="blademaster"><input type="checkbox" id="talent_blademaster" disabled/> Blademaster (auto)</label>
            <label class="talent-toggle talent-auto" data-needle="berserk charge"><input type="checkbox" id="talent_berserk" disabled/> Berserk Charge (auto)</label>
            <label class="talent-toggle" data-needle="devastating assault"><input type="checkbox" id="talent_devastating"/> Devastating Assault</label>
            <label class="talent-toggle talent-auto" data-needle="flesh render"><input type="checkbox" id="talent_flesh" disabled/> Flesh Render (auto)</label>
            <label class="talent-toggle" data-needle="raptor"><input type="checkbox" id="talent_raptor"/> Raptor</label>
            <label class="talent-toggle" data-needle="whirlwind"><input type="checkbox" id="talent_whirlwind"/> Whirlwind of Death</label>
          </div>
          <div class="attack-talents-col">
            <label class="talent-toggle talent-auto" data-needle="deadeye"><input type="checkbox" id="talent_deadeye" disabled/> Deadeye Shot (auto)</label>
            <label class="talent-toggle talent-auto" data-needle="marksman"><input type="checkbox" id="talent_marksman" disabled/> Marksman (auto)</label>
            <label class="talent-toggle talent-auto" data-needle="crushing blow"><input type="checkbox" id="talent_crushing" disabled/> Crushing Blow (auto)</label>
            <label class="talent-toggle talent-auto" data-needle="mighty shot"><input type="checkbox" id="talent_mighty" disabled/> Mighty Shot (auto)</label>
            <label class="talent-toggle talent-auto" data-needle="hammer blow"><input type="checkbox" id="talent_hammer" disabled/> Hammer Blow (auto)</label>
            <label class="talent-toggle talent-auto" data-needle="two-weapon wielder (melee)"><input type="checkbox" id="talent_twm_melee" disabled/> Two-Weapon Wielder (Melee) (auto)</label>
            <label class="talent-toggle talent-auto" data-needle="ambidextrous"><input type="checkbox" id="talent_ambi" disabled/> Ambidextrous (auto)</label>
            <label class="talent-toggle talent-auto" data-needle="two-weapon wielder (ranged)"><input type="checkbox" id="talent_twm_ranged" disabled/> Two-Weapon Wielder (Ranged) (auto)</label>
            <label class="talent-toggle talent-auto" data-needle="two weapon master"><input type="checkbox" id="talent_master" disabled/> Two Weapon Master (auto)</label>
          </div>
        </div>
        <hr><h3>Targets</h3>
        <table style="width:100%;"><thead><tr><th>Target</th><th>Distance</th><th>Range</th></tr></thead><tbody id="targetsBody"></tbody></table>
      </form>`,
      render: html => {
        const syncHordeBonus = () => {
          const isHorde = html.find("#horde")[0]?.checked;
          const hordeInput = html.find("#hordeBonus");
          hordeInput.prop("readonly", !!isHorde);
          html.find("#talent_force_channel").prop("disabled", !!isHorde);
          if (!isHorde) return;
          const firstTarget = targetTokens[0]?.actor;
          const magnitude = getHordeMagnitudeValue(firstTarget);
          hordeInput.val(getHordeBonusFromMagnitude(magnitude));
          html.find("#talent_force_channel").prop("checked", false);
        };

        const refreshTalents = () => {
          const weaponDoc = attacker.items.get(html.find("#weaponId").val());
          const modeKey = String(html.find("#modeKey").val() ?? "");
          const isMelee = (weaponDoc?.system?.class ?? "").toLowerCase() === "melee";
          const traits = parseWeaponTraits(weaponDoc ?? { system: { special: "" } });
          const isTearingWeapon = hasTrait(traits, "tearing");
          const isBladeWeapon = hasWeaponSpecial(weaponDoc, "blade");
          const twoWeaponAttack = !!html.find("#twoWeaponAttack")[0]?.checked;

          const relevanceById = {
            talent_blademaster: hasTalent(attacker, "blademaster") && isMelee && isBladeWeapon,
            talent_berserk: hasTalent(attacker, "berserk charge") && isMelee && modeKey === "charge",
            talent_deadeye: hasTalent(attacker, "deadeye") && !isMelee && modeKey === "called",
            talent_marksman: hasTalent(attacker, "marksman") && !isMelee,
            talent_crushing: hasTalent(attacker, "crushing blow") && isMelee,
            talent_mighty: hasTalent(attacker, "mighty shot") && !isMelee,
            talent_hammer: hasTalent(attacker, "hammer blow") && isMelee,
            talent_twm_melee: hasTalent(attacker, "two-weapon wielder (melee)") && isMelee && twoWeaponAttack,
            talent_twm_ranged: hasTalent(attacker, "two-weapon wielder (ranged)") && !isMelee && twoWeaponAttack,
            talent_ambi: hasTalent(attacker, "ambidextrous") && twoWeaponAttack,
            talent_master: hasTalent(attacker, "two weapon master") && twoWeaponAttack,
            talent_flesh: hasTalent(attacker, "flesh render") && isMelee && isTearingWeapon,
            talent_raptor: hasTalent(attacker, "raptor") && isMelee && modeKey === "charge"
          };

          const showById = {
            talent_raptor: !!relevanceById.talent_raptor,
            talent_marksman: !!relevanceById.talent_marksman
          };

          html.find(".talent-toggle").each((_, el) => {
            const $label = $(el);
            const needle = String($label.data("needle") ?? "");
            const input = $label.find("input");
            const id = String(input.attr("id") ?? "");
            const hasIt = hasTalent(attacker, needle);
            const relevant = Object.prototype.hasOwnProperty.call(relevanceById, id) ? !!relevanceById[id] : hasIt;
            const shown = Object.prototype.hasOwnProperty.call(showById, id) ? !!showById[id] : hasIt;

            $label.toggle(shown);
            $label.toggleClass("talent-unavailable", !hasIt || !relevant);

            if ($label.hasClass("talent-auto")) {
              input.prop("disabled", true);
              input.prop("checked", hasIt && relevant);
              return;
            }

            input.prop("disabled", !hasIt || !relevant);
            if (!relevant || !shown) input.prop("checked", false);
          });

          html.find("#talent_marksman").prop("checked", !!relevanceById.talent_marksman);
        };

        const refresh = () => {
          const weaponDoc = attacker.items.get(html.find("#weaponId").val());
          const mode = html.find("#modeKey");
          mode.html(buildModeOptions(weaponDoc));
          const firstEnabled = mode.find("option:not([disabled])").first().val();
          if (firstEnabled) mode.val(firstEnabled);
          html.find("#targetsBody").html(targetRows(weaponDoc));

          const detected = detectWeaponItems(attacker, weaponDoc);
          html.find("#detectedItems").html(presentWeaponItems(detected).join(", "));

          const normalRange = getNormalRangeForWeapon(weaponDoc);
          const isMeleeW = (weaponDoc?.system?.class ?? "").toLowerCase() === "melee";
          html.find("#weaponRangeDisplay").text(isMeleeW ? "Melee" : `${normalRange}m`);
          html.find("#weaponCraftDisplay").text(getCraftData(weaponDoc).label);
          html.find("#weaponTraitsDisplay").text(weaponDoc?.system?.special?.trim() || "None");

          const wType = (weaponDoc?.system?.type ?? "").toLowerCase();
          const availablePowerModes = POWER_MODE_OPTIONS_BY_TYPE[wType] ?? [1];
          const currentPowerMode = Number(html.find("#powerMode").val() || 1);
          html.find("#powerMode").html(
            availablePowerModes
              .map(modeKey => `<option value="${modeKey}">${POWER_MODES[modeKey].label} (×${POWER_MODES[modeKey].multiplier})</option>`)
              .join("")
          );
          html.find("#powerMode").val(availablePowerModes.includes(currentPowerMode) ? String(currentPowerMode) : "1");
          const showPower = ["las", "plasma"].includes(wType);
          html.find("#powerModeGroup").toggle(showPower);
          if (!showPower) html.find("#powerMode").val("1");

          const traits = parseWeaponTraits(weaponDoc ?? { system: { special: "" } });
          const forceWeapon = hasTrait(traits, "force");
          html.find("#forceChannelGroup").toggle(!!forceWeapon);
          if (!forceWeapon) html.find("#talent_force_channel").prop("checked", false);
          syncHordeBonus();
          refreshTalents();
        };

        html.find(".talent-toggle input").on("change", ev => {
          ev.currentTarget.dataset.userSet = "1";
        });
        html.find("#talent_doubletap").prop("checked", false);
        html.find("#talent_devastating").prop("checked", false);

        if (pendingMirrorSetup) {
          html.find("#weaponId").val(pendingMirrorSetup.weaponId ?? html.find("#weaponId").val());
          html.find("#modeKey").val(pendingMirrorSetup.modeKey ?? html.find("#modeKey").val());
          html.find("#manualMod").val(Number(pendingMirrorSetup.manualMod ?? 0));
          html.find("#aimMod").val(Number(pendingMirrorSetup.aimMod ?? 0));
          html.find("#horde").prop("checked", !!pendingMirrorSetup.isHorde);
          html.find("#hordeBonus").val(Number(pendingMirrorSetup.hordeBonus ?? 0));
          html.find("#shootMelee").prop("checked", !!pendingMirrorSetup.shootingMelee);
          html.find("#twoWeaponAttack").prop("checked", !!pendingMirrorSetup.twoWeaponAttack);
          html.find("#powerMode").val(Number(pendingMirrorSetup.powerModeKey ?? 1));
          const pt = pendingMirrorSetup.toggles ?? {};
          html.find("#talent_deadeye").prop("checked", !!pt.deadeye);
          html.find("#talent_doubletap").prop("checked", !!pt.doubletap);
          html.find("#talent_targetsel").prop("checked", !!pt.targetsel);
          html.find("#talent_devastating").prop("checked", !!pt.devastating);
          html.find("#talent_blademaster").prop("checked", !!pt.blademaster);
          html.find("#talent_whirlwind").prop("checked", !!pt.whirlwind);
          html.find("#talent_berserk").prop("checked", !!pt.berserk);
          html.find("#talent_twm_melee").prop("checked", !!pt.twmMelee);
          html.find("#talent_twm_ranged").prop("checked", !!pt.twmRanged);
          html.find("#talent_ambi").prop("checked", !!pt.ambi);
          html.find("#talent_master").prop("checked", !!pt.master);
          html.find("#talent_mighty").prop("checked", !!pt.mighty);
          html.find("#talent_crushing").prop("checked", !!pt.crushing);
          html.find("#talent_hammer").prop("checked", !!pt.hammer);
          html.find("#talent_flesh").prop("checked", !!pt.flesh);
          html.find("#talent_raptor").prop("checked", !!pt.raptor);
          html.find("#talent_force_channel").prop("checked", !!pt.forceChannel);
        }

        html.find("#weaponId").on("change", refresh);
        html.find("#modeKey").on("change", refreshTalents);
        html.find("#twoWeaponAttack").on("change", refreshTalents);
        html.find("#horde").on("change", syncHordeBonus);
        refresh();
        if (pendingMirrorSetup) {
          html.find("#modeKey").val(pendingMirrorSetup.modeKey ?? html.find("#modeKey").val());
        }
      },
      buttons: {
        attack: {
          label: "Attack",
          callback: html => {
            const targetConfigs = [];
            html.find("#targetsBody tr.target-row").each((_, row) => {
              const $r = $(row);
              const rangeMod = Number($r.find(".target-range-mod").val() || 0);
              targetConfigs.push({
                tokenUuid: String($r.data("uuid")),
                targetName: String($r.data("name")),
                distanceMeters: Number($r.data("distance")),
                rangeMod,
                rangeLabel: (attacker.items.get(html.find("#weaponId").val())?.system?.class === "melee") ? "Melee" : (RANGE_BANDS.find(b => b.mod === rangeMod)?.label ?? "Normal (+0)"),
                sizeMod: Number($r.data("size-mod")),
                sizeLabel: String($r.data("size-label")),
                sizeIgnored: Number($r.data("size-ignored")) === 1
              });
            });

            resolve({
              weaponId: html.find("#weaponId").val(),
              modeKey: html.find("#modeKey").val(),
              manualMod: Number(html.find("#manualMod").val() || 0),
              aimMod: Number(html.find("#aimMod").val() || 0),
              aimLabel: html.find("#aimMod option:selected").text(),
              powerModeKey: Number(html.find("#powerMode").val() || 1),
              isHorde: html.find("#horde")[0].checked,
              hordeBonus: Number(html.find("#hordeBonus").val() || 0),
              shootingMelee: html.find("#shootMelee")[0].checked,
              twoWeaponAttack: html.find("#twoWeaponAttack")[0].checked,
              targetTokenIds: targetTokens.map(t => t.id),
              targetConfigs,
              toggles: {
                deadeye: html.find("#talent_deadeye")[0].checked,
                marksman: html.find("#talent_marksman")[0].checked,
                doubletap: html.find("#talent_doubletap")[0].checked,
                targetsel: html.find("#talent_targetsel")[0].checked,
                devastating: html.find("#talent_devastating")[0].checked,
                blademaster: html.find("#talent_blademaster")[0].checked,
                whirlwind: html.find("#talent_whirlwind")[0].checked,
                berserk: html.find("#talent_berserk")[0].checked,
                twmMelee: html.find("#talent_twm_melee")[0].checked,
                twmRanged: html.find("#talent_twm_ranged")[0].checked,
                ambi: html.find("#talent_ambi")[0].checked,
                master: html.find("#talent_master")[0].checked,
                mighty: html.find("#talent_mighty")[0].checked,
                crushing: html.find("#talent_crushing")[0].checked,
                hammer: html.find("#talent_hammer")[0].checked,
                flesh: html.find("#talent_flesh")[0].checked,
                raptor: html.find("#talent_raptor")[0].checked,
                forceChannel: html.find("#talent_force_channel")[0].checked
              },
              detectedItems: detectWeaponItems(attacker, attacker.items.get(html.find("#weaponId").val()))
            });
          }
        },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "attack"
    });

    d.render(true, { width: 600 });
  });
};

const setup = await showAttackDialog();
if (!setup) return;
if (setup.toggles?.whirlwind) {
  const wsb = attacker.system.characteristics.weaponSkill?.bonus ?? 1;
  setup.modeKey = "standard";
  if (setup.targetConfigs.length > wsb) {
    ui.notifications.warn(`Whirlwind of Death limit exceeded: max ${wsb} targets. Extra targets ignored.`);
    setup.targetConfigs = setup.targetConfigs.slice(0, wsb);
  }
}
const selectedWeapon = attacker.items.get(setup.weaponId);
const setupTraits = parseWeaponTraits(selectedWeapon ?? { system: { special: "" } });
const isSprayWeapon = hasTrait(setupTraits, "spray");
const isBlastWeapon = hasTrait(setupTraits, "blast");
const singleTargetModes = ["single","called","standard"];
if (!setup.toggles?.whirlwind && !isSprayWeapon && !isBlastWeapon && singleTargetModes.includes(setup.modeKey) && setup.targetConfigs.length > 1) {
  ui.notifications.warn("Selected attack type can only target one opponent.");
  return;
}
await runAttackWorkflow(setup);
} catch (err) {
  console.error("DH2E external attack workflow failed", err);
  ui.notifications.error("DH2E workflow failed. Check console for details.");
}
}
