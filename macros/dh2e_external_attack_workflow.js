/**
 * DH2e External Attack Workflow (Foundry V13)
 * V13-safe flow:
 * 1) Attacker dialog (Attack) -> immediately rolls attack and creates workflow chat card.
 * 2) Defense dialogs per target with allocated hits.
 * 3) Damage dialog for attacker to roll per-target damage.
 */

const WORKFLOW_NS = "foundrymacros";
const WORKFLOW_KEY = "dh2eExternalWorkflow";

const controlled = canvas.tokens.controlled;
if (!controlled.length) return ui.notifications.warn("Select your attacker token first.");

const attackerToken = controlled[0];
const attacker = attackerToken.actor;
if (!attacker) return ui.notifications.warn("Attacker token has no actor.");

const targetTokens = Array.from(game.user.targets ?? []);
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

const hasTalent = (actorDoc, needle) =>
  actorDoc.items.some(i => i.type === "talent" && i.name.toLowerCase().includes(needle.toLowerCase()));

const parseWeaponTraits = weapon =>
  (weapon.system.special ?? "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
const hasTrait = (traits, key) => traits.some(t => t.includes(key));

const animatedRoll = async (formula, speaker) => {
  const roll = await new Roll(formula).roll({ async: true });
  await roll.toMessage({ speaker, rollMode: "roll" });
  return roll;
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

const allocateHits = ({ totalHits, modeKey, targets, rof }) => {
  const byTarget = new Map(targets.map(t => [t.tokenUuid, 0]));
  if (totalHits <= 0 || !targets.length) return byTarget;
  let remaining = totalHits;
  if (modeKey === "full" || modeKey === "suppressFull") remaining = Math.min(remaining, rof.full ?? remaining);
  let idx = 0;
  while (remaining > 0) {
    const t = targets[idx % targets.length];
    byTarget.set(t.tokenUuid, (byTarget.get(t.tokenUuid) ?? 0) + 1);
    idx += 1;
    remaining -= 1;
  }
  return byTarget;
};

const buildWorkflowHtml = state => {
  const cards = state.targets.map(t => {
    const sizeTxt = t.sizeIgnored ? `${t.sizeLabel} (Black Carapace ignores)` : `${t.sizeLabel} ${t.sizeMod >= 0 ? "+" : ""}${t.sizeMod}`;
    const dmgTxt = (t.damageRolls ?? []).map(d => `${d.total} ${d.loc}`).join(", ") || "—";
    return `<div style="border:1px solid #555;border-radius:6px;padding:6px;margin:6px 0;">
      <div><b>${t.name}</b> (${t.tokenUuid})</div>
      <div><b>Dist:</b> ${t.distanceMeters}m | <b>Range:</b> ${t.rangeLabel} | <b>Size:</b> ${sizeTxt}</div>
      <div><b>TN:</b> ${t.targetNumber} | <b>Hits:</b> ${t.allocatedHits}</div>
      <div><b>Defense:</b> ${t.defenseRoll ?? "—"} (${t.defenseOutcome ?? "—"})</div>
      <div><b>Damage:</b> ${dmgTxt}</div>
    </div>`;
  }).join("");

  return `<div data-workflow-id="${state.id}">
    <h3 style="margin:0 0 6px 0;">${state.attackerName} attacks with ${state.weaponName}</h3>
    <div><b>Mode:</b> ${state.modeLabel} | <b>Power:</b> ${state.powerModeLabel} | <b>Aim:</b> ${state.aimLabel}</div>
    <div><b>Modifiers:</b> ${state.modifierNotes.join(", ") || "None"}</div>
    <div><b>Talents/Items:</b> ${state.selectedTalents?.join(", ") || "None"}</div>
    <div><b>Attack Roll:</b> ${state.attackRoll ?? "—"} | <b>DoS:</b> ${state.dos ?? "—"} | <b>Status:</b> ${state.statusText ?? "Pending"} | <b>Total Hits:</b> ${state.totalHits ?? 0}</div>
    ${state.extraText ? `<div><b>Notes:</b> ${state.extraText}</div>` : ""}
    <hr>${cards}
  </div>`;
};

const promptDefenseForTarget = async targetState => {
  return new Promise(resolve => {
    new Dialog({
      title: `Defense: ${targetState.name}`,
      content: `<p><b>${targetState.name}</b> has <b>${targetState.allocatedHits}</b> incoming hits.</p>
                <p>Click <b>Roll Defense</b> to roll Agility defense now, or Skip.</p>`,
      buttons: {
        roll: { label: "Roll Defense", callback: () => resolve("roll") },
        skip: { label: "Skip", callback: () => resolve("skip") }
      },
      default: "roll"
    }).render(true);
  });
};

const promptDamageDialog = async (state, chatMessage) => {
  const rows = state.targets.filter(t => t.allocatedHits > 0).map(t => `<li>${t.name}: ${t.allocatedHits} hits</li>`).join("");
  if (!rows) return;

  await new Promise(resolve => {
    new Dialog({
      title: `Damage: ${state.attackerName}`,
      content: `<p>Incoming damage rolls to resolve:</p><ul>${rows}</ul><p>Roll now?</p>`,
      buttons: {
        roll: {
          label: "Roll Damage",
          callback: async () => {
            for (const t of state.targets) {
              if (t.allocatedHits <= 0) continue;
              const damageRolls = [];
              for (let i = 0; i < t.allocatedHits; i += 1) {
                const r = await animatedRoll(state.weaponDamage, chatMessage.speaker);
                damageRolls.push({ total: r.total, loc: getHitLocation(state.attackRoll || r.total) });
              }
              t.damageRolls = damageRolls;
              t.damageResolved = true;
            }
            resolve();
          }
        },
        later: { label: "Later", callback: () => resolve() }
      },
      default: "roll"
    }).render(true);
  });
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

  const modifierNotes = [mode.label];
  const selectedTalents = [];
  let sharedMod = mode.mod + setup.manualMod + setup.aimMod;
  if (setup.manualMod) modifierNotes.push(`Manual ${setup.manualMod >= 0 ? "+" : ""}${setup.manualMod}`);
  if (setup.aimMod) modifierNotes.push(setup.aimLabel);

  const t = setup.toggles ?? {};
  if (t.deadeye && !isMelee && setup.modeKey === "called") { sharedMod += 10; selectedTalents.push("Deadeye +10"); }
  if (t.doubletap && !isMelee) { sharedMod += 20; selectedTalents.push("Double Tap +20"); }
  if (t.grip) { sharedMod += 5; selectedTalents.push("Custom Grip +5"); }
  if (t.stock && !isMelee && setup.aimMod > 0) {
    const b = setup.aimMod === 20 ? 4 : 2;
    sharedMod += b;
    selectedTalents.push(`Modified Stock +${b}`);
  }
  if (t.motion && !isMelee && ["semi", "full", "suppressSemi", "suppressFull"].includes(setup.modeKey)) { sharedMod += 10; selectedTalents.push("Motion Predictor +10"); }
  if ((t.reddot || t.omni) && !isMelee && ["single", "called"].includes(setup.modeKey)) { sharedMod += 10; selectedTalents.push("Red-Dot +10"); }
  if (t.berserk && isMelee && setup.modeKey === "charge") { sharedMod += 10; selectedTalents.push("Berserk Charge +10"); }

  const targets = setup.targetConfigs.map(conf => ({
    tokenUuid: conf.tokenUuid,
    targetTokenUuid: conf.tokenUuid,
    name: conf.targetName,
    distanceMeters: conf.distanceMeters,
    rangeLabel: conf.rangeLabel,
    rangeMod: conf.rangeMod,
    sizeLabel: conf.sizeLabel,
    sizeMod: conf.sizeMod,
    sizeIgnored: conf.sizeIgnored,
    targetNumber: Math.max(1, baseSkill + sharedMod + conf.rangeMod + conf.sizeMod),
    allocatedHits: 0,
    defenseRoll: null,
    defenseOutcome: null,
    damageRolls: [],
    damageResolved: false
  }));

  const powerMode = POWER_MODES[setup.powerModeKey] ?? POWER_MODES[1];
  const state = {
    id: foundry.utils.randomID(),
    attackerActorId: attacker.id,
    attackerName: attacker.name,
    attackerTokenUuid: attackerToken.document.uuid,
    weaponId: weapon.id,
    weaponName: weapon.name,
    weaponDamage: weapon.system.damage || "1d10",
    modeKey: setup.modeKey,
    modeLabel: mode.label,
    powerModeLabel: powerMode.label,
    powerMultiplier: powerMode.multiplier,
    aimLabel: setup.aimLabel,
    modifierNotes,
    selectedTalents,
    attackRoll: null,
    dos: 0,
    totalHits: 0,
    statusText: "Pending",
    extraText: "",
    targets,
    flags: { immediate: true }
  };

  const chatMessage = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker, token: attackerToken.document }),
    content: buildWorkflowHtml(state),
    flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: state } }
  });

  // immediate attack roll
  const result = (await animatedRoll("1d100", chatMessage.speaker)).total;
  const bestTN = Math.max(...state.targets.map(t => t.targetNumber));
  const success = result <= bestTN;
  const dos = success ? 1 + Math.floor((bestTN - result) / 10) : 0;

  let hits = success ? 1 : 0;
  if (success && !isMelee) {
    if (["semi", "suppressSemi"].includes(state.modeKey)) hits = Math.min(1 + Math.floor((dos - 1) / 2), rof.burst ?? 1);
    else if (["full", "suppressFull"].includes(state.modeKey)) hits = Math.min(dos, rof.full ?? 1);
  }

  // Ammo consumption (legacy behavior): spent by firing mode, not by number of hits.
  // Includes Storm quality and power mode multiplier (Las/Plasma modes can increase this).
  let ammoSpent = 0;
  let outOfAmmoAfter = false;
  if (!isMelee && !infiniteAmmo && !isGrenade && weapon.system.clip?.value != null) {
    let shotsRequired = 1;
    if (["semi", "suppressSemi"].includes(state.modeKey)) shotsRequired = rof.burst ?? 1;
    else if (["full", "suppressFull"].includes(state.modeKey)) shotsRequired = rof.full ?? 1;

    if (hasTrait(traits, "storm")) shotsRequired *= 2;
    shotsRequired *= state.powerMultiplier;

    const currentClip = weapon.system.clip.value;
    const used = Math.min(shotsRequired, currentClip);
    ammoSpent = used;

    const newClip = Math.max(0, currentClip - used);
    outOfAmmoAfter = newClip <= 0;
    await weapon.update({ "system.clip.value": newClip });

    // Cap generated hits by available spent shots.
    hits = Math.min(hits, used);
  }

  const eligible = state.targets.filter(t => result <= t.targetNumber);
  const alloc = allocateHits({ totalHits: hits, modeKey: state.modeKey, targets: eligible, rof });

  state.targets = state.targets.map(t => ({ ...t, allocatedHits: alloc.get(t.tokenUuid) || 0 }));
  state.attackRoll = result;
  state.dos = dos;
  state.totalHits = Array.from(alloc.values()).reduce((a, b) => a + b, 0);
  state.statusText = success ? (outOfAmmoAfter ? "OUT OF AMMO" : "OK") : "MISS";
  if (ammoSpent > 0) {
    state.extraText = [state.extraText, `Ammo Spent: ${ammoSpent}`].filter(Boolean).join(" | ");
  }

  // defense dialogs for each target with hits
  for (const t of state.targets) {
    if (t.allocatedHits <= 0) continue;
    const decision = await promptDefenseForTarget(t);
    if (decision === "roll") {
      const targetDoc = await fromUuid(t.tokenUuid);
      const agility = targetDoc?.actor?.system?.characteristics?.agility?.total ?? 0;
      const r = await animatedRoll("1d100", chatMessage.speaker);
      const ok = r.total <= agility;
      t.defenseRoll = r.total;
      t.defenseOutcome = ok ? "Success (-1 hit)" : "Failed";
      if (ok && t.allocatedHits > 0) t.allocatedHits -= 1;
    } else {
      t.defenseOutcome = "Skipped";
    }
  }

  await chatMessage.update({
    content: buildWorkflowHtml(state),
    flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: state } }
  });

  // damage prompt back to attacker
  await promptDamageDialog(state, chatMessage);

  await chatMessage.update({
    content: buildWorkflowHtml(state),
    flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: state } }
  });
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
    const rof = weaponDoc?.system?.rateOfFire ?? {};
    return Object.entries(rangedModes).map(([k, v]) => {
      const bad = (["semi", "suppressSemi"].includes(k) && (rof.burst ?? 0) <= 0) || (["full", "suppressFull"].includes(k) && (rof.full ?? 0) <= 0);
      return `<option value="${k}" ${bad ? "disabled" : ""}>${v.label}</option>`;
    }).join("");
  };

  const targetRows = weaponDoc => {
    const isMelee = (weaponDoc?.system.class ?? "").toLowerCase() === "melee";
    const normalRange = getNormalRangeForWeapon(weaponDoc);
    return targetTokens.map(t => {
      const d = Math.round(canvas.grid.measureDistance(attackerToken.center, t.center));
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
        <div class="form-group"><label><b>Weapon</b></label><select id="weaponId">${weaponOptions}</select></div>
        <div class="form-group"><label><b>Attack Type</b></label><select id="modeKey"></select></div>
        <div class="form-group"><label><b>Modifier</b></label><input id="manualMod" type="number" value="0"/></div>
        <div class="form-group"><label><b>Aim</b></label><select id="aimMod"><option value="0">No Aim</option><option value="10">Half Aim (+10)</option><option value="20">Full Aim (+20)</option></select></div>
        <div class="form-group" id="powerModeGroup"><label><b>Power Mode</b></label><select id="powerMode"><option value="1">Normal</option><option value="2">Overcharge (×2)</option><option value="4">Overload (×4)</option><option value="3">Maximal (×3)</option></select></div>
        <hr><h3>Talents</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;">
          <label><input type="checkbox" id="talent_deadeye"/> Deadeye Shot</label>
          <label><input type="checkbox" id="talent_marksman"/> Marksman</label>
          <label><input type="checkbox" id="talent_doubletap"/> Double Tap</label>
          <label><input type="checkbox" id="talent_targetsel"/> Target Selection</label>
          <label><input type="checkbox" id="talent_devastating"/> Devastating Assault</label>
          <label><input type="checkbox" id="talent_blademaster"/> Blademaster</label>
          <label><input type="checkbox" id="talent_whirlwind"/> Whirlwind of Death</label>
          <label><input type="checkbox" id="talent_berserk"/> Berserk Charge</label>
          <label><input type="checkbox" id="talent_twm_melee"/> Two-Weapon Wielder (Melee)</label>
          <label><input type="checkbox" id="talent_twm_ranged"/> Two-Weapon Wielder (Ranged)</label>
          <label><input type="checkbox" id="talent_ambi"/> Ambidextrous</label>
          <label><input type="checkbox" id="talent_master"/> Two Weapon Master</label>
        </div>
        <hr><h3>Items</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;">
          <label><input type="checkbox" id="item_grip"/> Custom Grip</label>
          <label><input type="checkbox" id="item_fluid"/> Fluid Action</label>
          <label><input type="checkbox" id="item_stock"/> Modified Stock</label>
          <label><input type="checkbox" id="item_motion"/> Motion Predictor</label>
          <label><input type="checkbox" id="item_reddot"/> Red-Dot Laser Sight</label>
          <label><input type="checkbox" id="item_targeter"/> Targeter</label>
          <label><input type="checkbox" id="item_scope"/> Telescopic Sight</label>
          <label><input type="checkbox" id="item_omni"/> Omni-Scope</label>
        </div>
        <hr><h3>Targets</h3>
        <table style="width:100%;"><thead><tr><th>Target</th><th>Distance</th><th>Range</th></tr></thead><tbody id="targetsBody"></tbody></table>
      </form>`,
      render: html => {
        const refresh = () => {
          const weaponDoc = attacker.items.get(html.find("#weaponId").val());
          const mode = html.find("#modeKey");
          mode.html(buildModeOptions(weaponDoc));
          const firstEnabled = mode.find("option:not([disabled])").first().val();
          if (firstEnabled) mode.val(firstEnabled);
          html.find("#targetsBody").html(targetRows(weaponDoc));

          const wType = (weaponDoc?.system?.type ?? "").toLowerCase();
          const showPower = ["las", "plasma"].includes(wType);
          html.find("#powerModeGroup").toggle(showPower);
          if (!showPower) html.find("#powerMode").val("1");
        };

        html.find("#talent_deadeye").prop("checked", hasTalent(attacker, "deadeye"));
        html.find("#talent_marksman").prop("checked", hasTalent(attacker, "marksman"));
        html.find("#talent_doubletap").prop("checked", hasTalent(attacker, "double tap"));
        html.find("#talent_targetsel").prop("checked", hasTalent(attacker, "target selection"));
        html.find("#talent_devastating").prop("checked", hasTalent(attacker, "devastating assault"));
        html.find("#talent_blademaster").prop("checked", hasTalent(attacker, "blademaster"));
        html.find("#talent_whirlwind").prop("checked", hasTalent(attacker, "whirlwind"));
        html.find("#talent_berserk").prop("checked", hasTalent(attacker, "berserk charge"));
        html.find("#talent_twm_melee").prop("checked", hasTalent(attacker, "two-weapon wielder (melee)"));
        html.find("#talent_twm_ranged").prop("checked", hasTalent(attacker, "two-weapon wielder (ranged)"));
        html.find("#talent_ambi").prop("checked", hasTalent(attacker, "ambidextrous"));
        html.find("#talent_master").prop("checked", hasTalent(attacker, "two weapon master"));

        html.find("#weaponId").on("change", refresh);
        refresh();
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
                grip: html.find("#item_grip")[0].checked,
                fluid: html.find("#item_fluid")[0].checked,
                stock: html.find("#item_stock")[0].checked,
                motion: html.find("#item_motion")[0].checked,
                reddot: html.find("#item_reddot")[0].checked,
                targeter: html.find("#item_targeter")[0].checked,
                scope: html.find("#item_scope")[0].checked,
                omni: html.find("#item_omni")[0].checked
              }
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
await runAttackWorkflow(setup);
