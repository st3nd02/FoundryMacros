/**
 * Dark Heresy 2e External Attack Workflow (Foundry V13)
 * - Persistent workflow in ChatMessage flags
 * - Attack / Defense / Damage buttons
 * - Multi-target hit allocation
 * - Per-target range + size modifiers (Black Carapace aware)
 * - Legacy talent/item attack modifiers carried forward
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

const animatedRoll = async (formula, speaker) => {
  const roll = await new Roll(formula).roll({ async: true });
  await roll.toMessage({ speaker, rollMode: "roll" });
  return roll;
};

const parseWeaponTraits = weapon =>
  (weapon.system.special ?? "")
    .split(",")
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);

const hasTrait = (traits, key) => traits.some(t => t.includes(key));

const hasTalent = (actorDoc, needle) =>
  actorDoc.items.some(i => i.type === "talent" && i.name.toLowerCase().includes(needle.toLowerCase()));

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
  const allTraits = targetActor?.items?.filter(i => i.type === "trait")?.map(i => i.name.toLowerCase()) ?? [];
  const hasBlackCarapace = allTraits.some(t => t.includes("black carapace"));
  const sizeTrait = allTraits.find(t => t.startsWith("size"));
  if (!sizeTrait) return { mod: 0, label: "Normal", ignored: false };

  const match = sizeTrait.match(/size\s*\((\d+)\)/);
  if (!match) return { mod: 0, label: "Normal", ignored: false };

  const table = {
    1: { mod: -30, label: "Miniscule" },
    2: { mod: -20, label: "Puny" },
    3: { mod: -10, label: "Scrawny" },
    4: { mod: 0, label: "Normal" },
    5: { mod: 10, label: "Hulking" },
    6: { mod: 20, label: "Enormous" },
    7: { mod: 30, label: "Massive" },
    8: { mod: 40, label: "Immense" },
    9: { mod: 50, label: "Monumental" },
    10: { mod: 60, label: "Titanic" }
  };

  const data = table[Number(match[1])] ?? { mod: 0, label: "Normal" };
  if (hasBlackCarapace) return { mod: 0, label: data.label, ignored: true };
  return { mod: data.mod, label: data.label, ignored: false };
};

const getNormalRangeForWeapon = weapon => {
  if ((weapon.system.class ?? "").toLowerCase() === "melee") return 1;
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

const getCraftData = weapon => {
  const craft = (weapon.system.craftsmanship ?? "Common").toLowerCase();
  return {
    rangedPoor: craft === "poor",
    rangedGood: craft === "good",
    rangedBest: craft === "best",
    meleeBonus:
      craft === "poor" ? -10 :
      craft === "good" ? 5 :
      craft === "best" ? 10 : 0
  };
};

const computeJam = ({ result, targetNumber, weapon, traits }) => {
  const isMelee = (weapon.system.class ?? "").toLowerCase() === "melee";
  if (isMelee) return false;

  const craft = getCraftData(weapon);
  const reliable = hasTrait(traits, "reliable");
  const unreliable = hasTrait(traits, "unreliable");

  let jamLow = 95;
  if (reliable) jamLow = 100;
  if (unreliable) jamLow = 91;

  if (craft.rangedBest) jamLow = 101;
  else if (craft.rangedGood && !unreliable) jamLow = 100;
  else if (craft.rangedPoor) jamLow = unreliable ? targetNumber + 1 : 91;

  return result >= jamLow;
};

const allocateHits = ({ totalHits, modeKey, eligibleTargets, rof }) => {
  const byTarget = new Map(eligibleTargets.map(t => [t.tokenUuid, 0]));
  if (!eligibleTargets.length || totalHits <= 0) return byTarget;

  let remaining = totalHits;
  if (modeKey === "full" || modeKey === "suppressFull") {
    remaining = Math.min(remaining, rof.full ?? remaining);
  }

  let i = 0;
  while (remaining > 0) {
    const t = eligibleTargets[i % eligibleTargets.length];
    byTarget.set(t.tokenUuid, (byTarget.get(t.tokenUuid) ?? 0) + 1);
    i += 1;
    remaining -= 1;
  }

  return byTarget;
};

function canActOnAttack(state) {
  if (game.user.isGM) return true;
  return game.actors.get(state.attackerActorId)?.isOwner && !state.resolvedAttack;
}

function canActOnDefense(state, target) {
  if (!state.resolvedAttack) return false;
  if (target.allocatedHits <= 0 || target.defenseRoll != null) return false;
  if (game.user.isGM) return true;
  return fromUuidSync(target.tokenUuid)?.actor?.isOwner;
}

function canActOnDamage(state, target) {
  if (!state.resolvedAttack) return false;
  if (target.allocatedHits <= 0 || target.damageResolved) return false;
  if (game.user.isGM) return true;
  return game.actors.get(state.attackerActorId)?.isOwner;
}

const rangeSelectHtml = selectedMod =>
  `<select class="target-range-mod">${RANGE_BANDS.map(b => `<option value="${b.mod}" ${b.mod === selectedMod ? "selected" : ""}>${b.label}</option>`).join("")}</select>`;

const buildWorkflowHtml = state => {
  const blocks = state.targets
    .map(t => {
      const sizeTxt = t.sizeIgnored ? `${t.sizeLabel} (Black Carapace ignores)` : `${t.sizeLabel} ${t.sizeMod >= 0 ? "+" : ""}${t.sizeMod}`;
      const dmgTxt = (t.damageRolls ?? []).map(r => `${r.total} ${r.loc}`).join(", ") || "—";
      return `<div data-target-uuid="${t.tokenUuid}" style="border:1px solid #555; border-radius:6px; padding:6px; margin-bottom:6px;">
        <div style="font-weight:bold; margin-bottom:4px;">${t.name}</div>
        <div><b>Dist:</b> ${t.distanceMeters}m | <b>Range:</b> ${t.rangeLabel} | <b>Size:</b> ${sizeTxt}</div>
        <div><b>TN:</b> ${t.targetNumber} | <b>Hits:</b> ${t.allocatedHits} | <b>Defense:</b> ${t.defenseRoll ?? "—"} (${t.defenseOutcome ?? "—"})</div>
        <div><b>Damage:</b> ${dmgTxt}</div>
        <div style="margin-top:4px;">
          <button data-action="defense" data-target="${t.tokenUuid}" ${canActOnDefense(state, t) ? "" : "disabled"}>Defense</button>
          <button data-action="damage" data-target="${t.tokenUuid}" ${canActOnDamage(state, t) ? "" : "disabled"}>Damage</button>
        </div>
      </div>`;
    })
    .join("");

  return `<div class="dh2e-workflow" data-workflow-id="${state.id}">
    <h3 style="margin:0 0 6px 0;">${state.attackerName} attacks with ${state.weaponName}</h3>
    <div><b>Mode:</b> ${state.modeLabel} | <b>Power:</b> ${state.powerModeLabel} | <b>Aim:</b> ${state.aimLabel}</div>
    <div><b>Shared Modifiers:</b> ${state.modifierNotes.join(", ") || "None"}</div>
    <div><b>Talents/Items:</b> ${state.selectedTalents.join(", ") || "None"}</div>
    <div><b>Attack Roll:</b> ${state.attackRoll ?? "—"} | <b>DoS:</b> ${state.dos ?? "—"} | <b>Status:</b> ${state.statusText ?? "Pending"} | <b>Total Hits:</b> ${state.totalHits ?? 0}</div>
    ${state.extraText ? `<div><b>Notes:</b> ${state.extraText}</div>` : ""}
    <hr>
    <div>${blocks}</div>
    <hr>
    <button data-action="attack" ${canActOnAttack(state) ? "" : "disabled"}>Roll Attack</button>
  </div>`;
};

const updateWorkflowMessage = async (chatMessage, state) => {
  await chatMessage.update({
    content: buildWorkflowHtml(state),
    flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: state } }
  });
};

const showStartDialog = async () => {
  const weaponOptions = weapons.map(w => `<option value="${w.id}">${w.name}</option>`).join("");

  const modeOptionsForWeapon = weaponDoc => {
    const isMelee = (weaponDoc?.system.class ?? "").toLowerCase() === "melee";
    const rof = weaponDoc?.system?.rateOfFire ?? {};

    if (isMelee) {
      return Object.entries(meleeModes).map(([k, v]) => {
        let disabled = false;
        if (k === "swift" && !hasTalent(attacker, "swift attack")) disabled = true;
        if (k === "lightning" && !hasTalent(attacker, "lightning attack")) disabled = true;
        return `<option value="${k}" ${disabled ? "disabled" : ""}>${v.label}</option>`;
      }).join("");
    }

    return Object.entries(rangedModes).map(([k, v]) => {
      let disabled = false;
      if (["semi", "suppressSemi"].includes(k) && (rof.burst ?? 0) <= 0) disabled = true;
      if (["full", "suppressFull"].includes(k) && (rof.full ?? 0) <= 0) disabled = true;
      return `<option value="${k}" ${disabled ? "disabled" : ""}>${v.label}</option>`;
    }).join("");
  };

  const buildTargetRows = weaponDoc => {
    const isMelee = (weaponDoc?.system.class ?? "").toLowerCase() === "melee";
    const normalRange = getNormalRangeForWeapon(weaponDoc);

    return targetTokens.map(t => {
      const dist = Math.round(canvas.grid.measureDistance(attackerToken.center, t.center));
      const autoRange = getAutoRangeBand(dist, normalRange, isMelee);
      const size = getSizeModifier(t.actor);
      const sizeTxt = size.ignored ? `${size.label} (Black Carapace ignores)` : `${size.label} ${size.mod >= 0 ? "+" : ""}${size.mod}`;
      return `<tr class="target-row" data-uuid="${t.document.uuid}" data-name="${t.name}" data-distance="${dist}" data-size-mod="${size.mod}" data-size-label="${size.label}" data-size-ignored="${size.ignored ? 1 : 0}">
        <td>${t.name}</td><td>${dist}m</td><td>${rangeSelectHtml(autoRange)}</td><td>${sizeTxt}</td>
      </tr>`;
    }).join("");
  };

  return new Promise(resolve => {
    new Dialog({
      title: "External Attack Workflow",
      content: `<form>
        <div class="form-group"><label><b>Weapon</b></label><select id="weaponId">${weaponOptions}</select></div>
        <div class="form-group"><label><b>Attack Type</b></label><select id="modeKey"></select></div>
        <div class="form-group"><label><b>Modifier</b></label><input id="manualMod" type="number" value="0"/></div>
        <div class="form-group"><label><b>Aim</b></label><select id="aimMod"><option value="0">No Aim</option><option value="10">Half Aim (+10)</option><option value="20">Full Aim (+20)</option></select></div>
        <div class="form-group"><label><input type="checkbox" id="horde"/> Horde?</label></div>
        <div class="form-group"><label><b>Horde Bonus</b></label><input id="hordeBonus" type="number" value="0"/></div>
        <div class="form-group"><label><input type="checkbox" id="shootMelee"/> Shooting into Melee?</label></div>
        <div class="form-group"><label><input type="checkbox" id="twoWeaponAttack"/> Two-Weapon Attack?</label></div>
        <div class="form-group"><label><b>Power Mode</b></label><select id="powerMode"><option value="1">Normal</option><option value="2">Overcharge (×2)</option><option value="4">Overload (×4)</option><option value="3">Maximal (×3)</option></select></div>

        <hr><h3>Targets (UUID tracked, name shown)</h3>
        <table style="width:100%; font-size:0.9em;"><thead><tr><th>Target</th><th>Distance</th><th>Range</th><th>Size</th></tr></thead><tbody id="targetsBody"></tbody></table>

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
      </form>`,
      render: html => {
        const refresh = () => {
          const weaponDoc = attacker.items.get(html.find("#weaponId").val());
          const modeSel = html.find("#modeKey");
          modeSel.html(modeOptionsForWeapon(weaponDoc));
          const firstEnabled = modeSel.find("option:not([disabled])").first().val();
          if (firstEnabled) modeSel.val(firstEnabled);
          html.find("#targetsBody").html(buildTargetRows(weaponDoc));
        };

        html.find("#weaponId").on("change", refresh);

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

        refresh();
      },
      buttons: {
        start: {
          label: "Create Workflow",
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
                rangeLabel: RANGE_BANDS.find(b => b.mod === rangeMod)?.label ?? "Normal (+0)",
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
              isHorde: html.find("#horde")[0].checked,
              hordeBonus: Number(html.find("#hordeBonus").val() || 0),
              shootingMelee: html.find("#shootMelee")[0].checked,
              twoWeaponAttack: html.find("#twoWeaponAttack")[0].checked,
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
      default: "start"
    }).render(true);
  });
};

const setup = await showStartDialog();
if (!setup) return;

const weapon = attacker.items.get(setup.weaponId);
if (!weapon) return ui.notifications.error("Invalid weapon selection.");

const traits = parseWeaponTraits(weapon);
const isMelee = (weapon.system.class ?? "").toLowerCase() === "melee";
const modeTable = isMelee ? meleeModes : rangedModes;
const modeData = modeTable[setup.modeKey] ?? Object.values(modeTable)[0];
const bs = attacker.system.characteristics.ballisticSkill?.total ?? 0;
const ws = attacker.system.characteristics.weaponSkill?.total ?? 0;
const wsBonus = attacker.system.characteristics.weaponSkill?.bonus ?? 0;
const baseSkill = isMelee ? ws : bs;

const isFlame = !isMelee && (((weapon.system.type ?? "").toLowerCase() === "flame") || hasTrait(traits, "flame"));
const infiniteAmmo = hasTrait(traits, "living ammunition") || hasTrait(traits, "infammo");
const craft = getCraftData(weapon);

let sharedMod = setup.manualMod + (modeData?.mod ?? 0) + setup.aimMod;
const modifierNotes = [modeData?.label ?? "Mode"];
const selectedTalents = [];

if (setup.manualMod) modifierNotes.push(`Manual ${setup.manualMod >= 0 ? "+" : ""}${setup.manualMod}`);
if (setup.aimMod) modifierNotes.push(setup.aimLabel);
if (setup.isHorde && setup.hordeBonus) {
  sharedMod += setup.hordeBonus;
  modifierNotes.push(`Horde ${setup.hordeBonus >= 0 ? "+" : ""}${setup.hordeBonus}`);
}
if (setup.shootingMelee && !setup.toggles.targetsel) {
  sharedMod -= 20;
  modifierNotes.push("Shooting into Melee -20");
}
if (setup.twoWeaponAttack) {
  let penalty = -20;
  if (!setup.toggles.master) {
    const hasWielder = (isMelee && setup.toggles.twmMelee) || (!isMelee && setup.toggles.twmRanged);
    if (hasWielder && setup.toggles.ambi) penalty = -10;
  } else {
    penalty = 0;
  }
  sharedMod += penalty;
  modifierNotes.push(`Two-Weapon ${penalty}`);
}

if (isMelee && craft.meleeBonus !== 0) {
  sharedMod += craft.meleeBonus;
  selectedTalents.push(`Craftsmanship ${craft.meleeBonus >= 0 ? "+" : ""}${craft.meleeBonus}`);
}

if (setup.toggles.deadeye && !isMelee && setup.modeKey === "called") { sharedMod += 10; selectedTalents.push("Deadeye +10"); }
if (setup.toggles.doubletap && !isMelee) { sharedMod += 20; selectedTalents.push("Double Tap +20"); }
if (setup.toggles.grip) { sharedMod += 5; selectedTalents.push("Custom Grip +5"); }
if (setup.toggles.stock && !isMelee && setup.aimMod > 0) {
  const bonus = setup.aimMod === 20 ? 4 : 2;
  sharedMod += bonus;
  selectedTalents.push(`Modified Stock +${bonus}`);
}
if (setup.toggles.motion && !isMelee && ["semi", "full", "suppressSemi", "suppressFull"].includes(setup.modeKey)) { sharedMod += 10; selectedTalents.push("Motion Predictor +10"); }
if ((setup.toggles.reddot || setup.toggles.omni) && !isMelee && ["single", "called"].includes(setup.modeKey)) { sharedMod += 10; selectedTalents.push("Red-Dot +10"); }
if (setup.toggles.berserk && isMelee && setup.modeKey === "charge") { sharedMod += 10; selectedTalents.push("Berserk Charge +10"); }

const targets = setup.targetConfigs.map(conf => {
  let targetMod = conf.rangeMod + conf.sizeMod;

  if (setup.toggles.marksman && !isMelee && conf.rangeMod < 0) targetMod += Math.abs(conf.rangeMod);
  if ((setup.toggles.scope || setup.toggles.omni) && !isMelee && setup.aimMod === 20 && conf.rangeMod < 0) targetMod += Math.abs(conf.rangeMod);
  if (setup.toggles.targeter && !isMelee && (sharedMod + targetMod) < 0) targetMod += Math.min(10, Math.abs(sharedMod + targetMod));

  return {
    tokenUuid: conf.tokenUuid,
    targetTokenUuid: conf.tokenUuid,
    name: conf.targetName,
    distanceMeters: conf.distanceMeters,
    rangeMod: conf.rangeMod,
    rangeLabel: conf.rangeLabel,
    sizeMod: conf.sizeMod,
    sizeLabel: conf.sizeLabel,
    sizeIgnored: conf.sizeIgnored,
    targetNumber: Math.max(1, baseSkill + sharedMod + targetMod),
    allocatedHits: 0,
    defenseRoll: null,
    defenseOutcome: null,
    damageRolls: [],
    damageResolved: false
  };
});

if (setup.toggles.marksman) selectedTalents.push("Marksman");
if ((setup.toggles.scope || setup.toggles.omni) && setup.aimMod === 20) selectedTalents.push("Scope ignores range penalties");
if (setup.toggles.targeter) selectedTalents.push("Targeter reduces final penalties");
if (setup.toggles.targetsel) selectedTalents.push("Target Selection");
if (setup.toggles.whirlwind) selectedTalents.push("Whirlwind of Death");
if (setup.toggles.devastating) selectedTalents.push("Devastating Assault");
if (setup.toggles.blademaster) selectedTalents.push("Blademaster");
if (setup.toggles.fluid) selectedTalents.push("Fluid Action");

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
  modeLabel: modeData?.label ?? "Mode",
  powerModeLabel: powerMode.label,
  powerMultiplier: powerMode.multiplier,
  aimLabel: setup.aimLabel,
  modifierNotes,
  selectedTalents,
  traits,
  isMelee,
  setup,
  resolvedAttack: false,
  attackRoll: null,
  dos: 0,
  totalHits: 0,
  statusText: "Pending",
  extraText: "",
  ammoSpent: 0,
  targets
};


const bindWorkflowButtons = (chatMessage, html) => {
  if (!html) return;
  const root = html instanceof jQuery ? html : $(html);
  root.find("button[data-action]").off("click.dh2eWorkflow").on("click.dh2eWorkflow", async ev => {
      ev.preventDefault();
      const current = chatMessage.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
      if (!current) return;

      const action = ev.currentTarget.dataset.action;
      const targetUuid = ev.currentTarget.dataset.target;

      if (action === "attack") {
        if (!canActOnAttack(current)) return ui.notifications.warn("You cannot roll this attack.");

        const actorDoc = game.actors.get(current.attackerActorId);
        const weaponDoc = actorDoc?.items.get(current.weaponId);
        if (!actorDoc || !weaponDoc) return ui.notifications.error("Workflow actor/weapon no longer exists.");

        const isMeleeNow = (weaponDoc.system.class ?? "").toLowerCase() === "melee";
        const rof = weaponDoc.system.rateOfFire ?? {};

        if (isMeleeNow && current.modeKey === "swift" && !hasTalent(actorDoc, "swift attack")) {
          ui.notifications.warn("Requires talent: Swift Attack");
          return;
        }
        if (isMeleeNow && current.modeKey === "lightning" && !hasTalent(actorDoc, "lightning attack")) {
          ui.notifications.warn("Requires talent: Lightning Attack");
          return;
        }

        if (!isMeleeNow) {
          if ((current.modeKey === "semi" || current.modeKey === "suppressSemi") && (rof.burst ?? 0) <= 0) {
            ui.notifications.warn("Weapon has no semi-auto RoF.");
            return;
          }
          if ((current.modeKey === "full" || current.modeKey === "suppressFull") && (rof.full ?? 0) <= 0) {
            ui.notifications.warn("Weapon has no full-auto RoF.");
            return;
          }
        }

        const clipValue = weaponDoc.system.clip?.value;
        const isGrenade = hasTrait(current.traits, "grenade");
        const isFlameNow = !isMeleeNow && (((weaponDoc.system.type ?? "").toLowerCase() === "flame") || hasTrait(current.traits, "flame"));
        const infiniteAmmoNow = hasTrait(current.traits, "living ammunition") || hasTrait(current.traits, "infammo");

        if (!isMeleeNow && !infiniteAmmoNow && !isGrenade && clipValue != null && clipValue <= 0) {
          current.statusText = "OUT OF AMMO";
          await updateWorkflowMessage(chatMessage, current);
          return;
        }

        let result = isFlameNow ? 1 : (await animatedRoll("1d100", chatMessage.speaker)).total;

        let bestTN = Math.max(...current.targets.map(t => t.targetNumber));
        let success = result <= bestTN;
        let dos = success ? 1 + Math.floor((bestTN - result) / 10) : 0;

        if (current.setup.toggles.blademaster && isMeleeNow && !success) {
          const reroll = await animatedRoll("1d100", chatMessage.speaker);
          result = reroll.total;
          success = result <= bestTN;
          dos = success ? 1 + Math.floor((bestTN - result) / 10) : 0;
          current.extraText = `Blademaster reroll used (${result})`;
        }

        const jam = computeJam({ result, targetNumber: bestTN, weapon: weaponDoc, traits: current.traits });
        if (jam) dos = 0;

        if (current.setup.toggles.fluid && dos > 0 && ["semi", "suppressSemi"].includes(current.modeKey)) {
          dos += 1;
          current.extraText = [current.extraText, "Fluid Action +1 DoS"].filter(Boolean).join(" | ");
        }

        let totalHits = success && !jam ? 1 : 0;

        if (!isMeleeNow) {
          if (success && !jam && (current.modeKey === "semi" || current.modeKey === "suppressSemi")) totalHits = Math.min(1 + Math.floor((dos - 1) / 2), rof.burst ?? 1);
          if (success && !jam && (current.modeKey === "full" || current.modeKey === "suppressFull")) totalHits = Math.min(dos, rof.full ?? 1);
          if (success && !jam && ["single", "called"].includes(current.modeKey)) totalHits = 1;
        } else {
          if (current.setup.isHorde && !["swift", "lightning"].includes(current.modeKey)) {
            totalHits = dos > 0 ? 1 + Math.floor((dos - 1) / 2) : 0;
          } else if (["swift", "lightning"].includes(current.modeKey)) {
            totalHits = Math.min(dos, wsBonus);
          } else {
            totalHits = dos > 0 ? 1 : 0;
          }
        }

        if (hasTrait(current.traits, "storm")) totalHits *= 2;
        if (hasTrait(current.traits, "twin") && dos >= 2) totalHits += 1;
        if (current.setup.toggles.whirlwind && isMeleeNow && current.setup.isHorde && dos > 0) {
          const extra = Math.floor(wsBonus / 2);
          totalHits += extra;
          current.extraText = [current.extraText, `Whirlwind +${extra} hits`].filter(Boolean).join(" | ");
        }
        if (current.setup.toggles.devastating && current.modeKey === "allout" && totalHits > 0) {
          current.extraText = [current.extraText, "Devastating Assault: roll second attack"].filter(Boolean).join(" | ");
        }

        let ammoSpent = 0;
        if (!isMeleeNow && !infiniteAmmoNow && !isGrenade && clipValue != null && !jam) {
          let shotsRequired = 1;
          if (current.modeKey === "semi" || current.modeKey === "suppressSemi") shotsRequired = rof.burst ?? 1;
          else if (current.modeKey === "full" || current.modeKey === "suppressFull") shotsRequired = rof.full ?? 1;
          if (hasTrait(current.traits, "storm")) shotsRequired *= 2;
          shotsRequired *= current.powerMultiplier;

          const used = Math.min(shotsRequired, weaponDoc.system.clip.value);
          ammoSpent = used;
          totalHits = Math.min(totalHits, used);
          await weaponDoc.update({ "system.clip.value": Math.max(0, weaponDoc.system.clip.value - used) });
        }

        const eligible = current.targets.filter(t => result <= t.targetNumber);
        const allocation = allocateHits({ totalHits, modeKey: current.modeKey, eligibleTargets: eligible, rof });

        current.targets = current.targets.map(t => ({ ...t, allocatedHits: allocation.get(t.tokenUuid) || 0 }));
        current.attackRoll = result;
        current.dos = dos;
        current.totalHits = Array.from(allocation.values()).reduce((a, b) => a + b, 0);
        current.statusText = jam ? "JAM" : "OK";
        current.ammoSpent = ammoSpent;

        const suppressNote = [
          current.modeKey === "suppressSemi" ? "ROLL FOR PINNING (-10)" : "",
          current.modeKey === "suppressFull" ? "ROLL FOR PINNING (-20)" : ""
        ].filter(Boolean).join(" | ");

        current.extraText = [current.extraText, suppressNote].filter(Boolean).join(" | ");
        current.resolvedAttack = true;

        await updateWorkflowMessage(chatMessage, current);
      }

      if (action === "defense") {
        const t = current.targets.find(x => x.tokenUuid === targetUuid);
        if (!t) return;
        if (!canActOnDefense(current, t)) return ui.notifications.warn("You cannot defend this target.");

        const targetDoc = await fromUuid(t.tokenUuid);
        const agility = targetDoc?.actor?.system?.characteristics?.agility?.total ?? 0;
        const roll = await animatedRoll("1d100", chatMessage.speaker);
        const ok = roll.total <= agility;

        t.defenseRoll = roll.total;
        t.defenseOutcome = ok ? "Success (-1 hit)" : "Failed";
        if (ok && t.allocatedHits > 0) t.allocatedHits -= 1;

        await updateWorkflowMessage(chatMessage, current);
      }

      if (action === "damage") {
        const t = current.targets.find(x => x.tokenUuid === targetUuid);
        if (!t) return;
        if (!canActOnDamage(current, t)) return ui.notifications.warn("You cannot roll damage for this target.");

        const rolls = [];
        for (let i = 0; i < t.allocatedHits; i += 1) {
          const r = await animatedRoll(current.weaponDamage, chatMessage.speaker);
          rolls.push({ total: r.total, loc: getHitLocation(current.attackRoll || r.total) });
        }

        t.damageRolls = rolls;
        t.damageResolved = true;
        await updateWorkflowMessage(chatMessage, current);
      }
    });
};

const message = await ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor: attacker, token: attackerToken.document }),
  content: buildWorkflowHtml(state),
  flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: state } }
});

if (!globalThis.__dh2eExternalWorkflowHookRegistered) {
  Hooks.on("renderChatMessageHTML", (chatMessage, html) => {
    const wf = chatMessage.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
    if (!wf) return;
    bindWorkflowButtons(chatMessage, html);
  });

  Hooks.on("renderChatMessage", (chatMessage, html) => {
    const wf = chatMessage.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
    if (!wf) return;
    bindWorkflowButtons(chatMessage, html);
  });

  globalThis.__dh2eExternalWorkflowHookRegistered = true;
}

ui.notifications.info("External workflow created. Resolve Attack / Defense / Damage from chat.");
