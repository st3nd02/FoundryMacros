const COGITATOR_ID = "warhammer-40k-cogitator";

const SETTINGS = {
  attackMacroName: "attackMacroName",
  defenseMacroName: "defenseMacroName",
  damageMacroName: "damageMacroName",
  masterMacroName: "masterMacroName",
  autoCreateMacros: "autoCreateMacros",
  workflowHudEnabled: "workflowHudEnabled",
  workflowHudLocked: "workflowHudLocked",
  workflowHudPosX: "workflowHudPosX",
  workflowHudPosY: "workflowHudPosY"
};

const SOCKET_EVENTS = {
  requestDefense: "requestDefense",
  defenseResolved: "defenseResolved",
  damageReady: "damageReady",
  damageResolved: "damageResolved",
  clearWorkflowContexts: "clearWorkflowContexts",
  mirrorAttackReady: "mirrorAttackReady"
};

const WORKFLOW_NS = "warhammer-40k-cogitator";
const WORKFLOW_KEY = "dh2eExternalWorkflow";
const MACRO_FOLDER_NAME = "Warhammer 40k Cogitator";
const REACTION_FLAG = "reactionUsedForDefense";
const REACTION_COUNT_FLAG = "reactionUsedForDefenseCount";
const REACTION_EFFECT_NAME = "Reaction Used";
const REACTION_EFFECT_ICON = "icons/svg/lightning.svg";
const USED_EVASION_EFFECT_ID = "ce-used-evasion";
const DEVASTATING_ASSAULT_EFFECT_ID = "ce-devastating-assault";
const DEVASTATING_ASSAULT_EFFECT_NAME = "Devastating Assault";
const DOUBLE_TAP_EFFECT_ID = "ce-double-tap";
const DOUBLE_TAP_EFFECT_NAME = "Double Tap";
const WEAPON_RECHARGING_EFFECT_ID = "weapon-recharging";
const WEAPON_RECHARGING_EFFECT_NAME = "Weapon Recharging";
let cogitatorSocket = null;
let pendingDefenseContext = null;
let pendingDamageContext = null;
let pendingAttackContext = null;
const recentDefensePromptKeys = new Map();
let workflowHud = null;

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
  },
  gmMaster: {
    name: "DH2e External GM Master Workflow",
    file: "macros/dh2e_external_gm_master_workflow.js"
  },
  applyDamage: {
    name: "DH2e External Apply Damage Workflow",
    file: "macros/dh2e_external_apply_damage_workflow.js"
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

  game.settings.register(COGITATOR_ID, SETTINGS.workflowHudEnabled, {
    name: "Enable Persistent Workflow HUD",
    hint: "Show a movable workflow button bar on the canvas.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => refreshWorkflowHud()
  });

  game.settings.register(COGITATOR_ID, SETTINGS.workflowHudLocked, {
    name: "Lock Workflow HUD Position",
    hint: "Lock the workflow HUD so it cannot be dragged.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => refreshWorkflowHud()
  });

  game.settings.register(COGITATOR_ID, SETTINGS.workflowHudPosX, {
    name: "Workflow HUD Position X",
    scope: "client",
    config: false,
    type: Number,
    default: 24
  });

  game.settings.register(COGITATOR_ID, SETTINGS.workflowHudPosY, {
    name: "Workflow HUD Position Y",
    scope: "client",
    config: false,
    type: Number,
    default: 24
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
    openCharacteristicTest,
    ensureWorkflowMacros,
    runStep,
    emitSocket,
    submitDefenseResult,
    getDefenseRecipients,
    hasDefenseReaction,
    consumeDefenseReaction,
    clearDefenseReaction,
    setPendingDefenseContext,
    consumePendingDefenseContext,
    promptDefenseRequest,
    setPendingDamageContext,
    consumePendingDamageContext,
    submitDamageResult,
    setPendingAttackContext,
    consumePendingAttackContext,
    applyDevastatingAssaultEffect,
    applyDoubleTapEffect,
    clearDoubleTapEffect,
    applyWeaponRechargingEffect,
    refreshWorkflowHud
  };

  initializeSocketlib();
  registerSocketHandlers();
  registerCombatHooks();

  if (game.settings.get(COGITATOR_ID, SETTINGS.autoCreateMacros)) {
    await ensureWorkflowMacros();
  }

  Hooks.on("canvasReady", () => refreshWorkflowHud());
  Hooks.on("canvasTearDown", () => removeWorkflowHud());
  refreshWorkflowHud();

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

  const clearedBits = [];
  if (pendingDefenseContext) clearedBits.push("defense pending context");
  if (pendingDamageContext) clearedBits.push("damage pending context");
  if (pendingAttackContext) clearedBits.push("apply damage pending context");
  if (game.dh2eLastDamage?.targetTokenUuid || game.dh2eLastDamage?.hitsData?.length) {
    clearedBits.push("legacy apply damage payload");
    game.dh2eLastDamage = null;
  }

  let expiredDefenseCount = 0;
  let expiredDamageCount = 0;
  let expiredApplyCount = 0;

  clearLocalWorkflowContexts();
  emitSocket(SOCKET_EVENTS.clearWorkflowContexts, {});

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
        expiredDefenseCount += 1;
        target.defenseOutcome = "Expired (round advanced)";
        target.defenseRoll = null;
        target.defenseAction = null;
        target.defenseDegrees = 0;
        target.defenseSuccess = false;
      }

      if (!target.damageResolved) {
        expiredDamageCount += 1;
        target.damageResolved = true;
        target.damageSummary = "<div><b>Damage:</b> Expired (round advanced)</div>";
        target.damageRolls = [];
      }

      if (!target.damageApplied) {
        expiredApplyCount += 1;
      }
      target.damageApplied = true;
      target.applySummary = "<div><b>Application:</b> Expired (round advanced)</div>";
      target.damageApplicationData = null;

      target.allocatedHits = 0;
    }

    state.statusText = "Expired (round advanced)";

    await message.update({
      content: buildWorkflowHtml(state),
      flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: state } }
    });
  }

  if (expiredDefenseCount) clearedBits.push(`${expiredDefenseCount} pending defense result(s)`);
  if (expiredDamageCount) clearedBits.push(`${expiredDamageCount} pending damage result(s)`);
  if (expiredApplyCount) clearedBits.push(`${expiredApplyCount} pending apply-damage result(s)`);

  if (clearedBits.length) {
    await ChatMessage.create({
      speaker: { alias: "System" },
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      whisper: ChatMessage.getWhisperRecipients("GM").map(user => user.id),
      content: `<b>Round advanced:</b> cleared ${clearedBits.join(", ")}.`
    });
  }
}

