/**
 * DH2e External Defense Workflow (Foundry V13)
 * Run this as the defender owner to resolve pending defenses on existing attack workflows.
 */

(async () => {

const WORKFLOW_NS = "foundrymacros";
const WORKFLOW_KEY = "dh2eExternalWorkflow";

const token = canvas.tokens.controlled[0];
if (!token) return ui.notifications.warn("Select your defender token first.");
const actor = token.actor;
if (!actor) return ui.notifications.warn("Selected token has no actor.");

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
  .map((p, i) => `<option value="${i}">${p.state.attackerName} vs ${p.target.name} (${p.target.allocatedHits} hit${p.target.allocatedHits === 1 ? "" : "s"})</option>`)
  .join("");

const pick = await new Promise(resolve => {
  new Dialog({
    title: "External Defense Workflow",
    content: `<form class="def-wrap">
      <div class="form-group"><label><b>Pending Attack</b></label><select id="workflowPick">${workflowOptions}</select></div>
      <hr>
      <h3>Defence Type</h3>
      <label><input type="radio" name="defence" value="dodge" checked> Dodge (${dodgeBase})</label>
      <label><input type="radio" name="defence" value="parry"> Parry (${parryBase})</label>
      <hr>
      <div id="weaponBlock" style="opacity:.35;">
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
        html.find("#weaponBlock").css("opacity", parry ? 1 : 0.35);
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
let roll = await new Roll("1d100").roll({ async: true });

const postResult = async ({ usedFate }) => {
  const val = roll.total;
  const success = val === 1 ? true : (val === 100 ? false : val <= target);
  const degrees = Math.floor(Math.abs(target - val) / 10) + 1;
  const color = success ? "#1aff1a" : "#ff2a2a";

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<div style="text-align:center; color:#000;">
      ${usedFate ? `<b style="color:gold;font-style:italic;font-size:1.1em;">✦ ${actor.name} spends Fate and rerolls! ✦</b><hr>` : ""}
      <div style="font-style:italic;font-size:1.1em;"><b>${actor.name}</b> attempts a <b>${actionText}</b> against <b>${entry.state.attackerName}</b>'s <b>${entry.state.weaponName}</b> (<b>${entry.target.allocatedHits}</b> hits)</div>
      <hr>
      <div><u>Difficulty</u> ${pick.difficultyLabel}</div>
      <div><b>Target:</b> <span style="color:#ffad55;">${target}</span></div>
      <div><b>Roll:</b> <span style="color:#bd7548;">${val}</span></div>
      ${notes.length ? `<div style="font-style:italic">${notes.join(" | ")}</div>` : ""}
      <hr>
      <div style="font-size:1.2em;font-weight:900;color:${color};">${success ? `${degrees} Degrees of Success` : `${degrees} Degrees of Failure`}</div>
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
    roll = await new Roll("1d100").roll({ async: true });
    dos = await postResult({ usedFate: true });
  }
}

const current = entry.msg.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
if (!current) return ui.notifications.warn("Workflow no longer exists.");
const targetState = current.targets.find(t => t.tokenUuid === token.document.uuid);
if (!targetState) return ui.notifications.warn("Token no longer in workflow.");

targetState.defenseRoll = roll.total;
if (dos > 0) {
  targetState.allocatedHits = Math.max(0, (targetState.allocatedHits ?? 0) - dos);
  targetState.defenseOutcome = `Success (-${dos} hit${dos === 1 ? "" : "s"})`;
} else {
  targetState.defenseOutcome = "Failed";
}

await entry.msg.update({
  content: entry.msg.content,
  flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: current } }
});

ui.notifications.info("Defense resolved and workflow updated.");

})().catch(err => {
  console.error("DH2E external defense workflow failed", err);
  ui.notifications.error("DH2E defense workflow failed. Check console for details.");
});
