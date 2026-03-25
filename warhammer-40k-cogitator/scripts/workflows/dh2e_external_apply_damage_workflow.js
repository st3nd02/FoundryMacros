import { getCriticalText, inlineRollCriticalText } from "../data/criticals.js";

export async function runApplyDamageWorkflow() {
/**
 * DH2e External Apply Damage Workflow (Foundry V13)
 * Version: 1.4
 * GM-only damage application from `game.dh2eLastDamage`.
 */


if (!game.user.isGM) return ui.notifications.warn("Apply Damage is GM-only.");

// ======================================
// Damage Type display (BEAUTIFIED)
// ======================================
function getDamageTypeHTML(damageType){

  if (!damageType) return "";

  const typeColors = {
    energy:    "#4fd1ff",
    explosive: "#ff9933",
    rending:   "#cc3333",
    impact:    "#aaaaaa"
  };

  const key = damageType.toLowerCase();
  const color = typeColors[key] || "#ffffff";

  return `
  <span style="
    color:${color};
    font-weight:900;
    letter-spacing:1px;
    text-shadow:
      0 0 1px black,
      0 0 2px black,
      1px 1px 0 black,
     -1px -1px 0 black;
  ">
    ${damageType.toUpperCase()}
  </span>
  `;
}
const WORKFLOW_NS = "warhammer-40k-cogitator";
const WORKFLOW_KEY = "dh2eExternalWorkflow";
const CONDITION_MAP = {
  bleeding: { id: "bleeding", name: "Bleeding", aliases: ["Blood Loss"] },
  blinded: { id: "blinded", name: "Blinded" },
  deafened: { id: "deafened", name: "Deafened" },
  fear: { id: "fear", name: "Fear", aliases: ["Frightened"] },
  fire: { id: "fire", name: "Fire", aliases: ["On Fire"] },
  grappled: { id: "grappled", name: "Grappled" },
  hidden: { id: "hidden", name: "Hidden" },
  pinned: { id: "pinned", name: "Pinned" },
  poisoned: { id: "poisond", name: "Poisoned" },
  prone: { id: "prone", name: "Prone" },
  stunned: { id: "stunned", name: "Stunned" },
  unconscious: { id: "unconscious", name: "Unconscious" },
  dead: { id: "dead", name: "Dead" }
};
const actorHasCondition = (actorDoc, conditionIdOrName) => {
  if (!actorDoc?.effects) return false;
  const needle = String(conditionIdOrName ?? "").trim().toLowerCase();
  if (!needle) return false;
  return actorDoc.effects.some(effect => {
    if (!effect || effect.disabled || effect.isSuppressed) return false;
    const statuses = Array.isArray(effect.statuses) ? effect.statuses : Array.from(effect.statuses ?? []);
    const normalizedStatuses = statuses.map(status => String(status ?? "").trim().toLowerCase());
    const coreStatus = String(effect.flags?.core?.statusId ?? "").trim().toLowerCase();
    const ceStatus = String(effect.flags?.["dfreds-convenient-effects"]?.effectId ?? "").trim().toLowerCase();
    const name = String(effect.name ?? "").trim().toLowerCase();
    if (normalizedStatuses.includes(needle)) return true;
    if (coreStatus === needle || ceStatus === needle) return true;
    return name.includes(needle);
  });
};

const buildWorkflowHtml = state => {
  const outlined = (text, color) => `<span style="font-weight:700;color:${color};text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;">${text}</span>`;
  const statusColor = status => {
    const normalized = String(status ?? "").toLowerCase();
    if (normalized.includes("jam")) return "#b267ff";
    if (normalized.includes("miss")) return "#ff3b3b";
    if (normalized.includes("hit") || normalized.includes("ok") || normalized.includes("out of ammo")) return "#1aff1a";
    return "#d9d9d9";
  };
  const joinedTargets = (predicate = null) => {
    const targets = (state.targets ?? []).filter(t => !predicate || predicate(t)).map(t => t.name);
    return targets.length ? targets.join(", ") : "the target";
  };
  const styledDegrees = target => {
    const value = Number(target.defenseDegrees ?? 0);
    if (!value) return `<div style="text-align:center;">—</div>`;
    if (target.defenseSuccess) return `<div style="text-align:center;">${outlined(`${value} Degrees of Success`, "#1aff1a")}</div>`;
    return `<div style="text-align:center;">${outlined(`${value} Degrees of Failure`, "#ff2a2a")}</div>`;
  };
  const styledAttackDegrees = () => {
    const value = Number(state.attackDegrees ?? 0);
    if (!value) return "";
    if (value > 0) return `<div style="text-align:center;">${outlined(`${value} Degrees of Success`, "#1aff1a")}</div>`;
    return `<div style="text-align:center;">${outlined(`${Math.abs(value)} Degrees of Failure`, "#ff2a2a")}</div>`;
  };
  const buildDescription = () => {
    const appliedTargets = joinedTargets(t => t.damageApplied || t.damageResolved);
    const targetNames = joinedTargets();
    const hitWord = Number(state.totalHits ?? 0) === 1 ? "hit" : "hits";
    const missWord = Number(state.totalHits ?? 0) > 0 ? `${state.totalHits} ${hitWord}` : "misses";
    return `<b>${state.attackerName}</b> attacks <b>${targetNames}</b> with <b>${state.weaponName}</b> and ${missWord}. <b>${appliedTargets}</b> receives damage from <b>${state.attackerName}</b>.`;
  };

  const cards = (state.targets ?? []).map(t => {
    const sizeTxt = t.sizeIgnored ? `${t.sizeLabel} (Black Carapace ignores)` : `${t.sizeLabel} ${t.sizeMod >= 0 ? "+" : ""}${t.sizeMod}`;
    const shownHits = state.horde?.active ? (t.hordeHitsPreview ?? t.allocatedHits ?? 0) : (t.allocatedHits ?? 0);
    const hitsLabel = state.horde?.active ? "Hits vs Horde" : "Hits";
    const forceFieldSummary = t.forceFieldChecked
      ? `<div><b>Force Field:</b> ${outlined(t.forceFieldName ?? "—", "#ffad55")} | <b>Protection:</b> ${outlined(t.forceFieldProtection ?? "—", "#ffad55")} | <b>Overload:</b> ${outlined(t.forceFieldOverload ?? "—", "#ffad55")} | <b>Roll:</b> ${outlined(t.forceFieldRoll ?? "—", "#bd7548")}</div><div><b>Force Field Result:</b> ${outlined(t.forceFieldOutcome ?? "—", statusColor(t.forceFieldOutcome))}</div>`
      : "";
    const damageSummary = t.applySummary
      ? `<div style="margin-top:4px;padding:6px;border:1px solid #777;border-radius:6px;">${t.applySummary}</div>`
      : (t.damageSummary
        ? `<div style="margin-top:4px;padding:6px;border:1px solid #777;border-radius:6px;">${t.damageSummary}</div>`
        : "");

    return `<div style="border:1px solid #555;border-radius:6px;padding:6px;margin:6px 0;">
      <div><b>${t.name}</b></div>
      <div><b>Distance:</b> ${t.distanceMeters}m | <b>Range:</b> ${t.rangeLabel}</div>
      <div><b>Size:</b> ${sizeTxt}</div>
      <div><b>Defense Roll:</b> ${outlined(t.defenseTargetNumber ?? "—", "#3aa0ff")} vs ${outlined(t.defenseRoll ?? "—", "#ff9f1a")}</div>
      <div><b>Status:</b> ${outlined(t.defenseOutcome ?? "Pending", statusColor(t.defenseOutcome))} | <b>${hitsLabel}:</b> ${shownHits}</div>
      ${forceFieldSummary}
      ${styledDegrees(t)}
      ${damageSummary}
    </div>`;
  }).join("");

  const showPowerMode = ["las", "plasma"].includes(String(state.weaponClass ?? "").toLowerCase()) || ["las", "plasma"].includes(String(state.weaponType ?? "").toLowerCase());
  const aimPowerLine = `<div><b>Aim:</b> ${state.aimLabel}${showPowerMode ? ` | <b>Power:</b> ${state.powerModeLabel}` : ""}</div>`;
  return `<div data-workflow-id="${state.id}">
    <div style="margin:0 0 6px 0;font-size:1.05em;font-style:italic;">${buildDescription()}</div>
    <div><b>Attack Mode:</b> ${state.modeLabel}</div>
    ${aimPowerLine}
    <div><b>Modifiers:</b> ${state.modifierNotes?.join(", ") || "None"}</div>
    <div><b>Talents:</b> ${state.selectedTalents?.join(", ") || "None"}</div>
    <div><b>Weapon Traits:</b> ${state.weaponTraits || "None"}</div>
    <div><b>Items:</b> ${state.weaponItems?.join(", ") || "None"} | <b>Craftsmanship:</b> ${state.craftName}</div>
    <div><b>Attack Roll:</b> ${outlined(state.attackRoll ?? "—", "#ff9f1a")} | <b>Target:</b> ${outlined(state.bestTarget ?? Math.max(...(state.targets ?? []).map(t => Number(t.targetNumber ?? 0))), "#3aa0ff")}</div>
    <div><b>Status:</b> ${outlined(state.statusText ?? "Pending", statusColor(state.statusText))} | <b>Total ${state.horde?.active ? "Hits vs Horde" : "Hits"}:</b> ${state.totalHits ?? 0}</div>
    ${styledAttackDegrees()}
    ${cards}
  </div>`;
};


const candidates = [];
for (const msg of game.messages.contents) {
  const state = msg.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
  if (!state?.targets?.length) continue;
  for (const target of state.targets) {
    if (!target.damageResolved || target.damageApplied) continue;
    const targetUuid = target.tokenUuid ?? target.targetTokenUuid;
    if (!targetUuid) continue;
    const damageData = target.damageApplicationData ?? {
      attacker: state.attackerName,
      target: target.name,
      targetTokenUuid: targetUuid,
      weapon: state.weaponName,
      modeKey: state.modeKey ?? null,
      modeLabel: state.modeLabel ?? null,
      damageType: "impact",
      penetration: 0,
      hits: (target.damageRolls ?? []).length,
      hitsData: (target.damageRolls ?? []).map((r, idx) => ({ hit: idx + 1, location: r.loc, damage: r.total, fury: null })),
      dos: state.dos ?? 0,
      fury: [],
      properties: []
    };

    if (!damageData?.hitsData?.length) continue;

    candidates.push({ msg, state, target, targetUuid, damageData, label: `${state.attackerName} -> ${target.name} (${damageData.hitsData.length} hit${damageData.hitsData.length === 1 ? "" : "s"}) [${state.weaponName}]` });
  }
}

if (!candidates.length) {
  const fallback = game.dh2eLastDamage;
  if (!fallback?.targetTokenUuid || !fallback?.hitsData?.length) return ui.notifications.warn("No pending workflow damage to apply.");
  candidates.push({ msg: null, state: null, target: null, targetUuid: fallback.targetTokenUuid, damageData: fallback, label: `${fallback.attacker} -> ${fallback.target} [legacy payload]` });
}

const optionHtml = candidates.map((c, i) => `<option value="${i}">${c.label}</option>`).join("");
const selectedIndex = await new Promise(resolve => {
  new Dialog({
    title: "Select Workflow Damage",
    content: `<form><div class="form-group"><label><b>Damage Entry</b></label><select id="pick">${optionHtml}</select></div></form>`,
    buttons: {
      ok: { label: "Continue", callback: html => resolve(Number(html.find("#pick").val() || 0)) },
      cancel: { label: "Cancel", callback: () => resolve(null) }
    },
    default: "ok"
  }).render(true, { width: 700 });
});
if (selectedIndex == null) return;
const selectedEntry = candidates[selectedIndex];
const dmg = selectedEntry.damageData;

async function clearSelectedDamageFromWorkflow() {
  if (selectedEntry.msg && selectedEntry.state) {
    const latest = selectedEntry.msg.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
    if (latest?.targets?.length) {
      const tgt = latest.targets.find(t => (t.tokenUuid ?? t.targetTokenUuid) === dmg.targetTokenUuid);
      if (tgt) {
        tgt.damageResolved = false;
        tgt.damageApplied = false;
        tgt.damageSummary = null;
        tgt.applySummary = null;
        tgt.damageRolls = [];
        tgt.damageApplicationData = null;
      }
      await selectedEntry.msg.update({
        content: buildWorkflowHtml(latest),
        flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: latest } }
      });
    }
  } else {
    game.dh2eLastDamage = null;
  }
}