function hasDefenseReaction(actor) {
  if (!actor) return false;
  if (!isCombatTurnTrackingActive(actor)) return false;
  const used = getUsedDefenseReactions(actor);
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
  const fromFlags = Number(actor.getFlag(COGITATOR_ID, REACTION_COUNT_FLAG) ?? (actor.getFlag(COGITATOR_ID, REACTION_FLAG) ? 1 : 0));
  const fromEffects = getUsedEvasionStackCount(actor);
  return Math.max(fromFlags, fromEffects);
}

function getUsedEvasionStackCount(actor) {
  if (!actor) return 0;

  const usedEvasionEffects = actor.effects.filter(effect => {
    const statusValues = Array.isArray(effect.statuses)
      ? effect.statuses
      : Array.from(effect.statuses ?? []);
    const statusIds = statusValues.map(status => String(status ?? '').toLowerCase());
    const coreStatus = String(effect.flags?.core?.statusId ?? '').toLowerCase();
    const effectName = String(effect.name ?? '').toLowerCase();
    const effectId = String(effect.flags?.['dfreds-convenient-effects']?.effectId ?? '').toLowerCase();
    return statusIds.includes(USED_EVASION_EFFECT_ID) || coreStatus === USED_EVASION_EFFECT_ID || effectId === USED_EVASION_EFFECT_ID || effectName.includes('used evasion');
  });

  if (!usedEvasionEffects.length) return 0;

  return usedEvasionEffects.reduce((total, effect) => {
    const counter = Number(
      effect.flags?.statuscounter?.counter?.value
      ?? effect.flags?.statuscounter?.counter
      ?? effect.flags?.statusIconCounters?.value
      ?? effect.flags?.statusIconCounters?.counter
      ?? effect.flags?.['status-icon-counters']?.value
      ?? effect.flags?.['status-icon-counters']?.counter
      ?? effect.flags?.['status-icon-counter']?.value
      ?? effect.flags?.['status-icon-counter']?.counter
      ?? effect.flags?.convenientDescription?.counter
      ?? 0
    );
    return total + (Number.isFinite(counter) && counter > 0 ? counter : 1);
  }, 0);
}


function canModifyActorEffects(actor) {
  if (!actor) return false;
  if (game.user.isGM) return true;
  return actor.isOwner;
}

async function consumeDefenseReaction(actor) {
  if (!actor) return;
  if (!isCombatTurnTrackingActive(actor)) return;
  if (!canModifyActorEffects(actor)) return;
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
  await applyUsedEvasionEffect(actor, nextUsed);
}

