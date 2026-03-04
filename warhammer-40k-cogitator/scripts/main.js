const COGITATOR_ID = "warhammer-40k-cogitator";

const SETTINGS = {
  attackMacroName: "attackMacroName",
  defenseMacroName: "defenseMacroName",
  damageMacroName: "damageMacroName",
  masterMacroName: "masterMacroName",
  autoCreateMacros: "autoCreateMacros"
};

const SOCKET_EVENTS = {
  requestDefense: "requestDefense",
  defenseResolved: "defenseResolved",
  damageReady: "damageReady"
};

const WORKFLOW_NS = "foundrymacros";
const WORKFLOW_KEY = "dh2eExternalWorkflow";
const MACRO_FOLDER_NAME = "Warhammer 40k Cogitator";
const REACTION_FLAG = "reactionUsedForDefense";
const REACTION_EFFECT_NAME = "Reaction Used";
const REACTION_EFFECT_ICON = "icons/svg/lightning.svg";

const DEFAULT_MACROS = {
  attack: {
    name: "DH2e External Attack Workflow",
    file: "macros/dh2e_external_attack_workflow.js"
  },
  defense: {
    name: "DH2e External Defense Workflow",
    file: "macros/dh2e_external_defense_workflow.js"
  },
  damage: {
    name: "DH2e External Damage Workflow",
    file: "macros/dh2e_external_damage_workflow.js"
  },
  master: {
    name: "DH2e External Master Workflow",
    file: "macros/dh2e_external_master_workflow.js"
  }
};

Hooks.once("init", () => {
  console.log("Warhammer 40k Cogitator | Initializing");

  game.settings.register(COGITATOR_ID, SETTINGS.attackMacroName, {
    name: "Attack Macro Name",
    hint: "World macro name used for attack workflow execution.",
    scope: "world",
    config: true,
    type: String,
    default: DEFAULT_MACROS.attack.name
  });

  game.settings.register(COGITATOR_ID, SETTINGS.defenseMacroName, {
    name: "Defense Macro Name",
    hint: "World macro name used for defense workflow execution.",
    scope: "world",
    config: true,
    type: String,
    default: DEFAULT_MACROS.defense.name
  });

  game.settings.register(COGITATOR_ID, SETTINGS.damageMacroName, {
    name: "Damage Macro Name",
    hint: "World macro name used for damage workflow execution.",
    scope: "world",
    config: true,
    type: String,
    default: DEFAULT_MACROS.damage.name
  });
  game.settings.register(COGITATOR_ID, SETTINGS.masterMacroName, {
    name: "Master Macro Name",
    hint: "World macro name used for one-click launcher execution.",
    scope: "world",
    config: true,
    type: String,
    default: DEFAULT_MACROS.master.name
  });


  game.settings.register(COGITATOR_ID, SETTINGS.autoCreateMacros, {
    name: "Auto-create workflow macros",
    hint: "Automatically create missing Attack/Defense/Damage world macros from bundled scripts on ready.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.keybindings.register(COGITATOR_ID, "openLauncher", {
    name: "Open Workflow Launcher",
    hint: "Open Warhammer 40k Cogitator launcher dialog.",
    editable: [{ key: "KeyC", modifiers: ["Control", "Shift"] }],
    onDown: () => {
      openLauncher();
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
});

Hooks.once("ready", async () => {
  game.warhammer40kCogitator = {
    openLauncher,
    ensureWorkflowMacros,
    runStep,
    emitSocket,
    submitDefenseResult,
    getDefenseRecipients,
    hasDefenseReaction,
    consumeDefenseReaction,
    clearDefenseReaction
  };

  registerSocketHandlers();
  registerCombatHooks();

  if (game.settings.get(COGITATOR_ID, SETTINGS.autoCreateMacros)) {
    await ensureWorkflowMacros();
  }

  console.log("Warhammer 40k Cogitator | Ready");
});

function registerCombatHooks() {
  Hooks.on("updateCombat", async (combat, changed) => {
    if (!("turn" in changed) && !("round" in changed)) return;
    const actor = combat?.combatant?.actor;
    if (!actor) return;
    await clearDefenseReaction(actor);
  });
}

function hasDefenseReaction(actor) {
  return !!actor?.getFlag(COGITATOR_ID, REACTION_FLAG);
}

async function consumeDefenseReaction(actor) {
  if (!actor || hasDefenseReaction(actor)) return;

  const existing = actor.effects.find(e => e.getFlag(COGITATOR_ID, REACTION_FLAG));
  if (!existing) {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: REACTION_EFFECT_NAME,
      img: REACTION_EFFECT_ICON,
      icon: REACTION_EFFECT_ICON,
      transfer: false,
      disabled: false,
      flags: { [COGITATOR_ID]: { [REACTION_FLAG]: true } }
    }]);
  }

  await actor.setFlag(COGITATOR_ID, REACTION_FLAG, true);
}

