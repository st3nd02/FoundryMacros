/**
 * DH2e External Defense Workflow (Foundry V13)
 * Version: 1.3
 * Run this as the defender owner to resolve pending defenses on existing attack workflows.
 */

(async () => {

const WORKFLOW_NS = "warhammer-40k-cogitator";
const WORKFLOW_KEY = "dh2eExternalWorkflow";

const rollWithDiceSoNice = async formula => {
  const roll = await new Roll(formula).evaluate();
  if (game.dice3d?.showForRoll) {
    await game.dice3d.showForRoll(roll, game.user, true);
  }
  return roll;
};

const requestedDefense = game.warhammer40kCogitator?.consumePendingDefenseContext?.() ?? null;

const resolveTokenFromRequest = async () => {
  if (!requestedDefense?.targetTokenUuid) return null;
  const tokenDoc = await fromUuid(requestedDefense.targetTokenUuid);
  const tokenObject = tokenDoc?.object;
  if (!tokenObject) return null;
  tokenObject.control({ releaseOthers: true });
  if (tokenDoc.id) {
    game.user.updateTokenTargets([tokenDoc.id]);
  }
  return tokenObject;
};

const token = canvas.tokens.controlled[0] ?? await resolveTokenFromRequest();
if (!token) return ui.notifications.warn("Select your defender token first.");
const actor = token.actor;
if (!actor) return ui.notifications.warn("Selected token has no actor.");

if (game.warhammer40kCogitator?.hasDefenseReaction?.(actor)) {
  return ui.notifications.warn("No defense reactions remaining this turn for this actor.");
}


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
    if (t.tokenUuid !== token.document.uuid) continue;
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
      <div style="opacity:.7;">Fate Remaining: <b>${actor.system.fate?.value ?? 0}</b></div>
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
  const targetState = entry.state.targets.find(t => t.tokenUuid === token.document.uuid);
  if (!targetState) return ui.notifications.warn("Token no longer in workflow.");

  try {
    await game.warhammer40kCogitator.submitDefenseResult({
      chatMessageId: entry.msg.id,
      targetTokenUuid: token.document.uuid,
      defenseRoll: null,
      defenseOutcome: "Skipped (failed defense)",
      allocatedHits: targetState.allocatedHits ?? 0
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
  const special = String(w.system.special ?? "").toLowerCase();
  if (special.includes("balanced")) {
    base += 10;
    notes.push("Balanced +10");
  }
}

let target = Math.max(1, base + pick.difficultyMod + pick.manualMod);
let roll = await rollWithDiceSoNice("1d100");

const postResult = async ({ usedFate }) => {
  const val = roll.total;
  const success = val === 1 ? true : (val === 100 ? false : val <= target);
  const degrees = Math.floor(Math.abs(target - val) / 10) + 1;
  const color = success ? "#1aff1a" : "#ff2a2a";

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div style="border:1px solid #555;border-radius:6px;padding:8px;">
      ${usedFate ? `<div style="font-style:italic;"><b>${actor.name}</b> spends <b>Fate</b> and rerolls.</div><hr>` : ""}
      <div style="font-style:italic;"><b>${actor.name}</b> attempts <b>${actionText}</b> against <b>${entry.state.attackerName}</b> with <b>${entry.state.weaponName}</b>.</div>
      <div><b>Incoming Hits:</b> ${entry.target.allocatedHits}</div>
      <div><b>Difficulty:</b> ${pick.difficultyLabel}</div>
      <div><b>Target:</b> ${target} | <b>Roll:</b> ${val}</div>
      ${notes.length ? `<div><b>Notes:</b> ${notes.join(" | ")}</div>` : ""}
      <div><b>Result:</b> <span style="color:${color};font-weight:700;">${success ? `${degrees} Degrees of Success` : `${degrees} Degrees of Failure`}</span></div>
    </div>`
  });

  return success ? degrees : 0;
};

let dos = await postResult({ usedFate: false });

if (dos <= 0 && (actor.system.fate?.value ?? 0) > 0) {
  const useFate = await new Promise(resolve => {
    new Dialog({
      title: "Spend Fate?",
      content: `<p><b>Test Failed!</b><br>Spend 1 Fate Point to reroll?<br>Remaining: <b>${actor.system.fate?.value ?? 0}</b></p>`,
      buttons: {
        yes: { label: "Reroll (-1 Fate)", callback: () => resolve(true) },
        no: { label: "Keep Result", callback: () => resolve(false) }
      },
      default: "no"
    }).render(true);
  });

  if (useFate) {
    await actor.update({ "system.fate.value": Math.max(0, (actor.system.fate?.value ?? 0) - 1) });
    roll = await rollWithDiceSoNice("1d100");
    dos = await postResult({ usedFate: true });
  }
}

const current = entry.msg.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
if (!current) return ui.notifications.warn("Workflow no longer exists.");
const targetState = current.targets.find(t => t.tokenUuid === token.document.uuid);
if (!targetState) return ui.notifications.warn("Token no longer in workflow.");

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
      allocatedHits
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

if (game.warhammer40kCogitator?.consumeDefenseReaction) {
  await game.warhammer40kCogitator.consumeDefenseReaction(actor);
}

ui.notifications.info("Defense resolved and workflow updated.");

})().catch(err => {
  console.error("DH2E external defense workflow failed", err);
  ui.notifications.error(`DH2E defense workflow failed: ${err.message ?? "Check console for details."}`);
});