async function clearDefenseReaction(actor) {
  if (!actor) return;
  if (!canModifyActorEffects(actor)) return;
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

async function applyUsedEvasionEffect(actor, counter = null) {
  if (!actor) return;
  await addConvenientEffectToActor({ actorUuid: actor.uuid, effectId: USED_EVASION_EFFECT_ID, effectName: "Used Evasion", counter });
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

  await removeConvenientEffectFromActor({ actorUuid: actor.uuid, effectId: USED_EVASION_EFFECT_ID, effectName: "Used Evasion" });
}

async function applyDevastatingAssaultEffect(actor) {
  if (!actor) return false;
  return addConvenientEffectToActor({ actorUuid: actor.uuid, effectId: DEVASTATING_ASSAULT_EFFECT_ID, effectName: DEVASTATING_ASSAULT_EFFECT_NAME });
}

async function applyDoubleTapEffect(actor) {
  if (!actor) return false;
  return addConvenientEffectToActor({ actorUuid: actor.uuid, effectId: DOUBLE_TAP_EFFECT_ID, effectName: DOUBLE_TAP_EFFECT_NAME });
}

async function clearDoubleTapEffect(actor) {
  if (!actor) return false;
  await removeConvenientEffectFromActor({ actorUuid: actor.uuid, effectId: DOUBLE_TAP_EFFECT_ID, effectName: DOUBLE_TAP_EFFECT_NAME });
  return true;
}

async function applyWeaponRechargingEffect(actor) {
  if (!actor) return false;
  return addConvenientEffectToActor({ actorUuid: actor.uuid, effectId: WEAPON_RECHARGING_EFFECT_ID, effectName: WEAPON_RECHARGING_EFFECT_NAME });
}

function initializeSocketlib() {
  if (!globalThis.socketlib?.registerModule) return;
  cogitatorSocket = globalThis.socketlib.registerModule(COGITATOR_ID);
  cogitatorSocket.register("socketApplyDefenseResult", socketApplyDefenseResult);
  cogitatorSocket.register("socketApplyDamageResult", socketApplyDamageResult);
  cogitatorSocket.register("socketHandleDefenseRequest", socketHandleDefenseRequest);
  cogitatorSocket.register("socketHandleDamageReady", socketHandleDamageReady);
  cogitatorSocket.register("socketHandleMirrorAttackReady", socketHandleMirrorAttackReady);
  cogitatorSocket.register("socketClearWorkflowContexts", socketClearWorkflowContexts);
  cogitatorSocket.register("socketAddConvenientEffect", socketAddConvenientEffect);
}

async function socketApplyDefenseResult(payload) {
  if (!game.user.isGM) throw new Error("Only a GM may apply defense results.");
  assertDefenseResolverAuthorized(payload);
  await applyDefenseResult(payload);
  return { ok: true, mode: "socketlib-gm" };
}

async function socketApplyDamageResult(payload) {
  if (!game.user.isGM) throw new Error("Only a GM may apply damage results.");
  assertDamageResolverAuthorized(payload);
  await applyDamageResult(payload);
  return { ok: true, mode: "socketlib-gm" };
}

async function socketHandleDefenseRequest(payload) {
  await handleDefenseRequest(payload);
}

function socketHandleDamageReady(payload) {
  handleDamageReady(payload);
}

function socketHandleMirrorAttackReady(payload) {
  handleMirrorAttackReady(payload);
}

function socketClearWorkflowContexts() {
  clearLocalWorkflowContexts();
}

async function socketAddConvenientEffect(payload) {
  if (!game.user.isGM) throw new Error("Only a GM may apply effects.");
  return addConvenientEffectToActorLocal(payload);
}

async function addConvenientEffectToActor(payload) {
  if (!payload?.actorUuid) return false;
  if (game.user.isGM || !cogitatorSocket) {
    return addConvenientEffectToActorLocal(payload);
  }
  return cogitatorSocket.executeAsGM("socketAddConvenientEffect", payload);
}

async function addConvenientEffectToActorLocal({ actorUuid, effectId, effectName, counter = null }) {
  const actor = await resolveActorFromUuid(actorUuid);
  if (!actor) return false;

  const effectInterface = game.dfreds?.effectInterface;
  let applied = false;
  if (effectInterface?.addEffect) {
    const paramsByPriority = [
      { effectId, uuid: actor.uuid },
      { effectId, uuids: [actor.uuid] },
      { effectName, uuid: actor.uuid },
      { effectName, uuids: [actor.uuid] }
    ].filter(params => params.effectId || params.effectName);

    for (const params of paramsByPriority) {
      try {
        await effectInterface.addEffect(params);
        applied = true;
        break;
      } catch (_) {
        // Continue trying signatures for CE compatibility.
      }
    }
  }

  if (!applied && canModifyActorEffects(actor)) {
    const existing = findActorEffect(actor, effectId, effectName);
    if (!existing) {
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: effectName || effectId || "Status Effect",
        img: "icons/svg/aura.svg",
        icon: "icons/svg/aura.svg",
        transfer: false,
        disabled: false
      }]);
    }
    applied = true;
  }

  if (applied && Number.isFinite(Number(counter)) && Number(counter) > 0) {
    const activeEffect = findActorEffect(actor, effectId, effectName);
    if (activeEffect) {
      const numericCounter = Number(counter);
      await activeEffect.update({
        "flags.statuscounter.counter": { value: numericCounter },
        "flags.statusIconCounters.counter": numericCounter,
        "flags.statusIconCounters.value": numericCounter,
        "flags.status-icon-counters.counter": numericCounter,
        "flags.status-icon-counters.value": numericCounter
      });
    }
  }

  return applied;
}

async function removeConvenientEffectFromActor({ actorUuid, effectId, effectName }) {
  if (!actorUuid) return;
  const actor = await resolveActorFromUuid(actorUuid);
  if (!actor) return;

  const effectInterface = game.dfreds?.effectInterface;
  if (effectInterface?.removeEffect) {
    const paramsByPriority = [
      { effectId, uuid: actor.uuid },
      { effectId, uuids: [actor.uuid] },
      { effectName, uuid: actor.uuid },
      { effectName, uuids: [actor.uuid] }
    ].filter(params => params.effectId || params.effectName);

    for (const params of paramsByPriority) {
      try {
        await effectInterface.removeEffect(params);
        break;
      } catch (_) {
        // Continue trying signatures for CE compatibility.
      }
    }
  }
}