async function clearDefenseReaction(actor) {
  if (!actor) return;
  if (!hasDefenseReaction(actor)) return;

  const toDelete = actor.effects
    .filter(e => e.getFlag(COGITATOR_ID, REACTION_FLAG))
    .map(e => e.id)
    .filter(Boolean);
  if (toDelete.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
  }

  await actor.unsetFlag(COGITATOR_ID, REACTION_FLAG);
}

function getDefenseRecipients(targetActor) {
  if (!targetActor) return [];

  const activeGMs = game.users.filter(u => u.active && u.isGM);
  if (!targetActor.hasPlayerOwner) return activeGMs;

  const playerOwners = game.users.filter(u => u.active && !u.isGM && targetActor.testUserPermission(u, "OWNER"));
  if (playerOwners.length) return playerOwners;

  return activeGMs;
}

function registerSocketHandlers() {
  game.socket.on(`module.${COGITATOR_ID}`, packet => {
    if (!packet?.event || !packet?.payload) return;

    if (packet.event === SOCKET_EVENTS.requestDefense) {
      void handleDefenseRequest(packet.payload);
      return;
    }

    if (packet.event === SOCKET_EVENTS.defenseResolved) {
      void handleDefenseResolved(packet.payload);
      return;
    }

    if (packet.event === SOCKET_EVENTS.damageReady) {
      handleDamageReady(packet.payload);
    }
  });
}

function emitSocket(event, payload) {
  game.socket.emit(`module.${COGITATOR_ID}`, {
    event,
    payload,
    senderId: game.user.id
  });
}

async function handleDefenseRequest(payload) {
  const ownerIds = Array.isArray(payload.ownerIds) ? payload.ownerIds : [];
  if (!ownerIds.includes(game.user.id)) return;

  new Dialog({
    title: `Defense Requested: ${payload.targetName}`,
    content: `<p><b>${payload.targetName}</b> has <b>${payload.allocatedHits}</b> incoming hit(s).</p>
              <p>Attacker: <b>${payload.attackerName}</b><br>
              Weapon: <b>${payload.weaponName}</b></p>
              <p>Resolve now?</p>`,
    buttons: {
      resolve: {
        label: "Resolve Defense",
        callback: async () => {
          ui.notifications.info(`Opening defense workflow for message ${payload.chatMessageId}.`);
          await runStep("defense");
        }
      },
      later: { label: "Later" }
    },
    default: "resolve"
  }).render(true);
}

async function submitDefenseResult({ chatMessageId, targetTokenUuid, defenseRoll, defenseOutcome, allocatedHits }) {
  const canDirectUpdate = !!game.user.isGM;

  if (canDirectUpdate) {
    await applyDefenseResult({ chatMessageId, targetTokenUuid, defenseRoll, defenseOutcome, allocatedHits });
    return { ok: true, mode: "gm-direct" };
  }

  const activeGMs = game.users.filter(u => u.active && u.isGM);
  if (!activeGMs.length) {
    throw new Error("No active GM is connected. Defense result cannot be applied right now.");
  }

  emitSocket(SOCKET_EVENTS.defenseResolved, {
    chatMessageId,
    targetTokenUuid,
    defenseRoll,
    defenseOutcome,
    allocatedHits,
    resolverUserId: game.user.id
  });

  return { ok: true, mode: "socket" };
}

async function handleDefenseResolved(payload) {
  if (!game.user.isGM) return;
  try {
    assertDefenseResolverAuthorized(payload);
    await applyDefenseResult(payload);
  } catch (err) {
    console.error("Warhammer 40k Cogitator | Failed to apply defense result", err, payload);
    ui.notifications.error(`Warhammer 40k Cogitator: Failed to apply defense result (${err.message ?? err}).`);
  }
}

function assertDefenseResolverAuthorized({ resolverUserId, targetTokenUuid }) {
  if (!resolverUserId) {
    throw new Error("Defense payload missing resolver user.");
  }

  if (!targetTokenUuid) {
    throw new Error("Defense payload missing target token.");
  }

  const resolverUser = game.users.get(resolverUserId);
  if (!resolverUser) {
    throw new Error("Defense resolver user could not be found.");
  }

  if (resolverUser.isGM) return;

  const targetDoc = fromUuidSync(targetTokenUuid);
  const targetActor = targetDoc?.actor;
  if (!targetActor) {
    throw new Error("Defense target could not be resolved.");
  }

  if (!targetActor.testUserPermission(resolverUser, "OWNER")) {
    throw new Error("Defense resolver is not an owner of the target.");
  }
}