const token = await fromUuid(dmg.targetTokenUuid);
if (!token) return ui.notifications.warn("Target token not found.");
const actor = token.actor;

async function applyConvenientEffect(actorDoc, { effectId, effectName, effectAliases = [], counter = null }) {
  if (!actorDoc) return false;
  const effectInterface = game.dfreds?.effectInterface;
  const preferredNames = [effectName, ...effectAliases].filter(Boolean);
  const statusTemplate = Array.isArray(CONFIG?.statusEffects)
    ? CONFIG.statusEffects.find(status => String(status?.id ?? "").toLowerCase() === String(effectId ?? "").toLowerCase())
    : null;
  const findExistingEffect = () => actorDoc.effects.find(effect => {
    const statuses = Array.isArray(effect.statuses) ? effect.statuses : Array.from(effect.statuses ?? []);
    const ids = statuses.map(status => String(status ?? "").toLowerCase());
    const coreStatus = String(effect.flags?.core?.statusId ?? "").toLowerCase();
    const dfredsId = String(effect.flags?.["dfreds-convenient-effects"]?.effectId ?? "").toLowerCase();
    const name = String(effect.name ?? "").toLowerCase();
    const effectIdLc = String(effectId ?? "").toLowerCase();
    const nameMatches = preferredNames.some(candidate => name === String(candidate ?? "").toLowerCase());
    return ids.includes(effectIdLc) || coreStatus === effectIdLc || dfredsId === effectIdLc || nameMatches;
  });
  const createSystemActiveEffect = async () => {
    if (!effectId) return false;
    if (findExistingEffect()) return true;

    const systemEffectData = {
      name: statusTemplate?.name || preferredNames[0] || effectId,
      img: statusTemplate?.img || statusTemplate?.icon || "icons/svg/aura.svg",
      icon: statusTemplate?.icon || statusTemplate?.img || "icons/svg/aura.svg",
      transfer: false,
      disabled: false,
      statuses: [effectId],
      flags: { core: { statusId: effectId } }
    };

    try {
      if (typeof actorDoc.toggleStatusEffect === "function") {
        await actorDoc.toggleStatusEffect(effectId, { active: true });
      } else {
        await actorDoc.createEmbeddedDocuments("ActiveEffect", [systemEffectData]);
      }
    } catch (_) {
      try {
        await actorDoc.createEmbeddedDocuments("ActiveEffect", [systemEffectData]);
      } catch (_) {
        return false;
      }
    }
    return Boolean(findExistingEffect());
  };
  const paramsByPriority = [
    { effectId, uuid: actorDoc.uuid },
    { effectId, uuids: [actorDoc.uuid] },
    ...preferredNames.flatMap(name => ([
      { effectName: name, uuid: actorDoc.uuid },
      { effectName: name, uuids: [actorDoc.uuid] }
    ]))
  ].filter(params => params.effectId || params.effectName);

  // Prefer native/system status effects first so Foundry status icon counters work reliably.
  let hasEffect = await createSystemActiveEffect();

  if (!hasEffect && effectInterface?.addEffect) {
    for (const params of paramsByPriority) {
      try {
        await effectInterface.addEffect(params);
        if (findExistingEffect()) {
          hasEffect = true;
          break;
        }
      } catch (_) {
        // Keep trying CE signatures.
      }
    }
  }

  if (!hasEffect && !findExistingEffect()) {
    await actorDoc.createEmbeddedDocuments("ActiveEffect", [{
      name: preferredNames[0] || effectId || "Status Effect",
      img: "icons/svg/aura.svg",
      icon: "icons/svg/aura.svg",
      transfer: false,
      disabled: false,
      statuses: effectId ? [effectId] : [],
      flags: effectId ? { core: { statusId: effectId } } : {}
    }]);
    hasEffect = Boolean(findExistingEffect());
  }

  if (Number.isFinite(Number(counter)) && Number(counter) > 0) {
    const numericCounter = Number(counter);
    const activeEffect = findExistingEffect();
    if (activeEffect) {
      const existingCounter = Number(
        activeEffect.getFlag?.("statuscounter", "value")
        ?? activeEffect.flags?.statuscounter?.value
        ?? activeEffect.flags?.statuscounter?.counter?.value
        ?? activeEffect.flags?.statusIconCounters?.value
        ?? activeEffect.flags?.statusIconCounters?.counter
        ?? activeEffect.flags?.["status-icon-counters"]?.value
        ?? activeEffect.flags?.["status-icon-counters"]?.counter
        ?? 0
      ) || 0;
      const nextCounter = existingCounter + numericCounter;
      const remainingRounds = Number(activeEffect.duration?.remaining);
      const currentDuration = Number.isFinite(remainingRounds) ? Math.max(0, Math.ceil(remainingRounds)) : Math.max(0, Number(activeEffect.duration?.rounds ?? 0));
      const nextDuration = Math.max(currentDuration, nextCounter);
      const combat = game.combat;
      let combatRound = Number(combat?.round ?? 0);
      let combatTurn = Number(combat?.turn ?? 0);
      const targetTurnIndex = Number(combat?.turns?.findIndex(combatant => combatant?.actor?.id === actorDoc.id) ?? -1);
      if (Number.isInteger(targetTurnIndex) && targetTurnIndex >= 0) {
        if (Number.isInteger(combatTurn) && targetTurnIndex < combatTurn) combatRound += 1;
        combatTurn = targetTurnIndex;
      }
      await activeEffect.update({
        "flags.statuscounter.value": nextCounter,
        "flags.statuscounter.visible": nextCounter > 1,
        "flags.statuscounter.config.type": "default",
        "flags.statuscounter.config.dataSource": "flags.statuscounter.value",
        "flags.statuscounter.config.modifyDuration": true,
        "flags.statuscounter.config.durationType": 1,
        "flags.statuscounter.counter": { value: nextCounter },
        "flags.statusIconCounters.counter": nextCounter,
        "flags.statusIconCounters.value": nextCounter,
        "flags.status-icon-counters.counter": nextCounter,
        "flags.status-icon-counters.value": nextCounter,
        "duration.rounds": nextDuration,
        "duration.startRound": combatRound,
        "duration.startTurn": combatTurn
      });
    }
  }

  return Boolean(findExistingEffect());
}

