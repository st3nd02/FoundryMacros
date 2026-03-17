export async function runDamageWorkflow() {
try {
/**
 * DH2e External Damage Workflow (Foundry V13)
 * Version: 1.3
 * Run this as the attacker owner to resolve pending damage on existing workflows.
 */



const WORKFLOW_NS = "warhammer-40k-cogitator";
const WORKFLOW_KEY = "dh2eExternalWorkflow";

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
    const damaged = (state.targets ?? []).some(t => t.damageResolved || t.damageApplied);
    if (damaged) return `<b>${state.attackerName}</b>'s attack with <b>${state.weaponName}</b> damages <b>${joinedTargets(t => t.damageResolved || t.damageApplied)}</b>`;
    return `<b>${state.attackerName}</b> ${attackOutcomeVerb()} <b>${joinedTargets()}</b> with <b>${state.weaponName}</b>`;
  };

  const cards = (state.targets ?? []).map(t => {
    const sizeTxt = t.sizeIgnored ? `${t.sizeLabel} (Black Carapace ignores)` : `${t.sizeLabel} ${t.sizeMod >= 0 ? "+" : ""}${t.sizeMod}`;
    const defenseSummary = t.defenseAction
      ? `<div><b>Defense (T vs R):</b> ${outlined(t.defenseTargetNumber ?? "—", "#3aa0ff")} vs ${outlined(t.defenseRoll ?? "—", "#ff9f1a")} (${t.defenseAction} — ${t.defenseOutcome ?? "—"})</div>`
      : `<div><b>Defense (T vs R):</b> ${outlined(t.defenseTargetNumber ?? "—", "#3aa0ff")} vs ${outlined(t.defenseRoll ?? "—", "#ff9f1a")} (${t.defenseOutcome ?? "—"})</div>`;
    const shownHits = state.horde?.active ? (t.hordeHitsPreview ?? t.allocatedHits ?? 0) : (t.allocatedHits ?? 0);
    const hitsLabel = state.horde?.active ? "Hits vs Horde" : "Hits";
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
    <div><b>Modifiers:</b> ${state.modifierNotes?.join(", ") || "None"}</div>
    <div><b>Talents:</b> ${state.selectedTalents?.join(", ") || "None"}</div>
    <div><b>Items:</b> ${state.weaponItems?.join(", ") || "None"}</div>
    <div><b>Attack Roll:</b> ${outlined(state.attackRoll ?? "—", "#ff9f1a")} | <b>Target:</b> ${outlined(state.bestTarget ?? Math.max(...(state.targets ?? []).map(t => Number(t.targetNumber ?? 0))), "#3aa0ff")}</div>
    <div><b>Status:</b> ${outlined(state.statusText ?? "Pending", statusColor(state.statusText))} | <b>Total ${state.horde?.active ? "Hits vs Horde" : "Hits"}:</b> ${state.totalHits ?? 0}</div>
    <hr>${cards}
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
    const defenseResolved = out.includes("success") || out.includes("failed") || out.includes("skipped") || out.includes("no active owner");
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

const special = String(weapon.system.special ?? "").toLowerCase();
const dmg = String(weapon.system.damage ?? "1d10+0");
const penBase = getWeaponPenetration(weapon);
const m = dmg.match(/(\d+)d(\d+)([+-]\d+)?/i);
const damageType = String(weapon.system.damageType ?? "").toLowerCase();

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
+ <input type="number" id="flat" value="${m ? Number(m[3] || 0) : 0}" style="width:70px">
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
  `DoS: ${attackData.dos}`,
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
        let flat = Number(html.find("#flat").val());
        const craftsmanship = String(weapon.system.craftsmanship ?? "").toLowerCase();
        const meleeBestCraft = craftsmanship === "best" && String(weapon.system.class || "").toLowerCase() === "melee";
        if (meleeBestCraft) { flat += 1; properties.push("Best Craftsmanship +1"); }
        let pen = Number(html.find("#pen").val());
        const dos = Number(html.find("#dos").val());
        const isHordeTarget = !!entry.state?.horde?.active;
        const traitsText = String(weapon.system.special ?? "").toLowerCase();
        const hasTrait = (name) => traitsText.includes(name);
        const tearing = hasTrait("tearing");
        const proven = hasTrait("proven");
        const primitive = hasTrait("primitive");
        const accurate = hasTrait("accurate");
        const gauss = hasTrait("gauss");
        const force = hasTrait("force");
        const razor = hasTrait("razor");
        const melta = hasTrait("melta");
        const scatter = hasTrait("scatter");
        const spray = hasTrait("spray");
        const flame = hasTrait("flame");
        const toxic = hasTrait("toxic");
        const parseTraitVal = (name, d=0) => {
          const mm = traitsText.match(new RegExp(name + "\\s*\\((\\d+)\\)"));
          return mm ? Number(mm[1]) : d;
        };
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
        const aim = Number(entry.state?.aimMod ?? 0) > 0 ? "yes" : "no";

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

        formula += ` + ${flat}`;

        if (razor && dos >= 3) {
          pen *= 2;
          properties.push("Razor Sharp");
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
          if (!spray && activeIndexes.length) {
            const minActive = activeIndexes.reduce((best, idx) => (modDice[idx] < modDice[best] ? idx : best), activeIndexes[0]);
            modDice[minActive] = Math.max(modDice[minActive], dos);
            if (proven) modDice[minActive] = Math.max(modDice[minActive], provenVal);
            if (primitive) modDice[minActive] = Math.min(modDice[minActive], primitiveVal);
          }
          const total = modDice.reduce((a, b) => a + b, 0) + flatBonus;

          damageResults.push(total);
          hitsData.push({ hit: h, location: hitLocations[h - 1], damage: total, fury: null });

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
        const traitTests = { toxic: null, flame: null, spray: null, concussive: null, force: null };

        const rollCharacteristicTest = async ({ total, label, modifier = 0 }) => {
          const target = Math.max(1, Number(total || 0) + Number(modifier || 0));
          const roll = await new Roll("1d100").evaluate();
          if (game.dice3d) await game.dice3d.showForRoll(roll, game.user, true);
          return { label, target, roll: roll.total, success: isD100Success(roll.total, target), dos: calcDoS(target, roll.total) };
        };

        if (toxic && !isHordeTarget) {
          const toxicValue = parseTraitVal("toxic", 1);
          const test = await rollCharacteristicTest({
            total: targetActor?.system?.characteristics?.toughness?.total ?? 0,
            label: "Toughness",
            modifier: -10 * toxicValue
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

        if (flame && !isHordeTarget) {
          traitTests.flame = {
            ...(await rollCharacteristicTest({ total: targetActor?.system?.characteristics?.agility?.total ?? 0, label: "Agility" })),
            resolved: true
          };
          properties.push("Flame");
        }

        if (spray && !isHordeTarget) {
          traitTests.spray = {
            ...(await rollCharacteristicTest({ total: targetActor?.system?.characteristics?.agility?.total ?? 0, label: "Agility" })),
            resolved: true
          };
          properties.push("Spray");
        }

        const concussiveMatch = properties.find(p => /concussive\s*\((\d+)\)/i.test(String(p)));
        const concussiveValue = concussiveMatch ? Number(String(concussiveMatch).match(/concussive\s*\((\d+)\)/i)?.[1] ?? 0) : 0;
        if (concussiveValue > 0 && !isHordeTarget) {
          traitTests.concussive = {
            value: concussiveValue,
            ...(await rollCharacteristicTest({ total: targetActor?.system?.characteristics?.toughness?.total ?? 0, label: "Toughness" })),
            resolved: true
          };
        }

        if (force && forceChannel && !isHordeTarget) {
          const attackerWP = Number(actor.system?.characteristics?.willpower?.total ?? 0);
          const targetWP = Number(targetActor?.system?.characteristics?.willpower?.total ?? 0);
          const attackerRoll = await new Roll("1d100").evaluate();
          if (game.dice3d) await game.dice3d.showForRoll(attackerRoll, game.user, true);
          const targetRoll = await new Roll("1d100").evaluate();
          if (game.dice3d) await game.dice3d.showForRoll(targetRoll, game.user, true);
          const attackerDoS = calcDoS(attackerWP, attackerRoll.total);
          const targetDoS = calcDoS(targetWP, targetRoll.total);
          const won = attackerDoS > targetDoS;
          let forceDamage = 0;
          if (won) {
            const forceDice = Math.max(1, attackerDoS - targetDoS);
            const forceRoll = await new Roll(`${forceDice}d10`).evaluate();
            if (game.dice3d) await game.dice3d.showForRoll(forceRoll, game.user, true);
            forceDamage = forceRoll.total;
            traitTests.force = { resolved: true, attackerWP, targetWP, attackerRoll: attackerRoll.total, targetRoll: targetRoll.total, attackerDoS, targetDoS, won, dos: forceDice, result: forceDamage, ignoresSoak: true };
          } else {
            traitTests.force = { resolved: true, attackerWP, targetWP, attackerRoll: attackerRoll.total, targetRoll: targetRoll.total, attackerDoS, targetDoS, won, dos: 0, result: 0, ignoresSoak: true };
          }
          properties.push("Force");
        }

        const testSummary = [traitTests.flame, traitTests.spray, traitTests.toxic, traitTests.concussive].filter(Boolean)
          .map(t => `<div><b>${t.label} Test</b> (${t.target}) Roll ${t.roll}: <b>${t.success ? "Success" : "Failure"}</b>${typeof t.damage === "number" ? ` | Extra Damage: <b>${t.damage}</b>` : ""}</div>`)
          .join("");
        const forceSummary = traitTests.force
          ? `<div><b>Force Opposed WP</b> Attacker ${traitTests.force.attackerRoll}/${traitTests.force.attackerWP} (DoS ${traitTests.force.attackerDoS}) vs Target ${traitTests.force.targetRoll}/${traitTests.force.targetWP} (DoS ${traitTests.force.targetDoS}) → <b>${traitTests.force.won ? `Attacker Wins (${traitTests.force.dos}d10 = ${traitTests.force.result})` : "Target Resists"}</b></div>`
          : "";

        const sprayJamHtml = sprayJam
          ? `<hr><div style="color:#b267ff;font-weight:bold;">Spray Jam triggered (damage die result of 9).</div>`
          : "";

        const furyHtml = furyResults.length
          ? `<hr><div style="color:gold;font-size:1.1em;font-weight:bold;text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;">✦ RIGHTEOUS FURY ✦</div>${furyResults.map((f, i) => `<div>${i + 1}. <b>Location:</b> <i>${f.location}</i> — Righteous Fury: <b>${f.result}</b></div>`).join("")}`
          : "";

        const damageSummary = `<div style="text-align:center; color:#000;">
<div><b>Damage</b></div>
<div>—</div>
<div><b>Penetration:</b> ${pen}</div>
${damageResults.map((d, i) => `<div><span style="font-weight:700;color:#000;">Damage done:</span> <span style="font-weight:700;color:#000;">${d}</span> <i style="font-weight:400;">${hitLocations[i]}</i></div>`).join("")}
<div style="margin-top:6px;"><b>Properties:</b> ${properties.join(", ") || "None"}</div>
${testSummary}${forceSummary}${sprayJamHtml}
${furyHtml}
</div>`;

        const damageResult = {
          attacker: attackData.attacker,
          target: attackData.target,
          targetTokenUuid: attackData.targetTokenUuid,
          weapon: attackData.weapon,
          damageType,
          penetration: pen,
          hits,
          hitsData,
          dos,
          fury: furyResults,
          properties,
          toxic: traitTests.toxic,
          flame: traitTests.flame,
          spray: traitTests.spray,
          concussive: traitTests.concussive,
          felling: fellingVal,
          sprayJam,
          force: traitTests.force,
          talentModifier: entry.state?.talentModifier ?? null,
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