async function resolveActorFromUuid(actorUuid) {
  if (!actorUuid) return null;
  const resolved = await fromUuid(actorUuid);
  if (!resolved) return null;
  if (resolved.documentName === "Actor") return resolved;
  if (resolved.actor?.documentName === "Actor") return resolved.actor;
  if (resolved.baseActor?.documentName === "Actor") return resolved.baseActor;
  return null;
}

function findActorEffect(actor, effectId, effectName) {
  const effectIdLc = String(effectId ?? "").toLowerCase();
  const effectNameLc = String(effectName ?? "").toLowerCase();
  return actor.effects.find(effect => {
    const statusValues = Array.isArray(effect.statuses) ? effect.statuses : Array.from(effect.statuses ?? []);
    const statusIds = statusValues.map(status => String(status ?? "").toLowerCase());
    const coreStatus = String(effect.flags?.core?.statusId ?? "").toLowerCase();
    const ceId = String(effect.flags?.["dfreds-convenient-effects"]?.effectId ?? "").toLowerCase();
    const name = String(effect.name ?? "").toLowerCase();

    if (effectIdLc && (statusIds.includes(effectIdLc) || coreStatus === effectIdLc || ceId === effectIdLc || name === effectIdLc)) return true;
    if (effectNameLc && name === effectNameLc) return true;
    return false;
  });
}

function getDefenseRecipients(targetDocumentOrActor) {
  const actor = resolveActorForOwnership(targetDocumentOrActor);
  const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

  const activePlayerOwners = game.users
    .filter(user => user.active && !user.isGM)
    .filter(user => actor?.testUserPermission(user, ownerLevel));
  const activeGMs = game.users.filter(user => user.active && user.isGM);

  if (activePlayerOwners.length) {
    const controllingOwners = activePlayerOwners.filter(user => user.character?.id === actor?.id);
    const baseRecipients = controllingOwners.length ? controllingOwners : activePlayerOwners;
    return [...new Map([...baseRecipients, ...activeGMs].map(user => [user.id, user])).values()];
  }

  return activeGMs;
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
      return;
    }

    if (packet.event === SOCKET_EVENTS.damageResolved) {
      void handleDamageResolved(packet.payload);
      return;
    }

    if (packet.event === SOCKET_EVENTS.clearWorkflowContexts) {
      clearLocalWorkflowContexts();
      return;
    }

    if (packet.event === SOCKET_EVENTS.mirrorAttackReady) {
      handleMirrorAttackReady(packet.payload);
    }
  });
}

function clearLocalWorkflowContexts() {
  pendingDefenseContext = null;
  pendingDamageContext = null;
  pendingAttackContext = null;
  recentDefensePromptKeys.clear();
}

function emitSocket(event, payload) {
  if (cogitatorSocket) {
    const ownerIds = Array.isArray(payload?.ownerIds) ? payload.ownerIds : [];
    if (event === SOCKET_EVENTS.requestDefense) {
      if (ownerIds.includes(game.user.id)) {
        void handleDefenseRequest(payload);
      }
      void cogitatorSocket.executeForUsers("socketHandleDefenseRequest", ownerIds.filter(id => id !== game.user.id), payload);
      return;
    }

    if (event === SOCKET_EVENTS.damageReady) {
      if (ownerIds.includes(game.user.id)) {
        handleDamageReady(payload);
      }
      void cogitatorSocket.executeForUsers("socketHandleDamageReady", ownerIds.filter(id => id !== game.user.id), payload);
      return;
    }

    if (event === SOCKET_EVENTS.mirrorAttackReady) {
      if (ownerIds.includes(game.user.id)) {
        handleMirrorAttackReady(payload);
      }
      void cogitatorSocket.executeForUsers("socketHandleMirrorAttackReady", ownerIds.filter(id => id !== game.user.id), payload);
      return;
    }

    if (event === SOCKET_EVENTS.clearWorkflowContexts) {
      clearLocalWorkflowContexts();
      void cogitatorSocket.executeForEveryone("socketClearWorkflowContexts");
      return;
    }
  }

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
      ? `<div style="margin-top:4px;padding:6px;border:1px solid #777;border-radius:6px;">
          <div style="font-style:italic;"><b>${t.name}</b> attempts <b>${t.defenseAction}</b> against <b>${state.attackerName}</b> with <b>${state.weaponName}</b>.</div>
          <div><b>Incoming Hits:</b> ${t.incomingHits ?? t.allocatedHits ?? 0}</div>
          <div><b>Difficulty:</b> ${t.defenseDifficultyLabel ?? "—"}</div>
          <div><b>Defense (T vs R):</b> ${outlined(t.defenseTargetNumber ?? "—", "#3aa0ff")} vs ${outlined(t.defenseRoll ?? "—", "#ff9f1a")} (${t.defenseAction} — ${t.defenseOutcome ?? "—"})</div>
          ${t.defenseNotes?.length ? `<div><b>Notes:</b> ${t.defenseNotes.join(" | ")}</div>` : ""}
          <div><b>Result:</b> ${styledDegrees(t)}</div>
        </div>`
      : `<div><b>Defense (T vs R):</b> ${outlined(t.defenseTargetNumber ?? "—", "#3aa0ff")} vs ${outlined(t.defenseRoll ?? "—", "#ff9f1a")} (${t.defenseOutcome ?? "—"})</div>`;

    const damageSummary = t.damageSummary
      ? `<div style="margin-top:4px;padding:6px;border:1px solid #777;border-radius:6px;">${t.damageSummary}</div>`
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

  ui.notifications.info(`${payload.targetName ?? "A target"}: opening Defense workflow.`);
  await runStep("defense");
}

