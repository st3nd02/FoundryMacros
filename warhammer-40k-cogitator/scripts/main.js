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

const WORKFLOW_NS = "warhammer-40k-cogitator";
const WORKFLOW_KEY = "dh2eExternalWorkflow";
const MACRO_FOLDER_NAME = "Warhammer 40k Cogitator";
const REACTION_FLAG = "reactionUsedForDefense";
const REACTION_COUNT_FLAG = "reactionUsedForDefenseCount";
const REACTION_EFFECT_NAME = "Reaction Used";
const REACTION_EFFECT_ICON = "icons/svg/lightning.svg";
const USED_EVASION_EFFECT_ID = "ce-used-evasion";
let pendingDefenseContext = null;
const recentDefensePromptKeys = new Map();

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
    clearDefenseReaction,
    setPendingDefenseContext,
    consumePendingDefenseContext
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
    if ("round" in changed && game.user.isGM) {
      await clearResidualWorkflowsOnRoundChange(combat);
    }
    const actor = combat?.combatant?.actor;
    if (!actor) return;
    await clearDefenseReaction(actor);
  });
}

async function clearResidualWorkflowsOnRoundChange(combat) {
  if (!combat?.started) return;

  for (const message of game.messages.contents) {
    const state = message.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
    if (!state?.targets?.length) continue;

    const hasPending = state.targets.some(target => {
      if ((target.allocatedHits ?? 0) <= 0) return false;
      const outcome = String(target.defenseOutcome ?? "").toLowerCase();
      const defensePending = !outcome.includes("success") && !outcome.includes("failed") && !outcome.includes("skipped") && !outcome.includes("expired");
      return defensePending || !target.damageResolved;
    });

    if (!hasPending) continue;

    for (const target of state.targets) {
      const outcome = String(target.defenseOutcome ?? "").toLowerCase();
      const defensePending = !outcome.includes("success") && !outcome.includes("failed") && !outcome.includes("skipped") && !outcome.includes("expired");
      if (defensePending) {
        target.defenseOutcome = "Expired (round advanced)";
        target.defenseRoll = null;
        target.defenseAction = null;
        target.defenseDegrees = 0;
        target.defenseSuccess = false;
      }

      if (!target.damageResolved) {
        target.damageResolved = true;
        target.damageSummary = "<div><b>Damage:</b> Expired (round advanced)</div>";
        target.damageRolls = [];
      }

      target.allocatedHits = 0;
    }

    state.statusText = "Expired (round advanced)";

    await message.update({
      content: buildWorkflowHtml(state),
      flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: state } }
    });
  }
}

function hasDefenseReaction(actor) {
  if (!actor) return false;
  if (!isCombatTurnTrackingActive(actor)) return false;
  const used = Number(actor.getFlag(COGITATOR_ID, REACTION_COUNT_FLAG) ?? (actor.getFlag(COGITATOR_ID, REACTION_FLAG) ? 1 : 0));
  return used >= getDefenseReactionLimit(actor);
}

function isCombatTurnTrackingActive(actor) {
  if (!game.combat?.started) return false;
  if (!actor) return false;
  return game.combat.combatants.some(c => c.actorId === actor.id);
}

function getDefenseReactionLimit(actor) {
  if (!actor) return 1;

  const hasBonusReactionTalent = actor.items.some(item => {
    const itemName = String(item?.name ?? "").trim().toLowerCase();
    return itemName === "step aside" || itemName === "wall of steel";
  });

  return hasBonusReactionTalent ? 2 : 1;
}

function getUsedDefenseReactions(actor) {
  if (!actor) return 0;
  return Number(actor.getFlag(COGITATOR_ID, REACTION_COUNT_FLAG) ?? (actor.getFlag(COGITATOR_ID, REACTION_FLAG) ? 1 : 0));
}

async function consumeDefenseReaction(actor) {
  if (!actor) return;
  if (!isCombatTurnTrackingActive(actor)) return;
  const maxReactions = getDefenseReactionLimit(actor);
  const alreadyUsed = getUsedDefenseReactions(actor);
  if (alreadyUsed >= maxReactions) return;

  const nextUsed = Math.min(maxReactions, alreadyUsed + 1);

  const existing = actor.effects.find(e => e.getFlag(COGITATOR_ID, REACTION_FLAG));
  const effectName = `${REACTION_EFFECT_NAME} (${nextUsed}/${maxReactions})`;
  if (!existing) {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: effectName,
      img: REACTION_EFFECT_ICON,
      icon: REACTION_EFFECT_ICON,
      transfer: false,
      disabled: false,
      flags: { [COGITATOR_ID]: { [REACTION_FLAG]: true } }
    }]);
  } else {
    await existing.update({ name: effectName });
  }

  await actor.setFlag(COGITATOR_ID, REACTION_COUNT_FLAG, nextUsed);
  await actor.setFlag(COGITATOR_ID, REACTION_FLAG, true);
  await applyUsedEvasionEffect(actor);
}

