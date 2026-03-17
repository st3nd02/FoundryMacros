export async function runDefenseWorkflow() {
try {
/**
 * DH2e External Defense Workflow (Foundry V13)
 * Version: 1.4
 * Run this as the defender owner to resolve pending defenses on existing attack workflows.
 */



const WORKFLOW_NS = "warhammer-40k-cogitator";
const WORKFLOW_KEY = "dh2eExternalWorkflow";

const parseWeaponTraits = weapon => (weapon?.system?.special ?? "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
const hasTrait = (traits, key) => traits.some(t => t.includes(key));

const rollWithDiceSoNice = async formula => {
  const roll = await new Roll(formula).evaluate();
  if (game.dice3d?.showForRoll) {
    await game.dice3d.showForRoll(roll, game.user, true);
  }
  return roll;
};

const requestedDefense = game.warhammer40kCogitator?.consumePendingDefenseContext?.() ?? null;

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

const getActorFateValue = actorDoc => {
  const fate = actorDoc?.system?.fate;
  if (typeof fate === "number") return fate;
  return Number(fate?.value ?? 0);
};

const spendActorFate = async actorDoc => {
  const current = getActorFateValue(actorDoc);
  const next = Math.max(0, current - 1);
  if (typeof actorDoc?.system?.fate === "number") {
    await actorDoc.update({ "system.fate": next });
  } else {
    await actorDoc.update({ "system.fate.value": next });
  }
};

const resolveTokenFromRequest = async () => {
  if (!requestedDefense?.targetTokenUuid) return null;
  const tokenDoc = await fromUuid(requestedDefense.targetTokenUuid);
  const tokenObject = tokenDoc?.object;
  if (!tokenObject) return null;
  tokenObject.control({ releaseOthers: true });
  if (tokenDoc.id) {
    updateUserTokenTargets([tokenDoc.id]);
  }
  return tokenObject;
};

const requestedToken = await resolveTokenFromRequest();
const token = requestedToken ?? canvas.tokens.controlled[0];
if (!token) return ui.notifications.warn("Select your defender token first.");
const actor = token.actor;
if (!actor) return ui.notifications.warn("Selected token has no actor.");

const reactionAlreadyUsed = !!game.warhammer40kCogitator?.hasDefenseReaction?.(actor);


const difficulties = [
  { value: 60, label: "Trivial (+60)" },
  { value: 50, label: "Elementary (+50)" },
  { value: 40, label: "Simple (+40)" },
  { value: 30, label: "Easy (+30)" },
  { value: 20, label: "Routine (+20)" },
  { value: 10, label: "Ordinary (+10)" },
  { value: 0, label: "Challenging (+0)" },
  { value: -10, label: "Difficult (-10)" },
  { value: -20, label: "Hard (-20)" },
  { value: -30, label: "Very Hard (-30)" },
  { value: -40, label: "Arduous (-40)" },
  { value: -50, label: "Punishing (-50)" },
  { value: -60, label: "Hellish (-60)" }
];

const pending = [];
for (const msg of game.messages.contents) {
  const state = msg.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
  if (!state?.targets?.length) continue;
  for (const t of state.targets) {
    if ((t.tokenUuid ?? t.targetTokenUuid) !== token.document.uuid) continue;
    if ((t.allocatedHits ?? 0) <= 0) continue;
    if (t.damageResolved) continue;
    const out = String(t.defenseOutcome ?? "").toLowerCase();
    if (out.includes("success") || out.includes("failed") || out.includes("skipped")) continue;
    pending.push({ msg, state, target: t });
  }
}

if (!pending.length) return ui.notifications.warn("No pending defense found for this token.");

const dodgeBase = actor.system.skills?.dodge?.total ?? 0;
const parryBase = actor.system.skills?.parry?.total ?? 0;
const meleeWeapons = actor.items.filter(i => i.type === "weapon" && ["me", "melee"].includes((i.system.class ?? "").toLowerCase()));
const difficultyOptions = difficulties.map(d => `<option value="${d.value}" ${d.value === 0 ? "selected" : ""}>${d.label}</option>`).join("");
const weaponOptions = meleeWeapons.length
  ? meleeWeapons.map(w => `<option value="${w.id}">${w.name}</option>`).join("")
  : `<option value="">No melee weapons</option>`;
const workflowOptions = pending
  .map((p, i) => {
    const selected = requestedDefense?.chatMessageId === p.msg.id ? "selected" : "";
    return `<option value="${i}" ${selected}>${p.state.attackerName} vs ${p.target.name} (${p.target.allocatedHits} hit${p.target.allocatedHits === 1 ? "" : "s"})</option>`;
  })
  .join("");

const pick = await new Promise(resolve => {
  new Dialog({
    title: "External Defense Workflow",
    content: `<style>
      .def-wrap { min-height: 260px; }
      .twoCol { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .def-wrap label { display:flex; align-items:center; gap:6px; cursor:pointer; }
      .def-wrap label input[type="radio"], .def-wrap label input[type="checkbox"] { width:auto; margin:0; }
      .weaponBlock { margin-top:8px; opacity:.35; }
      .weaponBlock.enabled { opacity:1; }
      .def-wrap select, .def-wrap input { width:100%; }
    </style>
    <form class="def-wrap">
      ${reactionAlreadyUsed ? `<div style="margin-bottom:8px;padding:6px;border:1px solid #aa4444;border-radius:4px;color:#ffb3b3;"><b>No defense reactions remaining this turn.</b> You can submit this as failed so damage proceeds normally.</div>` : ""}
      <div class="form-group"><label><b>Pending Attack</b></label><select id="workflowPick">${workflowOptions}</select></div>
      <hr>
      <h3>Defence Type</h3>
      <div class="twoCol">
        <label><input type="radio" name="defence" value="dodge" checked> Dodge (${dodgeBase})</label>
        <label><input type="radio" name="defence" value="parry"> Parry (${parryBase})</label>
      </div>
      <hr>
      <div id="weaponBlock" class="weaponBlock">
        <label><b>Parry Weapon</b></label>
        <select id="weapon" disabled><option value="">Choose Melee Weapon</option>${weaponOptions}</select>
      </div>
      <hr>
      <label><b>Difficulty</b></label>
      <select id="difficulty">${difficultyOptions}</select>
      <hr>
      <label><b>Modifier</b></label>
      <input id="mod" type="number" value="0"/>
      <hr>
      <div style="opacity:.7;">Fate Remaining: <b>${getActorFateValue(actor)}</b></div>
    </form>`,
    render: html => {
      html.find('input[name="defence"]').on("change", function () {
        const parry = this.value === "parry" && this.checked;
        html.find("#weaponBlock").toggleClass("enabled", parry);
        html.find("#weapon").prop("disabled", !parry);
      });
    },
    buttons: {
      roll: {
        label: "Roll",
        callback: html => resolve({
          idx: Number(html.find("#workflowPick").val() || 0),
          type: html.find('input[name="defence"]:checked').val(),
          weaponId: html.find("#weapon").val(),
          difficultyMod: Number(html.find("#difficulty").val() || 0),
          difficultyLabel: html.find("#difficulty option:selected").text(),
          manualMod: Number(html.find("#mod").val() || 0)
        })
      },
      skip: {
        label: "Skip",
        callback: html => resolve({
          idx: Number(html.find("#workflowPick").val() || 0),
          type: "skip"
        })
      },
      cancel: { label: "Cancel", callback: () => resolve(null) }
    },
    default: "roll"
  }).render(true, { width: 600 });
});

if (!pick) return;
const entry = pending[pick.idx];
if (!entry) return ui.notifications.warn("Selected workflow no longer available.");

let base = pick.type === "parry" ? parryBase : dodgeBase;
const notes = [];
let actionText = pick.type === "parry" ? "Parry" : "Dodge";

if (pick.type === "skip") {
  const targetState = entry.state.targets.find(t => (t.tokenUuid ?? t.targetTokenUuid) === token.document.uuid);
  if (!targetState) return ui.notifications.warn("Token no longer in workflow.");

  try {
    await game.warhammer40kCogitator.submitDefenseResult({
      chatMessageId: entry.msg.id,
      targetTokenUuid: token.document.uuid,
      defenseRoll: null,
      defenseOutcome: "Skipped (failed defense)",
      allocatedHits: targetState.allocatedHits ?? 0,
      defenseDetails: {
        actionText: "Skipped",
        incomingHits: targetState.allocatedHits ?? 0,
        difficultyLabel: "—",
        targetNumber: null,
        notes: [],
        degrees: 0,
        success: false
      }
    });
  } catch (err) {
    ui.notifications.error(`Defense result could not be applied: ${err.message ?? err}`);
    return;
  }

  ui.notifications.info("Defense skipped and workflow updated.");
  return;
}

if (pick.type === "parry") {
  if (!pick.weaponId) return ui.notifications.warn("Select a melee weapon.");
  const w = actor.items.get(pick.weaponId);
  if (!w) return ui.notifications.warn("Invalid parry weapon.");
  actionText = `Parry with <b>${w.name}</b>`;
  const traits = parseWeaponTraits(w);
  if (hasTrait(traits, "balanced")) {
    base += 10;
    notes.push("Balanced +10");
  }
  if (hasTrait(traits, "defensive")) {
    base += 15;
    notes.push("Defensive +15");
  }
  if (hasTrait(traits, "unbalanced")) {
    base -= 10;
    notes.push("Unbalanced -10");
  }
  if (hasTrait(traits, "unwieldy")) {
    return ui.notifications.warn("Unwieldy weapons cannot be used to parry.");
  }

  const attackTraits = String(entry.state.weaponSpecial ?? "").toLowerCase().split(",").map(t => t.trim());
  if (attackTraits.some(t => t.includes("flexible"))) {
    return ui.notifications.warn("Attacker weapon is Flexible; parry is not possible.");
  }
}

let target = Math.max(1, base + pick.difficultyMod + pick.manualMod);
let roll = await rollWithDiceSoNice("1d100");

const postResult = ({ usedFate }) => {
  const val = roll.total;
  const success = val === 1 ? true : (val === 100 ? false : val <= target);
  const degrees = Math.floor(Math.abs(target - val) / 10) + 1;

  if (usedFate) notes.unshift("Spent Fate reroll");

  return { success, degrees, value: val };
};

let defenseResult = postResult({ usedFate: false });
let dos = defenseResult.success ? defenseResult.degrees : 0;
if (dos <= 0 && getActorFateValue(actor) > 0) {
  const useFate = await new Promise(resolve => {
    new Dialog({
      title: "Spend Fate?",
      content: `<p><b>Test Failed!</b><br>Spend 1 Fate Point to reroll?<br>Remaining: <b>${getActorFateValue(actor)}</b></p>`,
      buttons: {
        yes: { label: "Reroll (-1 Fate)", callback: () => resolve(true) },
        no: { label: "Keep Result", callback: () => resolve(false) }
      },
      default: "no"
    }).render(true);
  });

  if (useFate) {
    await spendActorFate(actor);
    roll = await rollWithDiceSoNice("1d100");
    defenseResult = postResult({ usedFate: true });
    dos = defenseResult.success ? defenseResult.degrees : 0;
  }
}

const current = entry.msg.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
if (!current) return ui.notifications.warn("Workflow no longer exists.");
const targetState = current.targets.find(t => (t.tokenUuid ?? t.targetTokenUuid) === token.document.uuid);
if (!targetState) return ui.notifications.warn("Token no longer in workflow.");

if (reactionAlreadyUsed && pick.type !== "skip") {
  try {
    await game.warhammer40kCogitator.submitDefenseResult({
      chatMessageId: entry.msg.id,
      targetTokenUuid: token.document.uuid,
      defenseRoll: null,
      defenseOutcome: "Failed (Reaction already used)",
      allocatedHits: targetState.allocatedHits ?? 0,
      defenseDetails: {
        actionText: "Reaction unavailable",
        incomingHits: targetState.allocatedHits ?? 0,
        difficultyLabel: "—",
        targetNumber: null,
        notes: ["No defense reactions remaining this turn"],
        degrees: 0,
        success: false
      }
    });
  } catch (err) {
    ui.notifications.error(`Defense result could not be applied: ${err.message ?? err}`);
    return;
  }

  ui.notifications.info("Defense marked as failed (reaction already used) and workflow updated.");
  return;
}

const defenseRoll = roll.total;
let allocatedHits = targetState.allocatedHits ?? 0;
let defenseOutcome = "Failed";

if (dos > 0) {
  allocatedHits = Math.max(0, allocatedHits - dos);
  defenseOutcome = `Success (-${dos} hit${dos === 1 ? "" : "s"})`;
}

if (game.warhammer40kCogitator?.submitDefenseResult) {
  try {
    await game.warhammer40kCogitator.submitDefenseResult({
      chatMessageId: entry.msg.id,
      targetTokenUuid: token.document.uuid,
      defenseRoll,
      defenseOutcome,
      allocatedHits,
      defenseDetails: {
        actionText,
        incomingHits: targetState.allocatedHits ?? 0,
        difficultyLabel: pick.difficultyLabel,
        targetNumber: target,
        notes,
        degrees: defenseResult.degrees,
        success: defenseResult.success
      }
    });
  } catch (err) {
    ui.notifications.error(`Defense result could not be applied: ${err.message ?? err}`);
    return;
  }
} else {
  try {
    targetState.defenseRoll = defenseRoll;
    targetState.defenseOutcome = defenseOutcome;
    targetState.allocatedHits = allocatedHits;

    await entry.msg.update({
      content: entry.msg.content,
      flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: current } }
    });
  } catch (err) {
    ui.notifications.error(`Direct workflow update failed: ${err.message ?? err}`);
    return;
  }
}

if (pick.type === "parry" && defenseResult.success) {
  const defenderWeapon = actor.items.get(pick.weaponId);
  const defTraits = parseWeaponTraits(defenderWeapon);
  const atkTraits = String(entry.state.weaponSpecial ?? "").toLowerCase().split(",").map(t => t.trim());
  const defenderHasPowerField = defTraits.some(t => t.includes("power field"));
  const attackerImmune = atkTraits.some(t => t.includes("warp weapon") || t.includes("force") || t.includes("natural weapon"));
  const attackerHasPowerField = atkTraits.some(t => t.includes("power field"));
  if (defenderHasPowerField && !attackerHasPowerField && !attackerImmune) {
    const breakRoll = await rollWithDiceSoNice("1d100");
    const broken = breakRoll.total >= 26;
    const extraNote = `Power Field check: ${breakRoll.total} ${broken ? "→ attacker weapon breaks" : "→ no break"}`;
    try {
      await game.warhammer40kCogitator.submitDefenseResult({
        chatMessageId: entry.msg.id,
        targetTokenUuid: token.document.uuid,
        defenseRoll,
        defenseOutcome,
        allocatedHits,
        defenseDetails: {
          actionText,
          incomingHits: targetState.allocatedHits ?? 0,
          difficultyLabel: pick.difficultyLabel,
          targetNumber: target,
          notes: [...notes, extraNote],
          degrees: defenseResult.degrees,
          success: defenseResult.success
        }
      });
    } catch (_) {}
  }
}

if (game.warhammer40kCogitator?.consumeDefenseReaction) {
  await game.warhammer40kCogitator.consumeDefenseReaction(actor);
}

ui.notifications.info("Defense resolved and workflow updated.");

} catch (err) {
  console.error("DH2E external defense workflow failed", err);
  ui.notifications.error(`DH2E defense workflow failed: ${err.message ?? "Check console for details."}`);
}
}