function promptDefenseRequest(payload) {
  void handleDefenseRequest(payload);
}

function setPendingDefenseContext(payload) {
  pendingDefenseContext = payload ?? null;
}

function consumePendingDefenseContext() {
  const context = pendingDefenseContext;
  pendingDefenseContext = null;
  return context;
}

function setPendingDamageContext(payload) {
  pendingDamageContext = payload ?? null;
}

function consumePendingDamageContext() {
  const context = pendingDamageContext;
  pendingDamageContext = null;
  return context;
}

function setPendingAttackContext(payload) {
  pendingAttackContext = payload ?? null;
}

function consumePendingAttackContext() {
  const context = pendingAttackContext;
  pendingAttackContext = null;
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
    updateUserTokenTargets([tokenDoc.id]);
  }
}

function updateUserTokenTargets(tokenIds = []) {
  if (!game.user) return;

  if (typeof game.user.updateTokenTargets === "function") {
    game.user.updateTokenTargets(tokenIds);
    return;
  }

  for (const existing of Array.from(game.user.targets ?? [])) {
    existing.setTarget(false, { user: game.user, releaseOthers: false, groupSelection: true });
  }

  for (const tokenId of tokenIds) {
    const token = canvas.tokens?.get(tokenId);
    if (!token) continue;
    token.setTarget(true, { user: game.user, releaseOthers: false, groupSelection: true });
  }
}

async function submitDefenseResult({ chatMessageId, targetTokenUuid, defenseRoll, defenseOutcome, allocatedHits, defenseDetails }) {
  const canDirectUpdate = !!game.user.isGM;

  if (canDirectUpdate) {
    await applyDefenseResult({ chatMessageId, targetTokenUuid, defenseRoll, defenseOutcome, allocatedHits, defenseDetails });
    return { ok: true, mode: "gm-direct" };
  }

  if (cogitatorSocket) {
    return cogitatorSocket.executeAsGM("socketApplyDefenseResult", {
      chatMessageId,
      targetTokenUuid,
      defenseRoll,
      defenseOutcome,
      allocatedHits,
      defenseDetails,
      resolverUserId: game.user.id
    });
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
    defenseDetails,
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

async function submitDamageResult({ chatMessageId, targetTokenUuid, attackerActorId, damageResult }) {
  const message = game.messages.get(chatMessageId);
  const canDirectUpdate = !!game.user.isGM || !!message?.canUserModify?.(game.user, "update");

  if (canDirectUpdate) {
    await applyDamageResult({ chatMessageId, targetTokenUuid, damageResult });
    return { ok: true, mode: game.user.isGM ? "gm-direct" : "owner-direct" };
  }

  if (cogitatorSocket) {
    return cogitatorSocket.executeAsGM("socketApplyDamageResult", {
      chatMessageId,
      targetTokenUuid,
      attackerActorId,
      damageResult,
      resolverUserId: game.user.id
    });
  }

  const activeGMs = game.users.filter(u => u.active && u.isGM);
  if (!activeGMs.length) {
    throw new Error("No active GM is connected. Damage result cannot be applied right now.");
  }

  emitSocket(SOCKET_EVENTS.damageResolved, {
    chatMessageId,
    targetTokenUuid,
    attackerActorId,
    damageResult,
    resolverUserId: game.user.id
  });

  return { ok: true, mode: "socket" };
}

function assertDamageResolverAuthorized({ resolverUserId, attackerActorId }) {
  if (!resolverUserId) throw new Error("Damage payload missing resolver user.");
  if (!attackerActorId) throw new Error("Damage payload missing attacker actor.");

  const resolverUser = game.users.get(resolverUserId);
  if (!resolverUser) throw new Error("Damage resolver user could not be found.");
  if (resolverUser.isGM) return;

  const attackerActor = game.actors.get(attackerActorId);
  if (!attackerActor) throw new Error("Damage attacker actor could not be resolved.");
  if (!attackerActor.testUserPermission(resolverUser, "OWNER")) {
    throw new Error("Damage resolver is not an owner of the attacker actor.");
  }
}

async function handleDamageResolved(payload) {
  if (!game.user.isGM) return;
  try {
    assertDamageResolverAuthorized(payload);
    await applyDamageResult(payload);
  } catch (err) {
    console.error("Warhammer 40k Cogitator | Failed to apply damage result", err, payload);
    ui.notifications.error(`Warhammer 40k Cogitator: Failed to apply damage result (${err.message ?? err}).`);
  }
}

async function applyDamageResult({ chatMessageId, targetTokenUuid, damageResult }) {
  const message = game.messages.get(chatMessageId);
  if (!message || !damageResult) return;

  const state = foundry.utils.deepClone(message.getFlag(WORKFLOW_NS, WORKFLOW_KEY));
  if (!state?.targets?.length) return;

  const target = state.targets.find(t => (t.tokenUuid ?? t.targetTokenUuid) === targetTokenUuid);
  if (!target) return;

  target.damageRolls = Array.isArray(damageResult.hitsData)
    ? damageResult.hitsData.map(hd => ({ total: hd.damage, loc: hd.location }))
    : [];
  target.damageSummary = damageResult.damageSummary ?? target.damageSummary ?? "<div><b>Damage:</b> Resolved</div>";
  target.damageResolved = true;
  target.damageApplied = false;
  target.applySummary = null;
  target.damageApplicationData = {
    attacker: damageResult.attacker,
    target: damageResult.target,
    targetTokenUuid,
    weapon: damageResult.weapon,
    damageType: damageResult.damageType,
    penetration: damageResult.penetration,
    hits: damageResult.hits,
    hitsData: Array.isArray(damageResult.hitsData) ? damageResult.hitsData : [],
    dos: damageResult.dos,
    fury: damageResult.fury,
    properties: damageResult.properties,
    toxic: damageResult.toxic,
    flame: damageResult.flame,
    spray: damageResult.spray,
    sprayJam: damageResult.sprayJam,
    force: damageResult.force
  };

  await message.update({
    content: buildWorkflowHtml(state),
    flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: state } }
  });
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

  const target = state.targets.find(t => (t.tokenUuid ?? t.targetTokenUuid) === targetTokenUuid);
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

    if (!cogitatorSocket && ownerIds.includes(game.user.id)) {
      handleDamageReady({ ownerIds, attackerName: state.attackerName, chatMessageId });
    }
  }
}