async function clearDefenseReaction(actor) {
  if (!actor) return;
  if (!hasDefenseReaction(actor) && !getUsedDefenseReactions(actor)) return;

  const toDelete = actor.effects
    .filter(e => e.getFlag(COGITATOR_ID, REACTION_FLAG))
    .map(e => e.id)
    .filter(Boolean);
  if (toDelete.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
  }

  await actor.unsetFlag(COGITATOR_ID, REACTION_FLAG);
  await actor.unsetFlag(COGITATOR_ID, REACTION_COUNT_FLAG);
  await removeUsedEvasionEffect(actor);
}

async function applyUsedEvasionEffect(actor) {
  const effectInterface = game.dfreds?.effectInterface;
  if (!effectInterface?.addEffect) return;

  const paramsByPriority = [
    { effectId: USED_EVASION_EFFECT_ID, uuid: actor.uuid },
    { effectId: USED_EVASION_EFFECT_ID, uuids: [actor.uuid] },
    { effectName: USED_EVASION_EFFECT_ID, uuid: actor.uuid },
    { effectName: USED_EVASION_EFFECT_ID, uuids: [actor.uuid] }
  ];

  for (const params of paramsByPriority) {
    try {
      await effectInterface.addEffect(params);
      return;
    } catch (_) {
      // Try next signature to support different CE versions.
    }
  }
}

async function removeUsedEvasionEffect(actor) {
  if (!actor) return;

  const actorEffectsToDelete = actor.effects
    .filter(effect => {
      const statusId = String(effect.statuses?.first?.() ?? effect.flags?.core?.statusId ?? "").toLowerCase();
      const effectName = String(effect.name ?? "").toLowerCase();
      return statusId === USED_EVASION_EFFECT_ID || effectName.includes("used evasion") || effectName === USED_EVASION_EFFECT_ID;
    })
    .map(effect => effect.id)
    .filter(Boolean);

  if (actorEffectsToDelete.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", actorEffectsToDelete);
  }

  const effectInterface = game.dfreds?.effectInterface;
  if (!effectInterface?.removeEffect) return;

  if (!actorEffectsToDelete.length) return;

  const paramsByPriority = [
    { effectId: USED_EVASION_EFFECT_ID, uuid: actor.uuid },
    { effectId: USED_EVASION_EFFECT_ID, uuids: [actor.uuid] },
    { effectName: USED_EVASION_EFFECT_ID, uuid: actor.uuid },
    { effectName: USED_EVASION_EFFECT_ID, uuids: [actor.uuid] }
  ];

  for (const params of paramsByPriority) {
    try {
      await effectInterface.removeEffect(params);
      return;
    } catch (_) {
      // Try next signature to support different CE versions.
    }
  }
}

function getDefenseRecipients(targetDocumentOrActor) {
  const actor = resolveActorForOwnership(targetDocumentOrActor);
  const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

  const activePlayerOwners = game.users
    .filter(user => user.active && !user.isGM)
    .filter(user => actor?.testUserPermission(user, ownerLevel));

  if (activePlayerOwners.length) {
    const controllingOwners = activePlayerOwners.filter(user => user.character?.id === actor?.id);
    return controllingOwners.length ? controllingOwners : activePlayerOwners;
  }

  return game.users.filter(user => user.active && user.isGM);
}

function resolveActorForOwnership(documentOrActor) {
  if (!documentOrActor) return null;
  if (documentOrActor.documentName === "Actor") return documentOrActor;
  if (documentOrActor.actor) return documentOrActor.actor;
  if (documentOrActor.baseActor) return documentOrActor.baseActor;
  return null;
}

