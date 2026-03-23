export async function runPsychicPowerWorkflow() {
  const WORKFLOW_NS = "warhammer-40k-cogitator";
  const WORKFLOW_KEY = "dh2eExternalWorkflow";
  const SUSTAINING_EFFECT_ID = "ce-(whc)-sustaining-psychic-power";
  const CONDITION_MAP = {
    bleeding: { id: "bleeding", name: "Blood Loss", aliases: ["Bleeding"] },
    blinded: { id: "blinded", name: "Blinded" },
    deafened: { id: "deafened", name: "Deafened" },
    fear: { id: "fear", name: "Frightened" },
    fire: { id: "fire", name: "On Fire" },
    grappled: { id: "grappled", name: "Grappled" },
    pinned: { id: "pinned", name: "Pinned" },
    prone: { id: "prone", name: "Prone" },
    stunned: { id: "stunned", name: "Stunned" },
    unconscious: { id: "unconscious", name: "Unconscious" },
    dead: { id: "dead", name: "Dead" }
  };

  if (!canvas.tokens.controlled.length) {
    return ui.notifications.warn("Select your token first.");
  }

  const token = canvas.tokens.controlled[0];
  const actor = token.actor;
  if (!actor) return ui.notifications.warn("Selected token has no actor.");

  const actorTalents = actor.items.filter(i => i.type === "talent");
  const actorWeapons = actor.items.filter(i => i.type === "weapon");
  const hasTalent = name => actorTalents.some(t => t.name.toLowerCase().trim() === name.toLowerCase());
  const actorHasWarpSense = hasTalent("Warp Sense");
  const actorHasFavoredWarp = hasTalent("Favored of the Warp");
  const actorHasFocusWeapon = actorWeapons.some(w => /\bfocus\b/i.test(String(w.system?.special ?? "")));

  const psychicPowers = actor.items
    .filter(i => i.type === "psychicPower")
    .filter(p => !p.name.startsWith("**"));

  if (!psychicPowers.length) return ui.notifications.warn("No usable Psychic Powers found.");

  const getStatValue = (a, type) => {
    switch (type) {
      case "willpower": return Number(a.system.characteristics?.willpower?.total ?? 0);
      case "perception": return Number(a.system.characteristics?.perception?.total ?? 0);
      case "psyniscience": return Number(a.system.skills?.psyniscience?.total ?? 0);
      case "corruption": return Number(a.system.corruption ?? 0);
      default: return 0;
    }
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

  const stripHTML = htmlString => {
    if (!htmlString) return "";
    const tmp = document.createElement("DIV");
    tmp.innerHTML = htmlString;
    return tmp.textContent || tmp.innerText || "";
  };

  const normalizeFocusTest = testString => {
    if (!testString) return "willpower";
    const lower = String(testString).toLowerCase();
    if (lower.includes("wp") || lower.includes("willpower")) return "willpower";
    if (lower.includes("per") || lower.includes("perception")) return "perception";
    if (lower.includes("psyniscience")) return "psyniscience";
    if (lower.includes("corruption")) return "corruption";
    return "willpower";
  };

  const isOpposedPower = testString => String(testString ?? "").toLowerCase().includes("opposed");

  const resolveFormula = (expr, pr) => {
    if (!expr) return "";
    const bonuses = actor.system.characteristics;
    const statMap = {
      PR: pr,
      WP: actor.system.characteristics?.willpower?.total ?? 0,
      PER: actor.system.characteristics?.perception?.total ?? 0,
      PSYN: actor.system.skills?.psyniscience?.total ?? 0,
      COR: actor.system.corruption ?? 0,
      SB: bonuses.strength?.bonus ?? 0,
      TB: bonuses.toughness?.bonus ?? 0,
      AgB: bonuses.agility?.bonus ?? 0,
      IntB: bonuses.intelligence?.bonus ?? 0,
      PerB: bonuses.perception?.bonus ?? 0,
      WPB: bonuses.willpower?.bonus ?? 0,
      FelB: bonuses.fellowship?.bonus ?? 0,
      InfB: bonuses.influence?.bonus ?? 0
    };

    let replaced = String(expr);
    for (const [key, value] of Object.entries(statMap)) {
      replaced = replaced.replace(new RegExp(key, "gi"), String(value));
    }
    return replaced;
  };

  const inlineRollDice = async text => {
    const diceRegex = /(\d+d\d+)/gi;
    let result = text;
    for (const match of text.match(diceRegex) || []) {
      const roll = await new Roll(match).evaluate({ async: true });
      result = result.replace(match, roll.total);
    }
    return result;
  };

  const stylizeConditionText = text => {
    const styles = {
      "Blood Loss": "#b30000",
      Blinded: "#6c63ff",
      Deafened: "#5dade2",
      Fire: "#ff7a00",
      Stunned: "#00b3ff",
      Unconscious: "#8e44ad",
      Pinned: "#f4d03f",
      Grappled: "#89d185",
      Snared: "#89d185",
      Prone: "#808080",
      Fear: "#ff66cc",
      Frightened: "#ff66cc",
      Shocked: "#ff66cc",
      Dead: "#7f8c8d"
    };

    let result = String(text ?? "");
    for (const [word, color] of Object.entries(styles)) {
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      result = result.replace(regex, match => `<b style="color:${color}; text-shadow:1px 1px #000000;">${match}</b>`);
    }
    return result;
  };

  const parseRoundAmount = raw => {
    const text = String(raw ?? "").trim().toLowerCase();
    if (!text) return 0;
    if (/^\d+$/.test(text)) return Number(text);
    if (text === "a" || text === "an" || text === "one" || text === "next") return 1;
    return 0;
  };

  const extractRoundsByKeyword = (text, keywordRegex) => {
    const plain = String(text ?? "").replace(/<[^>]*>/g, " ");
    const regex = new RegExp(`${keywordRegex.source}\\s+for\\s+((?:\\d+|one|a|an|next))\\s*round`, "gi");
    let total = 0;
    let match;
    while ((match = regex.exec(plain)) !== null) {
      total += Math.max(parseRoundAmount(match[1]), 0);
    }
    return total;
  };

  const extractConditionCounts = text => {
    const plain = String(text ?? "").replace(/<[^>]*>/g, " ").toLowerCase();
    const counts = {};
    const add = (id, amount = 1) => {
      counts[id] = (counts[id] ?? 0) + Math.max(Number(amount) || 0, 0);
    };

    if (/\bblood\s+loss\b|\bbleeding\b/.test(plain)) add("bleeding");
    if (/\bprone\b/.test(plain)) add("prone");
    if (/\bblinded\b|\bblindness\b|\bblind\b/.test(plain)) add("blinded");
    if (/\bdeafened\b|\bdeafness\b/.test(plain)) add("deafened");
    if (/\bfear\b|\bfrightened\b|\bshocked\b|\bpanic\b|\bsnap out of it\b/.test(plain)) add("fear");
    if (/\bcatch fire\b|\bon fire\b|\bfire\b/.test(plain)) add("fire");
    if (/\bgrappled\b|\bsnared\b|\bimmobilized\b|\bimmobilised\b/.test(plain)) add("grappled");
    if (/\bpinned\b|\bpinning\b/.test(plain)) add("pinned");

    const stunnedRounds = extractRoundsByKeyword(plain, /\bstunned\b/);
    if (stunnedRounds > 0) add("stunned", stunnedRounds);
    else if (/\bstunned\b/.test(plain)) add("stunned", 1);

    const unconsciousRounds = extractRoundsByKeyword(plain, /\bunconscious\b/);
    if (unconsciousRounds > 0) add("unconscious", unconsciousRounds);
    else if (/\bunconscious\b|\bcatatonic\b/.test(plain)) add("unconscious", 1);

    if (/\bdead\b|\bdie\b|\bdies\b|\bperish\b/.test(plain)) add("dead", 1);
    return counts;
  };

  const rollWithDice = async formula => {
    const roll = await new Roll(formula).evaluate({ async: true });
    if (game.dice3d?.showForRoll) await game.dice3d.showForRoll(roll, game.user, true);
    return roll;
  };

  const calcDoS = (target, roll) => 1 + Math.floor(Math.abs(target - roll) / 10);

  const measureDistanceMeters = (a, b) => {
    if (!a?.center || !b?.center) return null;
    if (typeof canvas.grid?.measureDistance === "function") {
      return Number(canvas.grid.measureDistance(a.center, b.center) ?? 0);
    }
    if (typeof canvas.grid?.measurePath === "function") {
      const path = canvas.grid.measurePath([a.center, b.center]);
      return Number(path?.distance ?? 0);
    }
    return null;
  };

  const requestOwnerDefense = async ({ targetState, chatMessage, state }) => {
    const targetDoc = await fromUuid(targetState.tokenUuid);
    const targetActor = targetDoc?.actor;
    if (!targetActor) return false;

    const reactionAlreadyUsed = !!game.warhammer40kCogitator?.hasDefenseReaction?.(targetActor);
    if (reactionAlreadyUsed) {
      await game.warhammer40kCogitator.submitDefenseResult({
        chatMessageId: chatMessage.id,
        targetTokenUuid: targetState.tokenUuid,
        defenseRoll: null,
        defenseOutcome: "Skipped (failed defense: reaction used)",
        allocatedHits: targetState.allocatedHits ?? 0,
        defenseDetails: {
          actionText: "Skipped",
          incomingHits: targetState.allocatedHits ?? 0,
          difficultyLabel: "—",
          targetNumber: null,
          notes: ["Reaction already used"],
          degrees: 0,
          success: false
        }
      });
      return true;
    }

    const recipientUsers = game.warhammer40kCogitator?.getDefenseRecipients
      ? game.warhammer40kCogitator.getDefenseRecipients(targetDoc ?? targetActor)
      : game.users.filter(user => user.active && user.isGM);
    if (!recipientUsers.length) return false;

    if (game.warhammer40kCogitator?.emitSocket) {
      const payload = {
        ownerIds: recipientUsers.map(u => u.id),
        chatMessageId: chatMessage.id,
        targetTokenUuid: targetState.tokenUuid,
        targetName: targetState.name,
        allocatedHits: targetState.allocatedHits,
        attackerName: state.attackerName,
        weaponName: state.weaponName
      };

      game.warhammer40kCogitator.emitSocket("requestDefense", payload);
      if (payload.ownerIds.includes(game.user.id)) {
        if (game.warhammer40kCogitator?.promptDefenseRequest) {
          game.warhammer40kCogitator.promptDefenseRequest(payload);
        } else {
          game.warhammer40kCogitator.setPendingDefenseContext?.(payload);
          await game.warhammer40kCogitator.runStep?.("defense");
        }
      }
      return true;
    }

    return false;
  };

  const getPhenomenaEntry = roll => {
    if (roll <= 3) return `Dark Foreboding: A faint breeze blows past the psyker and those near him, and everyone gets the feeling that somewhere in the galaxy something unfortunate just happened.`;
    if (roll <= 5) return `Warp Echo: For a few moments, all noises cause echoes, regardless of the surroundings.`;
    if (roll <= 8) return `Unholy Stench: The air around the psyker becomes permeated with a bizarre and foul smell.`;
    if (roll <= 11) return `Mind Warp: The psyker suffers a -5 penalty to Willpower tests until the start of his next turn as his own inherent phobias, suspicions, and hatreds surge to the surface of his mind in a wave of unbound emotion.`;
    if (roll <= 14) return `Hoarfrost: The temperature plummets for an instant, and a thin coating of frost forms to cover everything within 3d10 metres.`;
    if (roll <= 17) return `Aura of Taint: All animals within 1d100 metres become spooked and agitated; characters can use the Psyniscience skill to pinpoint the psyker as the cause`;
    if (roll <= 20) return `Memory Worm: All people within line of sight of the psyker forget some trivial fact or minor personal memory.`;
    if (roll <= 23) return `Spoilage: Food and drink go bad in a 5d10 metre radius.`;
    if (roll <= 26) return `Haunting Breeze: Winds whip up around the psyker for a few moments, blowing light objects around and guttering fires within 3d10 metres.`;
    if (roll <= 29) return `Veil of Darkness: For a brief moment (effectively, until the end of the round), the area within 3d10 metres is plunged into immediate and impenetrable darkness.`;
    if (roll <= 32) return `Distorted Reflections: Mirrors and other reflective surfaces within a radius of 5d10 metres distort or shatter.`;
    if (roll <= 35) return `Breath Leech: Each character (including the psyker) within a 3d10 metre radius becomes short of breath for one round and cannot make any Run or Charge actions.`;
    if (roll <= 38) return `Daemonic Mask: For a fleeting moment, the psyker takes on a daemonic appearance and gains the Fear (1) trait until the start of the next turn. However, he also gains 1 Corruption point.`;
    if (roll <= 41) return `Unnatural Decay: All plant life within 3d10 metres of the psyker withers and dies.`;
    if (roll <= 44) return `Spectral Gale: Howling winds erupt around the psyker, requiring each character (including the psyker) within 4d10 metres to make an Easy (+30) Agility or Strength test to avoid being knocked Prone.`;
    if (roll <= 47) return `Bloody Tears: Blood weeps from stone and wood within 3d10 metres of the psyker. If there are any paintings, pict-displays, statues, or other representations of people inside this area, they appear to be crying blood.`;
    if (roll <= 50) return `The Earth Protests: The ground suddenly shakes, and each character (including the psyker) within a 5d10 metre radius must make an Ordinary (+10) Agility test or be knocked down.`;
    if (roll <= 53) return `Actinic Discharge: Static electricity fills the air within 5d10 metres causing hair to stand on end and unprotected electronics to short out, while the psyker is wreathed in eldritch lightning.`;
    if (roll <= 56) return `Warp Ghosts: Ghostly apparitions fill the air within 3d10 metres around the psyker, flying about and howling in pain for a few brief moments. Everyone in the radius (except the psyker himself) must test against a Fear rating of 1.`;
    if (roll <= 59) return `Falling Upwards: Everything within 2d10 metres of the psyker (including the psyker himself) rises 1d10 metres into the air as gravity briefly ceases. Almost immediately, everything crashes back to earth, suffering falling Damage as appropriate for the distances fallen.`;
    if (roll <= 62) return `Banshee Howl: A shrill keening rings out across the immediate area, shattering glass and forcing every mortal creature able to hear it (including the psyker) to pass a Challenging (+0) Toughness Test or be deafened for 1d10 rounds.`;
    if (roll <= 65) return `The Furies: The Psyker is assailed by unseen horrors. He is slammed to the ground and suffers 1d5 Damage (ignoring Armour, but not Toughness Bonus) and he must test against Fear (2).`;
    if (roll <= 68) return `Shadow of the Warp: For a split second, the world changes in appearance, and everyone within 1d100 metres has brief but horrific glimpse of the shadow of the Warp. Everyone in the area (including the psyker) must make a Difficult (-10) Willpower Test or gain 1d5 Corruption Points.`;
    if (roll <= 71) return `Tech Scorn: The machine spirits reject your unnatural ways. All un-warded technology within 5d10 metres malfunctions momentarily, and all ranged weapons Jam, whilst characters with cybernetic implants must pass a Routine (+10) Toughness Test or suffer 1d5 Damage, ignoring Toughness Bonus and Armour.`;
    if (roll <= 74) return `Warp Madness: A violent ripple of tainted discord causes all creatures within 2d10 metres (with the exception of the psyker) to become Frenzied for a Round and suffer 1d5 Corruption Points unless they can pass a Difficult (-10) Willpower Test.`;
    return `Perils of the Warp`;
  };

  const getPerilsEntry = roll => {
    if (roll <= 5) return `The Gibbering: The psyker screams in pain as uncontrolled Warp energies surge through his unprepared mind. He must make a Challenging (+0) Willpower Test or be stunned for 1d5 Rounds.`;
    if (roll <= 9) return `Warp Burn: A violent burst of energy from the Warp smashes into the psyker's mind, sending him reeling. He suffers 2d5 Damage, ignoring Toughness Bonus and Armour, and is stunned for 1d5 Rounds.`;
    if (roll <= 13) return `Psychic Concussion: With a crack of energy, the psyker is knocked unconscious for 1d5 Rounds, and everyone within 3d10 metres must make a Routine (+10) Willpower Test or be Stunned for one Round.`;
    if (roll <= 18) return `Psy Blast: There is an explosion of power and the psyker is thrown 3d10 metres into the air, falling to the ground moments later.`;
    if (roll <= 24) return `Soul Sear: Warp power courses through the psyker's body, scorching his soul. The psyker cannot use any powers for the next hour and gains 2d5 Corruption Points.`;
    if (roll <= 30) return `Locked In: The power cages the psyker's mind in an ethereal prison. Each Round he must spend a Full Action to make a Difficult (-10) Willpower Test to escape.`;
    if (roll <= 38) return `Chronological Incontinence: Time warps around the psyker. He winks out of existence and reappears in 1d10 Rounds, suffering permanent damage and 1d5 Corruption Points.`;
    if (roll <= 46) return `Psychic Mirror: The psyker's power is turned back on him.`;
    if (roll <= 55) return `Warp Whispers: The voices of daemons fill the air within 4d10 metres. All must test or suffer 1d5 Corruption Points and Willpower damage.`;
    if (roll <= 58) return `Vice Versa: The psyker swaps consciousness with another being for 1d10 rounds.`;
    if (roll <= 67) return `Dark Summoning: A Bloodletter appears within 3d10 metres for 1d5 plus Toughness Bonus rounds.`;
    if (roll <= 72) return `Rending the Veil: All sentient creatures within 1d100 metres must test against Fear (2), the psyker against Fear (4) for 1d5 Rounds.`;
    if (roll <= 78) return `Blood Rain: A psychic storm erupts in 5d10 metres for 1d5 Rounds. The psyker gains 1d5+1 Corruption Points.`;
    if (roll <= 82) return `Cataclysmic Blast: Everyone within 1d10 metres takes 1d10 Energy Damage with Pen 5.`;
    if (roll <= 86) return `Mass Possession: Every character within 1d100 metres resists possession for up to 2d10 Rounds.`;
    if (roll <= 90) return `Reality Quake: Everyone within 3d10 metres takes 2d10 Rending Damage ignoring Armour.`;
    if (roll <= 99) return `Grand Possession: A powerful daemon attempts to possess the psyker.`;
    return `Annihilation: The psyker is immediately and irrevocably destroyed.`;
  };

  const powerOptions = `<option value="">Choose Psychic Power</option>${psychicPowers.map(p => `<option value="${p.id}">${p.name}</option>`).join("")}`;
  const psychicStrengthOptions = Array.from({ length: 15 }, (_, idx) => idx - 9)
    .map(i => `<option value="${i}" ${i === 0 ? "selected" : ""}>${i > 0 ? `+${i}` : i}</option>`).join("");
  const sustainingOptions = Array.from({ length: 11 }, (_, i) => `<option value="${i}">${i}</option>`).join("");

  const pick = await new Promise(resolve => {
    const focusTestOptions = `
      <option value="willpower">Willpower</option>
      <option value="perception">Perception</option>
      <option value="psyniscience">Psyniscience</option>
      <option value="corruption">Corruption</option>`;

    const psyClass = String(actor.system.psy?.class ?? "—");
    const corruption = Number(actor.system.corruption ?? 0);
    const psyRating = Number(actor.system.psy?.rating ?? 0);
    const psyniscience = Number(actor.system.skills?.psyniscience?.total ?? 0);
    const perception = Number(actor.system.characteristics?.perception?.total ?? 0);
    const willpower = Number(actor.system.characteristics?.willpower?.total ?? 0);

    let content = `<style>
.top-panel { display:flex; align-items:center; font-size:1.15rem; font-weight:bold; margin-bottom:12px; }
.top-left { min-width:150px; text-align:left; }
.top-center { flex:1; text-align:center; }
.top-right { min-width:160px; text-align:right; }
.selection-row { display:flex; align-items:center; gap:15px; margin-bottom:10px; background:rgba(0,0,0,0.1); padding:8px; border-radius:4px; }
.opposed-inline { color:orange; font-weight:bold; text-align:right; text-shadow:1px 1px 0px black; display:none; }
.power-select-container { flex:2; }
.checkbox-container { flex:0; white-space:nowrap; display:flex; align-items:center; gap:5px; }
.sustaining-container { flex:1; display:flex; align-items:center; gap:8px; }
.section-title { font-weight:bold; margin-top:8px; }
.psychic-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; margin-top:8px; }
.field-block { display:flex; flex-direction:column; }
.full-width { grid-column:1 / span 3; }
.big-box { width:100%; min-height:180px; height:220px; resize:vertical; }
</style>
<h2 style="text-align:center;"><b>${actor.name}</b></h2>
<div class="top-panel">
  <div class="top-left">${psyClass}<label style="margin-left:8px;"><input type="checkbox" id="blackCrusadeToggle"> BC</label></div>
  <div class="top-center">PR: ${psyRating} | <b>WP:</b> ${willpower} | <b>Per:</b> ${perception} | <b>Psyniscience:</b> ${psyniscience} | <b>Corruption:</b> ${corruption}</div>
  <div class="top-right"><select id="psyMode"><option value="fettered">Fettered</option><option value="unfettered" selected>Unfettered</option><option value="push">Push</option></select></div>
</div><hr>
<div class="selection-row">
  <div class="power-select-container"><label style="font-weight:bold; white-space:nowrap;">Select Power: </label><select id="powerSelect">${powerOptions}</select></div>
  <div class="sustaining-container"><label style="font-weight:bold; white-space:nowrap;">Psychic Strength:</label><select id="psychicStrength">${psychicStrengthOptions}</select></div>
  <div class="checkbox-container"><input type="checkbox" id="powerFocus" ${actorHasFocusWeapon ? "checked" : ""}><label for="powerFocus" style="font-weight:bold;">Psy Focus (+10)</label></div>
  <div class="sustaining-container"><label style="font-weight:bold; white-space:nowrap;">Sustaining Powers:</label><select id="sustainingCount">${sustainingOptions}</select></div>
</div>
<hr><div class="section-title"><h3>Talents</h3></div>
<div style="display:flex; gap:20px; margin-bottom:10px;">
  <label><input type="checkbox" id="talentWarpSense" ${actorHasWarpSense ? "checked" : ""}> Warp Sense</label>
  <label><input type="checkbox" id="talentFavoredWarp" ${actorHasFavoredWarp ? "checked" : ""}> Favored of the Warp</label>
</div><hr>
<div class="psychic-grid">
  <div class="field-block"><div class="section-title">Action</div><input id="action" type="text"></div>
  <div class="field-block"><div class="section-title">Subtype</div><input id="subtype" type="text"></div>
  <div class="field-block"><div class="section-title">Sustained?</div><input id="sustained" type="text"></div>
  <div class="field-block"><div class="section-title">Range</div><input id="range" type="text"></div>
  <div class="field-block"><div class="section-title">Focus Power</div><input id="difficulty" type="number"></div>
  <div class="field-block"><div class="section-title">Focus Test</div><select id="focusTest">${focusTestOptions}</select></div>
  <div class="field-block"><div class="section-title">Damage</div><input id="damageFormula" type="text"></div>
  <div class="field-block"><div class="section-title">Damage Type</div><input id="damageType" type="text"></div>
  <div class="field-block"><div class="section-title">Pen</div><input id="penetration" type="text"></div>
  <div class="field-block"><div class="section-title">Power Shape</div><input id="damageZone" type="text"></div>
  <div class="field-block"><div class="section-title">Modifier</div><input id="rollModifier" type="number" value="0"></div>
  <div class="field-block"><div class="section-title">&nbsp;</div><div id="opposedNote" class="opposed-inline">Opposed Power</div></div>
  <div class="field-block full-width"><div class="section-title">Special Traits</div><input id="damageSpecial" type="text"></div>
</div><hr><div class="section-title">Effect</div><textarea id="effect" class="big-box" style="font-family:monospace;"></textarea>`;

    new Dialog({
      title: "Psychic Power Handler",
      content,
      render: html => {
        const powerSelect = html.find("#powerSelect");
        const focusSelect = html.find("#focusTest");
        const opposedBox = html.find("#opposedNote");
        const psyModeSelect = html.find("#psyMode");
        const bcToggle = html.find("#blackCrusadeToggle");

        function updatePsychicStrengthOptions() {
          const mode = psyModeSelect.val();
          const isBC = bcToggle.is(":checked");
          const basePR = actor.system.psy?.rating ?? 1;
          const psyClassRaw = (actor.system.psy?.class || "").toLowerCase();
          let psyClassType = "bound";
          if (psyClassRaw.includes("unbound")) psyClassType = "unbound";
          if (psyClassRaw.includes("daemon")) psyClassType = "daemon";

          let min = 0;
          let max = 0;
          if (mode === "unfettered") {
            max = 0;
            const maxReduction = basePR - 1;
            min = maxReduction > 0 ? -maxReduction : 0;
          }
          if (mode === "push") {
            min = 0;
            if (psyClassType === "bound") max = isBC ? 3 : 2;
            if (psyClassType === "unbound") max = isBC ? 5 : 4;
            if (psyClassType === "daemon") max = isBC ? 4 : 3;
          }

          const current = parseInt(html.find("#psychicStrength").val()) || 0;
          const select = html.find("#psychicStrength");
          select.empty();
          for (let i = min; i <= max; i++) {
            select.append(`<option value="${i}">${i > 0 ? `+${i}` : i}</option>`);
          }
          select.val(current >= min && current <= max ? current : 0);
        }

        function updatePsyModes() {
          const isBC = bcToggle.is(":checked");
          const current = psyModeSelect.val();
          psyModeSelect.empty();
          if (isBC) psyModeSelect.append(`<option value="fettered">Fettered</option>`);
          psyModeSelect.append(`<option value="unfettered">Unfettered</option>`);
          psyModeSelect.append(`<option value="push">Push</option>`);
          if (psyModeSelect.find(`option[value="${current}"]`).length) psyModeSelect.val(current);
        }

        function populateFields(powerId) {
          if (!powerId) return;
          const power = actor.items.get(powerId);
          if (!power) return;
          const data = power.system;
          const focusPower = data.focusPower ?? {};
          const rawTest = focusPower.test ?? focusPower.characteristic ?? "";

          html.find("#action").val(data.action ?? "");
          html.find("#difficulty").val(data.focusPower?.difficulty ?? 0);
          html.find("#range").val(data.range ?? "");
          html.find("#sustained").val(data.sustained ?? "");
          html.find("#subtype").val(data.subtype ?? "");
          html.find("#damageZone").val(data.damage?.zone ?? "");
          html.find("#damageType").val(data.damage?.type ?? "");
          html.find("#damageFormula").val(data.damage?.formula ?? "");
          html.find("#penetration").val(data.damage?.penetration ?? "");
          html.find("#damageSpecial").val(data.damage?.special ?? "");
          html.find("#effect").val(stripHTML(data.effect ?? data.description ?? ""));

          const normalized = normalizeFocusTest(rawTest);
          if (normalized) focusSelect.val(normalized);
          if (isOpposedPower(rawTest)) opposedBox.show(); else opposedBox.hide();
        }

        psyModeSelect.on("change", updatePsychicStrengthOptions);
        bcToggle.on("change", () => {
          updatePsyModes();
          updatePsychicStrengthOptions();
        });
        powerSelect.on("change", ev => populateFields(ev.target.value));
        updatePsyModes();
        updatePsychicStrengthOptions();
      },
      buttons: {
        use: {
          label: "Use Power",
          callback: html => resolve({
            powerId: html.find("#powerSelect").val(),
            mode: html.find("#psyMode").val(),
            psychicStrength: Number(html.find("#psychicStrength").val() || 0),
            sustainingCount: Number(html.find("#sustainingCount").val() || 0),
            rollModifier: Number(html.find("#rollModifier").val() || 0),
            hasFocus: html.find("#powerFocus").is(":checked"),
            isBlackCrusade: html.find("#blackCrusadeToggle").is(":checked"),
            hasFavored: html.find("#talentFavoredWarp").is(":checked")
          })
        },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      }
    }, { width: 800 }).render(true);
  });

  if (!pick || !pick.powerId) return;

  const power = actor.items.get(pick.powerId);
  if (!power) return ui.notifications.warn("Choose a Psychic Power.");

  const data = power.system ?? {};
  const rawTest = data.focusPower?.test ?? data.focusPower?.characteristic ?? "";
  const focusTestType = normalizeFocusTest(rawTest);
  const opposed = isOpposedPower(rawTest);
  const hasDamage = String(data.damage?.formula ?? "").trim().length > 0;

  const targets = Array.from(game.user.targets ?? []);
  const targetToken = targets[0] ?? null;
  const targetActor = targetToken?.actor ?? null;

  if (hasDamage && !targetToken) return ui.notifications.warn("This power requires a target.");

  const basePR = Number(actor.system.psy?.rating ?? 1);
  const psyClassRaw = String(actor.system.psy?.class ?? "").toLowerCase();
  let psyClassType = "bound";
  if (psyClassRaw.includes("unbound")) psyClassType = "unbound";
  if (psyClassRaw.includes("daemon")) psyClassType = "daemon";

  if (psyClassType === "daemon" && pick.mode === "fettered") return ui.notifications.error("Daemons cannot use Fettered!");

  let effectivePR = pick.mode === "fettered" ? Math.ceil(basePR / 2) : basePR;
  let appliedStrength = pick.psychicStrength;
  let maxRaise = 0;
  let canLower = true;

  if (pick.mode === "unfettered") maxRaise = 0;
  if (pick.mode === "push") {
    if (psyClassType === "bound") maxRaise = pick.isBlackCrusade ? 3 : 2;
    if (psyClassType === "unbound") maxRaise = pick.isBlackCrusade ? 5 : 4;
    if (psyClassType === "daemon") maxRaise = pick.isBlackCrusade ? 4 : 3;
  }
  if (pick.mode === "fettered") { canLower = false; maxRaise = 0; }
  if (!canLower && appliedStrength < 0) appliedStrength = 0;
  if (appliedStrength > maxRaise) appliedStrength = maxRaise;

  let testModifierFromStrength = 0;
  if (appliedStrength < 0) {
    testModifierFromStrength = Math.abs(appliedStrength) * 10;
    effectivePR += appliedStrength;
  }
  if (appliedStrength > 0) {
    testModifierFromStrength = appliedStrength * -10;
    effectivePR += appliedStrength;
  }

  effectivePR = Math.max(1, effectivePR - Number(pick.sustainingCount ?? 0));

  const baseStat = getStatValue(actor, focusTestType);
  const focusDifficulty = Number(data.focusPower?.difficulty ?? 0);
  const focusBonus = pick.hasFocus ? 10 : 0;
  const bcBonus = pick.isBlackCrusade ? (effectivePR * 5) : 0;
  const targetNumber = Math.max(1, baseStat + focusDifficulty + testModifierFromStrength + focusBonus + pick.rollModifier + bcBonus);

  let manifestRoll = (await rollWithDice("1d100")).total;
  let manifestSuccess = manifestRoll !== 100 && manifestRoll <= targetNumber && !(pick.isBlackCrusade && manifestRoll >= 91);
  let manifestDoS = calcDoS(targetNumber, manifestRoll);

  if (!manifestSuccess && Number(actor.system.fate?.value ?? 0) > 0) {
    const useFate = await new Promise(resolve => {
      new Dialog({
        title: "Spend Fate?",
        content: `<p><b>Focus Power Test Failed!</b><br>Spend 1 Fate Point to reroll?</p>`,
        buttons: { yes: { label: "Spend Fate (-1)", callback: () => resolve(true) }, no: { label: "Keep Result", callback: () => resolve(false) } },
        default: "no"
      }).render(true);
    });

    if (useFate) {
      await actor.update({ "system.fate.value": Math.max(0, Number(actor.system.fate?.value ?? 0) - 1) });
      manifestRoll = (await rollWithDice("1d100")).total;
      manifestSuccess = manifestRoll !== 100 && manifestRoll <= targetNumber && !(pick.isBlackCrusade && manifestRoll >= 91);
      manifestDoS = calcDoS(targetNumber, manifestRoll);
    }
  }

  const resolvedRangeText = resolveFormula(String(data.range ?? ""), effectivePR).trim();
  if ((hasDamage || opposed) && targetToken) {
    const rangeValue = Number((resolvedRangeText.match(/\d+(?:\.\d+)?/) || [NaN])[0]);
    if (Number.isFinite(rangeValue)) {
      const dist = measureDistanceMeters(token, targetToken);
      if (Number.isFinite(dist) && dist > rangeValue) {
        return ui.notifications.warn(`Target too far (${Number(dist).toFixed(2)}m > ${rangeValue}m).`);
      }
    }
  }

  const isDouble = manifestRoll % 11 === 0;
  let triggersPhenomena = false;
  let phenomenaModifier = Number(pick.sustainingCount ?? 0) * 10;
  if (pick.mode === "unfettered" && isDouble) {
    triggersPhenomena = true;
    if (psyClassType !== "bound") phenomenaModifier += 10;
  }
  if (pick.mode === "push" && !isDouble) {
    triggersPhenomena = true;
    if (psyClassType === "unbound") phenomenaModifier += appliedStrength * 5;
    if (psyClassType === "daemon") phenomenaModifier += appliedStrength * 10;
  }

  let opposedResult = null;
  if (manifestSuccess && opposed && targetActor) {
    const defTarget = getStatValue(targetActor, focusTestType);
    const defRoll = (await rollWithDice("1d100")).total;
    const defSuccess = defRoll !== 100 && defRoll <= defTarget;
    const defDoS = calcDoS(defTarget, defRoll);
    const attackerWins = manifestDoS >= 1 && (!defSuccess || manifestDoS > defDoS);
    opposedResult = { target: defTarget, roll: defRoll, success: defSuccess, dos: defDoS, attackerWins };
  }

  const shape = String(data.damage?.zone ?? "").toLowerCase();
  const calcHits = () => {
    if (!manifestSuccess) return 0;
    if (shape === "bolt") return 1;
    if (shape === "barrage") return Math.max(0, Math.min(effectivePR, 1 + Math.floor(Math.max(0, manifestDoS - 1) / 2)));
    if (shape === "storm") return Math.max(0, Math.min(effectivePR, manifestDoS));
    if (shape === "blast") return 1;
    return 1;
  };

  let hits = hasDamage ? calcHits() : 0;
  if (opposed && opposedResult && !opposedResult.attackerWins) hits = 0;

  const rawFormula = String(data.damage?.formula ?? "");
  const rawType = String(data.damage?.type ?? "impact");
  const rawPen = String(data.damage?.penetration ?? "0");
  const rawSpecial = String(data.damage?.special ?? "");

  const finalFormula = resolveFormula(rawFormula, effectivePR);
  const finalPen = resolveFormula(rawPen, effectivePR);
  const finalSpecial = resolveFormula(rawSpecial, effectivePR);
  const hitLocation = getHitLocation(manifestRoll);

  const hitsData = [];
  if (manifestSuccess && hits > 0 && hasDamage) {
    for (let i = 1; i <= hits; i++) {
      const dmgRoll = await new Roll(finalFormula).evaluate({ async: true });
      hitsData.push({ hit: i, location: hitLocation, damage: dmgRoll.total, fury: null });
    }
  }

  if (manifestSuccess && String(data.sustained ?? "").trim().toLowerCase() !== "no") {
    await game.warhammer40kCogitator?.addConvenientEffectToActor?.({
      actorUuid: actor.uuid,
      effectId: SUSTAINING_EFFECT_ID,
      effectName: "Sustaining Psychic Power"
    });
  }

  let phenomenaText = "";
  const pendingConditionCounts = {};
  if (triggersPhenomena) {
    const rollsToMake = pick.hasFavored ? 2 : 1;
    const allResults = [];
    for (let i = 0; i < rollsToMake; i++) {
      const phRoll = await new Roll(`1d100 + ${phenomenaModifier}`).evaluate({ async: true });
      const phTotal = Math.min(phRoll.total, 100);
      if (phTotal >= 75) {
        const perilsRoll = await new Roll("1d100").evaluate({ async: true });
        const perilsEntry = stylizeConditionText(await inlineRollDice(getPerilsEntry(perilsRoll.total)));
        allResults.push(`<b style="color:orange;">Perils of the Warp! (${perilsRoll.total})</b><br>${perilsEntry}`);
        const counts = extractConditionCounts(perilsEntry);
        for (const [id, amount] of Object.entries(counts)) {
          pendingConditionCounts[id] = (pendingConditionCounts[id] ?? 0) + amount;
        }
      } else {
        const phEntry = stylizeConditionText(await inlineRollDice(getPhenomenaEntry(phTotal)));
        allResults.push(`<b>Psychic Phenomena (${phTotal})</b><br>${phEntry}`);
        const counts = extractConditionCounts(phEntry);
        for (const [id, amount] of Object.entries(counts)) {
          pendingConditionCounts[id] = (pendingConditionCounts[id] ?? 0) + amount;
        }
      }
    }
    phenomenaText = allResults.join("<hr>");
  }

  const styleBlue = "color:#3aa0ff;font-weight:bold;text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;";
  const styleOrange = "color:#ff9f1a;font-weight:bold;text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;";
  const styleGreen = "color:#1aff1a;font-weight:bold;text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;";
  const styleRed = "color:#ff2a2a;font-weight:bold;text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;";

  const casterDegreeLabel = manifestSuccess ? "Degrees of Success" : "Degrees of Failure";
  const casterDegreeStyle = manifestSuccess ? styleGreen : styleRed;
  const targetDegreeLabel = opposedResult?.success ? "Degrees of Success" : "Degrees of Failure";
  const targetDegreeStyle = opposedResult?.success ? styleGreen : styleRed;
  const opposedOutcomeLabel = opposedResult?.attackerWins ? "Caster Wins" : "Caster Loses";
  const opposedOutcomeStyle = opposedResult?.attackerWins ? styleGreen : styleRed;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor, token: token.document }),
    content: `<div style="text-align:center; font-size:1.05em;">
      <div style="font-style:italic; font-size:1.1em;">
        <b>${actor.name}</b> manifests <b>${power.name}</b>${targetToken ? ` against <b>${targetToken.name}</b>` : ""}
      </div>
      <hr>
      <div><b>Mode:</b> ${pick.mode} | <b>Psy Rating:</b> ${effectivePR} | <b>Range:</b> ${resolvedRangeText || "—"}</div>
      <div style="margin-top:4px;">
        <b>Focus Test (${focusTestType}):</b>
        <span style="${styleBlue}">${targetNumber}</span> vs <span style="${styleOrange}">${manifestRoll}</span>
        ${manifestSuccess ? `→ <span style="${styleGreen}">Success</span>` : `→ <span style="${styleRed}">Failure</span>`}
      </div>
      <div><span style="${casterDegreeStyle}">${manifestDoS} ${casterDegreeLabel}</span></div>
      <div><b>Description:</b> ${stripHTML(data.effect ?? data.description ?? "") || "—"}</div>
      ${opposedResult ? `<hr>
      <div style="font-weight:bold;">Opposed Check</div>
      <div><b>Caster:</b> <span style="${styleBlue}">${targetNumber}</span> vs <span style="${styleOrange}">${manifestRoll}</span></div>
      <div style="margin-top:4px;"><b>Target(s):</b> <span style="${styleBlue}">${opposedResult.target}</span> vs <span style="${styleOrange}">${opposedResult.roll}</span></div>
      <div><span style="${targetDegreeStyle}">${opposedResult.dos} ${targetDegreeLabel}</span></div>
      <div style="margin-top:4px;"><span style="${opposedOutcomeStyle}">${opposedOutcomeLabel}</span></div>` : ""}
      ${hasDamage ? `<hr><div><b>Damage:</b> ${finalFormula} | <b>Type:</b> ${rawType} | <b>Pen:</b> ${finalPen} | <b>Shape:</b> ${shape || "—"} | <b>Hits:</b> ${hits}</div>` : ""}
      <div style="margin-top:4px;"><b>Phenomena:</b> ${triggersPhenomena ? `YES (${phenomenaModifier >= 0 ? "+" : ""}${phenomenaModifier})` : "No"}</div>
      ${phenomenaText ? `<div style="margin-top:6px; text-align:center;">${phenomenaText}</div>` : ""}
    </div>`
  });

  for (const [conditionId, amountRaw] of Object.entries(pendingConditionCounts)) {
    const amount = Math.max(Number(amountRaw ?? 0), 0);
    if (amount <= 0) continue;
    const condition = CONDITION_MAP[conditionId];
    if (!condition) continue;
    await game.warhammer40kCogitator?.addConvenientEffectToActor?.({
      actorUuid: actor.uuid,
      effectId: condition.id,
      effectName: condition.name,
      effectNames: condition.aliases ?? [],
      counter: amount > 1 ? amount : null
    });
  }

  if (!manifestSuccess || !hasDamage || hits <= 0) return;
  if (opposed && opposedResult && !opposedResult.attackerWins) return;
  if (!targetToken || !targetActor) return;

  const distanceMeters = Number((measureDistanceMeters(token, targetToken) ?? 0).toFixed(2));
  const state = {
    id: foundry.utils.randomID(),
    attackerActorId: actor.id,
    attackerName: actor.name,
    attackerTokenUuid: token.document.uuid,
    weaponId: power.id,
    weaponName: power.name,
    weaponDamage: finalFormula,
    weaponPen: finalPen,
    weaponType: rawType,
    weaponSpecial: `${finalSpecial}${finalSpecial ? ", " : ""}InfaAmmo`,
    weaponTraits: `${finalSpecial}${finalSpecial ? ", " : ""}InfaAmmo`,
    modeKey: "psychic",
    modeLabel: `Psychic ${shape || "Power"}`,
    powerModeLabel: pick.mode,
    attackRoll: manifestRoll,
    attackDegrees: manifestSuccess ? manifestDoS : -manifestDoS,
    dos: manifestDoS,
    totalHits: hits,
    statusText: manifestSuccess ? "Hit" : "Miss",
    talentModifier: 0,
    toggles: {},
    targets: [{
      tokenUuid: targetToken.document.uuid,
      targetTokenUuid: targetToken.document.uuid,
      tokenId: targetToken.id,
      actorId: targetActor.id,
      name: targetToken.name,
      distanceMeters,
      rangeLabel: resolvedRangeText || "—",
      sizeLabel: "—",
      sizeMod: 0,
      sizeIgnored: false,
      targetNumber,
      allocatedHits: hits,
      incomingHits: hits,
      defenseRoll: null,
      defenseAction: null,
      defenseDifficultyLabel: null,
      defenseTargetNumber: null,
      defenseNotes: [],
      defenseDegrees: 0,
      defenseSuccess: false,
      defenseOutcome: opposed ? "Skipped (Opposed psychic)" : "Awaiting defense",
      inescapableAttackPenalty: 0,
      forceFieldChecked: false,
      forceFieldOutcome: null,
      forceFieldRoll: null,
      forceFieldProtection: null,
      forceFieldOverload: null,
      forceFieldName: null,
      damageRolls: [],
      damageResolved: false,
      damageSummary: null,
      damageApplicationData: {
        attacker: actor.name,
        target: targetActor.name,
        targetTokenUuid: targetToken.document.uuid,
        weapon: power.name,
        damageType: rawType,
        penetration: finalPen,
        hits,
        hitsData,
        dos: manifestDoS,
        properties: String(finalSpecial ?? "").split(",").map(s => s.trim()).filter(Boolean),
        fury: null
      }
    }],
    flags: { immediate: true }
  };

  const chatMessage = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor, token: token.document }),
    content: `<div><b>${actor.name}</b> attacks <b>${targetToken.name}</b> with psychic power <b>${power.name}</b>. Pending workflow resolution.</div>`,
    flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: state } }
  });

  if (!opposed) {
    await requestOwnerDefense({ targetState: state.targets[0], chatMessage, state });
    return;
  }

  game.warhammer40kCogitator?.setPendingDamageContext?.({ chatMessageId: chatMessage.id });
  await game.warhammer40kCogitator?.runStep?.("damage");
}