function handleDamageReady(payload) {
  const ownerIds = Array.isArray(payload.ownerIds) ? payload.ownerIds : [];
  if (!ownerIds.includes(game.user.id)) return;

  setPendingDamageContext(payload);

  ui.notifications.info(`${payload.attackerName ?? "Attacker"}: opening Damage workflow.`);
  void runStep("damage");
}

function handleMirrorAttackReady(payload) {
  const ownerIds = Array.isArray(payload.ownerIds) ? payload.ownerIds : [];
  if (!ownerIds.includes(game.user.id)) return;

  setPendingAttackContext(payload.setup ?? null);

  new Dialog({
    title: "Devastating Assault",
    content: `<p><b>${payload.attackerName ?? "Attacker"}</b> can make a second mirrored All Out attack.</p><p>Run attack workflow now?</p>`,
    buttons: {
      run: { label: "Run Attack", callback: async () => runStep("attack") },
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
        characteristic: { label: "Characteristic Test", callback: () => resolve("characteristic") },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "attack"
    }).render(true, { width: 420 });
  });

  if (!choice) return;
  if (choice === "characteristic") {
    await openCharacteristicTest();
    return;
  }
  await runStep(choice);
}

function getWorkflowHudButtons() {
  const buttons = [
    { id: "attack", label: "Attack", action: () => runStep("attack") },
    { id: "defense", label: "Defense", action: () => runStep("defense") },
    { id: "damage", label: "Damage", action: () => runStep("damage") },
    { id: "characteristic", label: "Characteristic", action: () => openCharacteristicTest() }
  ];

  if (game.user.isGM) {
    buttons.push({ id: "applyDamage", label: "Apply Damage", action: () => runStep("applyDamage") });
  }

  return buttons;
}

function refreshWorkflowHud() {
  const enabled = game.settings.get(COGITATOR_ID, SETTINGS.workflowHudEnabled);
  if (!enabled || !canvas?.ready) {
    removeWorkflowHud();
    return;
  }

  const locked = game.settings.get(COGITATOR_ID, SETTINGS.workflowHudLocked);
  const x = Number(game.settings.get(COGITATOR_ID, SETTINGS.workflowHudPosX)) || 24;
  const y = Number(game.settings.get(COGITATOR_ID, SETTINGS.workflowHudPosY)) || 24;
  const buttons = getWorkflowHudButtons();

  if (!workflowHud) workflowHud = new WorkflowHud();
  workflowHud.render({ locked, x, y, buttons });
}

function removeWorkflowHud() {
  workflowHud?.destroy();
  workflowHud = null;
}

class WorkflowHud {
  constructor() {
    this.element = null;
    this.dragging = false;
    this.locked = false;
    this.dragOffset = { x: 0, y: 0 };
  }

  render({ locked, x, y, buttons }) {
    this.locked = Boolean(locked);

    if (!this.element) {
      this.element = document.createElement("div");
      this.element.id = "warhammer40k-cogitator-workflow-hud";
      this.element.style.position = "absolute";
      this.element.style.display = "flex";
      this.element.style.gap = "6px";
      this.element.style.padding = "8px";
      this.element.style.borderRadius = "8px";
      this.element.style.background = "rgba(12, 12, 12, 0.9)";
      this.element.style.border = "1px solid rgba(206, 206, 206, 0.45)";
      this.element.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.45)";
      this.element.style.zIndex = "95";
      this.element.style.alignItems = "center";
      this.element.style.userSelect = "none";

      this.element.addEventListener("pointerdown", event => this.onPointerDown(event));

      document.body.appendChild(this.element);
    }