function extractStunnedRounds(text) {
  if (!text) return 0;
  const plain = String(text).replace(/<[^>]*>/g, " ");
  let rounds = 0;
  const regex = /stunned\s+for\s+(\d+)\s*round/gi;
  let match;
  while ((match = regex.exec(plain)) !== null) {
    rounds += Math.max(0, Number(match[1] ?? 0));
  }
  return rounds;
}

function extractDurationByKeyword(text, keywordRegex, units = ["round", "rounds"]) {
  if (!text) return 0;
  const plain = String(text).replace(/<[^>]*>/g, " ");
  const unitAlternation = units.map(unit => unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`${keywordRegex.source}\\s+for\\s+((?:\\d+|one|a|an|next))\\s*(?:${unitAlternation})\\b`, "gi");
  let total = 0;
  let match;
  while ((match = regex.exec(plain)) !== null) {
    total += Math.max(parseRoundAmount(match[1]), 0);
  }
  return total;
}

function parseRoundAmount(raw) {
  const text = String(raw ?? "").trim().toLowerCase();
  if (!text) return 0;
  if (/^\d+$/.test(text)) return Number(text);
  if (text === "a" || text === "an" || text === "one" || text === "next") return 1;
  return 0;
}

function extractRoundsByKeyword(text, keywordRegex) {
  if (!text) return 0;
  const plain = String(text).replace(/<[^>]*>/g, " ");
  const regex = new RegExp(`${keywordRegex.source}\\s+for\\s+((?:\\d+|one|a|an|next))\\s*round`, "gi");
  let rounds = 0;
  let match;
  while ((match = regex.exec(plain)) !== null) {
    rounds += Math.max(parseRoundAmount(match[1]), 0);
  }
  return rounds;
}

function textMentionsBloodLoss(text) {
  if (!text) return false;
  const plain = String(text).replace(/<[^>]*>/g, " ");
  return /\bblood\s+loss\b/i.test(plain);
}

function accumulateConditionCountsFromText(counts, text) {
  if (!text) return;
  const plain = String(text).replace(/<[^>]*>/g, " ").toLowerCase();
  const add = (id, amount = 1) => {
    counts[id] = (counts[id] ?? 0) + Math.max(Number(amount) || 0, 0);
  };

  if (/\bblood\s+loss\b|\bbleeding\b/.test(plain)) add("bleeding");
  if (/\bprone\b/.test(plain)) add("prone");
  const blindedDuration = extractDurationByKeyword(plain, /\bblinded\b|\bblindness\b|\bblind\b/, ["round", "rounds", "hour", "hours", "minute", "minutes"]);
  if (blindedDuration > 0) add("blinded", blindedDuration);
  else if (/\bblinded\b|\bblindness\b|\bblind\b/.test(plain)) add("blinded");
  const deafenedDuration = extractDurationByKeyword(plain, /\bdeafened\b|\bdeafness\b|\bdeaf\b/, ["round", "rounds", "hour", "hours", "minute", "minutes"]);
  if (deafenedDuration > 0) add("deafened", deafenedDuration);
  else if (/\bdeafened\b|\bdeafness\b|\bdeaf\b/.test(plain)) add("deafened");
  if (/\bfear\b|\bfrightened\b|\bshocked\b|\bpanic\b|\bsnap out of it\b/.test(plain)) add("fear");
  if (/\bcatch fire\b|\bon fire\b|\bfire\b/.test(plain)) add("fire");
  if (/\bgrappled\b|\bsnared\b|\bimmobilized\b|\bimmobilised\b/.test(plain)) add("grappled");
  if (/\bpinned\b|\bpinning\b/.test(plain)) add("pinned");

  const stunnedRounds = extractDurationByKeyword(plain, /\bstunned\b/, ["round", "rounds"]);
  if (stunnedRounds > 0) add("stunned", stunnedRounds);
  else if (/\bstunned\b/.test(plain)) add("stunned", 1);

  const unconsciousRounds = extractRoundsByKeyword(plain, /\bunconscious\b/);
  if (unconsciousRounds > 0) add("unconscious", unconsciousRounds);
  else if (/\bunconscious\b|\bcatatonic\b/.test(plain)) add("unconscious", 1);

  if (/\bdead\b|\bdie\b|\bdies\b|\bperish\b/.test(plain)) add("dead", 1);
}

function extractFatigueLevelsFromText(text) {
  if (!text) return 0;
  const plain = String(text).replace(/<[^>]*>/g, " ");
  let levels = 0;
  const regex = /(?:suffers?|gains?)\s+(\d+)\s+levels?\s+of\s+fatigue/gi;
  let match;
  while ((match = regex.exec(plain)) !== null) {
    levels += Math.max(0, Number(match[1] ?? 0));
  }
  return levels;
}