async function applyDefenseResult({ chatMessageId, targetTokenUuid, defenseRoll, defenseOutcome, allocatedHits }) {
  const message = game.messages.get(chatMessageId);
  if (!message) return;

  const state = foundry.utils.deepClone(message.getFlag(WORKFLOW_NS, WORKFLOW_KEY));
  if (!state?.targets?.length) return;

  const target = state.targets.find(t => t.tokenUuid === targetTokenUuid);
  if (!target) return;

  target.defenseRoll = defenseRoll;
  target.defenseOutcome = defenseOutcome;
  target.allocatedHits = Math.max(0, Number(allocatedHits ?? 0));

  await message.update({
    flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: state } }
  });

  const pendingDefense = state.targets.some(t => {
    if ((t.allocatedHits ?? 0) <= 0) return false;
    const out = String(t.defenseOutcome ?? "").toLowerCase();
    return !out.includes("success") && !out.includes("failed") && !out.includes("skipped");
  });

  const pendingDamage = state.targets.some(t => {
    if ((t.allocatedHits ?? 0) <= 0) return false;
    if (t.damageResolved) return false;
    const out = String(t.defenseOutcome ?? "").toLowerCase();
    return out.includes("success") || out.includes("failed") || out.includes("skipped");
  });

  if (!pendingDefense && pendingDamage) {
    const attackerActor = game.actors.get(state.attackerActorId);
    const ownerIds = game.users
      .filter(u => u.active && attackerActor?.testUserPermission(u, "OWNER"))
      .map(u => u.id);

    emitSocket(SOCKET_EVENTS.damageReady, {
      ownerIds,
      attackerName: state.attackerName,
      chatMessageId
    });
  }
}

function handleDamageReady(payload) {
  const ownerIds = Array.isArray(payload.ownerIds) ? payload.ownerIds : [];
  if (!ownerIds.includes(game.user.id)) return;

  new Dialog({
    title: "Damage Ready",
    content: `<p>All defense rolls are resolved for <b>${payload.attackerName}</b>.</p>
              <p>Run damage workflow now?</p>`,
    buttons: {
      run: { label: "Run Damage", callback: async () => runStep("damage") },
      later: { label: "Later" }
    },
    default: "run"
  }).render(true);
}

async function openLauncher() {
  const choice = await new Promise(resolve => {
    new Dialog({
      title: "Warhammer 40k Cogitator",
      content: `<p>Select workflow step:</p>`,
      buttons: {
        attack: { label: "Attack", callback: () => resolve("attack") },
        defense: { label: "Defense", callback: () => resolve("defense") },
        damage: { label: "Damage", callback: () => resolve("damage") },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "attack"
    }).render(true, { width: 420 });
  });

  if (!choice) return;
  await runStep(choice);
}

async function runStep(step) {
  const macroName = getConfiguredMacroName(step);
  const macro = game.macros.getName(macroName);
  if (!macro) {
    ui.notifications.warn(`Warhammer 40k Cogitator: Macro not found: ${macroName}`);
    return;
  }
  await macro.execute();
}

function getConfiguredMacroName(step) {
  if (step === "attack") return game.settings.get(COGITATOR_ID, SETTINGS.attackMacroName);
  if (step === "defense") return game.settings.get(COGITATOR_ID, SETTINGS.defenseMacroName);
  if (step === "damage") return game.settings.get(COGITATOR_ID, SETTINGS.damageMacroName);
  return game.settings.get(COGITATOR_ID, SETTINGS.masterMacroName);
}

async function ensureWorkflowMacros() {
  if (!game.user.isGM) return;

  const mapping = [
    ["attack", DEFAULT_MACROS.attack],
    ["defense", DEFAULT_MACROS.defense],
    ["damage", DEFAULT_MACROS.damage],
    ["master", DEFAULT_MACROS.master]
  ];

  const folder = await ensureMacroFolder();

  for (const [step, data] of mapping) {
    const configuredName = getConfiguredMacroName(step);
    const script = await loadBundledMacroScript(data.file);
    if (!script) {
      ui.notifications.warn(`Warhammer 40k Cogitator: Could not load bundled script ${data.file}`);
      continue;
    }

    let macro = game.macros.getName(configuredName);
    if (!macro) {
      macro = await Macro.create({
        name: configuredName,
        type: "script",
        scope: "global",
        command: script,
        img: "icons/svg/d20-black.svg",
        folder: folder?.id ?? null
      });

      ui.notifications.info(`Warhammer 40k Cogitator: Created macro '${configuredName}'.`);
      continue;
    }

    const updateData = {};
    if (String(macro.command ?? "") !== String(script ?? "")) updateData.command = script;
    if (folder?.id && macro.folder?.id !== folder.id) updateData.folder = folder.id;

    if (Object.keys(updateData).length) {
      await macro.update(updateData);
      ui.notifications.info(`Warhammer 40k Cogitator: Updated macro '${configuredName}'.`);
    }
  }
}


async function ensureMacroFolder() {
  const existing = game.folders.find(f => f.type === "Macro" && f.name === MACRO_FOLDER_NAME);
  if (existing) return existing;

  return Folder.create({
    name: MACRO_FOLDER_NAME,
    type: "Macro",
    color: "#7f5af0"
  });
}

async function loadBundledMacroScript(relativePath) {
  try {
    const modulePath = `/modules/${COGITATOR_ID}/${relativePath}`;
    const response = await fetch(modulePath);
    if (!response.ok) return null;
    return await response.text();
  } catch (err) {
    console.error("Warhammer 40k Cogitator | Failed to load bundled macro", relativePath, err);
    return null;
  }
}