    this.element.innerHTML = "";

    for (const button of buttons) {
      const buttonEl = document.createElement("button");
      buttonEl.type = "button";
      buttonEl.dataset.role = "workflow-action";
      buttonEl.textContent = button.label;
      buttonEl.style.padding = "4px 8px";
      buttonEl.style.fontSize = "12px";
      buttonEl.style.cursor = "pointer";
      buttonEl.addEventListener("click", async event => {
        event.stopPropagation();
        await button.action();
      });
      this.element.appendChild(buttonEl);
    }

    const lockButton = document.createElement("button");
    lockButton.type = "button";
    lockButton.textContent = this.locked ? "🔒" : "🔓";
    lockButton.title = this.locked ? "Unlock bar" : "Lock bar";
    lockButton.style.padding = "4px 8px";
    lockButton.style.fontSize = "12px";
    lockButton.style.cursor = "pointer";
    lockButton.addEventListener("click", async event => {
      event.stopPropagation();
      await game.settings.set(COGITATOR_ID, SETTINGS.workflowHudLocked, !this.locked);
    });
    this.element.appendChild(lockButton);

    this.element.style.left = `${Math.round(x)}px`;
    this.element.style.top = `${Math.round(y)}px`;
    this.element.style.cursor = this.locked ? "default" : "move";
  }

  onPointerDown(event) {
    if (this.locked) return;
    if (event.target.closest("button")) return;

    this.dragging = true;
    const rect = this.element.getBoundingClientRect();
    this.dragOffset = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };

    this.onPointerMoveBound = this.onPointerMove.bind(this);
    this.onPointerUpBound = this.onPointerUp.bind(this);
    window.addEventListener("pointermove", this.onPointerMoveBound);
    window.addEventListener("pointerup", this.onPointerUpBound, { once: true });
  }

  onPointerMove(event) {
    if (!this.dragging) return;

    const maxX = Math.max(window.innerWidth - this.element.offsetWidth - 8, 0);
    const maxY = Math.max(window.innerHeight - this.element.offsetHeight - 8, 0);
    const x = Math.min(Math.max(event.clientX - this.dragOffset.x, 8), maxX);
    const y = Math.min(Math.max(event.clientY - this.dragOffset.y, 8), maxY);

    this.element.style.left = `${Math.round(x)}px`;
    this.element.style.top = `${Math.round(y)}px`;
  }

  async onPointerUp() {
    this.dragging = false;
    window.removeEventListener("pointermove", this.onPointerMoveBound);

    const x = parseInt(this.element.style.left, 10) || 24;
    const y = parseInt(this.element.style.top, 10) || 24;
    await game.settings.set(COGITATOR_ID, SETTINGS.workflowHudPosX, x);
    await game.settings.set(COGITATOR_ID, SETTINGS.workflowHudPosY, y);
  }

  destroy() {
    this.dragging = false;
    if (this.onPointerMoveBound) {
      window.removeEventListener("pointermove", this.onPointerMoveBound);
    }
    this.element?.remove();
    this.element = null;
  }
}

async function askForFateReroll(actor) {
  const fateCurrent = actor.system.fate?.value ?? 0;
  if (fateCurrent <= 0) return false;

  return new Promise(resolve => {
    new Dialog({
      title: "Spend Fate?",
      content: `<p><b>Test Failed!</b><br> Spend 1 Fate Point to reroll?<br>Remaining: <b>${fateCurrent}</b></p>`,
      buttons: {
        yes: { label: "Spend Fate (-1)", callback: () => resolve(true) },
        no: { label: "Keep Result", callback: () => resolve(false) }
      },
      default: "no"
    }).render(true);
  });
}