function styleCriticalEffectKeywords(text) {
  const outlined = (label, color) => `<span style="font-weight:900;color:${color};text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;">${label}</span>`;
  const stylers = [
    { regex: /\bStunned\b/g, color: "#00b3ff" },
    { regex: /\bBlinded\b/g, color: "#6c63ff" },
    { regex: /\bDeafened\b/g, color: "#5dade2" },
    { regex: /\bBlood Loss\b/g, color: "#ff4d4d" },
    { regex: /\bProne\b/g, color: "#f4d03f" },
    { regex: /\bUnconscious\b/g, color: "#8e44ad" },
    { regex: /\bDead\b/g, color: "#ff2a2a" }
  ];
  return stylers.reduce((styledText, styler) => styledText.replace(styler.regex, match => outlined(match, styler.color)), String(text ?? ""));
}

function actorImmuneToDeadCondition(actorDoc) {
  const traitNames = (actorDoc?.items ?? [])
    .filter(item => item.type === "trait")
    .map(item => String(item.name ?? "").toLowerCase());
  return traitNames.some(name =>
    name.includes("undying")
    || name.includes("necron")
    || name.includes("from beyond")
    || name.includes("regeneration")
    || name.includes("strange physiology")
    || name.includes("black carapace")
  );
}

function prettyLoc(loc){
  return loc.replace(/([A-Z])/g," $1").replace(/^./,s=>s.toUpperCase());
}

function locKey(loc){
  return {
    "Head":"head",
    "Body":"body",
    "Left Arm":"leftArm",
    "Right Arm":"rightArm",
    "Left Leg":"leftLeg",
    "Right Leg":"rightLeg"
  }[loc] || "body";
}
function critLocKey(loc){
  if (loc.includes("Arm")) return "Arm";
  if (loc.includes("Leg")) return "Leg";
  if (loc === "Head") return "Head";
  return "Body";
}

const actorHasTrueGrit = (actor.items ?? [])
  .some(item => item.type === "talent" && String(item.name ?? "").trim().toLowerCase() === "true grit");

new Dialog({

title:`Apply Damage → ${actor.name}`,

content:`
<form>
<label>Cover:
<input type="number" id="cover" value="0" style="width:60px;"></label>
<br><br>

<label>Extra Damage (each hit):
<input type="number" id="extra" value="0" style="width:60px;"></label>
<br><br>

<label><input type="checkbox" id="ignoreArmour"> Ignore Armour</label><br>
<label><input type="checkbox" id="trueGrit" ${actorHasTrueGrit ? "checked" : ""}> True Grit</label>
</form>
`,

buttons:{
apply:{
label:"Apply",
callback: async (html)=>{

const coverStart = Number(html.find("#cover").val()) || 0;

if (dmg.horde?.active) {
  const currentWounds = Number(actor.system?.wounds?.value ?? 0);
  const maxWounds = Number(actor.system?.wounds?.max ?? currentWounds);
  const inflicted = Math.max(0, Number(dmg.horde.magnitudeHits ?? 0));
  const newWounds = Number.isFinite(maxWounds) && maxWounds >= 0
    ? Math.min(maxWounds, currentWounds + inflicted)
    : (currentWounds + inflicted);
  await actor.update({
    "system.wounds.value": newWounds,
    "system.wounds.critical": 0
  });

  const hordeSummary = `
<div style="text-align:center;">

<span style="font-weight:700;color:#000;">Magnitude done:</span> <span style="font-weight:700;color:#000;">${inflicted}</span><br>
<b>Magnitude:</b> ${currentWounds} -> ${newWounds}${Number.isFinite(maxWounds) && maxWounds >= 0 ? ` / ${maxWounds}` : ""}<br>
${(dmg.properties ?? []).length ? `${(dmg.properties ?? []).map(p => p === "Horde Target" ? `<b>${p}</b>` : p).join(", ")}<br>` : ""}
<i>Horde rules applied: no hit locations, no Righteous Fury, no critical effects.</i>
</div>`;

  if (selectedEntry.msg && selectedEntry.state) {
    const latest = selectedEntry.msg.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
    if (latest?.targets?.length) {
      const tgt = latest.targets.find(t => (t.tokenUuid ?? t.targetTokenUuid) === dmg.targetTokenUuid);
      if (tgt) {
        tgt.damageApplied = true;
        tgt.applySummary = hordeSummary;
      }
      await selectedEntry.msg.update({
        content: buildWorkflowHtml(latest),
        flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: latest } }
      });
    }
  } else {
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor}), content: hordeSummary });
  }
  return;
}

const extra = Number(html.find("#extra").val()) || 0;
const ignoreArmour = html.find("#ignoreArmour")[0].checked;
const trueGrit = html.find("#trueGrit")[0].checked;
const warpWeaponIgnoresArmour = (dmg.properties ?? []).some((property) => String(property ?? "").toLowerCase().includes("warp weapon"));
const armourIgnored = ignoreArmour || warpWeaponIgnoresArmour;

dmg.talentModifier = dmg.talentModifier ?? {
  attack: { attackRoll: 0, penetration: 0, damage: 0, defense: 0, notes: [] },
  defense: { attackRoll: 0, penetration: 0, damage: 0, defense: 0, notes: [] },
  damage: { attackRoll: 0, penetration: 0, damage: 0, defense: 0, notes: [] },
  applyDamage: { attackRoll: 0, penetration: 0, damage: 0, defense: 0, notes: [] }
};
dmg.talentModifier.applyDamage.notes.push("Apply Damage workflow resolved.");

let coverRemaining = coverStart;
const selectedTalents = Array.isArray(dmg.selectedTalents) ? dmg.selectedTalents : [];
const nowhereToHideActive = !!dmg.nowhereToHideActive || selectedTalents.some((name) => String(name ?? "").toLowerCase().includes("nowhere to hide"));
const isSprayOrBlast = !!dmg.spray?.resolved || (Array.isArray(dmg.properties) && dmg.properties.some((property) => {
  const text = String(property ?? "").toLowerCase();
  return text.includes("spray") || text.includes("blast");
}));
const nowhereToHideReduction = nowhereToHideActive
  ? Math.max(0, isSprayOrBlast ? 1 : Number(dmg.dos ?? 0))
  : 0;
if (nowhereToHideReduction > 0) {
  const beforeCover = coverRemaining;
  coverRemaining = Math.max(coverRemaining - nowhereToHideReduction, 0);
  dmg.talentModifier.applyDamage.notes.push(`Nowhere to Hide: cover ${beforeCover} -> ${coverRemaining} (reduced by ${nowhereToHideReduction}${isSprayOrBlast ? ", Spray/Blast rule" : " from Degrees of Success"})`);
}

// ===== PULL STATS (same pattern as original) =====
const TBtotal = actor.system.characteristics.toughness.total || 0;
const TBunnat = actor.system.characteristics.toughness.unnatural || 0;
const TBBonus = Math.floor(TBtotal/10);
const felling = Math.max(Number(dmg.felling ?? 0), 0);
const effectiveUnnaturalTB = Math.max(TBunnat - felling, 0);
const TB = TBBonus + effectiveUnnaturalTB;

const woundsMax = actor.system.wounds.max;
let woundsCurrent = actor.system.wounds.value;
let critCurrent = actor.system.wounds.critical || 0;

const armourValues = actor.system.armour;
const armourLocationKeys = ["head", "body", "leftArm", "rightArm", "leftLeg", "rightLeg"];
const startingArmourByLocation = Object.fromEntries(
  armourLocationKeys.map((key) => [key, Number(armourValues?.[key]?.value ?? 0)])
);