function getAttackerDamageRecipients(attackerActor) {
  if (!attackerActor) return game.users.filter(user => user.active && user.isGM);

  const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const activePlayerOwners = game.users
    .filter(user => user.active && !user.isGM)
    .filter(user => attackerActor.testUserPermission(user, ownerLevel));

  if (activePlayerOwners.length) return activePlayerOwners;
  return game.users.filter(user => user.active && user.isGM);
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

function buildWorkflowHtml(state) {
  const outlined = (text, color) => `<span style="font-weight:700;color:${color};text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;">${text}</span>`;
  const statusColor = status => {
    const normalized = String(status ?? "").toLowerCase();
    if (normalized.includes("jam")) return "#b267ff";
    if (normalized.includes("miss")) return "#ff3b3b";
    if (normalized.includes("hit") || normalized.includes("ok") || normalized.includes("out of ammo")) return "#1aff1a";
    return "#d9d9d9";
  };
  const styledAttackDegrees = () => {
    const value = Number(state.attackDegrees ?? 0);
    if (!value) return "";
    if (value > 0) return `<div>${outlined(`${value} Degrees of Success`, "#1aff1a")}</div>`;
    return `<div>${outlined(`${Math.abs(value)} Degrees of Failure`, "#ff2a2a")}</div>`;
  };
  const styledDegrees = target => {
    const value = Number(target.defenseDegrees ?? 0);
    if (!value) return "—";
    if (target.defenseSuccess) return outlined(`${value} Degrees of Success`, "#1aff1a");
    return outlined(`${value} Degrees of Failure`, "#ff2a2a");
  };

  const cards = (state.targets ?? []).map(t => {
    const sizeTxt = t.sizeIgnored ? `${t.sizeLabel} (Black Carapace ignores)` : `${t.sizeLabel} ${t.sizeMod >= 0 ? "+" : ""}${t.sizeMod}`;
    const dmgTxt = (t.damageRolls ?? []).map(d => `${d.total} ${d.loc}`).join(", ") || "—";
    const defenseSummary = t.defenseAction
      ? `<div style="margin-top:4px;padding:6px;border:1px solid #777;border-radius:6px;background:#151515;">
          <div style="font-style:italic;"><b>${t.name}</b> attempts <b>${t.defenseAction}</b> against <b>${state.attackerName}</b> with <b>${state.weaponName}</b>.</div>
          <div><b>Incoming Hits:</b> ${t.incomingHits ?? t.allocatedHits ?? 0}</div>
          <div><b>Difficulty:</b> ${t.defenseDifficultyLabel ?? "—"}</div>
          <div><b>Target:</b> ${outlined(t.defenseTargetNumber ?? "—", "#3aa0ff")} | <b>Roll:</b> ${outlined(t.defenseRoll ?? "—", "#ff9f1a")}</div>
          ${t.defenseNotes?.length ? `<div><b>Notes:</b> ${t.defenseNotes.join(" | ")}</div>` : ""}
          <div><b>Result:</b> ${styledDegrees(t)}</div>
        </div>`
      : `<div><b>Defense:</b> ${t.defenseRoll ?? "—"} (${t.defenseOutcome ?? "—"})</div>`;

    const damageSummary = t.damageSummary
      ? `<div style="margin-top:4px;padding:6px;border:1px solid #777;border-radius:6px;background:#11131a;">${t.damageSummary}</div>`
      : `<div><b>Damage:</b> ${dmgTxt}</div>`;

    return `<div style="border:1px solid #555;border-radius:6px;padding:6px;margin:6px 0;">
      <div><b>${t.name}</b></div>
      <div><b>Dist:</b> ${t.distanceMeters}m | <b>Range:</b> ${t.rangeLabel} | <b>Size:</b> ${sizeTxt}</div>
      <div><b>TN:</b> ${outlined(t.targetNumber, "#3aa0ff")} | <b>Hits:</b> ${t.allocatedHits}</div>
      ${defenseSummary}
      ${damageSummary}
    </div>`;
  }).join("");

  return `<div data-workflow-id="${state.id}">
    <div style="margin:0 0 6px 0;font-size:1.05em;font-style:italic;"><b>${state.attackerName}</b> attacks with <b>${state.weaponName}</b></div>
    <div><b>Mode:</b> ${state.modeLabel} | <b>Power:</b> ${state.powerModeLabel} | <b>Aim:</b> ${state.aimLabel} | <b>Craftsmanship:</b> ${state.craftName}</div>
    <div><b>Modifiers:</b> ${state.modifierNotes?.join(", ") || "None"}</div>
    <div><b>Talents/Items:</b> ${state.selectedTalents?.join(", ") || "None"}</div>
    <div><b>Attack Roll:</b> ${outlined(state.attackRoll ?? "—", "#ff9f1a")} | <b>Status:</b> ${outlined(state.statusText ?? "Pending", statusColor(state.statusText))}</div>
    <div style="font-size:1.1em;"><b>Total Hits:</b> ${state.totalHits ?? 0}</div>
    ${state.extraText ? `<div><b>Notes:</b> ${state.extraText}</div>` : ""}
    ${styledAttackDegrees()}
    <hr>${cards}
  </div>`;
}

async function handleDefenseRequest(payload) {
  const ownerIds = Array.isArray(payload.ownerIds) ? payload.ownerIds : [];
  if (!ownerIds.includes(game.user.id)) return;

  const dedupeKey = `${payload.chatMessageId ?? ""}:${payload.targetTokenUuid ?? ""}`;
  if (dedupeKey !== ":") {
    const now = Date.now();
    const lastPromptAt = recentDefensePromptKeys.get(dedupeKey) ?? 0;
    if (now - lastPromptAt < 3000) return;
    recentDefensePromptKeys.set(dedupeKey, now);
  }

  setPendingDefenseContext(payload);
  await focusDefenseTarget(payload.targetTokenUuid);
  ui.notifications.info(`Defense requested for ${payload.targetName}. Opening defense workflow.`);
  await runStep("defense");
}

function setPendingDefenseContext(payload) {
  pendingDefenseContext = payload ?? null;
}

function consumePendingDefenseContext() {
  const context = pendingDefenseContext;
  pendingDefenseContext = null;
  return context;
}

async function focusDefenseTarget(targetTokenUuid) {
  if (!targetTokenUuid) return;

  const tokenDoc = await fromUuid(targetTokenUuid);
  const tokenObject = tokenDoc?.object;
  if (!tokenObject) return;

  tokenObject.control({ releaseOthers: true });

  if (tokenObject.center) {
    await canvas.animatePan({ x: tokenObject.center.x, y: tokenObject.center.y, duration: 250 });
  }

  if (tokenDoc.id) {
    game.user.updateTokenTargets([tokenDoc.id]);
  }
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

async function applyDefenseResult({ chatMessageId, targetTokenUuid, defenseRoll, defenseOutcome, allocatedHits, defenseDetails }) {
  const message = game.messages.get(chatMessageId);
  if (!message) return;

  const state = foundry.utils.deepClone(message.getFlag(WORKFLOW_NS, WORKFLOW_KEY));
  if (!state?.targets?.length) return;

  const target = state.targets.find(t => t.tokenUuid === targetTokenUuid);
  if (!target) return;

  target.defenseRoll = defenseRoll;
  target.defenseOutcome = defenseOutcome;
  target.allocatedHits = Math.max(0, Number(allocatedHits ?? 0));
  if (defenseDetails) {
    target.defenseAction = defenseDetails.actionText ?? null;
    target.incomingHits = Number(defenseDetails.incomingHits ?? target.incomingHits ?? target.allocatedHits ?? 0);
    target.defenseDifficultyLabel = defenseDetails.difficultyLabel ?? null;
    target.defenseTargetNumber = defenseDetails.targetNumber ?? null;
    target.defenseNotes = Array.isArray(defenseDetails.notes) ? defenseDetails.notes : [];
    target.defenseDegrees = Number(defenseDetails.degrees ?? 0);
    target.defenseSuccess = !!defenseDetails.success;
  }

  await message.update({
    content: buildWorkflowHtml(state),
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
    const ownerIds = getAttackerDamageRecipients(attackerActor).map(u => u.id);

    emitSocket(SOCKET_EVENTS.damageReady, {
      ownerIds,
      attackerName: state.attackerName,
      chatMessageId
    });

    if (ownerIds.includes(game.user.id)) {
      handleDamageReady({ ownerIds, attackerName: state.attackerName, chatMessageId });
    }
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
  const { macro, configuredName } = resolveStepMacro(step);
  if (!macro) {
    ui.notifications.warn(`Warhammer 40k Cogitator: Macro not found. Checked: ${getMacroLookupNames(step).join(", ")}`);
    return;
  }

  if (configuredName && macro.name !== configuredName && game.user.isGM) {
    await game.settings.set(COGITATOR_ID, getStepSettingKey(step), macro.name);
  }

  await macro.execute();
}

function resolveStepMacro(step) {
  const configuredName = getConfiguredMacroName(step);
  const lookupNames = getMacroLookupNames(step);
  const candidates = lookupNames
    .map(name => game.macros.getName(name))
    .filter(Boolean);

  if (!candidates.length) return { macro: null, configuredName };

  const preferred = candidates.find(isCurrentWorkflowMacro) ?? candidates[0];
  return { macro: preferred, configuredName };
}

function isCurrentWorkflowMacro(macro) {
  const command = String(macro?.command ?? "");
  return command.includes("DH2e External") && command.includes("Foundry V13");
}

function getMacroLookupNames(step) {
  const names = [getConfiguredMacroName(step), DEFAULT_MACROS[step]?.name];

  if (step === "attack") names.push("dh2e_external_attack_workflow");
  if (step === "defense") names.push("dh2e_external_defense_workflow");
  if (step === "damage") names.push("dh2e_external_damage_workflow");
  if (step === "master") names.push("dh2e_external_master_workflow");

  return [...new Set(names.filter(Boolean))];
}

function getStepSettingKey(step) {
  if (step === "attack") return SETTINGS.attackMacroName;
  if (step === "defense") return SETTINGS.defenseMacroName;
  if (step === "damage") return SETTINGS.damageMacroName;
  return SETTINGS.masterMacroName;
}

function getConfiguredMacroName(step) {
  return game.settings.get(COGITATOR_ID, getStepSettingKey(step));
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