async function openCharacteristicTest() {
  if (!canvas.tokens.controlled.length) {
    ui.notifications.warn("Select your token first.");
    return;
  }

  const actor = canvas.tokens.controlled[0].actor;

  const characteristics = {
    weaponSkill: "Weapon Skill",
    ballisticSkill: "Ballistic Skill",
    strength: "Strength",
    toughness: "Toughness",
    agility: "Agility",
    intelligence: "Intelligence",
    perception: "Perception",
    willpower: "Willpower",
    fellowship: "Fellowship",
    influence: "Influence"
  };

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

  const options = Object.entries(characteristics)
    .map(([key, label]) => `<option value="${key}">${label}</option>`)
    .join("");

  const difficultyOptions = difficulties
    .map(d => `<option value="${d.value}" ${d.value === 0 ? "selected" : ""}>${d.label}</option>`)
    .join("");

  new Dialog({
    title: "Characteristic Test",
    content: `
<form>
<div><b>Which characteristic do you want to test?</b></div>
<br><div class="form-group">
<label><b>Characteristic</b></label>
<select id="char">${options}</select>
</div>
<br>
<div class="form-group">
<label><b>Difficulty</b></label>
<select id="difficulty">
${difficultyOptions}
</select>
</div>
<br>
<div class="form-group">
<label><b>Modifier</b><br></label>
<input id="mod" type="number" value="0"/>
</div><br>

</form>
`,
    buttons: {
      roll: {
        label: "Roll Test",
        callback: async html => {
          const key = html.find("#char").val();
          const label = characteristics[key];
          const mod = Number(html.find("#mod").val());
          const difficulty = Number(html.find("#difficulty").val());
          const difficultyLabel = difficulties.find(d => d.value === difficulty)?.label ?? "";
          const base = actor.system.characteristics[key].total;

          let target = base + difficulty + mod;
          if (target < 1) target = 1;

          const displayTarget = target;
          const roll = await new Roll("1d100").roll({ async: true });
          await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }) });
          const result = roll.total;

          let dos = 0;
          let dof = 0;

          if (result <= target) dos = 1 + Math.floor((target - result) / 10);
          else dof = 1 + Math.floor((result - target) / 10);

          const unnatural = actor.system.characteristics[key].unnatural || 0;
          const unnaturalBonus = dos > 0 ? Math.floor(unnatural / 2) : 0;
          const finalDoS = dos + unnaturalBonus;
          const success = dos > 0;

          const modLine = `
<b>Difficulty:</b><i> ${difficultyLabel}</i><br>
${mod ? `<b>Modifier:</b><i> ${mod >= 0 ? "+" : ""}${mod}</i><br>` : ""}
`;

          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
<div style="text-align:center;">

<div style="font-style:italic; font-size:1.1em;">
<b>${actor.name}</b> performs a <b>${label}</b> Test
</div>

<hr>

<div style="font-size:1.0em;">${modLine}</div>

<div style="margin-top:6px;font-size:1.3em;">
Target:
<span style="
  color:#ffad55;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${displayTarget}</span>
</div>

<div style="font-size:1.4em;">
Roll:
<span style="
  color:#bd7548;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${result}</span>
</div>

${dos ? `<div style="font-weight:bold;font-size:1.3em;">
DoS:
<span style="color:#0a8f0a;text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;">
${finalDoS}
</span>
${unnaturalBonus ? `<br><span style="font-size:0.8em;color:#8fe38f; text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;">
(+${unnaturalBonus} Unnatural)
</span>` : ""}
</div>` : ""}
${dof ? `<div style="font-weight:bold;font-size:1.3em;">
DoF: <span style="color:#a00000;
text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;"> ${dof}</span><br>
</div>` : ""}

</div></div>`
          });

          if (!success && actor.system.fate?.value > 0) {
            const useFate = await askForFateReroll(actor);

            if (useFate) {
              await actor.update({ "system.fate.value": actor.system.fate.value - 1 });

              const roll2 = await new Roll("1d100").roll({ async: true });
              await roll2.toMessage({ speaker: ChatMessage.getSpeaker({ actor }) });
              const result2 = roll2.total;

              let dos2 = 0;
              let dof2 = 0;

              if (result2 <= target) dos2 = 1 + Math.floor((target - result2) / 10);
              else dof2 = 1 + Math.floor((result2 - target) / 10);

              const unnatural2 = actor.system.characteristics[key].unnatural || 0;
              const unnaturalBonus2 = dos2 > 0 ? Math.floor(unnatural2 / 2) : 0;
              const finalDoS2 = dos2 + unnaturalBonus2;

              ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor }),
                content: `
<div style="text-align:center;">
<b style="color:gold;">${actor.name} spends Fate and rerolls!</b>
<hr>
<div style="text-align:center;">

<div style="font-style:italic;font-size:1.1em;">
<b>${actor.name}</b> performs a <b>${label}</b> Test
</div>

<hr>

<div style="font-size:1.0em;">${modLine}</div>

<div style="margin-top:6px;font-size:1.3em;">
Target:
<span style="
  color:#ffad55;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${displayTarget}</span>
</div>

<div style="font-size:1.4em;">
Roll:
<span style="
  color:#bd7548;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${result2}</span>
</div>

${dos2 ? `<div style="font-weight:bold;font-size:1.3em;">
DoS:
<span style="color:#0a8f0a;text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;">
${finalDoS2}
</span>
${unnaturalBonus2 ? `<br><span style="font-size:0.8em;color:#8fe38f; text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;">
(+${unnaturalBonus2} Unnatural)
</span>` : ""}
</div>` : ""}
${dof2 ? `<div style="font-weight:bold;font-size:1.3em;">
DoF: <span style="color:#a00000;
text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;"> ${dof2}</span><br>
</div>` : ""}

</div>`
              });
            }
          }
        }
      }
    }
  }).render(true);
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
  if (step === "gmMaster") return DEFAULT_MACROS.gmMaster.name;
  if (step === "applyDamage") return DEFAULT_MACROS.applyDamage.name;
  return game.settings.get(COGITATOR_ID, getStepSettingKey(step));
}

async function ensureWorkflowMacros() {
  if (!game.user.isGM) return;

  const mapping = [
    ["attack", DEFAULT_MACROS.attack],
    ["defense", DEFAULT_MACROS.defense],
    ["damage", DEFAULT_MACROS.damage],
    ["master", DEFAULT_MACROS.master],
    ["gmMaster", DEFAULT_MACROS.gmMaster],
    ["applyDamage", DEFAULT_MACROS.applyDamage]
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