let report = "";
let pendingStunnedRounds = 0;
let pendingBloodLoss = textMentionsBloodLoss((dmg.properties ?? []).join(" | "));
let pendingFatigueFromCriticals = 0;
const pendingConditionCounts = {};
accumulateConditionCountsFromText(pendingConditionCounts, (dmg.properties ?? []).join(" | "));
let lastCritLocation = null;
let realCritToApply = 0;
let furyCrits = [];
const resolveCriticalLocation = () => (
  lastCritLocation
  || dmg.hitsData?.[dmg.hitsData.length - 1]?.location
  || dmg.hitsData?.[0]?.location
  || "Body"
);
const applyDirectDamageWithCritical = (damageAmount, location = null) => {
  const amount = Math.max(Number(damageAmount ?? 0), 0);
  const woundsBefore = woundsCurrent;
  let newWounds = woundsCurrent + amount;
  let critDamage = 0;
  if (newWounds > woundsMax){
    critDamage = newWounds - woundsMax;
    newWounds = woundsMax;
  }
  if (trueGrit && critDamage > 0){
    critDamage = Math.max(critDamage - TB, 1);
  }
  woundsCurrent = newWounds;
  critCurrent += critDamage;
  if (critDamage > 0){
    lastCritLocation = location || resolveCriticalLocation();
    realCritToApply = critCurrent;
  }
  return { woundsBefore, critDamage };
};
  
// ===== ARMOUR BLOCK =====
const armourBlock = `
Head ${armourValues.head?.value||0} |
Body ${armourValues.body?.value||0} |
LA ${armourValues.leftArm?.value||0} |
RA ${armourValues.rightArm?.value||0} |
LL ${armourValues.leftLeg?.value||0} |
RL ${armourValues.rightLeg?.value||0}
`;

// ===============================
// LOOP HITS
// ===============================
let totalInflicted = 0;
const hasCorrosive = (dmg.properties ?? []).some((property) => String(property ?? "").toLowerCase().includes("corrosive"));
const targetIsUnconscious = actorHasCondition(actor, "unconscious");
let corrosiveArmourDamageTotal = 0;
let corrosiveWoundsDamageTotal = 0;
for (let hit of dmg.hitsData){
  const loc = locKey(hit.location);
  const currentLocationArmour = Number(armourValues?.[loc]?.value ?? 0);

  const coverUsed = Math.max(coverRemaining,0);

  let corrosiveRoll = null;
  let corrosiveArmourDamage = 0;
  let corrosiveWoundDamage = 0;
  if (hasCorrosive) {
    corrosiveRoll = await new Roll("1d10").evaluate();
    if (game.dice3d) await game.dice3d.showForRoll(corrosiveRoll, game.user, true);
    corrosiveArmourDamage = Math.min(currentLocationArmour, Number(corrosiveRoll.total ?? 0));
    corrosiveWoundDamage = Math.max(Number(corrosiveRoll.total ?? 0) - currentLocationArmour, 0);

    if (armourValues?.[loc]) {
      armourValues[loc].value = Math.max(currentLocationArmour - corrosiveArmourDamage, 0);
    }

    corrosiveArmourDamageTotal += corrosiveArmourDamage;
    corrosiveWoundsDamageTotal += corrosiveWoundDamage;
  }

  const armourAfterCorrosive = Number(armourValues?.[loc]?.value ?? 0);
  const totalArmour = armourAfterCorrosive + coverUsed;

  const effectiveArmour = armourIgnored
    ? 0
    : Math.max(totalArmour - dmg.penetration, 0);

  const soak = effectiveArmour + TB;

  const baseDamageRaw = Number(hit.damage ?? 0);
  const baseDamage = targetIsUnconscious ? baseDamageRaw * 2 : baseDamageRaw;
  const damage = Math.max(baseDamage + extra, 0);

  const inflicted = Math.max(damage - soak, 0);
  totalInflicted += inflicted;

  const woundsBefore = woundsCurrent;

  let newWounds = woundsCurrent + inflicted + corrosiveWoundDamage;
  let critDamage = 0;

  if (newWounds > woundsMax){
    critDamage = newWounds - woundsMax;
    newWounds = woundsMax;
  }

  if (trueGrit && critDamage > 0){
    critDamage = Math.max(critDamage - TB, 1);
  }

  woundsCurrent = newWounds;
  critCurrent += critDamage;
  if (critDamage > 0){
    lastCritLocation = hit.location;
    realCritToApply = critCurrent;
  }

  if (hit.fury){
    furyCrits.push({
      location: hit.location,
      value: Number(hit?.fury?.result ?? hit?.fury ?? 1) || 1
    });
  }

  const corrosiveHitHtml = hasCorrosive
    ? `<b>Corrosive (1d10):</b> ${Number(corrosiveRoll?.total ?? 0)} → Armour -${corrosiveArmourDamage}${corrosiveWoundDamage > 0 ? ` | Wounds +${corrosiveWoundDamage} (ignores armour & TB)` : ""}<br>`
    : "";

  report += `
  <hr>
  <b>Hit ${hit.hit}</b> — <i>${prettyLoc(hit.location)}</i><br>

  <b>Cover:</b> ${coverUsed} → <i>Remaining:</i> ${Math.max(coverRemaining-1,0)}<br>

  <b>Damage:</b> <span style="
  color:#bd7548;
  font-weight:bold;
  font-size:1.1em;
  text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;
">${baseDamageRaw}${targetIsUnconscious ? " × 2 (Unconscious)" : ""}${extra?` + ${extra}`:""}</span><br>
  ${hit.keptDisplay ? `<span style="font-style:italic;color:#000;">${hit.keptDisplay}</span><br>` : ""}

  ${corrosiveHitHtml}
  <b>Soak:</b> ${soak}<br>

  <b>Inflicted:</b> <span style="color:#ff2a2a;font-weight:900; text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;">${inflicted}</span><br>

  <b>Wounds:</b> ${woundsBefore} → ${woundsCurrent}/${woundsMax}<br>

  <b>Critical Damage:</b> ${critDamage} (${critCurrent} total)

  ${hit.hit === 1 && nowhereToHideReduction > 0 ? `<b>Nowhere to Hide:</b> Cover reduced by ${nowhereToHideReduction}${isSprayOrBlast ? " (Spray/Blast)" : ` (${Number(dmg.dos ?? 0)} Degrees of Success)`}<br>` : ""}

 <span style="
    color:gold;
    font-size:1.0em;
    font-weight:bold;
    text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;
  "> ${hit.fury ? "<br><i>Righteous Fury Applied</i>" : ""}</span>
  `;

  coverRemaining--;
}

// ===============================
// TRAIT TEST RESULTS (resolved in damage workflow)
// ===============================
if (dmg.flame?.resolved) {
  report += `
  <hr>
  <b>🔥 FLAME AGILITY TEST</b><br>
  Target: <b>${dmg.flame.target}</b><br>
  Roll: <b>${dmg.flame.roll}</b><br>
  Result: ${dmg.flame.success ? "<span style='color:#6EC1FF;font-weight:900;'>SUCCESS</span>" : "<span style='color:#ff9f1a;font-weight:900;'>FAILED</span>"}
  `;
}

if (dmg.spray?.resolved) {
  report += `
  <hr>
  <b>💨 SPRAY AGILITY TEST</b><br>
  Target: <b>${dmg.spray.target}</b><br>
  Roll: <b>${dmg.spray.roll}</b><br>
  Result: ${dmg.spray.success ? "<span style='color:#6EC1FF;font-weight:900;'>SUCCESS</span>" : "<span style='color:#ff9f1a;font-weight:900;'>FAILED</span>"}
  `;
}

if (dmg.concussive?.resolved) {
  const stunRounds = Number(dmg.concussive.dof ?? 1);
  report += `
  <hr>
  <b>💥 CONCUSSIVE TOUGHNESS TEST</b><br>
  Target: <b>${dmg.concussive.target}</b><br>
  Roll: <b>${dmg.concussive.roll}</b><br>
  Result: ${dmg.concussive.success ? "<span style='color:#6EC1FF;font-weight:900;'>RESISTED</span>" : `<span style='color:#ff9f1a;font-weight:900;'>FAILED</span> (Stunned ${stunRounds} round${stunRounds === 1 ? "" : "s"})`}
  `;

  if (!dmg.concussive.success) {
    pendingConditionCounts.stunned = (pendingConditionCounts.stunned ?? 0) + stunRounds;
  }
}

