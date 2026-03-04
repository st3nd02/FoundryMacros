/**
 * DH2e External Damage Workflow (Foundry V13)
 * Version: 1.0
 * Run this as the attacker owner to resolve pending damage on existing workflows.
 */

(async () => {

const WORKFLOW_NS = "warhammer-40k-cogitator";
const WORKFLOW_KEY = "dh2eExternalWorkflow";

const token = canvas.tokens.controlled[0];
if (!token) return ui.notifications.warn("Select your character first.");

const actor = token.actor;
if (!actor) return ui.notifications.warn("Selected token has no actor.");

const pending = [];
for (const msg of game.messages.contents) {
  const state = msg.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
  if (!state?.targets?.length) continue;
  if (state.attackerActorId !== actor.id) continue;

  for (const target of state.targets) {
    if ((target.allocatedHits ?? 0) <= 0) continue;
    if (target.damageResolved) continue;
    const out = String(target.defenseOutcome ?? "").toLowerCase();
    if (out.includes("awaiting")) continue;
    pending.push({ msg, state, target });
  }
}

if (!pending.length) return ui.notifications.warn("No pending damage found in workflows for this attacker.");

const hasTalent = name => actor.items.some(i => i.type === "talent" && i.name.toLowerCase().includes(name.toLowerCase()));
const hasMighty = hasTalent("mighty shot");
const hasCrushing = hasTalent("crushing blow");

const optionHtml = pending.map((p, i) => `<option value="${i}">${p.state.attackerName} -> ${p.target.name} (${p.target.allocatedHits} hits) [${p.state.weaponName}]</option>`).join("");

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
  targetTokenUuid: entry.target.tokenUuid,
  weapon: entry.state.weaponName,
  hits: entry.target.allocatedHits,
  dos: entry.state.dos ?? 0,
  location: getHitLocation(entry.state.attackRoll ?? 50)
};

const weapon = actor.items.get(entry.state.weaponId) || actor.items.find(w => w.type === "weapon" && w.name === attackData.weapon);
if (!weapon) return ui.notifications.warn("Weapon not found on actor.");

const parseVal = (txt, name, dflt = 0) => {
  const m = String(txt ?? "").toLowerCase().match(new RegExp(name + "\\s*\\((\\d+)\\)"));
  return m ? Number(m[1]) : dflt;
};

const special = String(weapon.system.special ?? "").toLowerCase();
const dmg = String(weapon.system.damage ?? "1d10+0");
const penBase = Number(weapon.system.penetration ?? 0);
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
<h3>Weapon Traits</h3>
<div style="columns:2; column-gap:25px;">
<label><input type="checkbox" id="tearing" ${special.includes("tearing") ? "checked" : ""}> Tearing</label><br>
<label><input type="checkbox" id="proven" ${special.includes("proven") ? "checked" : ""}> Proven</label>
<input type="number" id="provenVal" value="${parseVal(special, "proven", 3)}" style="width:45px"><br>
<label><input type="checkbox" id="primitive" ${special.includes("primitive") ? "checked" : ""}> Primitive</label>
<input type="number" id="primitiveVal" value="${parseVal(special, "primitive", 8)}" style="width:45px"><br>
<label><input type="checkbox" id="accurate" ${special.includes("accurate") ? "checked" : ""}> Accurate</label>
<select id="aim"><option value="no">No Aim</option><option value="yes">Aim</option></select><br>
<label><input type="checkbox" id="gauss" ${special.includes("gauss") ? "checked" : ""}> Gauss</label><br>
<label><input type="checkbox" id="razor" ${special.includes("razor") ? "checked" : ""}> Razor Sharp</label><br>
<label><input type="checkbox" id="flame" ${special.includes("flame") ? "checked" : ""}> Flame</label><br>
<label><input type="checkbox" id="toxic" ${special.includes("toxic") ? "checked" : ""}> Toxic</label>
<input type="number" id="toxicVal" value="${parseVal(special, "toxic", 1)}" style="width:45px"><br>
<label><input type="checkbox" id="melta" ${special.includes("melta") ? "checked" : ""}> Melta</label>
<select id="meltaRange"><option>Normal</option><option>Short</option><option>Point Blank</option><option>Long</option></select><br>
<label><input type="checkbox" id="scatter" ${special.includes("scatter") ? "checked" : ""}> Scatter</label>
<select id="scatterRange"><option>Normal</option><option>Short</option><option>Point Blank</option><option>Long</option></select><br>
<label><input type="checkbox" id="felling" ${special.includes("felling") ? "checked" : ""}> Felling</label>
<input type="number" id="fellingVal" value="${parseVal(special, "felling", 0)}" style="width:45px"><br>
<label><input type="checkbox" id="devastating" ${special.includes("devastating") ? "checked" : ""}> Devastating</label>
<input type="number" id="devastatingVal" value="${parseVal(special, "devastating", 0)}" style="width:45px"><br>
<label><input type="checkbox" id="blast" ${special.includes("blast") ? "checked" : ""}> Blast</label>
<input type="number" id="blastVal" value="${parseVal(special, "blast", 0)}" style="width:45px"><br>
<label><input type="checkbox" id="concussive" ${special.includes("concussive") ? "checked" : ""}> Concussive</label>
<input type="number" id="concussiveVal" value="${parseVal(special, "concussive", 0)}" style="width:45px"><br>
<label><input type="checkbox" id="crippling" ${special.includes("crippling") ? "checked" : ""}> Crippling</label>
<input type="number" id="cripplingVal" value="${parseVal(special, "crippling", 0)}" style="width:45px"><br>
<label><input type="checkbox" id="force" ${special.includes("force") ? "checked" : ""}> Force</label>
<select id="forceChannel"><option value="no">No Channel</option><option value="yes">Channel</option></select><br>
<label><input type="checkbox" id="power" ${special.includes("power field") ? "checked" : ""}> Power</label><br>
<label><input type="checkbox" id="hallucinogenic" ${special.includes("hallucinogenic") ? "checked" : ""}> Hallucinogenic</label>
<input type="number" id="hallucinogenicVal" value="${parseVal(special, "hallucinogenic", 0)}" style="width:45px"><br>
<label><input type="checkbox" id="haywire" ${special.includes("haywire") ? "checked" : ""}> Haywire</label>
<input type="number" id="haywireVal" value="${parseVal(special, "haywire", 0)}" style="width:45px"><br>
</div>
<hr>
<h3>Damage Talents / Gear</h3>
<div style="columns:2; column-gap:25px;">
<label><input type="checkbox" id="talent_mighty" ${hasMighty ? "checked" : ""}> Mighty Shot</label><br>
<label><input type="checkbox" id="talent_crushing" ${hasCrushing ? "checked" : ""}> Crushing Blow</label><br>
<label><input type="checkbox" id="talent_hammer"> Hammer Blow</label><br>
<label><input type="checkbox" id="talent_flesh" ${hasTalent("flesh render") ? "checked" : ""}> Flesh Render</label><br>
<label><input type="checkbox" id="talent_raptor"> Raptor</label><br>
</div>
</form>
`,
  buttons: {
    roll: {
      label: "Roll Damage",
      callback: async html => {
        const wClass = String(weapon.system.class || "").toLowerCase();
        const isMelee = wClass === "melee";
        const isRanged = ["basic", "pistol", "heavy", "thrown"].includes(wClass);

        const diceCount = Number(html.find("#diceCount").val());
        const dieType = html.find('input[name="dieType"]:checked').val();
        let flat = Number(html.find("#flat").val());
        let pen = Number(html.find("#pen").val());
        const dos = Number(html.find("#dos").val());
        const tearing = html.find("#tearing")[0].checked;
        const proven = html.find("#proven")[0].checked;
        const primitive = html.find("#primitive")[0].checked;
        const accurate = html.find("#accurate")[0].checked;
        const gauss = html.find("#gauss")[0].checked;
        const force = html.find("#force")[0].checked;
        const razor = html.find("#razor")[0].checked;
        const melta = html.find("#melta")[0].checked;
        const scatter = html.find("#scatter")[0].checked;
        const hammer = html.find("#talent_hammer")[0]?.checked;
        const flesh = html.find("#talent_flesh")[0]?.checked;
        const raptor = html.find("#talent_raptor")[0]?.checked;
        const meltaRange = html.find("#meltaRange").val();
        const scatterRange = html.find("#scatterRange").val();
        const provenVal = Number(html.find("#provenVal").val());
        const primitiveVal = Number(html.find("#primitiveVal").val());
        const aim = html.find("#aim").val();

        let properties = [];

        if (hasMighty && isRanged) {
          const bsb = actor.system.characteristics.ballisticSkill.bonus;
          const bonus = Math.ceil(bsb / 2);
          flat += bonus;
          properties.push(`Mighty Shot +${bonus}`);
        }

        if (hasCrushing && isMelee) {
          const wsb = actor.system.characteristics.weaponSkill.bonus;
          const bonus = Math.ceil(wsb / 2);
          flat += bonus;
          properties.push(`Crushing Blow +${bonus}`);
        }

        if (hammer && isMelee) {
          const sb = actor.system.characteristics.strength.bonus;
          const bonus = Math.ceil(sb / 2);
          flat += bonus;
          properties.push(`Hammer Blow +${bonus}`);
          const concBox = html.find("#concussive")[0];
          const concValField = html.find("#concussiveVal");
          let current = 0;
          if (concBox?.checked) current = Number(concValField.val() || 0);
          concBox.checked = true;
          concValField.val(current + 2);
        }

        if (scatter && (scatterRange === "Short" || scatterRange === "Point Blank")) {
          flat += 2;
          properties.push("Scatter");
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

        if (force) {
          const psyRating = actor.system.psy?.rating || 0;
          flat += psyRating;
          pen += psyRating;
          properties.push(`Force (+${psyRating})`);
        }

        let formula = `${diceCount}d${dieType}`;
        if (tearing) {
          let extraDice = 1;
          if (flesh && isMelee) {
            extraDice += 1;
            properties.push("Flesh Render");
          }
          const rollDice = diceCount + extraDice;
          formula = `${rollDice}d${dieType}kh${diceCount}`;
          properties.push("Tearing");
        }

        if (accurate && aim === "yes") {
          const extra = Math.min(Math.floor(dos / 2), 2);
          if (extra > 0) formula += ` + ${extra}d${dieType}`;
          properties.push("Accurate");
        }

        if (raptor && isMelee) {
          const extra = Math.min(Math.floor(dos / 2), 2);
          if (extra > 0) {
            formula += ` + ${extra}d${dieType}`;
            properties.push(`Raptor +${extra}d${dieType}`);
          }
        }

        formula += ` + ${flat}`;

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

        if (razor && dos >= 3) {
          pen *= 2;
          properties.push("Razor Sharp");
        }

        const hits = attackData.hits;
        const hitLocations = buildHitLocations(attackData.location || "Body", hits);
        const hitsData = [];
        const damageResults = [];

        for (let h = 1; h <= hits; h++) {
          const roll = new Roll(formula);
          await roll.evaluate();
          if (game.dice3d) await game.dice3d.showForRoll(roll, game.user, true);
          const dice = roll.dice[0]?.results.map(r => r.result) ?? [];
          const flatBonus = roll.total - dice.reduce((a, b) => a + b, 0);
          const lowestIndex = dice.indexOf(Math.min(...dice));
          const modDice = [...dice];
          modDice[lowestIndex] = Math.max(modDice[lowestIndex], dos);
          if (proven) modDice[lowestIndex] = Math.max(modDice[lowestIndex], provenVal);
          if (primitive) modDice[lowestIndex] = Math.min(modDice[lowestIndex], primitiveVal);
          const total = modDice.reduce((a, b) => a + b, 0) + flatBonus;

          damageResults.push(total);
          hitsData.push({ hit: h, location: hitLocations[h - 1], damage: total, fury: null });
        }

        const flavor = `<div style="text-align:center; color:#000;">
<div style="font-style:italic;font-size:1.1em;"><b>${attackData.attacker}</b> hits <b>${attackData.target}</b> with <b>${attackData.weapon}</b></div>
<hr>
<div><b>Penetration:</b> ${pen}</div>
${damageResults.map((d, i) => `<div><b>Hit ${i + 1}</b> (${hitLocations[i]}): <b>${d}</b></div>`).join("")}
<div style="margin-top:6px;"><b>Properties:</b> ${properties.join(", ") || "None"}</div>
</div>`;

        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: flavor });

        const latest = entry.msg.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
        if (latest) {
          const tgt = latest.targets.find(t => t.tokenUuid === entry.target.tokenUuid);
          if (tgt) {
            tgt.damageRolls = hitsData.map(hd => ({ total: hd.damage, loc: hd.location }));
            tgt.damageResolved = true;
          }
          await entry.msg.update({
            flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: latest } }
          });
        }

        game.dh2eLastDamage = {
          attacker: attackData.attacker,
          target: attackData.target,
          targetTokenUuid: attackData.targetTokenUuid,
          weapon: attackData.weapon,
          damageType,
          penetration: pen,
          hits,
          hitsData,
          dos,
          properties
        };
      }
    },
    cancel: { label: "Cancel" }
  }
}).render(true, { width: 700 });

})().catch(err => {
  console.error("DH2E external damage workflow failed", err);
  ui.notifications.error("DH2E damage workflow failed. Check console for details.");
});
