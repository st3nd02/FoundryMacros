import { canActorSpendFate, maybeApplyFateReroll } from "../fate_engine.js";

export async function runDamageWorkflow() {
try {
/**
 * DH2e External Damage Workflow (Foundry V13)
 * Version: 1.3
 * Run this as the attacker owner to resolve pending damage on existing workflows.
 */



const WORKFLOW_NS = "warhammer-40k-cogitator";
const WORKFLOW_KEY = "dh2eExternalWorkflow";
const COLOR_TEXT_OUTLINE = "0px 0px 1px #000000, 1px 1px 1px #000000";

const buildWorkflowHtml = state => {
  const outlined = (text, color) => `<span style="font-weight:700;color:${color};text-shadow:${COLOR_TEXT_OUTLINE};">${text}</span>`;
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
  const hasResolvableDefense = (state.targets ?? []).some(t => t.defenseAction && !String(t.defenseOutcome ?? "").toLowerCase().includes("awaiting"));
  const remainingHitsAfterDefense = (state.targets ?? [])
    .filter(t => Number(t.allocatedHits ?? 0) > 0 && t.defenseAction && !t.damageResolved && !t.damageApplied)
    .reduce((sum, t) => sum + Number(t.allocatedHits ?? 0), 0);
  const hasDamageResolution = (state.targets ?? []).some(t => t.damageResolved || t.damageApplied);
  const targetNames = joinedTargets();
  const hitWord = Number(state.totalHits ?? 0) === 1 ? "hit" : "hits";
  const missWord = Number(state.totalHits ?? 0) > 0 ? `${state.totalHits} ${hitWord}` : "misses";
  const defenseStory = () => {
    const defended = (state.targets ?? []).find(t => t.defenseAction && !String(t.defenseOutcome ?? "").toLowerCase().includes("awaiting"));
    if (!defended) return "";
    const action = String(defended.defenseAction ?? "defend").toLowerCase();
    const outcome = defended.defenseSuccess
      ? (Number(defended.defenseDegrees ?? 0) > 1 ? "totally succeeds" : "partially succeeds")
      : (Number(defended.defenseDegrees ?? 0) > 1 ? "totally fails" : "partially fails");
    return `<b>${defended.name}</b> attempts to <b>${action}</b> against <b>${state.attackerName}</b> and ${outcome}.`;
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
    if (hasDamageResolution) {
      const appliedTargets = joinedTargets(t => t.damageResolved || t.damageApplied);
      return `<b>${appliedTargets}</b> receives damage from <b>${state.attackerName}</b>.`;
    }
    if (remainingHitsAfterDefense > 0) {
      return `<b>${state.attackerName}</b> manages <b>${remainingHitsAfterDefense}</b> hit(s) on <b>${targetNames}</b>.`;
    }
    if (hasResolvableDefense) return defenseStory();
    return `<b>${state.attackerName}</b> attacks <b>${targetNames}</b> with <b>${state.weaponName}</b> and ${missWord}.`;
  };

  const cards = (state.targets ?? []).map(t => {
    const sizeTxt = t.sizeIgnored ? `${t.sizeLabel} (Black Carapace ignores)` : `${t.sizeLabel} ${t.sizeMod >= 0 ? "+" : ""}${t.sizeMod}`;
    const forceFieldSummary = t.forceFieldChecked
      ? `<div><b>Force Field:</b> ${outlined(t.forceFieldName ?? "—", "#ffad55")} | <b>Protection:</b> ${outlined(t.forceFieldProtection ?? "—", "#ffad55")} | <b>Overload:</b> ${outlined(t.forceFieldOverload ?? "—", "#ffad55")} | <b>Roll:</b> ${outlined(t.forceFieldRoll ?? "—", "#bd7548")}</div><div><b>Force Field Result:</b> ${outlined(t.forceFieldOutcome ?? "—", statusColor(t.forceFieldOutcome))}</div>`
      : "";
    const defenseSummary = `<div><b>Defense Roll:</b> ${outlined(t.defenseTargetNumber ?? "—", "#3aa0ff")} vs ${outlined(t.defenseRoll ?? "—", "#ff9f1a")}</div>`;
    const shownHits = state.horde?.active ? (t.hordeHitsPreview ?? t.allocatedHits ?? 0) : (t.allocatedHits ?? 0);
    const hitsLabel = state.horde?.active ? "Hits vs Horde" : "Hits";
    const damageSummary = t.damageSummary
      ? `<div style="margin-top:4px;padding:6px;border:1px solid #777;border-radius:6px;">${t.damageSummary}</div>`
      : `<div style="text-align:center;"><b>Damage</b><div></div></div>`;

    return `<div style="border:1px solid #555;border-radius:6px;padding:6px;margin:6px 0;">
      <div><b>${t.name}</b></div>
      <div><b>Distance:</b> ${t.distanceMeters}m | <b>Range:</b> ${t.rangeLabel}</div>
      <div><b>Size:</b> ${sizeTxt}</div>
      ${defenseSummary}
      <div><b>Status:</b> ${outlined(t.defenseOutcome ?? "Pending", statusColor(t.defenseOutcome))} | <b>${hitsLabel}:</b> ${shownHits}</div>
      ${forceFieldSummary}
      ${styledDegrees(t)}
      ${damageSummary}
    </div>`;
  }).join("");

  const showPowerMode = ["las", "plasma"].includes(String(state.weaponClass ?? "").toLowerCase()) || ["las", "plasma"].includes(String(state.weaponType ?? "").toLowerCase());
  const aimPowerLine = `<div><b>Aim:</b> ${state.aimLabel}${showPowerMode ? ` | <b>Power:</b> ${state.powerModeLabel}` : ""}</div>`;
  return `<div data-workflow-id="${state.id}" style="line-height:0;">
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



const token = canvas.tokens.controlled[0];
if (!token) return ui.notifications.warn("Select your character first.");

const actor = token.actor;
if (!actor) return ui.notifications.warn("Selected token has no actor.");

const pendingDamageContext = game.warhammer40kCogitator?.consumePendingDamageContext?.() ?? null;

const pending = [];
for (const msg of game.messages.contents) {
  const state = msg.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
  if (!state?.targets?.length) continue;
  if (state.attackerActorId !== actor.id) continue;

  for (const target of state.targets) {
    if ((target.allocatedHits ?? 0) <= 0) continue;
    if (target.damageResolved) continue;
    const out = String(target.defenseOutcome ?? "").toLowerCase();
    const defenseResolved = out.includes("success") || out.includes("fail") || out.includes("skipped") || out.includes("no active owner");
    if (!defenseResolved || out.includes("awaiting")) continue;
    pending.push({ msg, state, target, targetUuid: target.tokenUuid ?? target.targetTokenUuid });
  }
}

if (!pending.length) return ui.notifications.warn("No pending damage found in workflows for this attacker.");

const optionHtml = pending.map((p, i) => {
  const selected = pendingDamageContext?.chatMessageId === p.msg.id && pendingDamageContext?.targetTokenUuid === p.targetUuid ? "selected" : "";
  return `<option value="${i}" ${selected}>${p.state.attackerName} -> ${p.target.name} (${p.target.allocatedHits} hits) [${p.state.weaponName}]</option>`;
}).join("");

const pick = await new Promise(resolve => {
  new Dialog({
    title: "Damage Workflow",
    content: `<form><div class="form-group"><label><b>Pending Damage</b></label><select id="pick">${optionHtml}</select></div></form>`,
    buttons: {
      ok: { label: "Continue", callback: html => resolve(Number(html.find("#pick").val() || 0)) },
      cancel: { label: "Cancel", callback: () => resolve(null) }
    },
    default: "ok"
  }).render(true, { width: 600 });
});

if (pick == null) return;
const entry = pending[pick];
if (!entry) return ui.notifications.warn("Pending entry no longer available.");

const attackData = {
  attacker: entry.state.attackerName,
  target: entry.target.name,
  targetTokenUuid: entry.targetUuid,
  weapon: entry.state.weaponName,
  hits: entry.state?.horde?.active ? 1 : entry.target.allocatedHits,
  dos: entry.state.dos ?? 0,
  location: getHitLocation(entry.state.attackRoll ?? 50)
};
const calledShotLocation = String(entry.state?.setupSnapshot?.calledShotLocation ?? "Body");
const useCalledShotLocation = String(entry.state?.modeKey ?? "").toLowerCase() === "called";
if (useCalledShotLocation) {
  attackData.location = calledShotLocation;
}

const weapon = actor.items.get(entry.state.weaponId) || actor.items.find(w => w.type === "weapon" && w.name === attackData.weapon);
if (!weapon) return ui.notifications.warn("Weapon not found on actor.");

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

const parseVal = (txt, name, dflt = 0) => {
  const m = String(txt ?? "").toLowerCase().match(new RegExp(name + "\\s*\\((\\d+)\\)"));
  return m ? Number(m[1]) : dflt;
};

const isPsychicWorkflow = String(entry.state?.modeKey ?? "") === "psychic";
const special = String((isPsychicWorkflow ? entry.state?.weaponSpecial : weapon.system.special) ?? "").toLowerCase();
const dmg = String((isPsychicWorkflow ? entry.state?.weaponDamage : weapon.system.damage) ?? "1d10+0");
const penBase = Number(isPsychicWorkflow ? (entry.state?.weaponPen ?? 0) : getWeaponPenetration(weapon));
const m = dmg.match(/^(\d+)d(\d+)(.*)$/i);
const defaultFlatExpr = m ? String(m[3] ?? "") : "+0";
const damageType = String((isPsychicWorkflow ? entry.state?.weaponType : weapon.system.damageType) ?? "").toLowerCase();

const buildHitLocations = (first, hits) => {
  const otherArm = first === "Left Arm" ? "Right Arm" : "Left Arm";
  const pattern = first === "Head" ? ["Head", "Left Arm", "Body", "Right Arm", "Body"]
    : (first === "Left Arm" || first === "Right Arm") ? [first, "Body", "Head", "Body", otherArm]
    : first === "Body" ? ["Body", "Left Arm", "Head", "Right Arm", "Body"]
    : [first, "Body", "Left Arm", "Head", "Body"];
  return Array.from({ length: hits }, (_, i) => pattern[i % pattern.length]);
};

function getHitLocation(rollValue) {
  const reversed = Number(String(rollValue).padStart(2, "0").split("").reverse().join(""));
  if (reversed <= 10) return "Head";
  if (reversed <= 20) return "Right Arm";
  if (reversed <= 30) return "Left Arm";
  if (reversed <= 70) return "Body";
  if (reversed <= 85) return "Right Leg";
  return "Left Leg";
}

new Dialog({
  title: "Damage Roll Card",
  content: `
<form>
<b>Weapon</b><br>
<input id="weaponName" type="text" style="width:100%" readonly value="${attackData.weapon}"><br><br>

<b>Damage</b><br>
<input type="number" id="diceCount" value="${m ? Number(m[1]) : 1}" style="width:60px">
<label><input type="radio" name="dieType" value="10" ${(m ? m[2] : "10") === "10" ? "checked" : ""}>d10</label>
<label><input type="radio" name="dieType" value="5" ${(m ? m[2] : "10") === "5" ? "checked" : ""}>d5</label>
+ <input type="text" id="flat" value="${defaultFlatExpr}" style="width:90px">
<br><br>
<div style="columns:2; column-gap:20px;">
<label><b>Penetration</b><br>
<input type="number" id="pen" value="${penBase}"><br></label><br>

<label><b>Degrees of Success</b><br>
<input type="number" id="dos" value="${attackData.dos}"><br></label><br>
</div>
<hr>
<h3>Attack Context (read-only)</h3>
<textarea id="attackContext" style="width:100%;height:140px;" readonly>${[
  `Talents/Items: ${(entry.state.selectedTalents ?? []).join(", ") || "None"}`,
  `Weapon Traits: ${special || "None"}`,
  `Power Mode: ${entry.state.powerModeLabel ?? "Normal"}`,
  `Mode of Fire/Attack: ${entry.state.modeLabel ?? "—"}`,
  `Hits: ${attackData.hits}`,
  `Degrees of Success: ${attackData.dos}`,
  `Modifiers: ${(entry.state.modifierNotes ?? []).join(", ") || "None"}`
].join("\n")}</textarea>
</form>
`,
  buttons: {
    roll: {
      label: "Roll Damage",
      callback: async html => {
        const wClass = String(weapon.system.class || "").toLowerCase();
        const isMelee = wClass === "melee";
        const isRanged = !isMelee;

        const diceCount = Number(html.find("#diceCount").val());
        const dieType = html.find('input[name="dieType"]:checked').val();
        let properties = [];
        let flatExpr = String(html.find("#flat").val() ?? "").trim() || "+0";
        let flat = Number((flatExpr.match(/[+-]\d+$/) || [0])[0]);
        const craftsmanship = String(weapon.system.craftsmanship ?? "").toLowerCase();
        const meleeBestCraft = craftsmanship === "best" && String(weapon.system.class || "").toLowerCase() === "melee";
        if (meleeBestCraft) { flat += 1; properties.push("Best Craftsmanship +1"); }
        if (isPsychicWorkflow) {
          // Psychic formulas can include arithmetic like +2*PR already resolved into state.weaponDamage.
          const parsed = Number((flatExpr || "").replace(/^\+/, ""));
          if (Number.isFinite(parsed)) flat = parsed;
        }
        let pen = Number(html.find("#pen").val());
        const dos = Number(html.find("#dos").val());
        const isHordeTarget = !!entry.state?.horde?.active;
        const traitsText = String(special ?? "").toLowerCase();
        const traitList = traitsText
          .split(",")
          .map(t => t.trim().toLowerCase())
          .filter(Boolean);
        const hasTrait = name => {
          const normalized = String(name ?? "").trim().toLowerCase();
          return traitList.some(trait => trait === normalized || trait.startsWith(`${normalized} (`));
        };
        const parseTraitVal = (name, d=0) => {
          const normalized = String(name ?? "").trim().toLowerCase();
          const entry = traitList.find(trait => trait === normalized || trait.startsWith(`${normalized} (`));
          if (!entry) return d;
          const mm = entry.match(/\((\d+)\)/);
          return mm ? Number(mm[1]) : d;
        };
        const tearing = hasTrait("tearing");
        const proven = hasTrait("proven");
        const primitive = hasTrait("primitive");
        const accurate = hasTrait("accurate");
        const gauss = hasTrait("gauss");
        const force = hasTrait("force");
        const razor = hasTrait("razor") || hasTrait("razor sharp");
        const melta = hasTrait("melta");
        const scatter = hasTrait("scatter");
        const spray = hasTrait("spray");
        const flame = hasTrait("flame");
        const toxic = hasTrait("toxic");
        const hallucinogenic = hasTrait("hallucinogenic");
        const shocking = hasTrait("shocking");
        const snare = hasTrait("snare");
        const warpWeapon = hasTrait("warp weapon");
        const corrosive = hasTrait("corrosive");
        const lance = hasTrait("lance");
        const hammer = !!entry.state?.toggles?.hammer;
        const flesh = !!entry.state?.toggles?.flesh;
        const raptor = !!entry.state?.toggles?.raptor;
        const mighty = !!entry.state?.toggles?.mighty;
        const crushing = !!entry.state?.toggles?.crushing;
        const forceChannel = !!entry.state?.forceChanneling;
        const targetRangeLabel = String(entry.target?.rangeLabel ?? "");
        const scatterPointBlank = targetRangeLabel.includes("Point Blank");
        const scatterLongOrExtreme = targetRangeLabel.includes("Long") || targetRangeLabel.includes("Extreme");
        const meltaRange = "Short";
        const provenVal = parseTraitVal("proven", 1);
        const primitiveVal = parseTraitVal("primitive", 9);
        const fellingVal = parseTraitVal("felling", 0);
        const snareVal = parseTraitVal("snare", 0);
        const aimLabel = String(entry.state?.aimLabel ?? "").toLowerCase();
        const aim = aimLabel.includes("half aim") || aimLabel.includes("full aim") ? "yes" : "no";

        const isD100Success = (roll, target) => roll === 1 ? true : (roll === 100 ? false : roll <= target);
        const calcDoS = (target, roll) => isD100Success(roll, target) ? (1 + Math.floor((target - roll) / 10)) : 0;

        entry.state.talentModifier = entry.state.talentModifier ?? {
          attack: { attackRoll: 0, penetration: 0, damage: 0, defense: 0, notes: [] },
          defense: { attackRoll: 0, penetration: 0, damage: 0, defense: 0, notes: [] },
          damage: { attackRoll: 0, penetration: 0, damage: 0, defense: 0, notes: [] },
          applyDamage: { attackRoll: 0, penetration: 0, damage: 0, defense: 0, notes: [] }
        };

        if (mighty && isRanged && !special.includes("grenade")) {
          const bsb = actor.system.characteristics.ballisticSkill.bonus;
          const bonus = Math.ceil(bsb / 2);
          flat += bonus;
          entry.state.talentModifier.damage.damage += bonus;
          entry.state.talentModifier.damage.notes.push(`Mighty Shot +${bonus}`);
          properties.push(`Mighty Shot +${bonus}`);
        }

        if (crushing && isMelee) {
          const wsb = actor.system.characteristics.weaponSkill.bonus;
          const bonus = Math.ceil(wsb / 2);
          flat += bonus;
          entry.state.talentModifier.damage.damage += bonus;
          entry.state.talentModifier.damage.notes.push(`Crushing Blow +${bonus}`);
          properties.push(`Crushing Blow +${bonus}`);
        }

        if (hammer && isMelee) {
          const sb = actor.system.characteristics.strength.bonus;
          const bonus = Math.ceil(sb / 2);
          pen += bonus;
          entry.state.talentModifier.damage.penetration += bonus;
          entry.state.talentModifier.damage.notes.push(`Hammer Blow Pen +${bonus}`);
          properties.push(`Hammer Blow Pen +${bonus}`);
          if (String(entry.state?.modeKey ?? "") === "allout") {
            properties.push("Concussive (2)");
          }
        }

        if (scatter && scatterPointBlank) {
          flat += 2;
          properties.push("Scatter (+2 @ Point Blank)");
        }

        if (scatter && scatterLongOrExtreme) {
          flat -= 2;
          properties.push("Scatter (-2 @ Long/Extreme)");
        }

        if (melta && (meltaRange === "Short" || meltaRange === "Point Blank")) {
          pen *= 2;
          properties.push("Melta");
        }

        if (wClass === "melee") {
          const strTotal = actor.system.characteristics.strength.total || 0;
          const strUnnatural = actor.system.characteristics.strength.unnatural || 0;
          const strBonus = Math.floor(strTotal / 10);
          flat += strBonus + strUnnatural;
          properties.push(`SB (${strBonus}+${strUnnatural})`);
        }

        if (force && forceChannel) {
          const psyRating = actor.system.psy?.rating || 0;
          flat += psyRating;
          pen += psyRating;
          properties.push(`Force (+${psyRating})`);
        }

        let formula = `${diceCount}d${dieType}`;
        if (tearing) {
          const extraDice = (flesh && isMelee) ? 2 : 1;
          if (flesh && isMelee) properties.push("Flesh Render");
          const rollDice = diceCount + extraDice;
          formula = `${rollDice}d${dieType}kh${diceCount}`;
          properties.push("Tearing");
        }

        if (accurate && wClass === "basic" && aim === "yes") {
          const extra = Math.min(Math.floor(dos / 2), 2);
          if (extra > 0) formula += ` + ${extra}d${dieType}`;
          properties.push("Accurate");
        }

        if (raptor && isMelee) {
          const extra = Math.min(Math.floor(dos / 2), 2);
          if (extra > 0) {
            formula += ` + ${extra}d${dieType}`;
            entry.state.talentModifier.damage.notes.push(`Raptor +${extra}d${dieType}`);
            properties.push(`Raptor +${extra}d${dieType}`);
          }
        }

        if (entry.state?.modeKey) {
          const wType = String(weapon.system.type || "").toLowerCase();
          if (wType === "las") {
            if (entry.state.powerModeLabel?.toLowerCase() === "overcharge") {
              flat += 1;
              properties.push("Overcharge +1");
            }
            if (entry.state.powerModeLabel?.toLowerCase() === "overload") {
              flat += 2;
              pen += 2;
              properties.push("Overload +2 / +2 Pen");
            }
          }
          if (wType === "plasma" && entry.state.powerModeLabel?.toLowerCase() === "maximal") {
            formula += ` + 1d${dieType}`;
            pen += 2;
            properties.push("Maximal");
          }
        }

        formula += ` + (${flat})`;
        if (isPsychicWorkflow) {
          const suffix = String(flatExpr || "").trim();
          formula = `${diceCount}d${dieType}${suffix ? ` ${suffix.startsWith("+") || suffix.startsWith("-") ? suffix : `+ ${suffix}`}` : ""}`;
        }

        if (razor && dos >= 3) {
          pen *= 2;
          properties.push("Razor Sharp");
        }

        if (lance && dos > 0) {
          const lanceBonus = pen * dos;
          pen += lanceBonus;
          properties.push(`Lance (+${lanceBonus} Pen from ${dos} Degrees of Success)`);
        }

        if (fellingVal > 0) {
          properties.push(`Felling (${fellingVal})`);
        }

        const hits = attackData.hits;
        const firstLocation = spray ? "Body" : (attackData.location || "Body");
        const hitLocations = buildHitLocations(firstLocation, hits);
        const hitsData = [];
        const damageResults = [];
        const furyQueue = [];
        let sprayJam = false;

        for (let h = 1; h <= hits; h++) {
          const roll = new Roll(formula);
          await roll.evaluate();
          if (game.dice3d) await game.dice3d.showForRoll(roll, game.user, true);
          const dice = roll.dice[0]?.results.map(r => r.result) ?? [];
          const flatBonus = roll.total - dice.reduce((a, b) => a + b, 0);
          const allResults = roll.dice[0]?.results ?? [];
          const activeIndexes = allResults
            .map((r, idx) => ({ idx, v: Number(r.result ?? 0), active: r.active !== false && !r.discarded }))
            .filter(r => r.active)
            .map(r => r.idx);
          const modDice = [...dice];
          const dosReplacementCap = Number(dieType) || 10;
          const dosReplacementValue = Math.min(Math.max(Number(dos ?? 0), 0), dosReplacementCap);
          if (!spray && activeIndexes.length) {
            const minActive = activeIndexes.reduce((best, idx) => (modDice[idx] < modDice[best] ? idx : best), activeIndexes[0]);
            modDice[minActive] = Math.max(modDice[minActive], dosReplacementValue);
            if (proven) modDice[minActive] = Math.max(modDice[minActive], provenVal);
            if (primitive) modDice[minActive] = Math.min(modDice[minActive], primitiveVal);
          }
          const total = modDice.reduce((a, b) => a + b, 0) + flatBonus;
          const dosReplaced = !spray && activeIndexes.length;
          const replacedIndex = dosReplaced ? activeIndexes.reduce((best, idx) => (dice[idx] < dice[best] ? idx : best), activeIndexes[0]) : -1;
          const originalValue = dosReplaced ? dice[replacedIndex] : null;
          const replacementApplied = dosReplaced && dosReplacementValue > Number(originalValue ?? 0);
          const highlightedIndexes = new Set(activeIndexes);
          if (replacementApplied) highlightedIndexes.delete(replacedIndex);
          const keptDiceDisplay = dice
            .map((value, idx) => highlightedIndexes.has(idx) ? `<b>${value}</b>` : `${value}`)
            .join(", ");
          const keptDisplay = dosReplaced
            ? `[ ${keptDiceDisplay}, (${replacementApplied ? `<b>${dosReplacementValue}</b>` : `${dosReplacementValue}`}) ]`
            : `[ ${keptDiceDisplay} ]`;

          damageResults.push(total);
          hitsData.push({ hit: h, location: hitLocations[h - 1], damage: total, fury: null, keptDisplay });

          const dieMax = Number(dieType);
          const furyNumbers = spray ? [dieMax] : (gauss && dieMax === 10 ? [9, 10] : [dieMax]);
          if (spray && dice.some(d => d === 9)) sprayJam = true;
          if (!isHordeTarget && dice.some(d => furyNumbers.includes(d))) {
            furyQueue.push(h);
          }
        }

        const furyResults = [];
        for (const hitIndex of furyQueue) {
          const furyRoll = new Roll("1d5");
          await furyRoll.evaluate();
          if (game.dice3d) await game.dice3d.showForRoll(furyRoll, game.user, true);
          furyResults.push({
            hit: hitIndex,
            location: hitLocations[hitIndex - 1] ?? "-",
            result: furyRoll.total
          });
          hitsData[hitIndex - 1].fury = { result: furyRoll.total };
        }

        const targetDoc = await fromUuid(attackData.targetTokenUuid);
        const targetActor = targetDoc?.actor;
        const traitTests = { toxic: null, flame: null, spray: null, concussive: null, hallucinogenic: null, force: null };

        const rollCharacteristicTest = async ({ total, label, modifier = 0, actorDoc = null, rollType = null }) => {
          const target = Math.max(1, Number(total || 0) + Number(modifier || 0));
          const roll = await new Roll("1d100").evaluate();
          if (game.dice3d) await game.dice3d.showForRoll(roll, game.user, true);
          let rollValue = roll.total;
          let success = isD100Success(rollValue, target);
          let dos = calcDoS(target, rollValue);
          if (!success && canActorSpendFate(actorDoc)) {
            const fateOutcome = await maybeApplyFateReroll({
              actor: actorDoc,
              rollType: rollType ?? `${label} Roll`,
              targetNumber: target,
              rollResult: rollValue,
              reroll: async () => {
                const reroll = await new Roll("1d100").evaluate();
                if (game.dice3d) await game.dice3d.showForRoll(reroll, game.user, true);
                return reroll.total;
              },
              speaker: ChatMessage.getSpeaker({ actor: actorDoc }),
              postReport: true
            });
            if (fateOutcome.usedFate) {
              rollValue = fateOutcome.roll;
              success = fateOutcome.success;
              dos = fateOutcome.dos;
            }
          }
          return { label, target, roll: rollValue, success, dos };
        };

        if (toxic && !isHordeTarget) {
          const toxicValue = parseTraitVal("toxic", 1);
          const test = await rollCharacteristicTest({
            total: targetActor?.system?.characteristics?.toughness?.total ?? 0,
            label: "Toughness",
            modifier: -10 * toxicValue,
            actorDoc: targetActor,
            rollType: "Toughness to Resist Toxic"
          });
          let toxicDamage = 0;
          if (!test.success) {
            const toxicRoll = await new Roll("1d10").evaluate();
            if (game.dice3d) await game.dice3d.showForRoll(toxicRoll, game.user, true);
            toxicDamage = toxicRoll.total;
          }
          traitTests.toxic = { value: toxicValue, ...test, damage: toxicDamage, resolved: true };
          properties.push(`Toxic (${toxicValue})`);
        }

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

        if (hallucinogenic && !isHordeTarget) {
          const hallucinogenicValue = parseTraitVal("hallucinogenic", 1);
          const hasRespirator = targetActor?.items?.some(item => String(item?.type ?? "").toLowerCase() === "gear" && /respirator/i.test(String(item?.name ?? "")));
          const respiratorBonus = hasRespirator ? 20 : 0;
          const hallucinogenicPenalty = 10 * hallucinogenicValue;
          const test = await rollCharacteristicTest({
            total: targetActor?.system?.characteristics?.toughness?.total ?? 0,
            label: "Toughness",
            modifier: respiratorBonus - hallucinogenicPenalty,
            actorDoc: targetActor,
            rollType: "Toughness to Resist Hallucinogenic"
          });

          let effectRollTotal = null;
          let dof = 0;
          let resultText = null;
          let resultInlineRolls = null;
          if (!test.success) {
            const effectRoll = await new Roll("1d10").evaluate();
            if (game.dice3d) await game.dice3d.showForRoll(effectRoll, game.user, true);
            effectRollTotal = effectRoll.total;
            dof = Math.max(1, 1 + Math.floor((test.roll - test.target) / 10));
            resultText = hallucinogenicResultTable[effectRollTotal] ?? "";
            if (effectRollTotal === 3 || effectRollTotal === 4) resultInlineRolls = 'Scatter Diagram: [[/r 1d10]]';
            if (effectRollTotal === 10) resultInlineRolls = '1d5 degrees of success: [[/r 1d5]]';
          }

          traitTests.hallucinogenic = {
            value: hallucinogenicValue,
            respiratorBonus,
            hasRespirator: Boolean(hasRespirator),
            penalty: hallucinogenicPenalty,
            ...test,
            dof,
            effectRoll: effectRollTotal,
            resultText,
            resultInlineRolls,
            duration: dof,
            resolved: true
          };
          properties.push(`Hallucinogenic (${hallucinogenicValue})`);
        }

        if (shocking && !isHordeTarget) {
          const shockingValue = parseTraitVal("shocking", 0);
          properties.push(shockingValue > 0 ? `Shocking (${shockingValue})` : "Shocking");
        }

        if (flame && !isHordeTarget) {
          traitTests.flame = {
            ...(await rollCharacteristicTest({
              total: targetActor?.system?.characteristics?.agility?.total ?? 0,
              label: "Agility",
              actorDoc: targetActor,
              rollType: "Agility to Resist Flame"
            })),
            resolved: true
          };
          properties.push("Flame");
        }

        if (spray) {
          properties.push("Spray");
        }

        const concussiveMatch = properties.find(p => /concussive\s*\((\d+)\)/i.test(String(p)));
        const concussiveValue = concussiveMatch ? Number(String(concussiveMatch).match(/concussive\s*\((\d+)\)/i)?.[1] ?? 0) : 0;
        if (concussiveMatch && concussiveValue >= 0 && !isHordeTarget) {
          const concussiveTest = await rollCharacteristicTest({
            total: targetActor?.system?.characteristics?.toughness?.total ?? 0,
            label: "Toughness",
            modifier: -10 * concussiveValue,
            actorDoc: targetActor,
            rollType: "Toughness to Resist Concussive"
          });
          const concussiveDof = concussiveTest.success ? 0 : Math.max(1, 1 + Math.floor((concussiveTest.roll - concussiveTest.target) / 10));
          traitTests.concussive = {
            value: concussiveValue,
            dof: concussiveDof,
            ...concussiveTest,
            resolved: true
          };
        }

        if (force && forceChannel && !isHordeTarget) {
          const attackerWP = Number(actor.system?.characteristics?.willpower?.total ?? 0);
          const targetWP = Number(targetActor?.system?.characteristics?.willpower?.total ?? 0);
          const attackerRoll = await new Roll("1d100").evaluate();
          if (game.dice3d) await game.dice3d.showForRoll(attackerRoll, game.user, true);
          let attackerRollValue = attackerRoll.total;
          if (!isD100Success(attackerRollValue, attackerWP) && canActorSpendFate(actor)) {
            const attackerFateOutcome = await maybeApplyFateReroll({
              actor,
              rollType: "Force Opposed Willpower Roll",
              targetNumber: attackerWP,
              rollResult: attackerRollValue,
              reroll: async () => {
                const reroll = await new Roll("1d100").evaluate();
                if (game.dice3d) await game.dice3d.showForRoll(reroll, game.user, true);
                return reroll.total;
              },
              speaker: ChatMessage.getSpeaker({ actor }),
              postReport: true
            });
            if (attackerFateOutcome.usedFate) attackerRollValue = attackerFateOutcome.roll;
          }

          const targetRoll = await new Roll("1d100").evaluate();
          if (game.dice3d) await game.dice3d.showForRoll(targetRoll, game.user, true);
          let targetRollValue = targetRoll.total;
          if (!isD100Success(targetRollValue, targetWP) && canActorSpendFate(targetActor)) {
            const targetFateOutcome = await maybeApplyFateReroll({
              actor: targetActor,
              rollType: "Force Opposed Willpower Roll",
              targetNumber: targetWP,
              rollResult: targetRollValue,
              reroll: async () => {
                const reroll = await new Roll("1d100").evaluate();
                if (game.dice3d) await game.dice3d.showForRoll(reroll, game.user, true);
                return reroll.total;
              },
              speaker: ChatMessage.getSpeaker({ actor: targetActor }),
              postReport: true
            });
            if (targetFateOutcome.usedFate) targetRollValue = targetFateOutcome.roll;
          }

          const attackerDoS = calcDoS(attackerWP, attackerRollValue);
          const targetDoS = calcDoS(targetWP, targetRollValue);
          const won = attackerDoS > targetDoS;
          let forceDamage = 0;
          if (won) {
            const forceDice = Math.max(1, attackerDoS - targetDoS);
            const forceRoll = await new Roll(`${forceDice}d10`).evaluate();
            if (game.dice3d) await game.dice3d.showForRoll(forceRoll, game.user, true);
            forceDamage = forceRoll.total;
            traitTests.force = { resolved: true, attackerWP, targetWP, attackerRoll: attackerRollValue, targetRoll: targetRollValue, attackerDoS, targetDoS, won, dos: forceDice, result: forceDamage, ignoresSoak: true };
          } else {
            traitTests.force = { resolved: true, attackerWP, targetWP, attackerRoll: attackerRollValue, targetRoll: targetRollValue, attackerDoS, targetDoS, won, dos: 0, result: 0, ignoresSoak: true };
          }
          properties.push("Force");
        }

        if (warpWeapon) properties.push("Warp Weapon");
        if (corrosive) properties.push("Corrosive");
        if (snare) properties.push(snareVal > 0 ? `Snare (${snareVal})` : "Snare");

        const testSummary = [traitTests.flame, traitTests.spray, traitTests.toxic, traitTests.concussive].filter(Boolean)
          .map(t => `<div><b>${t.label} Test</b> (${t.target}) Roll ${t.roll}: <b>${t.success ? "Success" : "Failure"}</b>${typeof t.damage === "number" ? ` | Extra Damage: <b>${t.damage}</b>` : ""}</div>`)
          .join("");
        const hallucinogenicSummary = traitTests.hallucinogenic
          ? `<div><b>Hallucinogenic (${traitTests.hallucinogenic.value}) Toughness Test</b> (Target ${traitTests.hallucinogenic.target}${traitTests.hallucinogenic.respiratorBonus ? ` = Toughness ${traitTests.hallucinogenic.target + traitTests.hallucinogenic.penalty - traitTests.hallucinogenic.respiratorBonus} - ${traitTests.hallucinogenic.penalty} + ${traitTests.hallucinogenic.respiratorBonus} (Respirator)` : ""}) Roll ${traitTests.hallucinogenic.roll}: <b>${traitTests.hallucinogenic.success ? "Target resisted the hallucinogenic effect" : `FAILED | Duration: <b>${traitTests.hallucinogenic.duration}</b> round${traitTests.hallucinogenic.duration === 1 ? "" : "s"}`}</b>${traitTests.hallucinogenic.success ? "" : `<div style="margin-top:4px;">${traitTests.hallucinogenic.resultText ?? ""}</div>${traitTests.hallucinogenic.resultInlineRolls ? `<div>${traitTests.hallucinogenic.resultInlineRolls}</div>` : ""}`}</div>`
          : "";
        const forceSummary = traitTests.force
          ? `<div><b>Force Opposed WP</b> Attacker ${traitTests.force.attackerRoll}/${traitTests.force.attackerWP} (${traitTests.force.attackerDoS} Degrees of Success) vs Target ${traitTests.force.targetRoll}/${traitTests.force.targetWP} (${traitTests.force.targetDoS} Degrees of Success) → <b>${traitTests.force.won ? `Attacker Wins (${traitTests.force.dos}d10 = ${traitTests.force.result})` : "Target Resists"}</b></div>`
          : "";

        const sprayJamHtml = sprayJam
          ? `<hr><div style="color:#b267ff;font-weight:bold;">Spray Jam triggered (damage die result of 9).</div>`
          : "";

        const furyHtml = furyResults.length
          ? `<hr><div style="color:gold;font-size:1.1em;font-weight:bold;text-shadow:${COLOR_TEXT_OUTLINE};">✦ RIGHTEOUS FURY ✦</div>${furyResults.map((f, i) => `<div>${i + 1}. <b>Location:</b> <i>${f.location}</i> — Righteous Fury: <b>${f.result}</b></div>`).join("")}`
          : "";

        const formulaInline = formula;
        const damageSummary = `<div style="text-align:center; color:#000;">
<div><b>Damage</b></div>
<div><i style="color:#000;">(${formulaInline})</i></div>
<div><b>Penetration:</b> ${pen}</div>
${damageResults.map((d, i) => `<div><span style="font-weight:700;color:#000;">Damage done:</span> <span style="color:#bd7548;font-weight:900;font-size:1.1em;text-shadow:${COLOR_TEXT_OUTLINE};">${d}</span> <i style="font-weight:400;color:#000;">${hitLocations[i]}</i></div>`).join("")}
<div style="margin-top:6px;"><b>Properties:</b> ${properties.join(", ") || "None"}</div>
${testSummary}${hallucinogenicSummary}${forceSummary}${sprayJamHtml}
${furyHtml}
</div>`;

        const damageResult = {
          attacker: attackData.attacker,
          target: attackData.target,
          targetTokenUuid: attackData.targetTokenUuid,
          weapon: attackData.weapon,
          modeKey: entry.state?.modeKey ?? null,
          modeLabel: entry.state?.modeLabel ?? null,
          damageType,
          penetration: pen,
          hits,
          hitsData,
          dos,
          fury: furyResults,
          properties,
          toxic: traitTests.toxic,
          shocking: shocking ? { active: true } : null,
          flame: traitTests.flame,
          spray: traitTests.spray,
          concussive: traitTests.concussive,
          hallucinogenic: traitTests.hallucinogenic,
          felling: fellingVal,
          sprayJam,
          force: traitTests.force,
          talentModifier: entry.state?.talentModifier ?? null,
          selectedTalents: entry.state?.selectedTalents ?? [],
          nowhereToHideActive: !!entry.state?.toggles?.nowhereToHide,
          suppressingFireResolved: !!entry.state?.suppressingFireResolved,
          damageSummary
        };

        if (game.warhammer40kCogitator?.submitDamageResult) {
          await game.warhammer40kCogitator.submitDamageResult({
            chatMessageId: entry.msg.id,
            targetTokenUuid: entry.targetUuid,
            attackerActorId: actor.id,
            damageResult
          });
        } else {
          const latest = entry.msg.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
          if (latest) {
            const tgt = latest.targets.find(t => (t.tokenUuid ?? t.targetTokenUuid) === entry.targetUuid);
            if (tgt) {
              tgt.damageRolls = hitsData.map(hd => ({ total: hd.damage, loc: hd.location }));
              tgt.damageSummary = damageSummary;
              tgt.damageResolved = true;
              tgt.damageApplied = false;
              tgt.applySummary = null;
              tgt.damageApplicationData = {
                ...damageResult,
                targetTokenUuid: attackData.targetTokenUuid
              };
            }
            await entry.msg.update({
              content: buildWorkflowHtml(latest),
              flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: latest } }
            });
          }
        }

        game.dh2eLastDamage = {
          ...damageResult,
          chatMessageId: entry.msg.id
        };
      }
    },
    cancel: { label: "Cancel" }
  }
}).render(true, { width: 700 });

} catch (err) {
  console.error("DH2E external damage workflow failed", err);
  ui.notifications.error("DH2E damage workflow failed. Check console for details.");
}
}