if (dmg.toxic?.resolved) {
  report += `
  <hr>
  <b>☣ TOXIC TEST</b><br>
  Target: <b>${dmg.toxic.target}</b><br>
  Roll: <b>${dmg.toxic.roll}</b><br>
  Result: ${dmg.toxic.success
    ? "<span style='color:#6EC1FF;font-weight:900;'>RESISTED</span>"
    : "<span style='color:#66cc66;font-weight:900;'>FAILED</span>"}
  `;

  if (!dmg.toxic.success && Number(dmg.toxic.damage ?? 0) > 0){
    const toxicDamage = Number(dmg.toxic.damage);
    const { woundsBefore, critDamage } = applyDirectDamageWithCritical(toxicDamage);

    report += `
    <div style="font-size:1.1em; color:#66cc66; text-shadow:
      0 0 2px #000,
      0 0 4px #000,
      0 0 6px #000;"><b>☣ TOXIC DAMAGE ☣</b><br>
    Damage: ${toxicDamage}<br>
    <span style="font-weight:900;">Inflicted: ${toxicDamage} (ignores armour & TB)</span></div><br>
    Wounds: ${woundsBefore} → ${woundsCurrent}/${woundsMax}<br>
    Critical Damage: ${critDamage} (${critCurrent} total)
    `;
  }
} else if (dmg.toxic?.result && totalInflicted > 0) {
  // Backward compatibility for old payloads
  const toxicDamage = Number(dmg.toxic.result);
  const { woundsBefore, critDamage } = applyDirectDamageWithCritical(toxicDamage);
  report += `<hr><b>☣ TOXIC DAMAGE ☣</b><br>Damage: ${toxicDamage}<br>Wounds: ${woundsBefore} → ${woundsCurrent}/${woundsMax}<br>Critical Damage: ${critDamage} (${critCurrent} total)`;
}

if (dmg.hallucinogenic?.resolved) {
  const hallucinogenic = dmg.hallucinogenic;
  const hallucinogenicBaseTarget = Number(hallucinogenic.target ?? 0)
    + Number(hallucinogenic.penalty ?? 0)
    - Number(hallucinogenic.respiratorBonus ?? 0);

  const hallucinogenicResultTable = {
    1: "Bugsbugsbugsbugs! The character drops to the floor, flailing and screaming as he tries to claw off imaginary insects devouring his skin and flesh. The character gains the Prone and Stunned conditions.",
    2: "My hands…! The character believes his hands have turned into slimy tentacles, or perhaps the flesh has begun to strip off the bone in bloody lumps. Regardless of the particulars, the character drops everything he is carrying and spends the duration staring at his hands and screaming. The character is Stunned.",
    3: "They're coming through the walls! The character sees gruesome aliens bursting through the walls/ceiling/floor/bushes and opens fire. The character must spend each turn firing at a random piece of terrain within his line of sight. Any creatures caught in the line of fire are subject to attacks as normal. Each round, choose a new target at random (use the Scatter Diagram) to determine which direction that is, with a \"7\" meaning he shoots the ground, and a \"10\" meaning he fires wildly into the air.",
    4: "Nobody can see me! The character believes he is invisible and wanders aimlessly, making faces at those around him. He waddles about in random directions each round (use the Scatter Diagram), using a Full Action to move. The character retains his Reactions.",
    5: "I can fly! The sky looks so big and inviting, the character flaps his arms trying to imitate a pterasquirrel. He might do nothing but jump up and down on the spot. If he is standing above ground level, he may throw himself off in a random direction, with the usual consequences for falling—appalling injury or death being the likely outcomes.",
    6: "They've got it in for me…! The character is overcome with paranoia, believing even his own comrades are out to get him. On the character's turn, he must move to a position of cover, getting out of line of sight from any other characters. He remains hidden until the effect ends, moving to new cover as needed to stay as hidden as possible.",
    7: "They got me! The character believes that the gas is toxic and collapses to the floor as if dead; he counts as being Helpless. Other characters who sees him \"die\" must pass a Challenging (+0) Intelligence test; should they fail then they also think the character is dead.",
    8: "I'll take you all on! The character is filled with a burning rage and a desire for violence. The character becomes Frenzied (see page 127) for the duration of the effects, and must attack the closest opponent.",
    9: "I'm only little! The character believes he has shrunk to half his normal size and everything else is big and frightening now. All other characters count as having the Fear (3) trait to the character.",
    10: "The worms! The character desperately tries to remove a massive fanged worm he thinks is slowly winding its way up his leg. If holding a gun, he shoots himself with it or, if not, he hits himself in the leg with whatever melee weapon he is holding. If the character is currently holding no weapon, he draws a random weapon from those he carries and attacks himself with it. Randomly determine which leg the character believes to be trapped by the worm. The attack automatically inflicts a single hit with 1d5 degrees of success that deals damage normally."
  };

  const resultText = hallucinogenic.resultText ?? hallucinogenicResultTable[Number(hallucinogenic.effectRoll ?? 0)] ?? "";
  const inlineRolls = hallucinogenic.resultInlineRolls
    ?? (Number(hallucinogenic.effectRoll ?? 0) === 3 || Number(hallucinogenic.effectRoll ?? 0) === 4
      ? "Scatter Diagram: [[/r 1d10]]"
      : (Number(hallucinogenic.effectRoll ?? 0) === 10 ? "1d5 degrees of success: [[/r 1d5]]" : ""));

  report += `
  <hr>
  <b>🌀 HALLUCINOGENIC (${Number(hallucinogenic.value ?? 1)}) TOUGHNESS TEST</b><br>
  Target: <b>${hallucinogenic.target}</b> (T ${hallucinogenicBaseTarget} - ${Number(hallucinogenic.penalty ?? 0)}${Number(hallucinogenic.respiratorBonus ?? 0) > 0 ? ` + ${Number(hallucinogenic.respiratorBonus ?? 0)} Respirator` : ""})<br>
  Roll: <b>${hallucinogenic.roll}</b><br>
  Result: ${hallucinogenic.success
    ? "<span style='color:#6EC1FF;font-weight:900;'>RESISTED</span>"
    : `<span style='color:#ff9f1a;font-weight:900;'>FAILED</span> (Duration: <b>${hallucinogenic.duration}</b> round${Number(hallucinogenic.duration ?? 0) === 1 ? "" : "s"})<br>${resultText}${inlineRolls ? `<br>${inlineRolls}` : ""}`}
  `;
}

let shockingOutcomeSummary = "";
let snareOutcomeSummary = "";
let suppressingOutcomeSummary = "";
const suppressModeKey = String(dmg.modeKey ?? "").toLowerCase();
const suppressingPenalty = suppressModeKey === "suppresssemi"
  ? 10
  : (suppressModeKey === "suppressfull" ? 20 : 0);

if (suppressingPenalty > 0) {
  const willpowerTotal = Math.max(1, Number(actor.system?.characteristics?.willpower?.total ?? 0));
  const suppressingTarget = Math.max(1, willpowerTotal - suppressingPenalty);
  const suppressingRoll = await new Roll("1d100").evaluate();
  if (game.dice3d) await game.dice3d.showForRoll(suppressingRoll, game.user, true);
  const resisted = suppressingRoll.total <= suppressingTarget && suppressingRoll.total !== 100;

  report += `
  <hr>
  <b><span style='color:#f4d03f;'>🔻 SUPPRESSING FIRE WILLPOWER TEST</span></b><br>
  Mode: <b>${dmg.modeLabel ?? dmg.modeKey ?? "Suppressing Fire"}</b><br>
  Target: <b>${suppressingTarget}</b> (WP ${willpowerTotal} - ${suppressingPenalty})<br>
  Roll: <b>${suppressingRoll.total}</b><br>
  Result: ${resisted
    ? "<span style='color:#6EC1FF;font-weight:900;'>SUCCESS</span> (Avoids Pinning)"
    : "<span style='color:#ff9f1a;font-weight:900;'>FAILED</span> (<span style='color:#ffd200;font-weight:900;'>Pinned</span>)"}
  `;

  if (!resisted) {
    pendingConditionCounts.pinned = (pendingConditionCounts.pinned ?? 0) + 1;
    await applyConvenientEffect(actor, {
      effectId: "pinned",
      effectName: "Pinned"
    });
  }

  suppressingOutcomeSummary = resisted
    ? `<br><b>${dmg.target}</b> passed Suppressing Fire WP test (${suppressingRoll.total}/${suppressingTarget}) and avoided pinning.`
    : `<br><b>${dmg.target}</b> failed Suppressing Fire WP test (${suppressingRoll.total}/${suppressingTarget}) — <span style='color:#ffd200;font-weight:900;'>Pinned</span>.`;
}

