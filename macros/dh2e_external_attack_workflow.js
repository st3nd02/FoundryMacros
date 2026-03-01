/**
 * Dark Heresy 2e External Attack Workflow (Foundry V13)
 * Goal: keep original macro behavior while using a persistent, chat-visible workflow.
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

const parseWeaponTraits = weapon =>
  (weapon.system.special ?? "")
    .split(",")
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);

const hasTrait = (traits, key) => traits.some(t => t.includes(key));

const getNormalRangeForWeapon = weapon => {
  if ((weapon.system.class ?? "").toLowerCase() === "melee") return 1;
  const isGrenade = hasTrait(parseWeaponTraits(weapon), "grenade");
  if (isGrenade) {
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
    craft,
    rangedPoor: craft === "poor",
    rangedGood: craft === "good",
    rangedBest: craft === "best"
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
  if (totalHits <= 0 || !eligibleTargets.length) return byTarget;

  const isFull = modeKey === "full" || modeKey === "suppressFull";
  let remaining = totalHits;
  if (isFull) remaining = Math.min(remaining, rof.full ?? remaining);

  let idx = 0;
  while (remaining > 0) {
    const t = eligibleTargets[idx % eligibleTargets.length];
    byTarget.set(t.tokenUuid, (byTarget.get(t.tokenUuid) ?? 0) + 1);
    idx += 1;
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
  const rows = state.targets
    .map(t => {
      const sizeText = t.sizeIgnored ? `${t.sizeLabel} (Black Carapace ignores)` : `${t.sizeLabel} ${t.sizeMod >= 0 ? "+" : ""}${t.sizeMod}`;
      const damageText = (t.damageRolls ?? []).map(r => `${r.total} ${r.loc}`).join(", ") || "—";
      return `<tr data-target-uuid="${t.tokenUuid}">
        <td>${t.name}</td>
        <td>${t.distanceMeters}m</td>
        <td>${t.rangeLabel}</td>
        <td>${sizeText}</td>
        <td>${t.targetNumber}</td>
        <td>${t.allocatedHits}</td>
        <td>${t.defenseRoll ?? "—"}</td>
        <td>${t.defenseOutcome ?? "—"}</td>
        <td>${damageText}</td>
        <td>
          <button data-action="defense" data-target="${t.tokenUuid}" ${canActOnDefense(state, t) ? "" : "disabled"}>Defense</button>
          <button data-action="damage" data-target="${t.tokenUuid}" ${canActOnDamage(state, t) ? "" : "disabled"}>Damage</button>
        </td>
      </tr>`;
    })
    .join("");

  return `<div class="dh2e-workflow" data-workflow-id="${state.id}">
    <h3>${state.attackerName} attacks with ${state.weaponName}</h3>
    <div><b>Mode:</b> ${state.modeLabel} | <b>Power:</b> ${state.powerModeLabel} | <b>Aim:</b> ${state.aimLabel}</div>
    <div><b>Shared Modifiers:</b> ${state.modifierNotes.join(", ") || "None"}</div>
    <div><b>Talents/Items:</b> ${state.selectedTalents.join(", ") || "None"}</div>
    <div><b>Attack Roll:</b> ${state.attackRoll ?? "—"} | <b>DoS:</b> ${state.dos ?? "—"} | <b>Status:</b> ${state.statusText ?? "Pending"} | <b>Total Hits:</b> ${state.totalHits ?? 0}</div>
    ${state.extraText ? `<div>${state.extraText}</div>` : ""}
    <table style="width:100%; font-size:0.9em;">
      <thead><tr><th>Target</th><th>Dist</th><th>Range</th><th>Size</th><th>TN</th><th>Hits</th><th>Defense</th><th>Outcome</th><th>Damage</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
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
  const modeOptions = Object.entries(rangedModes).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");

  const buildTargetRows = weaponDoc => {
    const isMelee = (weaponDoc?.system.class ?? "").toLowerCase() === "melee";
    const normalRange = getNormalRangeForWeapon(weaponDoc);
    return targetTokens
      .map(t => {
        const distanceMeters = Math.round(canvas.grid.measureDistance(attackerToken.center, t.center));
        const autoRangeMod = getAutoRangeBand(distanceMeters, normalRange, isMelee);
        const sizeData = getSizeModifier(t.actor);
        const sizeText = sizeData.ignored ? `${sizeData.label} (Black Carapace ignores)` : `${sizeData.label} ${sizeData.mod >= 0 ? "+" : ""}${sizeData.mod}`;
        return `<tr class="target-row" data-uuid="${t.document.uuid}" data-name="${t.name}" data-distance="${distanceMeters}" data-size-mod="${sizeData.mod}" data-size-label="${sizeData.label}" data-size-ignored="${sizeData.ignored ? 1 : 0}">
          <td>${t.name}</td><td>${distanceMeters}m</td><td>${rangeSelectHtml(autoRangeMod)}</td><td>${sizeText}</td>
        </tr>`;
      })
      .join("");
  };

  return new Promise(resolve => {
    new Dialog({
      title: "External Attack Workflow",
      content: `<form>
        <div class="form-group"><label><b>Weapon</b></label><select id="weaponId">${weaponOptions}</select></div>
        <div class="form-group"><label><b>Attack Type</b></label><select id="modeKey">${modeOptions}</select></div>
        <div class="form-group"><label><b>Modifier</b></label><input id="manualMod" type="number" value="0"/></div>
        <div class="form-group"><label><b>Aim</b></label><select id="aimMod"><option value="0">No Aim</option><option value="10">Half Aim (+10)</option><option value="20">Full Aim (+20)</option></select></div>
        <div class="form-group"><label><input type="checkbox" id="horde"/> Horde?</label></div>
        <div class="form-group"><label><b>Horde Bonus</b></label><input id="hordeBonus" type="number" value="0"/></div>
        <div class="form-group"><label><input type="checkbox" id="shootMelee"/> Shooting into Melee?</label></div>
        <div class="form-group"><label><input type="checkbox" id="twoWeaponAttack"/> Two-Weapon Attack?</label></div>
        <div class="form-group"><label><b>Power Mode</b></label><select id="powerMode"><option value="1">Normal</option><option value="2">Overcharge (×2)</option><option value="4">Overload (×4)</option><option value="3">Maximal (×3)</option></select></div>
        <hr><h3>Targets (UUID tracked, name displayed)</h3>
        <table style="width:100%; font-size:0.9em;"><thead><tr><th>Target</th><th>Distance</th><th>Range</th><th>Size</th></tr></thead><tbody id="targetsBody"></tbody></table>
        <hr><h3>Talents / Items</h3>
        <label><input type="checkbox" id="talent_deadeye"/> Deadeye</label>
        <label><input type="checkbox" id="talent_marksman"/> Marksman</label>
        <label><input type="checkbox" id="talent_doubletap"/> Double Tap</label>
        <label><input type="checkbox" id="talent_targetsel"/> Target Selection</label>
        <label><input type="checkbox" id="item_grip"/> Custom Grip</label>
        <label><input type="checkbox" id="item_stock"/> Modified Stock</label>
        <label><input type="checkbox" id="item_motion"/> Motion Predictor</label>
        <label><input type="checkbox" id="item_reddot"/> Red Dot</label>
        <label><input type="checkbox" id="item_targeter"/> Targeter</label>
        <label><input type="checkbox" id="item_scope"/> Scope</label>
      </form>`,
      render: html => {
        const refresh = () => html.find("#targetsBody").html(buildTargetRows(attacker.items.get(html.find("#weaponId").val())));
        html.find("#weaponId").on("change", refresh);
        html.find("#talent_deadeye").prop("checked", hasTalent(attacker, "deadeye"));
        html.find("#talent_marksman").prop("checked", hasTalent(attacker, "marksman"));
        html.find("#talent_doubletap").prop("checked", hasTalent(attacker, "double tap"));
        html.find("#talent_targetsel").prop("checked", hasTalent(attacker, "target selection"));
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
                grip: html.find("#item_grip")[0].checked,
                stock: html.find("#item_stock")[0].checked,
                motion: html.find("#item_motion")[0].checked,
                reddot: html.find("#item_reddot")[0].checked,
                targeter: html.find("#item_targeter")[0].checked,
                scope: html.find("#item_scope")[0].checked
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
const isFlame = !isMelee && (((weapon.system.type ?? "").toLowerCase() === "flame") || hasTrait(traits, "flame"));
const infiniteAmmo = hasTrait(traits, "living ammunition") || hasTrait(traits, "infammo");

const modeData = rangedModes[setup.modeKey] ?? rangedModes.single;
const bs = attacker.system.characteristics.ballisticSkill?.total ?? 0;

let sharedMod = setup.manualMod + modeData.mod + setup.aimMod;
const modifierNotes = [modeData.label];
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
  sharedMod -= 20;
  modifierNotes.push("Two-Weapon Attack -20");
}
if (setup.toggles.deadeye && setup.modeKey === "called") { sharedMod += 10; selectedTalents.push("Deadeye +10"); }
if (setup.toggles.doubletap && ["single", "called"].includes(setup.modeKey)) { sharedMod += 20; selectedTalents.push("Double Tap +20"); }
if (setup.toggles.grip) { sharedMod += 5; selectedTalents.push("Custom Grip +5"); }
if (setup.toggles.stock && setup.aimMod > 0) { const b = setup.aimMod === 20 ? 4 : 2; sharedMod += b; selectedTalents.push(`Modified Stock +${b}`); }
if (setup.toggles.motion && ["semi", "full", "suppressSemi", "suppressFull"].includes(setup.modeKey)) { sharedMod += 10; selectedTalents.push("Motion Predictor +10"); }
if (setup.toggles.reddot && ["single", "called"].includes(setup.modeKey)) { sharedMod += 10; selectedTalents.push("Red-Dot +10"); }

const targets = setup.targetConfigs.map(conf => {
  let targetMod = conf.rangeMod + conf.sizeMod;
  if (setup.toggles.marksman && conf.rangeMod < 0) targetMod += Math.abs(conf.rangeMod);
  if (setup.toggles.scope && setup.aimMod === 20 && conf.rangeMod < 0) targetMod += Math.abs(conf.rangeMod);
  if (setup.toggles.targeter && (sharedMod + targetMod) < 0) targetMod += Math.min(10, Math.abs(sharedMod + targetMod));

  return {
    tokenUuid: conf.tokenUuid,
    name: conf.targetName,
    targetTokenUuid: conf.tokenUuid, // compatibility key from original logging shape
    distanceMeters: conf.distanceMeters,
    rangeMod: conf.rangeMod,
    rangeLabel: conf.rangeLabel,
    sizeMod: conf.sizeMod,
    sizeLabel: conf.sizeLabel,
    sizeIgnored: conf.sizeIgnored,
    targetNumber: Math.max(1, bs + sharedMod + targetMod),
    allocatedHits: 0,
    defenseRoll: null,
    defenseOutcome: null,
    damageRolls: [],
    damageResolved: false
  };
});

if (setup.toggles.marksman) selectedTalents.push("Marksman");
if (setup.toggles.scope && setup.aimMod === 20) selectedTalents.push("Scope ignores range penalty");
if (setup.toggles.targeter) selectedTalents.push("Targeter reduces penalties");

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
  modeLabel: modeData.label,
  powerModeLabel: powerMode.label,
  powerMultiplier: powerMode.multiplier,
  aimLabel: setup.aimLabel,
  modifierNotes,
  selectedTalents,
  traits,
  resolvedAttack: false,
  attackRoll: null,
  dos: 0,
  totalHits: 0,
  statusText: "Pending",
  extraText: "",
  ammoSpent: 0,
  targets
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

    html.find("button[data-action]").on("click", async ev => {
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

        const rof = weaponDoc.system.rateOfFire ?? {};
        if ((current.modeKey === "semi" || current.modeKey === "suppressSemi") && (rof.burst ?? 0) <= 0) {
          ui.notifications.warn("Weapon has no semi-auto RoF.");
          return;
        }
        if ((current.modeKey === "full" || current.modeKey === "suppressFull") && (rof.full ?? 0) <= 0) {
          ui.notifications.warn("Weapon has no full-auto RoF.");
          return;
        }

        const clipValue = weaponDoc.system.clip?.value;
        const isGrenade = hasTrait(current.traits, "grenade");
        if (!isMelee && !infiniteAmmo && !isGrenade && clipValue != null && clipValue <= 0) {
          current.statusText = "OUT OF AMMO";
          await updateWorkflowMessage(chatMessage, current);
          return;
        }

        const roll = isFlame ? { total: 1 } : await animatedRoll("1d100", chatMessage.speaker);
        const result = roll.total;

        const bestTN = Math.max(...current.targets.map(t => t.targetNumber));
        const success = result <= bestTN;
        let dos = success ? 1 + Math.floor((bestTN - result) / 10) : 0;

        const jam = computeJam({ result, targetNumber: bestTN, weapon: weaponDoc, traits: current.traits });
        if (jam) dos = 0;

        let totalHits = success && !jam ? 1 : 0;
        if (success && !jam && (current.modeKey === "semi" || current.modeKey === "suppressSemi")) totalHits = Math.min(1 + Math.floor((dos - 1) / 2), rof.burst ?? 1);
        if (success && !jam && (current.modeKey === "full" || current.modeKey === "suppressFull")) totalHits = Math.min(dos, rof.full ?? 1);

        if (hasTrait(current.traits, "storm")) totalHits *= 2;
        if (hasTrait(current.traits, "twin") && dos >= 2) totalHits += 1;

        // Ammo spend based on mode, not hits (legacy behavior)
        let ammoSpent = 0;
        if (!isMelee && !infiniteAmmo && !isGrenade && clipValue != null && !jam) {
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
        current.extraText = [
          (current.modeKey === "suppressSemi") ? "ROLL FOR PINNING (-10)" : "",
          (current.modeKey === "suppressFull") ? "ROLL FOR PINNING (-20)" : ""
        ].filter(Boolean).join(" | ");
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
  });

  globalThis.__dh2eExternalWorkflowHookRegistered = true;
}

ui.notifications.info("External workflow created (UUID-tracked targets, name-based display). Resolve in chat.");