const hasShocking = Boolean(dmg.shocking?.active)
  || (dmg.properties ?? []).some(p => String(p).toLowerCase().includes("shocking"));

if (hasShocking && totalInflicted > 0) {
  const shockingTarget = Math.max(1, Number(actor.system?.characteristics?.toughness?.total ?? 0));
  const shockingRoll = await new Roll("1d100").evaluate();
  if (game.dice3d) await game.dice3d.showForRoll(shockingRoll, game.user, true);

  const succeeded = shockingRoll.total <= shockingTarget && shockingRoll.total !== 100;
  const dof = succeeded ? 0 : Math.max(1, 1 + Math.floor((shockingRoll.total - shockingTarget) / 10));

  report += `
  <hr>
  <b><span style='color:#ffd200;'>⚡</span> <span style='color:#00b3ff;'>SHOCKING TOUGHNESS TEST</span></b><br>
  Target: <b>${shockingTarget}</b><br>
  Roll: <b>${shockingRoll.total}</b><br>
  Result: ${succeeded
    ? "<span style='color:#6EC1FF;font-weight:900;'>SUCCESS</span>"
    : `<span style='color:#00b3ff;font-weight:900;'>FAILED</span> (${dof} Degrees of Failure)`}
  `;

  if (succeeded) {
    shockingOutcomeSummary = `<br><b>${dmg.target}</b> succeeded vs <span style='color:#00b3ff;font-weight:900;'>Shocking</span>.`;
  } else {
    const currentFatigue = Number(actor.system?.fatigue?.value ?? 0);
    await actor.update({ "system.fatigue.value": currentFatigue + 1 });
    pendingStunnedRounds += dof;
    pendingConditionCounts.stunned = (pendingConditionCounts.stunned ?? 0) + dof;
    shockingOutcomeSummary = `<br><b>${dmg.target}</b> is <span style='color:#00b3ff;font-weight:900;'>stunned</span> for <b>${dof}</b> round${dof === 1 ? "" : "s"}.`;
  }
}


const snareProperty = (dmg.properties ?? []).find((property) => /snare/i.test(String(property ?? "")));
const snareValue = snareProperty
  ? Number(String(snareProperty).match(/snare\s*\((\d+)\)/i)?.[1] ?? 0)
  : 0;
const hasSnare = Boolean(snareProperty);

if (hasSnare && totalInflicted > 0) {
  const agilityTotal = Number(actor.system?.characteristics?.agility?.total ?? 0);
  const snarePenalty = snareValue * 10;
  const snareTarget = Math.max(1, agilityTotal - snarePenalty);
  const snareRoll = await new Roll("1d100").evaluate();
  if (game.dice3d) await game.dice3d.showForRoll(snareRoll, game.user, true);

  const succeeded = snareRoll.total <= snareTarget && snareRoll.total !== 100;

  report += `
  <hr>
  <b><span style='color:#89d185;'>🪤 SNARE AGILITY TEST</span></b><br>
  Target: <b>${snareTarget}</b> ${snarePenalty > 0 ? `(Ag ${agilityTotal} - ${snarePenalty})` : ""}<br>
  Roll: <b>${snareRoll.total}</b><br>
  Result: ${succeeded
    ? "<span style='color:#6EC1FF;font-weight:900;'>SUCCESS</span>"
    : "<span style='color:#ff9f1a;font-weight:900;'>FAILED</span>"}
  `;

  snareOutcomeSummary = succeeded
    ? `<br><b>${dmg.target}</b> avoided the <span style='color:#89d185;font-weight:900;'>Snare</span>.`
    : `<br><b>${dmg.target}</b> is <span style='color:#89d185;font-weight:900;'>Immobilized</span> by <span style='color:#89d185;font-weight:900;'>Snare</span>.`;
  if (!succeeded) {
    pendingConditionCounts.grappled = (pendingConditionCounts.grappled ?? 0) + 1;
  }
}

if (dmg.force?.resolved) {
  report += `
  <hr>
  <div style="color:#cc3333; text-shadow:0 0 2px #000,0 0 4px #000,0 0 6px #000; font-weight:900;"><b>✦ FORCE OPPOSED TEST ✦</b></div><br>
  Attacker WP: ${dmg.force.attackerWP} Roll <b>${dmg.force.attackerRoll}</b> (${dmg.force.attackerDoS} Degrees of Success)<br>
  Target WP: ${dmg.force.targetWP} Roll <b>${dmg.force.targetRoll}</b> (${dmg.force.targetDoS} Degrees of Success)<br>
  `;

  if (dmg.force.won && Number(dmg.force.result ?? 0) > 0) {
    const forceDamage = Number(dmg.force.result);
    const { woundsBefore, critDamage } = applyDirectDamageWithCritical(forceDamage);

    report += `
    <span style="color:#66cc66;font-weight:900;">ATTACKER WINS</span><br>
    <b>✦ FORCE DAMAGE ✦</b><br>
    Damage: ${forceDamage} (${dmg.force.dos}d10)<br>
    <span style="color:#cc3333;font-weight:900;">Inflicted: ${forceDamage} (ignores armour & TB)</span><br>
    Wounds: ${woundsBefore} → ${woundsCurrent}/${woundsMax}<br>
    Crit Added: ${critDamage} (${critCurrent} total)
    `;
  } else {
    report += `<span style="color:#6EC1FF;font-weight:900;">TARGET RESISTS FORCE</span>`;
  }
} else if (dmg.force?.used && dmg.force.result) {
  // Backward compatibility for old payloads
  const forceDamage = Number(dmg.force.result);
  const { woundsBefore, critDamage } = applyDirectDamageWithCritical(forceDamage);
  report += `<hr><b>✦ FORCE DAMAGE ✦</b><br>Damage: ${forceDamage}<br>Wounds: ${woundsBefore} → ${woundsCurrent}/${woundsMax}<br>Critical Damage: ${critDamage} (${critCurrent} total)`;
}

// ===== UPDATE ACTOR (same as original logic) =====
const armourUpdates = {};
for (const key of armourLocationKeys) {
  const startingArmour = Number(startingArmourByLocation[key] ?? 0);
  const currentArmour = Number(armourValues?.[key]?.value ?? 0);
  if (currentArmour !== startingArmour) {
    armourUpdates[`system.armour.${key}.value`] = currentArmour;
  }
}

await actor.update({
  "system.wounds.value": Math.min(woundsCurrent, woundsMax),
  "system.wounds.critical": critCurrent,
  ...armourUpdates
});
let critReport = "";

const damageType = String(dmg.damageType ?? "");
const critType = damageType.charAt(0).toUpperCase() + damageType.slice(1);

// ==========================
// Righteous Fury effects
// ==========================
for (let i = 0; i < furyCrits.length; i++){

  const fury = furyCrits[i];
  const loc = critLocKey(fury.location);

  let text = getCriticalText(critType, loc, fury.value);
  if (text){
    text = await inlineRollCriticalText(text);
    pendingBloodLoss = pendingBloodLoss || textMentionsBloodLoss(text);
    pendingFatigueFromCriticals += extractFatigueLevelsFromText(text);
    accumulateConditionCountsFromText(pendingConditionCounts, text);
    text = styleCriticalEffectKeywords(text);

    critReport += `
    <hr>
    <b>Righteous Fury ${i+1}:</b>
    ${loc} – ${fury.value}<br>
    ${text}
    `;
  }
}

// ==========================
// REAL CRITICAL (total)
// ==========================
if (realCritToApply > 0 && lastCritLocation){

  const loc = critLocKey(lastCritLocation);

  let text = getCriticalText(critType, loc, realCritToApply);

  if (text){
    text = await inlineRollCriticalText(text);
    pendingBloodLoss = pendingBloodLoss || textMentionsBloodLoss(text);
    pendingFatigueFromCriticals += extractFatigueLevelsFromText(text);
    accumulateConditionCountsFromText(pendingConditionCounts, text);
    text = styleCriticalEffectKeywords(text);

    critReport += `
    <hr>
    <div style="font-size:1.1em;font-weight:900;color:#ff2a2a; text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;">
    ☠ CRITICAL DAMAGE ☠
    </div>
    ${getDamageTypeHTML(critType)} – ${loc} – ${realCritToApply}<br>
    ${text}
    `;
  }
}

if (pendingFatigueFromCriticals > 0) {
  const currentFatigue = Number(actor.system?.fatigue?.value ?? 0);
  const fatigueMax = Number(actor.system?.fatigue?.max ?? 0);
  const updatedFatigue = currentFatigue + pendingFatigueFromCriticals;
  await actor.update({ "system.fatigue.value": updatedFatigue });
  if (fatigueMax > 0 && updatedFatigue >= fatigueMax) {
    const tb = Number(actor.system?.characteristics?.toughness?.bonus ?? 0);
    const unconsciousMinutes = Math.max(0, 10 - tb);
    await applyConvenientEffect(actor, {
      effectId: "unconscious",
      effectName: "Unconscious",
      counter: unconsciousMinutes > 1 ? unconsciousMinutes : null
    });
  }
  critReport += `<br><b>Fatigue from Critical Effects:</b> ${pendingFatigueFromCriticals}`;
}

if (pendingStunnedRounds > 0) pendingConditionCounts.stunned = (pendingConditionCounts.stunned ?? 0) + pendingStunnedRounds;
if (pendingBloodLoss) pendingConditionCounts.bleeding = Math.max(Number(pendingConditionCounts.bleeding ?? 0), 1);

if (Number(critCurrent ?? 0) > 11) {
  const hasPlayerOwner = Object.values(actor.ownership ?? {}).some(level => Number(level) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
  if (!hasPlayerOwner && !actorImmuneToDeadCondition(actor)) {
    pendingConditionCounts.dead = Math.max(Number(pendingConditionCounts.dead ?? 0), 1);
  }
}

for (const [conditionKey, countRaw] of Object.entries(pendingConditionCounts)) {
  const count = Math.max(Number(countRaw ?? 0), 0);
  if (count <= 0) continue;
  const condition = CONDITION_MAP[conditionKey];
  if (!condition) continue;
  if (condition.id === "dead" && (actorImmuneToDeadCondition(actor) || Object.values(actor.ownership ?? {}).some(level => Number(level) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))) continue;
  await applyConvenientEffect(actor, {
    effectId: condition.id,
    effectName: condition.name,
    effectAliases: condition.aliases ?? [],
    counter: count > 1 ? count : null
  });
}

  const corrosiveSummary = hasCorrosive
  ? `<hr><b>☣ CORROSIVE</b><br>Armour Damage: <b>${corrosiveArmourDamageTotal}</b>${corrosiveWoundsDamageTotal > 0 ? `<br>Direct Wounds: <b>${corrosiveWoundsDamageTotal}</b> (ignores armour & TB)` : ""}`
  : "";

const damageTypeHTML = getDamageTypeHTML(dmg.damageType);
  const reminderTraits = ["Crippling", "Sanctified", "Haywire"].filter((trait) =>
    (dmg.properties ?? []).some((property) => String(property ?? "").toLowerCase().includes(trait.toLowerCase()))
  );
  const traitReminderHtml = reminderTraits.length
    ? `<hr><b>Trait Reminder:</b> ${reminderTraits.join(", ")}`
    : "";
  
// ===============================
// WORKFLOW CARD INTEGRATION
// ===============================
const applySummary = `
<div style="text-align:center;">
<b>Armour:</b><br>${armourBlock}<br>
<b>Toughness Bonus:</b> ${TBBonus}<br>
<b>Unnatural Toughness:</b> ${TBunnat}${felling > 0 ? ` (Felling ${felling} → ${effectiveUnnaturalTB})` : ""}
<hr>
<b>Damage Type:</b> ${damageTypeHTML} <br>
<b>Penetration:</b> ${dmg.penetration}<br>
<b>Properties:</b> ${dmg.properties?.join(", ") || "None"}
${report}
${suppressingOutcomeSummary}
${shockingOutcomeSummary}
${snareOutcomeSummary}
${corrosiveSummary}
${trueGrit ? "<hr><i>True Grit applied</i>" : ""}
${armourIgnored ? `<br><i>Armour ignored${warpWeaponIgnoresArmour && !ignoreArmour ? " (Warp Weapon)" : ""}</i>` : ""}
${critReport}
${traitReminderHtml}
</div>`;

if (selectedEntry.msg && selectedEntry.state) {
  const latest = selectedEntry.msg.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
  if (latest?.targets?.length) {
    const tgt = latest.targets.find(t => (t.tokenUuid ?? t.targetTokenUuid) === dmg.targetTokenUuid);
    if (tgt) {
      tgt.damageApplied = true;
      tgt.damageSummary = null;
      tgt.applySummary = applySummary;
    }

    await selectedEntry.msg.update({
      content: buildWorkflowHtml(latest),
      flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: latest } }
    });

    const allApplied = latest.targets
      .filter(t => (t.allocatedHits ?? 0) > 0)
      .every(t => t.damageApplied);

    if (allApplied && latest.devastatingFollowUp?.available && !latest.devastatingFollowUp?.prompted) {
      const attackerActor = game.actors.get(latest.attackerActorId);
      const hasDevastatingEffect = attackerActor?.effects?.some(effect => {
        const statusValues = Array.isArray(effect.statuses) ? effect.statuses : Array.from(effect.statuses ?? []);
        const statusIds = statusValues.map(status => String(status ?? "").toLowerCase());
        const effectId = String(effect.flags?.["dfreds-convenient-effects"]?.effectId ?? "").toLowerCase();
        const name = String(effect.name ?? "").toLowerCase();
        return statusIds.includes("ce-devastating-assault") || effectId === "ce-devastating-assault" || name.includes("devastating assault");
      });

      if (!hasDevastatingEffect) {
        const ownerIds = game.warhammer40kCogitator?.getDefenseRecipients?.(attackerActor ?? actor)?.map(user => user.id) ?? [];
        ChatMessage.create({
          speaker: { alias: "System" },
          style: CONST.CHAT_MESSAGE_STYLES.OTHER,
          whisper: ownerIds,
          content: "<b>Devastating Assault:</b> You hit. Your next attack against the same target gains the follow-up all out attack setup."
        });
        if (attackerActor) {
          await game.warhammer40kCogitator?.applyDevastatingAssaultEffect?.(attackerActor);

          const ownerIds = game.warhammer40kCogitator?.getDefenseRecipients?.(attackerActor)?.map(user => user.id) ?? [];
          const setup = latest.devastatingFollowUp?.setup ?? null;
          if (ownerIds.length && setup) {
            game.warhammer40kCogitator?.emitSocket?.("mirrorAttackReady", {
              ownerIds,
              attackerName: latest.attackerName,
              setup
            });
          }
        }
      }

      latest.devastatingFollowUp.prompted = true;
      await selectedEntry.msg.update({
        content: buildWorkflowHtml(latest),
        flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: latest } }
      });
    }
  }
} else {
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({actor}),
    content: applySummary
  });
}

}
},
delete:{
label:"Delete",
callback: async ()=>{
  await clearSelectedDamageFromWorkflow();
  ui.notifications.info("Pending damage was deleted from the workflow.");
}
},
cancel:{
label:"Cancel"
}
}

}).render(true);
}
