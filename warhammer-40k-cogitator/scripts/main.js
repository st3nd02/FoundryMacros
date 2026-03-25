import { runAttackWorkflow } from "./workflows/dh2e_external_attack_workflow.js";
import { runDefenseWorkflow } from "./workflows/dh2e_external_defense_workflow.js";
import { runDamageWorkflow } from "./workflows/dh2e_external_damage_workflow.js";
import { runApplyDamageWorkflow } from "./workflows/dh2e_external_apply_damage_workflow.js";
import { runPsychicPowerWorkflow } from "./workflows/dh2e_external_psychic_workflow.js";

const COGITATOR_ID = "warhammer-40k-cogitator";
const COGITATOR_VERSION = "2.1.55";

const SETTINGS = {
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
const REACTION_FLAG = "reactionUsedForDefense";
const REACTION_COUNT_FLAG = "reactionUsedForDefenseCount";
const USED_EVASION_EFFECT_ID = "ce-(whc)-used-evasion";
const DEVASTATING_ASSAULT_EFFECT_ID = "ce-devastating-assault";
const DEVASTATING_ASSAULT_EFFECT_NAME = "Devastating Assault";
const DOUBLE_TAP_EFFECT_ID = "ce-(whc)-double-tap";
const DOUBLE_TAP_EFFECT_NAME = "Double Tap";
const WEAPON_RECHARGING_EFFECT_ID = "ce-(whc)-weapon-recharging";
const WEAPON_RECHARGING_EFFECT_NAME = "Weapon Recharging";
const FORCE_FIELD_ACTIVE_EFFECT_ID = "ce-(whc)-force-field-active";
const FORCE_FIELD_OVERLOADED_EFFECT_ID = "ce-(whc)-force-field-overloaded";
const FORCE_FIELD_ACTIVE_EFFECT_NAME = "Force Field Active";
const FORCE_FIELD_OVERLOADED_EFFECT_NAME = "Force Field Overloaded";
let cogitatorSocket = null;
let pendingDefenseContext = null;
let pendingDamageContext = null;
let pendingAttackContext = null;
const recentDefensePromptKeys = new Map();
let workflowHud = null;
const healingRollHistory = [];

Hooks.once("init", () => {
  console.log(`Warhammer 40k Cogitator v${COGITATOR_VERSION} | Initializing`);

  game.settings.registerMenu(COGITATOR_ID, "workflowHudResetMenu", {
    name: "Reset Workflow HUD Position",
    label: "Center HUD",
    hint: "Reset the workflow HUD to the center of your screen.",
    icon: "fas fa-crosshairs",
    type: WorkflowHudResetMenu,
    restricted: false
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
    openFearTest,
    openSkillTest,
    openMedicalTest,
    openHealingFlow,
    openFateRestore,
    openFatigueManager,
    openAmmoReload,
    runPsychicPowerWorkflow,
    openForceFieldCheck,
    resolveForceFieldIntercept,
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
    addConvenientEffectToActor,
    refreshWorkflowHud
  };

  initializeSocketlib();
  registerSocketHandlers();
  registerCombatHooks();
  reportLegacyMacroSettings();

  Hooks.on("canvasReady", () => refreshWorkflowHud());
  Hooks.on("renderSceneControls", () => refreshWorkflowHud());
  Hooks.on("canvasTearDown", () => removeWorkflowHud());
  refreshWorkflowHud();

  console.log(`Warhammer 40k Cogitator v${COGITATOR_VERSION} | Ready`);
});

function registerCombatHooks() {
  Hooks.on("updateCombat", async (combat, changed) => {
    if (!("turn" in changed) && !("round" in changed)) return;
    if ("round" in changed && game.user.isGM) {
      await clearResidualWorkflowsOnRoundChange(combat);
    }
    const actor = getUpdatedCombatTurnActor(combat, changed);
    if (!actor) return;
    await clearDefenseReaction(actor);
    await applyBleedingTurnStartFatigue(actor);
    await clearExpiredTurnStartEffects(actor);
  });
}

function getUpdatedCombatTurnActor(combat, changed) {
  if (!combat) return null;

  const changedTurn = Number(changed?.turn);
  if (Number.isInteger(changedTurn) && changedTurn >= 0) {
    return combat.turns?.[changedTurn]?.actor ?? null;
  }

  return combat.combatant?.actor ?? null;
}

const TURN_START_EXPIRING_EFFECT_NAMES = new Set(["stunned", "blinded", "deafened", "defeaned"]);

function isTurnStartExpiringEffect(effect) {
  if (!effect) return false;

  const statusValues = Array.isArray(effect.statuses)
    ? effect.statuses
    : Array.from(effect.statuses ?? []);
  const normalizedStatuses = statusValues.map(status => String(status ?? "").trim().toLowerCase());
  const coreStatus = String(effect.flags?.core?.statusId ?? "").trim().toLowerCase();
  const ceStatus = String(effect.flags?.["dfreds-convenient-effects"]?.effectId ?? "").trim().toLowerCase();
  const normalizedName = String(effect.name ?? "").trim().toLowerCase();

  if (normalizedStatuses.some(status => TURN_START_EXPIRING_EFFECT_NAMES.has(status))) return true;
  if (TURN_START_EXPIRING_EFFECT_NAMES.has(coreStatus)) return true;
  if (TURN_START_EXPIRING_EFFECT_NAMES.has(ceStatus)) return true;
  return TURN_START_EXPIRING_EFFECT_NAMES.has(normalizedName);
}

function getEffectRemainingTurns(effect) {
  if (!effect) return null;

  const remaining = Number(effect.duration?.remaining);
  if (Number.isFinite(remaining)) return remaining;

  const rounds = Number(effect.duration?.rounds);
  if (Number.isFinite(rounds)) return rounds;

  return null;
}

function actorHasCondition(actorDoc, conditionIdOrName) {
  if (!actorDoc?.effects) return false;
  const needle = String(conditionIdOrName ?? "").trim().toLowerCase();
  if (!needle) return false;
  return actorDoc.effects.some(effect => {
    if (!effect || effect.disabled || effect.isSuppressed) return false;
    const statuses = Array.isArray(effect.statuses) ? effect.statuses : Array.from(effect.statuses ?? []);
    const normalizedStatuses = statuses.map(status => String(status ?? "").trim().toLowerCase());
    const coreStatus = String(effect.flags?.core?.statusId ?? "").trim().toLowerCase();
    const ceStatus = String(effect.flags?.["dfreds-convenient-effects"]?.effectId ?? "").trim().toLowerCase();
    const name = String(effect.name ?? "").trim().toLowerCase();
    if (normalizedStatuses.includes(needle)) return true;
    if (coreStatus === needle || ceStatus === needle) return true;
    return name.includes(needle);
  });
}

async function applyBleedingTurnStartFatigue(actor) {
  if (!actor || !game.user?.isGM) return;
  if (!actorHasCondition(actor, "bleeding")) return;
  const currentFatigue = Number(actor.system?.fatigue?.value ?? 0);
  await actor.update({ "system.fatigue.value": currentFatigue + 1 });
  await ChatMessage.create({
    speaker: { alias: "System" },
    content: `<b>${actor.name}</b> gains <b>+1 Fatigue</b> at round start due to <b>Bleeding</b>.`
  });
}

async function clearExpiredTurnStartEffects(actor) {
  if (!actor) return;
  if (!canModifyActorEffects(actor)) return;

  const expiredEffectIds = actor.effects
    .filter(effect => isTurnStartExpiringEffect(effect) && Number(getEffectRemainingTurns(effect)) <= 0)
    .map(effect => effect.id)
    .filter(Boolean);

  if (expiredEffectIds.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", expiredEffectIds);
  }
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

  await actor.setFlag(COGITATOR_ID, REACTION_COUNT_FLAG, nextUsed);
  await actor.setFlag(COGITATOR_ID, REACTION_FLAG, true);
  await applyUsedEvasionEffect(actor, Math.max(1, nextUsed - alreadyUsed));
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

async function applyUsedEvasionEffect(actor, stacks = 1) {
  if (!actor) return;
  const stackCount = Math.max(1, Number(stacks) || 1);
  for (let i = 0; i < stackCount; i += 1) {
    await addConvenientEffectToActor({
      actorUuid: actor.uuid,
      effectId: USED_EVASION_EFFECT_ID,
      effectName: "Used Evasion",
      allowDuplicates: true
    });
  }
}

async function removeUsedEvasionEffect(actor) {
  if (!actor) return;

  const actorEffectsToDelete = actor.effects
    .filter(effect => {
      const statusValues = Array.isArray(effect.statuses) ? effect.statuses : Array.from(effect.statuses ?? []);
      const statusIds = statusValues.map(status => String(status ?? "").toLowerCase());
      const coreStatus = String(effect.flags?.core?.statusId ?? "").toLowerCase();
      const effectId = String(effect.flags?.["dfreds-convenient-effects"]?.effectId ?? "").toLowerCase();
      const effectName = String(effect.name ?? "").toLowerCase();
      return statusIds.includes(USED_EVASION_EFFECT_ID) || coreStatus === USED_EVASION_EFFECT_ID || effectId === USED_EVASION_EFFECT_ID || effectName.includes("used evasion") || effectName === USED_EVASION_EFFECT_ID;
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

async function addConvenientEffectToActorLocal({ actorUuid, effectId, effectName, effectNames = [], counter = null, allowDuplicates = false }) {
  const actor = await resolveActorFromUuid(actorUuid);
  if (!actor) return false;

  const effectInterface = game.dfreds?.effectInterface;
  let applied = false;
  const preferredNames = [effectName, ...effectNames].filter(Boolean);
  const statusTemplate = Array.isArray(CONFIG?.statusEffects)
    ? CONFIG.statusEffects.find(status => {
      const statusId = String(status?.id ?? "").toLowerCase();
      const statusName = String(status?.name ?? "").toLowerCase();
      const effectIdLc = String(effectId ?? "").toLowerCase();
      if (effectIdLc && statusId === effectIdLc) return true;
      return preferredNames.some(name => {
        const normalized = String(name ?? "").toLowerCase();
        return normalized && (statusName === normalized || statusId === normalized);
      });
    })
    : null;
  const resolvedStatusId = String(statusTemplate?.id ?? effectId ?? "").trim();
  const hasAppliedEffect = () => {
    if (allowDuplicates) return false;
    return Boolean(findActorEffect(actor, resolvedStatusId, effectName) || preferredNames.map(name => findActorEffect(actor, resolvedStatusId, name)).find(Boolean));
  };

  if (!allowDuplicates && canModifyActorEffects(actor) && resolvedStatusId) {
    const existingSystemStatus = findActorEffect(actor, resolvedStatusId, effectName) || preferredNames.map(name => findActorEffect(actor, resolvedStatusId, name)).find(Boolean);
    if (!existingSystemStatus) {
      try {
        if (typeof actor.toggleStatusEffect === "function") {
          await actor.toggleStatusEffect(resolvedStatusId, { active: true });
          if (findActorEffect(actor, resolvedStatusId, effectName) || preferredNames.map(name => findActorEffect(actor, resolvedStatusId, name)).find(Boolean)) {
            applied = true;
          }
        }
      } catch (_) {
        // Fall through to other application mechanisms.
      }
    } else {
      applied = true;
    }
  }

  if (effectInterface?.addEffect) {
    const paramsByPriority = [
      { effectId: resolvedStatusId || effectId, uuid: actor.uuid },
      { effectId: resolvedStatusId || effectId, uuids: [actor.uuid] },
      ...preferredNames.flatMap(name => ([
        { effectName: name, uuid: actor.uuid },
        { effectName: name, uuids: [actor.uuid] }
      ]))
    ].filter(params => params.effectId || params.effectName);

    for (const params of paramsByPriority) {
      try {
        await effectInterface.addEffect(params);
        if (allowDuplicates || hasAppliedEffect()) {
          applied = true;
          break;
        }
      } catch (_) {
        // Continue trying signatures for CE compatibility.
      }
    }
  }

  if (!applied && canModifyActorEffects(actor)) {
    const existing = allowDuplicates ? null : findActorEffect(actor, resolvedStatusId, effectName) || preferredNames.map(name => findActorEffect(actor, resolvedStatusId, name)).find(Boolean);
    if (!existing) {
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: statusTemplate?.name || preferredNames[0] || resolvedStatusId || "Status Effect",
        img: statusTemplate?.img || statusTemplate?.icon || "icons/svg/aura.svg",
        icon: statusTemplate?.icon || statusTemplate?.img || "icons/svg/aura.svg",
        transfer: false,
        disabled: false,
        statuses: resolvedStatusId ? [resolvedStatusId] : [],
        flags: resolvedStatusId ? { core: { statusId: resolvedStatusId } } : {}
      }]);
    }
    applied = true;
  }

  if (applied && Number.isFinite(Number(counter)) && Number(counter) > 0) {
    const activeEffect = findActorEffect(actor, resolvedStatusId, effectName) || preferredNames.map(name => findActorEffect(actor, resolvedStatusId, name)).find(Boolean);
    if (activeEffect) {
      const numericCounter = Number(counter);
      const existingCounter = Number(
        activeEffect.getFlag?.("statuscounter", "value")
        ?? activeEffect.flags?.statuscounter?.value
        ?? activeEffect.flags?.statuscounter?.counter?.value
        ?? activeEffect.flags?.statusIconCounters?.value
        ?? activeEffect.flags?.statusIconCounters?.counter
        ?? activeEffect.flags?.["status-icon-counters"]?.value
        ?? activeEffect.flags?.["status-icon-counters"]?.counter
        ?? 0
      ) || 0;
      const nextCounter = existingCounter + numericCounter;
      const remainingRounds = Number(activeEffect.duration?.remaining);
      const currentDuration = Number.isFinite(remainingRounds) ? Math.max(0, Math.ceil(remainingRounds)) : Math.max(0, Number(activeEffect.duration?.rounds ?? 0));
      const nextDuration = Math.max(currentDuration, nextCounter);
      const combatRound = Number(game.combat?.round ?? 0);
      const combatTurn = Number(game.combat?.turn ?? 0);
      await activeEffect.update({
        "flags.statuscounter.value": nextCounter,
        "flags.statuscounter.visible": nextCounter > 1,
        "flags.statuscounter.config.type": "default",
        "flags.statuscounter.config.dataSource": "flags.statuscounter.value",
        "flags.statuscounter.config.modifyDuration": true,
        "flags.statuscounter.config.durationType": 1,
        "flags.statuscounter.counter": { value: nextCounter },
        "flags.statusIconCounters.counter": nextCounter,
        "flags.statusIconCounters.value": nextCounter,
        "flags.status-icon-counters.counter": nextCounter,
        "flags.status-icon-counters.value": nextCounter,
        "duration.rounds": nextDuration,
        "duration.startRound": combatRound,
        "duration.startTurn": combatTurn
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
  const joinedTargets = (predicate = null) => {
    const targets = (state.targets ?? []).filter(t => !predicate || predicate(t)).map(t => t.name);
    return targets.length ? targets.join(", ") : "the target";
  };
  const hasResolvableDefense = (state.targets ?? []).some(t => t.defenseAction && !String(t.defenseOutcome ?? "").toLowerCase().includes("awaiting"));
  const hasDamageResolution = (state.targets ?? []).some(t => t.damageResolved || t.damageApplied);
  const defenseStory = () => {
    const defended = (state.targets ?? []).find(t => t.defenseAction && !String(t.defenseOutcome ?? "").toLowerCase().includes("awaiting"));
    if (!defended) return "";
    const action = String(defended.defenseAction ?? "defend").toLowerCase();
    const outcome = defended.defenseSuccess
      ? (Number(defended.defenseDegrees ?? 0) > 1 ? "totally succeeds" : "partially succeeds")
      : (Number(defended.defenseDegrees ?? 0) > 1 ? "totally fails" : "partially fails");
    return `<b>${defended.name}</b> attempts to <b>${action}</b> against <b>${state.attackerName}</b> and ${outcome}.`;
  };
  const buildDescription = () => {
    const targetNames = joinedTargets();
    const hitWord = Number(state.totalHits ?? 0) === 1 ? "hit" : "hits";
    const missWord = Number(state.totalHits ?? 0) > 0 ? `${state.totalHits} ${hitWord}` : "misses";
    const attackLine = `<b>${state.attackerName}</b> attacks <b>${targetNames}</b> with <b>${state.weaponName}</b> and ${missWord}.`;
    if (hasDamageResolution) {
      const appliedTargets = joinedTargets(t => t.damageResolved || t.damageApplied);
      return `${attackLine} <b>${appliedTargets}</b> receives damage from <b>${state.attackerName}</b>.`;
    }
    if (hasResolvableDefense) return defenseStory();
    return attackLine;
  };

  const cards = (state.targets ?? []).map(t => {
    const sizeTxt = t.sizeIgnored ? `${t.sizeLabel} (Black Carapace ignores)` : `${t.sizeLabel} ${t.sizeMod >= 0 ? "+" : ""}${t.sizeMod}`;
    const forceFieldSummary = t.forceFieldChecked
      ? `<div><b>Force Field:</b> ${outlined(t.forceFieldName ?? "—", "#ffad55")} | <b>Protection:</b> ${outlined(t.forceFieldProtection ?? "—", "#ffad55")} | <b>Overload:</b> ${outlined(t.forceFieldOverload ?? "—", "#ffad55")} | <b>Roll:</b> ${outlined(t.forceFieldRoll ?? "—", "#bd7548")}</div><div><b>Force Field Result:</b> ${outlined(t.forceFieldOutcome ?? "—", statusColor(t.forceFieldOutcome))}</div>`
      : "";
    const defenseSummary = t.defenseAction
      ? `<div style="margin-top:4px;padding:6px;border:1px solid #777;border-radius:6px;">
          <div><b>Incoming Hits:</b> ${t.incomingHits ?? t.allocatedHits ?? 0}</div>
          <div><b>Difficulty:</b> ${t.defenseDifficultyLabel ?? "—"}</div>
          <div><b>Defense Roll:</b> ${outlined(t.defenseTargetNumber ?? "—", "#3aa0ff")} vs ${outlined(t.defenseRoll ?? "—", "#ff9f1a")}</div>
          <div><b>Status:</b> ${outlined(t.defenseOutcome ?? "Pending", statusColor(t.defenseOutcome))}</div>
          ${t.defenseNotes?.length ? `<div><b>Notes:</b> ${t.defenseNotes.join(" | ")}</div>` : ""}
          ${forceFieldSummary}
          <div>${styledDegrees(t)}</div>
        </div>`
      : `<div><b>Defense Roll:</b> ${outlined(t.defenseTargetNumber ?? "—", "#3aa0ff")} vs ${outlined(t.defenseRoll ?? "—", "#ff9f1a")}</div><div><b>Status:</b> ${outlined(t.defenseOutcome ?? "Pending", statusColor(t.defenseOutcome))}</div>${forceFieldSummary}`;

    const damageSummary = t.applySummary
      ? `<div style="margin-top:4px;padding:6px;border:1px solid #777;border-radius:6px;">${t.applySummary}</div>`
      : (t.damageSummary
        ? `<div style="margin-top:4px;padding:6px;border:1px solid #777;border-radius:6px;">${t.damageSummary}</div>`
        : ``);

    return `<div style="border:1px solid #555;border-radius:6px;padding:6px;margin:6px 0;">
      <div><b>${t.name}</b></div>
      <div><b>Dist:</b> ${t.distanceMeters}m | <b>Range:</b> ${t.rangeLabel} | <b>Size:</b> ${sizeTxt}</div>
      <div><b>TN:</b> ${outlined(t.targetNumber, "#3aa0ff")} | <b>Hits:</b> ${t.allocatedHits}</div>
      ${defenseSummary}
      ${damageSummary}
    </div>`;
  }).join("");

  return `<div data-workflow-id="${state.id}">
    <div style="margin:0 0 6px 0;font-size:1.05em;font-style:italic;">${buildDescription()}</div>
    <div><b>Mode:</b> ${state.modeLabel} | <b>Power:</b> ${state.powerModeLabel} | <b>Aim:</b> ${state.aimLabel} | <b>Craftsmanship:</b> ${state.craftName}</div>
    <div><b>Modifiers:</b> ${state.modifierNotes?.join(", ") || "None"}</div>
    <div><b>Talents:</b> ${state.selectedTalents?.join(", ") || "None"}</div>
    <div><b>Weapon Traits:</b> ${state.weaponTraits || state.weaponSpecial || "None"}</div>
    <div><b>Items:</b> ${state.weaponItems?.join(", ") || "None"}</div>
    <div><b>Attack Roll:</b> ${outlined(state.attackRoll ?? "—", "#ff9f1a")} | <b>Status:</b> ${outlined(state.statusText ?? "Pending", statusColor(state.statusText))}</div>
    <div style="font-size:1.1em;"><b>Total Hits:</b> ${state.totalHits ?? 0}</div>
    ${state.extraText ? `<div><b>Notes:</b> ${state.extraText}</div>` : ""}
    ${styledAttackDegrees()}
    ${cards}
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
    shocking: damageResult.shocking,
    flame: damageResult.flame,
    spray: damageResult.spray,
    concussive: damageResult.concussive,
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
    return !out.includes("success") && !out.includes("fail") && !out.includes("skipped");
  });

  const pendingDamage = state.targets.some(t => {
    if ((t.allocatedHits ?? 0) <= 0) return false;
    if (t.damageResolved) return false;
    const out = String(t.defenseOutcome ?? "").toLowerCase();
    return out.includes("success") || out.includes("fail") || out.includes("skipped");
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
        ...(game.user.isGM ? { applyDamage: { label: "Apply Damage", callback: () => resolve("applyDamage") } } : {}),
        skill: { label: "Skill Test", callback: () => resolve("skill") },
        characteristic: { label: "Characteristic Test", callback: () => resolve("characteristic") },
        fear: { label: "Fear Test", callback: () => resolve("fear") },
        medical: { label: "Medical Flow", callback: () => resolve("medical") },
        ...(game.user.isGM ? { healing: { label: "Apply Healing", callback: () => resolve("healing") } } : {}),
        ...(game.user.isGM ? { restoreFate: { label: "Fate", callback: () => resolve("restoreFate") } } : {}),
        ...(game.user.isGM ? { fatigue: { label: "Fatigue", callback: () => resolve("fatigue") } } : {}),
        ...(game.user.isGM ? { ammoReload: { label: "Ammo Reload", callback: () => resolve("ammoReload") } } : {}),
        ...(game.user.isGM ? { forceField: { label: "Force Field", callback: () => resolve("forceField") } } : {}),
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "attack"
    }).render(true, { width: 420 });
  });

  if (!choice) return;
  if (choice === "skill") {
    await openSkillTest();
    return;
  }
  if (choice === "characteristic") {
    await openCharacteristicTest();
    return;
  }
  if (choice === "fear") {
    await openFearTest();
    return;
  }
  if (choice === "medical") {
    await openMedicalTest();
    return;
  }
  if (choice === "healing") {
    await openHealingFlow();
    return;
  }
  if (choice === "restoreFate") {
    await openFateRestore();
    return;
  }
  if (choice === "fatigue") {
    await openFatigueManager();
    return;
  }
  if (choice === "ammoReload") {
    await openAmmoReload();
    return;
  }
  if (choice === "forceField") {
    await runHudForceFieldCheck();
    return;
  }
  await runStep(choice);
}

function getWorkflowHudButtons() {
  const buttons = [
    { id: "attack", label: "Attack", action: () => runStep("attack") },
    { id: "psychic", label: "Psychic Powers", action: () => runStep("psychic") },
    { id: "defense", label: "Defense", action: () => runStep("defense") },
    { id: "damage", label: "Damage", action: () => runStep("damage") },
    { id: "skill", label: "Skill", action: () => openSkillTest() },
    { id: "characteristic", label: "Characteristic", action: () => openCharacteristicTest() },
    { id: "fear", label: "Fear", action: () => openFearTest() },
    { id: "medical", label: "Medical", action: () => openMedicalTest() }
  ];

  if (game.user.isGM) {
    buttons.push({ id: "applyDamage", label: "Apply Damage", action: () => runStep("applyDamage") });
    buttons.push({ id: "healing", label: "Apply Healing", action: () => openHealingFlow() });
    buttons.push({ id: "restoreFate", label: "Fate", action: () => openFateRestore() });
    buttons.push({ id: "fatigue", label: "Fatigue", action: () => openFatigueManager() });
    buttons.push({ id: "ammoReload", label: "Ammo Reload", action: () => openAmmoReload() });
    buttons.push({ id: "forceField", label: "Force Field", action: () => runHudForceFieldCheck() });
  }

  return buttons;
}

function refreshWorkflowHud() {
  const enabled = game.settings.get(COGITATOR_ID, SETTINGS.workflowHudEnabled);
  const activeCanvas = globalThis.canvas ?? game.canvas;
  const canvasIsAvailable = Boolean(activeCanvas && (activeCanvas.ready ?? activeCanvas.initialized ?? true));
  if (!enabled || !canvasIsAvailable) {
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

function getWorkflowHudCenterPosition() {
  const minMargin = 8;
  const hudWidth = workflowHud?.element?.offsetWidth ?? 500;
  const hudHeight = workflowHud?.element?.offsetHeight ?? 42;
  const centerX = Math.round((window.innerWidth - hudWidth) / 2);
  const centerY = Math.round((window.innerHeight - hudHeight) / 2);

  return {
    x: Math.max(centerX, minMargin),
    y: Math.max(centerY, minMargin)
  };
}

async function resetWorkflowHudToCenter() {
  const { x, y } = getWorkflowHudCenterPosition();
  await game.settings.set(COGITATOR_ID, SETTINGS.workflowHudPosX, x);
  await game.settings.set(COGITATOR_ID, SETTINGS.workflowHudPosY, y);
  refreshWorkflowHud();
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
    const hudScale = game.user.isGM ? 0.8 : 1;
    const px = value => `${Math.round(value * hudScale)}px`;

    if (!this.element) {
      this.element = document.createElement("div");
      this.element.id = "warhammer40k-cogitator-workflow-hud";
      this.element.style.position = "fixed";
      this.element.style.display = "grid";
      this.element.style.border = "1px solid var(--wh-brass-dark)";
      this.element.style.background = "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 18%, rgba(0,0,0,0.16) 100%), linear-gradient(145deg, var(--wh-metal-light) 0%, var(--wh-metal) 38%, var(--wh-metal-dark) 100%)";
      this.element.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -2px 8px rgba(0,0,0,0.45), 0 4px 14px rgba(0,0,0,0.45)";
      this.element.style.zIndex = "9999";
      this.element.style.alignItems = "center";
      this.element.style.userSelect = "none";
      this.element.style.pointerEvents = "all";
      this.element.style.opacity = "1";
      this.element.style.visibility = "visible";
      this.element.style.fontFamily = "\"IM Fell English SC\", \"Times New Roman\", serif";
      this.element.style.setProperty("--wh-metal-dark", "#1c1f22");
      this.element.style.setProperty("--wh-metal", "#2a2f34");
      this.element.style.setProperty("--wh-metal-light", "#3a4046");
      this.element.style.setProperty("--wh-edge", "#6e747a");
      this.element.style.setProperty("--wh-brass-dark", "#5e4a1f");
      this.element.style.setProperty("--wh-brass", "#8a6b2e");
      this.element.style.setProperty("--wh-brass-light", "#b08d3c");
      this.element.style.setProperty("--wh-red-dark", "#3f0505");
      this.element.style.setProperty("--wh-red", "#7b0f0f");
      this.element.style.setProperty("--wh-red-bright", "#a61b1b");
      this.element.style.setProperty("--wh-parchment-dark", "#b7a982");
      this.element.style.setProperty("--wh-parchment", "#d8c9a3");
      this.element.style.setProperty("--wh-ink", "#2b2416");
      this.element.style.setProperty("--wh-yellow-dirty", "#9a7f00");
      this.element.style.setProperty("--wh-yellow", "#c7a300");
      this.element.style.setProperty("--wh-text", "#e6dcc5");
      this.element.style.setProperty("--wh-shadow", "rgba(0, 0, 0, 0.65)");
      this.element.style.setProperty("--wh-shadow-deep", "rgba(0, 0, 0, 0.85)");

      this.element.addEventListener("pointerdown", event => this.onPointerDown(event));
    }

    if (!this.element.isConnected) {
      this.attachToDom();
    }

    this.element.innerHTML = "";

    const buttonMap = new Map(buttons.map(button => [button.id, button]));
    const gridColumns = game.user.isGM ? 4 : 3;
    this.element.style.gap = px(6);
    this.element.style.padding = px(8);
    this.element.style.borderRadius = px(6);
    this.element.style.gridTemplateColumns = `repeat(${gridColumns}, minmax(${px(110)}, 1fr))`;

    const iconCell = this.createIconCell(hudScale, this.locked);
    const emptyCell = (colSpan = 1) => this.createEmptyCell(hudScale, colSpan);
    const actionCell = (id, fallbackLabel = "Coming soon") => this.createActionCell(hudScale, buttonMap.get(id), fallbackLabel);

    if (game.user.isGM) {
      this.element.appendChild(actionCell("attack", "Attack"));
      this.element.appendChild(actionCell("defense", "Defense"));
      this.element.appendChild(actionCell("damage", "Damage"));
      this.element.appendChild(actionCell("applyDamage", "Apply Damage"));
      this.element.appendChild(actionCell("psychic", "Psychic Powers"));

      iconCell.style.gridColumn = "span 2";
      this.element.appendChild(iconCell);
      this.element.appendChild(actionCell("fear", "Fear"));

      this.element.appendChild(actionCell("characteristic", "Characteristics"));
      this.element.appendChild(actionCell("skill", "Skills"));
      this.element.appendChild(actionCell("medical", "Medical"));
      this.element.appendChild(actionCell("healing", "Apply Healing"));

      this.element.appendChild(actionCell("restoreFate", "Fate"));
      this.element.appendChild(actionCell("ammoReload", "Ammo Reload"));
      this.element.appendChild(actionCell("fatigue", "Fatigue"));
      this.element.appendChild(actionCell("forceField", "Force Field"));

    } else {
      this.element.appendChild(actionCell("attack", "Attack"));
      this.element.appendChild(actionCell("defense", "Defense"));
      this.element.appendChild(actionCell("damage", "Damage"));
      this.element.appendChild(actionCell("psychic", "Psychic Powers"));

      this.element.appendChild(iconCell);
      this.element.appendChild(actionCell("fear", "Fear"));

      this.element.appendChild(actionCell("characteristic", "Characteristics"));
      this.element.appendChild(actionCell("skill", "Skills"));
      this.element.appendChild(actionCell("medical", "Medical"));

    }

    const { clampedX, clampedY } = this.getClampedPosition(x, y);
    this.element.style.left = `${Math.round(clampedX)}px`;
    this.element.style.top = `${Math.round(clampedY)}px`;

    this.persistPositionIfChanged(clampedX, clampedY, x, y);
    this.element.style.cursor = this.locked ? "default" : "move";
  }

  createActionCell(hudScale, button, fallbackLabel) {
    const px = value => `${Math.round(value * hudScale)}px`;
    const buttonEl = document.createElement("button");
    buttonEl.type = "button";
    buttonEl.dataset.role = "workflow-action";
    buttonEl.textContent = button?.label ?? fallbackLabel;
    buttonEl.style.padding = `${px(6)} ${px(8)}`;
    buttonEl.style.fontSize = px(12);
    buttonEl.style.minHeight = px(36);
    buttonEl.style.background = "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 12%, rgba(0,0,0,0.10) 100%), linear-gradient(145deg, #31373d 0%, #23282d 55%, #1b1f23 100%)";
    buttonEl.style.border = "1px solid var(--wh-brass-dark)";
    buttonEl.style.borderRadius = px(4);
    buttonEl.style.color = "var(--wh-text)";
    buttonEl.style.fontFamily = "\"IM Fell English SC\", \"Times New Roman\", serif";
    buttonEl.style.textTransform = "uppercase";
    buttonEl.style.letterSpacing = "0.06em";
    buttonEl.style.textShadow = "0 1px 1px rgba(0,0,0,0.7)";
    buttonEl.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -3px 6px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.35)";
    buttonEl.style.cursor = button ? "pointer" : "default";
    buttonEl.style.transition = "border-color 120ms ease, color 120ms ease, box-shadow 120ms ease";
    const highlightedActionIds = new Set(["medical", "healing", "restoreFate", "skill", "characteristic", "forceField"]);
    if (highlightedActionIds.has(button?.id)) {
      buttonEl.style.background = "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.10) 100%), linear-gradient(145deg, #cfc09b 0%, #b7a982 100%)";
      buttonEl.style.color = "var(--wh-ink)";
      buttonEl.style.textShadow = "0 1px 0 rgba(255,255,255,0.2)";
    }
    if (!button) {
      buttonEl.disabled = true;
      buttonEl.style.opacity = "0.82";
      buttonEl.style.color = "rgba(230, 220, 197, 0.55)";
      buttonEl.style.borderStyle = "dashed";
      buttonEl.style.background = "linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.22) 100%), repeating-linear-gradient(45deg, rgba(0,0,0,0) 0 8px, rgba(0,0,0,0) 8px 10px, rgba(199,163,0,0.25) 10px 16px, rgba(0,0,0,0) 16px 18px), linear-gradient(145deg, #262a2e 0%, #1a1d20 100%)";
    } else {
      buttonEl.addEventListener("click", async event => {
        event.stopPropagation();
        await button.action();
      });
      buttonEl.addEventListener("mouseenter", () => {
        buttonEl.style.borderColor = "var(--wh-brass-light)";
        buttonEl.style.color = highlightedActionIds.has(button?.id) ? "#1f1a10" : "#f2ead8";
        buttonEl.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -3px 6px rgba(0,0,0,0.35), 0 0 6px rgba(122,15,15,0.18)";
      });
      buttonEl.addEventListener("mouseleave", () => {
        buttonEl.style.borderColor = "var(--wh-brass-dark)";
        buttonEl.style.color = highlightedActionIds.has(button?.id) ? "var(--wh-ink)" : "var(--wh-text)";
        buttonEl.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -3px 6px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.35)";
      });
    }
    return buttonEl;
  }

  createComingSoonCell(hudScale, colSpan = 1) {
    const px = value => `${Math.round(value * hudScale)}px`;
    const cell = document.createElement("div");
    cell.textContent = "Coming soon";
    cell.style.display = "flex";
    cell.style.alignItems = "center";
    cell.style.justifyContent = "center";
    cell.style.minHeight = px(36);
    cell.style.padding = `${px(6)} ${px(8)}`;
    cell.style.fontSize = px(12);
    cell.style.border = "1px dashed rgba(176, 141, 60, 0.35)";
    cell.style.borderRadius = px(4);
    cell.style.color = "rgba(230, 220, 197, 0.65)";
    cell.style.fontFamily = "\"IM Fell English SC\", \"Times New Roman\", serif";
    cell.style.textTransform = "uppercase";
    cell.style.letterSpacing = "0.05em";
    cell.style.textShadow = "0 1px 1px rgba(0,0,0,0.7)";
    cell.style.background = "linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.22) 100%), repeating-linear-gradient(45deg, rgba(0,0,0,0) 0 8px, rgba(0,0,0,0) 8px 10px, rgba(199,163,0,0.20) 10px 16px, rgba(0,0,0,0) 16px 18px), linear-gradient(145deg, #262a2e 0%, #1a1d20 100%)";
    if (colSpan > 1) cell.style.gridColumn = `span ${colSpan}`;
    return cell;
  }

  createEmptyCell(hudScale, colSpan = 1) {
    const px = value => `${Math.round(value * hudScale)}px`;
    const cell = document.createElement("div");
    cell.style.minHeight = px(36);
    if (colSpan > 1) cell.style.gridColumn = `span ${colSpan}`;
    return cell;
  }

  createIconCell(hudScale, locked) {
    const px = value => `${Math.round(value * hudScale)}px`;
    const cell = document.createElement("div");
    cell.style.display = "flex";
    cell.style.alignItems = "center";
    cell.style.justifyContent = "center";
    cell.style.minHeight = px(36);
    cell.style.padding = px(4);
    cell.style.border = "1px solid var(--wh-brass-dark)";
    cell.style.borderRadius = px(4);
    cell.style.cursor = "pointer";
    cell.style.background = locked
      ? "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.15) 100%), linear-gradient(145deg, #31373d 0%, #23282d 55%, #1b1f23 100%)"
      : "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.15) 100%), repeating-linear-gradient(45deg, rgba(0,0,0,0) 0 8px, rgba(0,0,0,0) 8px 10px, rgba(199,163,0,0.25) 10px 16px, rgba(0,0,0,0) 16px 18px), linear-gradient(145deg, #5b1010 0%, #3f0505 100%)";
    cell.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -3px 6px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.35)";
    cell.title = locked ? "Unlock bar" : "Lock bar";
    cell.addEventListener("pointerdown", event => event.stopPropagation());
    cell.addEventListener("click", async event => {
      event.stopPropagation();
      await game.settings.set(COGITATOR_ID, SETTINGS.workflowHudLocked, !locked);
    });

    const icon = document.createElement("img");
    icon.src = `modules/${COGITATOR_ID}/Warhammer-40k-cogitator-button.png`;
    icon.alt = "Warhammer 40k Cogitator";
    icon.style.maxHeight = px(28);
    icon.style.maxWidth = "100%";
    icon.style.objectFit = "contain";
    cell.appendChild(icon);

    return cell;
  }

  attachToDom() {
    const hudHost = document.body;
    hudHost.appendChild(this.element);
  }

  getClampedPosition(x, y) {
    const rawX = Number.isFinite(Number(x)) ? Number(x) : 24;
    const rawY = Number.isFinite(Number(y)) ? Number(y) : 24;
    const maxX = Math.max(window.innerWidth - this.element.offsetWidth - 8, 0);
    const maxY = Math.max(window.innerHeight - this.element.offsetHeight - 8, 0);
    const clampedX = Math.min(Math.max(rawX, 8), maxX);
    const clampedY = Math.min(Math.max(rawY, 8), maxY);
    return { clampedX, clampedY };
  }

  async persistPositionIfChanged(clampedX, clampedY, x, y) {
    const originalX = Number.isFinite(Number(x)) ? Number(x) : 24;
    const originalY = Number.isFinite(Number(y)) ? Number(y) : 24;
    if (Math.round(clampedX) === Math.round(originalX) && Math.round(clampedY) === Math.round(originalY)) return;

    await game.settings.set(COGITATOR_ID, SETTINGS.workflowHudPosX, Math.round(clampedX));
    await game.settings.set(COGITATOR_ID, SETTINGS.workflowHudPosY, Math.round(clampedY));
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

class WorkflowHudResetMenu extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "warhammer40k-cogitator-reset-workflow-hud",
      title: "Reset Workflow HUD Position"
    });
  }

  getData() {
    return {};
  }

  activateListeners(html) {
    super.activateListeners(html);
    this.submit();
    this.close();
  }

  async _updateObject() {
    await resetWorkflowHudToCenter();
    ui.notifications.info("Workflow HUD moved to screen center.");
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

async function show3dDiceRoll(roll) {
  if (!roll) return;

  try {
    if (game.dice3d?.showForRoll) {
      await game.dice3d.showForRoll(roll, game.user, true);
    }
  } catch (error) {
    console.debug("Warhammer 40k Cogitator | Dice So Nice render skipped:", error);
  }
}


async function openSkillTest() {
  const token = canvas.tokens.controlled[0];
  if (!token) {
    ui.notifications.warn("Select a token first.");
    return;
  }

  const actor = token.actor;
  const skills = actor.system.skills;

  const hasEnemy = actor.items.some(i => i.type === "talent" && /enemy/i.test(i.name));
  const hasPeer = actor.items.some(i => i.type === "talent" && /peer/i.test(i.name));
  const hasKeen = actor.items.some(i => i.type === "talent" && /keen intuition/i.test(i.name));
  const hasInfusedKnowledge = actor.items.some(i => i.type === "talent" && /infused knowledge/i.test(i.name));
  const hasHeightened = actor.items.some(i => i.type === "talent" && slug(i.name).startsWith("heightenedsenses"));

  async function askForFate() {
    const fateCurrent = actor.system.fate?.value ?? 0;
    if (fateCurrent <= 0) return false;
    if ((actor.system.fate?.value ?? 0) <= 0) return false;

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

  function prettyLabel(str) {
    return str
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_\-]/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function slug(s) {
    return s.replace(/[\s\-']/g, "").replace(/[()]/g, "").toLowerCase();
  }

  function buildOptions(obj) {
    return Object.entries(obj)
      .map(([k]) => `<option value="${k}">${prettyLabel(k)}</option>`)
      .join("");
  }

  function buildSpecialityOptions(group) {
    const list = skills[group]?.specialities ?? {};

    const infusedAllowed =
      hasInfusedKnowledge &&
      (group === "commonLore" || group === "scholasticLore");

    return Object.entries(list)
      .filter(([, v]) => infusedAllowed || v?.isKnown)
      .map(([k]) => `<option value="${k}">${prettyLabel(k)}</option>`)
      .join("");
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

  const difficultyOptions = difficulties
    .map(d => `<option value="${d.value}" ${d.value === 0 ? "selected" : ""}>${d.label}</option>`)
    .join("");

  const skillOptions = buildOptions({
    acrobatics: 1,
    athletics: 1,
    awareness: 1,
    charm: 1,
    command: 1,
    commerce: 1,
    deceive: 1,
    inquiry: 1,
    interrogation: 1,
    intimidate: 1,
    logic: 1,
    psyniscience: 1,
    scrutiny: 1,
    security: 1,
    sleightOfHand: 1,
    stealth: 1,
    survival: 1,
    techUse: 1
  });

  const commonOptions = buildSpecialityOptions("commonLore");
  const forbiddenOptions = buildSpecialityOptions("forbiddenLore");
  const scholasticOptions = buildSpecialityOptions("scholasticLore");
  const operateOptions = buildSpecialityOptions("operate");
  const navigateOptions = buildSpecialityOptions("navigate");
  const tradeOptions = buildSpecialityOptions("trade");

  new Dialog({
    title: "Skill Test",
    content: `
<style>
.skill-test-dialog form{
  font-size:14px;
}

.skill-test-dialog select,
.skill-test-dialog input[type="number"]{
  width:100%;
  margin-bottom:6px;
}

.grid3{
  display:grid;
  grid-template-columns:repeat(3, 1fr);
  gap:8px 14px;
}

.grid3 label{
  display:flex;
  align-items:center;
  gap:6px;
}

h3{
  margin:10px 0 4px;
}

hr{
  margin:10px 0;
}
</style>
<form>

<h3>Skills</h3>
<div style="display:flex; gap:6px; align-items:center;">
  <select id="skill" style="flex:1;">
    <option value="">--</option>${skillOptions}
  </select>

  <div id="selectedSkillDisplay" style="
    min-width:140px;
    text-align:center;
    font-weight:bold;
    font-size:1.1em;
    color:#3aa0ff;
    text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
  ">—</div>
</div>
<hr>

<h3 style="margin-bottom:4px;">Lore</h3>

<div style="display:flex; gap:6px; width:100%;">
  <select id="common" style="flex:1; min-width:0;">
    <option value="">Common Lore</option>${commonOptions}
  </select>

  <select id="forbidden" style="flex:1; min-width:0;">
    <option value="">Forbidden Lore</option>${forbiddenOptions}
  </select>

  <select id="scholastic" style="flex:1; min-width:0;">
    <option value="">Scholastic Lore</option>${scholasticOptions}
  </select>
</div>

<hr>

<h3>Operate / Navigate</h3>
<div class="grid3">
<select id="operate"><option value="">Operate</option>${operateOptions}</select>
<select id="navigate"><option value="">Navigate</option>${navigateOptions}</select>
</div>
<h3>Trade</h3>
<div class="grid3">
<select id="trade"><option value="">Trade</option>${tradeOptions}</select>
</div>
<hr>
<h3>Modifiers</h3>

<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px 14px; align-items:end;">

  <div>
    <label style="font-weight:bold;">Difficulty</label>
    <select id="difficulty">
      ${difficultyOptions}
    </select>
  </div>

  <div>
    <label style="font-weight:bold;">Modifier</label>
    <input id="mod" type="number" value="0"/>
  </div>

</div>
<hr>

<h3>Talents</h3>
<div class="grid3">
<label style="opacity:${hasEnemy ? 1 : 0.4};"><input type="checkbox" id="enemy" ${hasEnemy ? "" : "disabled"}> Enemy</label>
<label style="opacity:${hasPeer ? 1 : 0.4};"><input type="checkbox" id="peer" ${hasPeer ? "" : "disabled"}> Peer</label>
<label style="opacity:${hasKeen ? 1 : 0.4};"><input type="checkbox" id="keen" ${hasKeen ? "" : "disabled"}> Keen Intuition</label>
<label style="opacity:${hasHeightened ? 1 : 0.4};">
  <input type="checkbox" id="heightened"
  ${hasHeightened ? "" : "disabled"}>
  Heightened Senses
</label>
<label style="opacity:${hasInfusedKnowledge ? 1 : 0.4};"><input type="checkbox" id="infused" ${hasInfusedKnowledge ? "checked" : "disabled"}> Infused Knowledge</label>
</div>

<hr>

<h3>Items</h3>
<div class="grid3">

<label><input type="checkbox" data-bonus="20" data-skill="awareness"> Auspex</label>
<label><input type="checkbox" data-bonus="30" data-skill="awareness"> Good Auspex</label>
<label><input type="checkbox" data-bonus="20" data-skill="medicae,awareness"> Diagnostor</label>

<label><input type="checkbox" data-bonus="10" data-skill="deceive"> Disguise Kit</label>
<label><input type="checkbox" data-bonus="30" data-skill="athletics"> Clip Harness</label>
<label><input type="checkbox" data-bonus="10" data-skill="techuse"> Combi-Tool</label>

<label><input type="checkbox" data-bonus="20" data-skill="interrogation"> Excruciator Kit</label>
<label><input type="checkbox" data-bonus="30" data-skill="security"> Multikey</label>

<label><input type="checkbox" data-bonus="30" data-skill="medicae"> Field Suture</label>

<label><input type="checkbox" data-bonus="20" data-skill="stealth"> Camo Cloak</label>
<label><input type="checkbox" data-bonus="30" data-skill="stealth"> Stummer</label>
<label><input type="checkbox" data-bonus="10" data-skill="stealth"> Synskin</label>

</div>

</form>
`,

    buttons: {
      roll: {
        label: "Roll",
        callback: async html => {
          const picks = [
            ["skill", "skill"],
            ["common", "commonLore"],
            ["forbidden", "forbiddenLore"],
            ["scholastic", "scholasticLore"],
            ["operate", "operate"],
            ["navigate", "navigate"],
            ["trade", "trade"]
          ];

          let selected;
          let group;

          for (const [id, g] of picks) {
            const val = html.find(`#${id}`).val();
            if (val) {
              if (selected) return ui.notifications.warn("Select only ONE skill.");
              selected = val;
              group = g;
            }
          }

          if (!selected) return ui.notifications.warn("Pick a skill.");

          let base;
          let label;

          if (group === "skill") {
            base = skills[selected].total;
            label = prettyLabel(selected);
          } else {
            base = skills[group].specialities[selected].total;
            label = `${prettyLabel(group)} (${prettyLabel(selected)})`;
          }

          const notes = [];

          const difficultyMod = Number(html.find("#difficulty").val());
          const manualMod = Number(html.find("#mod").val());

          let target = base + difficultyMod + manualMod;

          notes.push(`Difficulty ${difficultyMod >= 0 ? "+" : ""}${difficultyMod}`);
          if (manualMod !== 0) {
            notes.push(`Modifier ${manualMod >= 0 ? "+" : ""}${manualMod}`);
          }

          const characteristics = skills[selected]?.characteristics ?? "";

          if (html.find("#enemy").is(":checked") && /fel|inf/i.test(characteristics)) {
            target -= 10;
            notes.push("Enemy -10");
          }

          if (html.find("#peer").is(":checked") && /fel|inf/i.test(characteristics)) {
            target += 10;
            notes.push("Peer +10");
          }

          if (
            hasInfusedKnowledge &&
            (group === "commonLore" || group === "scholasticLore")
          ) {
            const spec = skills[group]?.specialities[selected];

            if (spec && spec.isKnown === false) {
              target += 20;
              notes.push("Infused Knowledge +20");
            }
          }

          if (
            hasHeightened &&
            html.find("#heightened").is(":checked") &&
            selected === "awareness"
          ) {
            target += 10;
            notes.push("Heightened Senses +10");
          }

          html.find("[data-bonus]:checked").each(function () {
            const bonus = Number(this.dataset.bonus);
            const skillList = this.dataset.skill.split(",");
            if (skillList.includes(selected)) {
              target += bonus;
              notes.push(`${this.parentNode.textContent.trim()} +${bonus}`);
            }
          });

          const baseTarget = target;

          const roll = await new Roll("1d100").roll({ async: true });
          let rollVal = roll.total;
          if (target < 1) target = 1;

          let keenData = null;

          if (html.find("#keen").is(":checked") && selected === "awareness" && rollVal > target) {
            const firstVal = rollVal;

            let keenTarget = baseTarget - 10;
            if (keenTarget < 1) keenTarget = 1;

            const r2 = await new Roll("1d100").roll({ async: true });
            const secondVal = r2.total;

            rollVal = secondVal;
            target = keenTarget;

            keenData = {
              firstVal,
              firstTarget: baseTarget,
              secondVal,
              secondTarget: keenTarget
            };

            notes.push("Keen Intuition reroll -10");
          }

          const success = rollVal <= target;
          const degrees = Math.floor(Math.abs(target - rollVal) / 10) + 1;

          const resultText = success ?
            `${degrees} Degrees of Success` :
            `${degrees} Degrees of Failure`;

          const successColor = success ? "#1aff1a" : "#ff2a2a";

          await show3dDiceRoll(roll);

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
<div style="text-align:center; color:#000000; font-size:1.1em;">

<div style="font-style:italic;font-size:1.1em;">
<b>${actor.name}</b> performs a <b>${label}</b> Test
</div>

<hr>

${!keenData ? `
<div style="margin-top:6px;font-size:1.2em;">
<b>Target:</b>
<span style="
  color:#3aa0ff;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${target}</span>
</div>
` : ``}

  ${keenData ? `
  <div style="font-size:1.2em; margin-bottom:4px;">
    <b>First Roll:</b> <span style="
  color:#ff9f1a;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${keenData.firstVal}</span> <i><b>vs</b></i> <span style="
  color:#3aa0ff;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${keenData.firstTarget}</span>
  </div>

  <div style="font-size:1.2em; margin-bottom:4px;">
   <b> Keen Reroll:</b> <span style="
  color:#ff9f1a;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${keenData.secondVal}</span> <i><b>vs</b></i> <span style="
  color:#3aa0ff;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${keenData.secondTarget}</span>
  </div>
` : `
  <div style="font-size:1.2em;">
<b>Roll:</b>
<span style="
  color:#ff9f1a;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${rollVal}</span>
  </div>
`}

  ${notes.length ? `
  <div style="font-size:1.1em; font-style:italic; opacity:0.85; margin-bottom:6px;">
    ${notes.join(" | ")}
  </div>` : ""}

  <div style="
    font-size:1.2em;
    font-weight:bold;
    color:${successColor};
   text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
  ">
    ${resultText}
  </div>

</div>
`
          });

          if (!success && (actor.system.fate?.value ?? 0) > 0) {
            const useFate = await askForFate();

            if (useFate) {
              await actor.update({
                "system.fate.value": actor.system.fate.value - 1
              });

              const fateRoll = await new Roll("1d100").roll({ async: true });
              const fateVal = fateRoll.total;

              const fateSuccess = fateVal <= target;
              const fateDegrees = Math.floor(Math.abs(target - fateVal) / 10) + 1;

              const fateText = fateSuccess ?
                `${fateDegrees} Degrees of Success` :
                `${fateDegrees} Degrees of Failure`;

              const fateColor = fateSuccess ? "#1aff1a" : "#ff2a2a";

              await show3dDiceRoll(fateRoll);

              await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor }),
                content: `
<div style="text-align:center;">

<b style="
  color:gold;
  font-style:italic;
  font-size:1.1em;
   text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">✦ ${actor.name} spends Fate and rerolls! ✦
</b></div><hr>
<div style="text-align:center; color:#000000; font-size:1.1em;">

<div style="font-style:italic;font-size:1.1em;">
<b>${actor.name}</b> performs a <b>${label}</b> Test
</div>

<hr>

<div style="margin-top:6px;font-size:1.2em;">
<b>Target:</b>
<span style="
  color:#3aa0ff;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${target}</span>
</div>

<div style="font-size:1.2em;">
<b>Roll:</b>
<span style="
  color:#ff9f1a;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${fateVal}</span>
  </div>

  ${notes.length ? `
  <div style="font-size:1.1em; font-style:italic; opacity:0.85; margin-bottom:6px;">
    ${notes.join(" | ")}
  </div>` : ""}

  <div style="
    font-size:1.2em;
    font-weight:bold;
    color:${fateColor};
    text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
  ">
    ${fateText}
  </div>

</div>
`
              });
            }
          }
        }
      }
    },
    render: html => {
      function updateSelectedSkill() {
        const picks = [
          ["skill", "skill"],
          ["common", "commonLore"],
          ["forbidden", "forbiddenLore"],
          ["scholastic", "scholasticLore"],
          ["operate", "operate"],
          ["navigate", "navigate"],
          ["trade", "trade"]
        ];

        let selected;
        let group;

        for (const [id, g] of picks) {
          const val = html.find(`#${id}`).val();
          if (val) {
            selected = val;
            group = g;
          }
        }

        if (!selected) {
          html.find("#selectedSkillDisplay").text("—");
          return;
        }

        let total;

        if (group === "skill") {
          total = skills[selected]?.total ?? 0;
          html.find("#selectedSkillDisplay")
            .text(`${prettyLabel(selected)} ${total}`);
        } else {
          total = skills[group]?.specialities[selected]?.total ?? 0;
          html.find("#selectedSkillDisplay")
            .text(`${prettyLabel(group)} (${prettyLabel(selected)}) ${total}`);
        }
      }

      html.find("select").on("change", updateSelectedSkill);
      updateSelectedSkill();
    }
  }).render(true);
}

async function openMedicalTest() {
  const token = canvas.tokens.controlled[0];
  if (!token) {
    ui.notifications.warn("Select your healer first.");
    return;
  }

  if (!game.user.targets.size) {
    ui.notifications.warn("Target a patient.");
    return;
  }

  const actor = token.actor;
  const patientToken = [...game.user.targets][0];
  const patient = patientToken.actor;
  const skills = actor.system.skills;

  const hasMaster = actor.items.some(i => /master chirurgeon/i.test(i.name));
  const hasSuperior = actor.items.some(i => /superior chirurgeon/i.test(i.name));
  const hasHardy = patient.items.some(i => /hardy/i.test(i.name));

  const sutureItem = actor.items.find(i => /field suture/i.test(i.name));
  const hasSutureItem = !!sutureItem;

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

  const difficultyOptions = difficulties
    .map(d => `<option value="${d.value}" ${d.value === 0 ? "selected" : ""}>${d.label}</option>`)
    .join("");

  function rememberHealingRoll(amount, label) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    healingRollHistory.unshift({
      amount: Math.floor(amount),
      label: label ?? `${actor.name} → ${patient.name}`,
      timestamp: Date.now()
    });
    if (healingRollHistory.length > 12) healingRollHistory.length = 12;
  }

  async function promptApplyHealing(amount, sourceLabel = "Medical Flow") {
    if (!game.user.isGM || !Number.isFinite(amount) || amount <= 0) return;
    new Dialog({
      title: "Apply Healing",
      content: `<p>Apply <b>${Math.floor(amount)}</b> healing to <b>${patient.name}</b> now?</p>`,
      buttons: {
        apply: {
          label: "Apply Healing",
          callback: async () => openHealingFlow({
            token: patientToken,
            prefillAmount: Math.floor(amount),
            sourceLabel
          })
        },
        later: { label: "Later" }
      },
      default: "apply"
    }).render(true);
  }

  async function askForFate() {
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

  const wounds = patient.system.wounds;
  const tb =
    (patient.system.characteristics.toughness?.bonus ?? 0) +
    (patient.system.characteristics.toughness?.unnatural ?? 0);

  let state = "Lightly Wounded";
  if (!hasHardy) {
    if ((wounds?.critical ?? 0) > 0) state = "Critically Wounded";
    else if ((wounds?.value ?? 0) > tb * 2) state = "Heavily Wounded";
  }

  new Dialog({
    title: "Medicae Test",
    content: `
<style>
.grid2{
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap:6px 18px;
}
.grid2 label{
  display:flex;
  align-items:center;
  gap:6px;
}
</style>

<form>
<h3>State the nature of your medical emergency:</h3>
<div class="grid2">
  <label><input type="radio" name="mode" value="first" checked> First Aid</label>
  <label><input type="radio" name="mode" value="extended"> Extended Care</label>
  <label><input type="radio" name="mode" value="diagnose"> Diagnose</label>
  <label><input type="radio" name="mode" value="staunch"> Staunch Blood Loss</label>
</div>

<hr>

<h3>Diagnose Skill</h3>
<div class="grid2">
<select id="diagSkill" disabled style="opacity:.5">
  <option value="medicae">Medicae</option>
  <option value="awareness">Awareness</option>
</select>
</div>

<hr>

<div class="grid2">
  <div>
    <h3>Difficulty</h3>
    <select id="difficulty">${difficultyOptions}</select>
  </div>
  <div>
    <h3>Modifier</h3>
    <input id="mod" type="number" value="0">
  </div>
</div>

<hr>

<h3>Talents</h3>
<div class="grid2">
  <label><input type="checkbox" id="master" ${hasMaster ? "checked" : ""}> Master Chirurgeon</label>
  <label><input type="checkbox" id="superior" ${hasSuperior ? "checked" : ""}> Superior Chirurgeon</label>
  <label><input type="checkbox" id="apoth"> Space Marine Apothecary</label>
</div>

<hr>

<h3>Items</h3>
<div class="grid2">
  <label><input type="checkbox" id="narthecium"> Narthecium +20</label>
  <label><input type="checkbox" id="diagnostor"> Diagnostor +20</label>
  <label><input type="checkbox" id="suture" ${hasSutureItem ? "" : "disabled style='opacity:.5'"}> Field Suture +30</label>
  <label><input type="checkbox" id="medikit"> Medi-kit +10</label>
</div>
</form>
`,
    render: html => {
      const sel = html.find("#diagSkill");
      const toggle = () => {
        const isDiag = html.find("input[name='mode'][value='diagnose']").is(":checked");
        sel.prop("disabled", !isDiag);
        sel.css("opacity", isDiag ? "1" : ".5");
      };

      html.find("input[name='mode']").on("change", toggle);
      toggle();
    },
    buttons: {
      roll: {
        label: "Roll",
        callback: async html => {
          const mode = html.find("input[name='mode']:checked").val();

          const modeNames = {
            first: "First Aid",
            extended: "Extended Care",
            diagnose: "Diagnose",
            staunch: "Staunch Blood Loss"
          };
          const actionName = modeNames[mode];

          const skillName = mode === "diagnose"
            ? html.find("#diagSkill").val()
            : "medicae";

          const difficultyMod = Number(html.find("#difficulty").val());
          const difficultyLabel = html.find("#difficulty option:selected").text();
          const baseSkill = skills?.[skillName]?.total ?? 0;
          let target = baseSkill + difficultyMod + Number(html.find("#mod").val());

          const notes = [];
          let usedSuture = false;

          if (html.find("#master").is(":checked")) {
            target += 10;
            notes.push("Master +10");
          }
          if (html.find("#superior").is(":checked")) {
            target += 20;
            notes.push("Superior +20");
          }
          if (html.find("#narthecium").is(":checked")) {
            target += 20;
            notes.push("Narthecium +20");
          }
          if (html.find("#medikit").is(":checked")) {
            target += 10;
            notes.push("Medi-kit +10");
          }
          if (html.find("#diagnostor").is(":checked") && mode === "diagnose") {
            target += 20;
            notes.push("Diagnostor +20");
          }
          if (html.find("#suture").is(":checked") && mode === "staunch" && hasSutureItem) {
            target += 30;
            notes.push("Field Suture +30");
            usedSuture = true;
          }
          if (mode === "staunch") {
            target -= 10;
            notes.push("Staunch Blood Loss -10");
          }

          target = Math.max(1, target);
          const baseTarget = target;

          const roll = await new Roll("1d100").roll({ async: true });
          const rollVal = roll.total;
          const success =
            rollVal === 1 ? true :
            rollVal === 100 ? false :
            rollVal <= target;
          const degrees = Math.floor(Math.abs(target - rollVal) / 10) + 1;

          async function calcHeal(deg) {
            const intBonus =
              (actor.system.characteristics.intelligence?.bonus ?? 0) +
              Math.floor((actor.system.characteristics.intelligence?.unnatural ?? 0) / 2);

            let heal = deg + intBonus;

            if (html.find("#apoth").is(":checked")) {
              const apothRoll = await new Roll("1d5").roll({ async: true });
              heal += apothRoll.total;
              notes.push(`Apothecary +${apothRoll.total}`);
            }

            if (html.find("#master").is(":checked")) heal += 2;
            return heal;
          }

          let rolledHealAmount = 0;
          let healText = "";
          if (success && (mode === "first" || mode === "extended")) {
            const heal = await calcHeal(degrees);
            rolledHealAmount = heal;
            rememberHealingRoll(heal, `${actor.name} → ${patient.name} (${actionName})`);
            healText = `
  <div style="margin-top:6px;font-weight:bold;font-size:1.2em;">
  Heals <span style="color:#ff2a2a;text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;">${heal}</span> wounds
  </div>`;
          }

          const successColor = success ? "#1aff1a" : "#ff2a2a";

          await show3dDiceRoll(roll);

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
<div style="font-size:1.1em; text-align:center; color: #000000;">
<div style="font-style:italic;font-size:1.1em;"><b>${actor.name}</b> treats <b>${patient.name}</b></div><hr>
<div style="font-size:1.2em; text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black; color: #ff0000;">
<b>${actionName}</b></div>
${mode === "diagnose" ? `<b>Skill:</b> <i>${skillName.charAt(0).toUpperCase() + skillName.slice(1)}</i><br>` : ""}
${(mode === "first" || mode === "extended") ? `<b>State:</b> <b>${state}</b><br>` : ""}
${difficultyLabel ? `
<span style="font-size:1.1em;">
<b>Difficulty: </b><i>${difficultyLabel}</i>
</span>` : ""}
<div style="margin-top:6px;font-size:1.1em;"><b>Target: </b><span style="
  color:#3aa0ff;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${target}</span></div>
<div style="font-size:1.1em;"><b>Roll:</b><span style="
  color:#ff9f1a;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${rollVal}</span>
${notes.length ? `<div style="font-size:1.0em;font-style:italic">${notes.join(" | ")}</div>` : ""}
<div style="text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black; font-weight:bold;color:${successColor}">
${success ? `${degrees} Degrees of Success` : `${degrees} Degrees of Failure`}
</div>
${healText}
</div>`
          });

          if (success && (mode === "first" || mode === "extended") && rolledHealAmount > 0) {
            await promptApplyHealing(rolledHealAmount, `${actor.name} ${actionName}`);
          }

          if (!success && (actor.system.fate?.value ?? 0) > 0) {
            const useFate = await askForFate();
            if (!useFate) return;

            await actor.update({ "system.fate.value": actor.system.fate.value - 1 });

            const fateRoll = await new Roll("1d100").roll({ async: true });
            const fateVal = fateRoll.total;
            const fateSuccess =
              fateVal === 1 ? true :
              fateVal === 100 ? false :
              fateVal <= baseTarget;
            const fateDegrees = Math.floor(Math.abs(baseTarget - fateVal) / 10) + 1;

            let fateHealAmount = 0;
            let fateHealText = "";
            if (fateSuccess && (mode === "first" || mode === "extended")) {
              const heal = await calcHeal(fateDegrees);
              fateHealAmount = heal;
              rememberHealingRoll(heal, `${actor.name} → ${patient.name} (${actionName} Fate)`);
              fateHealText = `
      <div style="margin-top:6px;font-weight:bold;font-size:1.3em;"> Heals <span style=" color:#ff2a2a; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;">${heal}</span> wounds </div>`;
            }

            await show3dDiceRoll(fateRoll);

            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              content: `
      <div style="font-size:1.1em;text-align:center; color: #000000;"> <div> <b style="
  color:gold;
  font-style:italic;
  font-size:1.1em;
   text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">✦ ${actor.name} spends Fate and rerolls! ✦
</b></div><hr>
<div style="font-style:italic;font-size:1.1em;"><b>${actor.name}</b> treats <b>${patient.name}</b></div>
<div style="font-size:1.2em; text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black; color: #ff0000;">
<b>${actionName}</b></div>
${mode === "diagnose" ? `<b>Skill:</b> <i>${skillName.charAt(0).toUpperCase() + skillName.slice(1)}</i><br>` : ""}
${(mode === "first" || mode === "extended") ? `<b>State:</b> <b>${state}</b><br>` : ""}
${difficultyLabel ? `
<span style="font-size:1.1em;">
<b>Difficulty: </b><i>${difficultyLabel}</i>
</span>` : ""}
<div style="margin-top:6px;font-size:1.1em;"><b>Target: </b><span style="
  color:#3aa0ff;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${baseTarget}</span></div>
<div style="font-size:1.1em;"><b>Roll:</b><span style="
  color:#ff9f1a;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${fateVal}</span>
${notes.length ? `<div style="font-size:1.0em;font-style:italic">${notes.join(" | ")}</div>` : ""}
<div style="text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black; font-weight:bold;color:${successColor}">
${fateSuccess ? `${fateDegrees} Degrees of Success` : `${fateDegrees} Degrees of Failure`}
</div>
${fateHealText}
</div>`
            });

            if (fateSuccess && (mode === "first" || mode === "extended") && fateHealAmount > 0) {
              await promptApplyHealing(fateHealAmount, `${actor.name} ${actionName} (Fate)`);
            }
          }

          if (usedSuture && sutureItem) {
            await sutureItem.delete();
          }
        }
      }
    }
  }).render(true);
}

async function openHealingFlow({ token: providedToken = null, prefillAmount = null, sourceLabel = "" } = {}) {
  if (!game.user.isGM) {
    ui.notifications.warn("Only GMs can apply healing.");
    return;
  }

  const token = providedToken ?? canvas.tokens.controlled[0];
  if (!token) {
    ui.notifications.warn("Select a token.");
    return;
  }

  const actor = token.actor;
  const wounds = foundry.utils.deepClone(actor.system.wounds);

  const safePrefillAmount = Number.isFinite(Number(prefillAmount)) ? Math.max(0, Math.floor(Number(prefillAmount))) : 0;
  const historyOptions = healingRollHistory
    .map((entry, index) => `<option value="${index}" ${index === 0 ? "selected" : ""}>${entry.amount} — ${entry.label}</option>`)
    .join("");
  const hasHistory = healingRollHistory.length > 0;

  new Dialog({
    title: `Heal ${actor.name}`,
    content: `
    <form>
      <div style="text-align:center; margin-bottom:8px;">
        <b>Current Status</b><br>
        Wounds: <span style="color:#ff2a2a; font-weight:bold;">${wounds.value}</span><br>
        Critical: <span style="color:#ff2a2a; font-weight:bold;">${wounds.critical}</span>
      </div>

      <hr>

      <div style="display:flex; flex-direction:column; gap:6px;">
        <label><b>Healing Roll</b></label>
        <select id="healingSource">
          ${hasHistory ? `<option value="history">Available Healing Rolls</option>` : ""}
          <option value="custom" ${!hasHistory || safePrefillAmount > 0 ? "selected" : ""}>Custom</option>
        </select>

        ${hasHistory ? `
        <select id="historyRoll" ${safePrefillAmount > 0 ? "style='display:none'" : ""}>
          ${historyOptions}
        </select>` : ""}

        <label><b>Healing Amount</b></label>
        <input id="heal" type="number" value="${safePrefillAmount}" min="0"/>
        ${sourceLabel ? `<div style="font-size:0.9em; opacity:0.8;">Source: ${sourceLabel}</div>` : ""}
      </div>
    </form>
  `,
    render: html => {
      const source = html.find("#healingSource");
      const history = html.find("#historyRoll");
      const amount = html.find("#heal");

      const setAmountFromHistory = () => {
        if (!history.length) return;
        const entry = healingRollHistory[Number(history.val())];
        if (entry) amount.val(entry.amount);
      };

      const toggleInputs = () => {
        const mode = source.val();
        const usingHistory = mode === "history" && history.length;
        history.toggle(usingHistory);
        amount.prop("readonly", usingHistory);
        if (usingHistory) setAmountFromHistory();
      };

      source.on("change", toggleInputs);
      history.on("change", setAmountFromHistory);
      toggleInputs();
    },
    buttons: {
      heal: {
        label: "Apply Healing",
        callback: async html => {
          let amount = Number(html.find("#heal").val());
          if (!amount || amount <= 0) return;

          let healedCrit = 0;
          let healedWounds = 0;

          if (wounds.critical > 0) {
            const reduce = Math.min(amount, wounds.critical);
            wounds.critical -= reduce;
            amount -= reduce;
            healedCrit = reduce;
          }

          if (amount > 0 && wounds.value > 0) {
            const reduce = Math.min(amount, wounds.value);
            wounds.value -= reduce;
            healedWounds = reduce;
          }

          await actor.update({ "system.wounds": wounds });

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
              <div style="text-align:center; color:#000000; font-size:1.1em;">
                <div style="font-style:italic;font-size:1.1em;">
                  <b>${actor.name}</b> receives treatment
                </div>
                <hr>
                <div>
                  ${healedCrit ? `Critical Damage Healed: <b>${healedCrit}</b><br>` : ""}
                  ${healedWounds ? `Wounds Healed: <b>${healedWounds}</b><br>` : ""}
                </div>
                <div style="margin-top:6px;">
                  <b>Remaining:</b> Crit <b>${wounds.critical}</b> | Wounds <b>${wounds.value}</b>
                </div>
              </div>
            `
          });
        }
      }
    }
  }).render(true);
}

async function openFateRestore() {
  if (!game.user.isGM) {
    ui.notifications.warn("Only GMs can restore Fate.");
    return;
  }

  if (!canvas.tokens.controlled.length) {
    ui.notifications.warn("Select your token first.");
    return;
  }

  const actor = canvas.tokens.controlled[0].actor;
  const current = actor.system.fate?.value ?? 0;
  const max = actor.system.fate?.max ?? 0;

  new Dialog({
    title: "Restore Fate",
    content: `
    <form>
      <div style="text-align:center;margin-bottom:8px;">
        <b>${actor.name}</b><br>
        Fate: ${current}/${max}
      </div>

      <hr>

      <div style="display:grid;grid-template-columns: 1fr 1fr;gap:8px;align-items:center;">
        <label>
          <input type="checkbox" id="fullRestore" checked>
          Full Restore
        </label>
        <div>
          Amount:
          <input id="amount" type="number" value="1" min="1" disabled style="width:60px;">
        </div>
      </div>
    </form>
    `,
    render: html => {
      html.find("#fullRestore").change(event => {
        html.find("#amount").prop("disabled", event.target.checked);
      });
    },
    buttons: {
      restore: {
        label: "Restore",
        callback: async html => {
          const full = html.find("#fullRestore")[0]?.checked;
          const restoreAmount = full ? (max - current) : Number(html.find("#amount").val());
          if (!Number.isFinite(restoreAmount) || restoreAmount <= 0) return;

          const newValue = current + restoreAmount;
          await actor.update({ "system.fate.value": newValue });

          const exceeded = newValue > max;
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
            <div style="text-align:center;font-style:italic; font-size:1.2em;">
              <b>${actor.name}</b> has his Fate restored by<br>
              <b style="color:#6EC1FF; text-shadow:
                  0 0 1px black,
                  0 0 2px black,
                  1px 1px 0 black,
                 -1px -1px 0 black;">+${restoreAmount}</b><br>
              Now: <b>${newValue}</b> / ${max}
              ${exceeded ? `<br><span style="color:orange; text-shadow:
                  0 0 1px black,
                  0 0 2px black,
                  1px 1px 0 black,
                 -1px -1px 0 black;">Bonus Fate gained</span>` : ""}
            </div>
            `
          });
        }
      }
    }
  }).render(true);
}

async function openFatigueManager() {
  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can use Fatigue Manager.");
    return;
  }
  if (!canvas.tokens.controlled.length) {
    ui.notifications.warn("Select your token first.");
    return;
  }

  const actor = canvas.tokens.controlled[0].actor;
  if (!actor) return;

  const current = actor.system.fatigue?.value ?? 0;
  const max = actor.system.fatigue?.max ?? 0;
  const tb = actor.system.characteristics?.toughness?.bonus ?? 0;
  const unconsciousMinutes = Math.max(0, 10 - tb);

  new Dialog({
    title: "Apply Fatigue",
    content: `
<form>
  <div style="text-align:center;margin-bottom:8px;">
    <b>${actor.name}</b><br>
    Fatigue: ${current}/${max}
  </div>
  <hr>
  <div style="display:grid;grid-template-columns: 1fr 1fr;gap:8px;align-items:center;">
    <label>
      <input type="checkbox" id="reset" checked>
      Unmodified (Reset to 0)
    </label>
    <div>
      Amount:
      <input id="amount" type="number" value="1" min="1" disabled style="width:60px;">
    </div>
  </div>
</form>
`,
    render: html => {
      html.find("#reset").change(ev => {
        html.find("#amount").prop("disabled", ev.target.checked);
      });
    },
    buttons: {
      apply: {
        label: "Apply",
        callback: async html => {
          const reset = html.find("#reset")[0].checked;

          let newValue;
          let fatigueAdded = 0;

          if (reset) {
            newValue = 0;
          } else {
            fatigueAdded = Number(html.find("#amount").val());
            if (fatigueAdded <= 0) return;
            newValue = current + fatigueAdded;
          }

          await actor.update({
            "system.fatigue.value": newValue
          });

          const exceeded = newValue > max;
          const unconscious = newValue >= max && max > 0;
          if (unconscious) {
            await addConvenientEffectToActor({
              actorUuid: actor.uuid,
              effectId: "unconscious",
              effectName: "Unconscious",
              counter: unconsciousMinutes > 1 ? unconsciousMinutes : null
            });
          }

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
<div style="text-align:center;font-style:italic; font-size:1.2em;">
  <b>${actor.name}</b><br>
  ${reset
    ? "removes all Fatigue"
    : `gains <b style="color:#C76EFF; text-shadow:
      0 0 1px black,
      0 0 2px black,
      1px 1px 0 black,
      -1px -1px 0 black;">+${fatigueAdded}</b> Fatigue`
  }
  <br>
  Now: <b>${newValue}</b> / ${max}
  ${exceeded
    ? `<br><span style="color:orange; font-size:1.0em; text-shadow:
      0 0 1px black,
      0 0 2px black,
      1px 1px 0 black,
      -1px -1px 0 black;">Fatigue limit exceeded</span>`
    : ""}
  ${unconscious
    ? `<br><span style="color:red; font-size:1.0em; text-shadow:
      0 0 1px black,
      0 0 2px black,
      1px 1px 0 black,
      -1px -1px 0 black;"><b>${actor.name} falls unconscious due to fatigue damage!</b></span><br>Unconscious for <b>${unconsciousMinutes}</b> minute${unconsciousMinutes === 1 ? "" : "s"}.
      </span>`
    : ""}
</div>
`
          });
        }
      }
    }
  }).render(true);
}

async function openAmmoReload() {
  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can use Ammo Reload.");
    return;
  }

  if (!canvas.tokens.controlled.length) {
    ui.notifications.warn("Select your token first.");
    return;
  }

  const actor = canvas.tokens.controlled[0].actor;

  const weapons = actor.items.filter(i =>
    i.type === "weapon" &&
    i.system?.clip?.max > 0
  );

  if (!weapons.length) {
    ui.notifications.warn("No reloadable weapons found.");
    return;
  }

  const weaponOptions = weapons.map(w =>
    `<option value="${w.id}">
    ${w.name} (${w.system.clip.value}/${w.system.clip.max})
  </option>`
  ).join("");

  new Dialog({
    title: "Reload Weapon",

    content: `
<form>

<div class="form-group">
<label><b>Weapon</b></label>
<select id="weapon">${weaponOptions}</select>
</div>

<div class="form-group">
<label><b>Ammo</b></label>
<select id="ammo"></select>
</div>

<hr>

<div style="
display:grid;
grid-template-columns: 1fr 1fr;
gap:8px;
align-items:center;
">

<label>
<input type="checkbox" id="fullReload" checked>
Full Reload
</label>

<div>
Rounds:
<input id="rounds" type="number" min="1" value="1" disabled style="width:60px;">
</div>

</div>

</form>
`,

    render: html => {
      html.find("#fullReload").change(ev => {
        html.find("#rounds").prop("disabled", ev.target.checked);
      });

      function updateAmmo() {
        const weapon = actor.items.get(html.find("#weapon").val());

        const ammoItems = actor.items.filter(i =>
          i.type === "ammunition" &&
          (i.system?.weapon ?? "").toLowerCase().trim() === weapon.name.toLowerCase().trim()
        );

        if (!ammoItems.length) {
          html.find("#ammo").html(`<option value="">No compatible ammo</option>`);
          return;
        }

        const opts = ammoItems.map(a => {
          const qty = a.system?.quantity ?? a.system?.clip?.value ?? 0;
          return `<option value="${a.id}">${a.name} (${qty})</option>`;
        }).join("");

        html.find("#ammo").html(opts);
      }

      updateAmmo();
      html.find("#weapon").change(updateAmmo);
    },

    buttons: {
      reload: {
        label: "Reload",

        callback: async html => {
          const weapon = actor.items.get(html.find("#weapon").val());
          const ammo = actor.items.get(html.find("#ammo").val());

          if (!ammo) return;

          const current = weapon.system.clip.value ?? 0;
          const max = weapon.system.clip.max ?? 0;

          const ammoQty =
            ammo.system?.quantity ??
            ammo.system?.clip?.value ??
            0;

          if (ammoQty <= 0) {
            ui.notifications.warn("No ammo left.");
            return;
          }

          const fullReload = html.find("#fullReload")[0].checked;

          let wanted;

          if (fullReload)
            wanted = max - current;
          else
            wanted = Number(html.find("#rounds").val());

          if (wanted <= 0) return;

          const used = Math.min(wanted, ammoQty, max - current);

          if (used <= 0) {
            ui.notifications.info("Weapon already full.");
            return;
          }

          const newWeapon = current + used;
          const newAmmo = ammoQty - used;

          await weapon.update({
            "system.clip.value": newWeapon
          });

          if (ammo.system?.quantity != null)
            await ammo.update({ "system.quantity": newAmmo });

          else if (ammo.system?.clip?.value != null)
            await ammo.update({ "system.clip.value": newAmmo });

          if (newAmmo <= 0)
            await ammo.delete();

          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
<div style="text-align:center;font-style:italic; font-size:1.2em;">
<b>${actor.name}</b> reloads <b>${weapon.name}</b><br>
Using <b>${ammo.name}</b><br>
<b style="color:#6EC1FF; text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;">${used}</b> rounds loaded
</div>
`
          });
        }
      }
    }
  }).render(true);
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
          await show3dDiceRoll(roll);
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
<div style="text-align:center; font-size:1.1em;">

<div style="font-style:italic; font-size:1.1em;">
<b>${actor.name}</b> performs a <b>${label}</b> Test
</div>

<hr>

<div style="font-size:1.0em;">${modLine}</div>

<div style="margin-top:6px;font-size:1.2em;">
<b>Target:</b>
<span style="
  color:#3aa0ff;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${displayTarget}</span>
</div>

<div style="font-size:1.2em;">
<b>Roll:</b>
<span style="
  color:#ff9f1a;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${result}</span>
</div>

${dos ? `<div style="font-weight:bold;font-size:1.3em;">
<span style="color:#1aff1a;text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;">
${finalDoS} Degrees of Success
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
<span style="color:#ff2a2a;
text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;"> ${dof} Degrees of Failure</span><br>
</div>` : ""}

</div></div>`
          });

          if (!success && actor.system.fate?.value > 0) {
            const useFate = await askForFateReroll(actor);

            if (useFate) {
              await actor.update({ "system.fate.value": actor.system.fate.value - 1 });

              const roll2 = await new Roll("1d100").roll({ async: true });
              await show3dDiceRoll(roll2);
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
<div style="text-align:center; font-size:1.1em;">
<b style="color:gold;">${actor.name} spends Fate and rerolls!</b>
<hr>
<div style="text-align:center;">

<div style="font-style:italic;font-size:1.1em;">
<b>${actor.name}</b> performs a <b>${label}</b> Test
</div>

<hr>

<div style="font-size:1.0em;">${modLine}</div>

<div style="margin-top:6px;font-size:1.2em;">
<b>Target:</b>
<span style="
  color:#3aa0ff;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${displayTarget}</span>
</div>

<div style="font-size:1.2em;">
<b>Roll:</b>
<span style="
  color:#ff9f1a;
  font-weight:bold;
  text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;
">${result2}</span>
</div>

${dos2 ? `<div style="font-weight:bold;font-size:1.3em;">
<span style="color:#1aff1a;text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;">
${finalDoS2} Degrees of Success
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
<span style="color:#ff2a2a;
text-shadow:
    0 0 1px black,
    0 0 2px black,
    1px 1px 0 black,
   -1px -1px 0 black;"> ${dof2} Degrees of Failure</span><br>
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

async function openFearTest() {
  const token = canvas.tokens.controlled[0];
  if (!token) return ui.notifications.warn("Select your character first.");

  const actor = token.actor;
  let fate = actor.system.fate?.value ?? 0;

  const roll3d = game.dice3d;

  const FEAR_TABLE = [
    { max: 20, text: "The character is badly startled. He can only take a single Half Action during his next turn, but afterward he acts normally." },
    { max: 40, text: "Fear grips the character and he begins to shake and tremble. He suffers a -10 penalty on all tests for the rest of the encounter unless he can recover his wits (see Shock and Snapping Out of It, page 286)." },
    { max: 60, text: "Reeling with shock, the character backs away from the source of his Fear. He cannot willingly approach the object of his Fear, but can otherwise act normally, with a -10 penalty on all tests until the end of the encounter." },
    { max: 80, text: "The character is frozen by terror. He can take no actions until he recovers himself (see Shock and Snapping Out of It, page 286). After snapping out of it, he makes all tests with a -10 penalty for the rest of the encounter." },
    { max: 100, text: "Panic grips the character. He must flee the source of his fear, if able, as fast as he can, and if prevented from doing so, can only take Half Actions and is at a -20 penalty to all tests. Once away from the danger, he must successfully Snap Out of It (see Shock and Snapping Out of It, page 286) to regain control." },
    { max: 120, text: "Fainting dead away, the character keels over and remains Unconscious for 1d5 rounds. Once he regains consciousness, he is still shaken and takes all tests with a -10 penalty until the end of the encounter." },
    { max: 130, text: "Totally overcome, the character screams and vomits uncontrollably for 1d5 rounds. During this time he can do nothing, and drops anything he is holding. Afterward, until the end of the encounter, the character can only take a single Half Action each turn." },
    { max: 140, text: "The character laughs hysterically and randomly attacks anything near him in a manic frenzy, firing wildly or attacking with whatever he has at hand. This effect lasts until the character Snaps Out of It (see Shock and Snapping Out of It, page 286), or until he is knocked Unconscious or otherwise incapacitated." },
    { max: 160, text: "The character crumples to the ground for 1d5+1 rounds and begins sobbing, babbling, and tearing at his own flesh, and can do nothing else. Even after he returns to his senses, he is a complete mess, and suffers a -20 penalty on all tests until the end of the encounter." },
    { max: 170, text: "The character's mind snaps. He becomes catatonic for 1d5 hours; for that time, he is Unconscious and cannot be roused." },
    { max: 999, text: "HEARTSTOP" }
  ];
  const FEAR_CONDITION_MAP = {
    fear: { id: "fear", name: "Fear", aliases: ["Frightened"] },
    stunned: { id: "stunned", name: "Stunned" },
    unconscious: { id: "unconscious", name: "Unconscious" },
    prone: { id: "prone", name: "Prone" },
    bleeding: { id: "bleeding", name: "Bleeding", aliases: ["Blood Loss"] }
  };

  const selectedTarget = [...game.user.targets][0];
  const targetTraits = selectedTarget?.actor?.items?.filter(i => i.type === "trait")?.map(i => String(i.name ?? "")) ?? [];
  const fearTrait = targetTraits.find(name => /fear\s*\(\s*\d+\s*\)/i.test(name)) ?? "";
  const fearLevelMatch = fearTrait.match(/fear\s*\(\s*(\d+)\s*\)/i);
  const suggestedFearLevel = Math.min(4, Math.max(1, Number(fearLevelMatch?.[1] ?? 1)));

  async function d100() {
    const r = await new Roll("1d100").evaluate({ async: true });
    if (roll3d) roll3d.showForRoll(r);
    return r.total;
  }

  const rollInlineDiceText = async text => {
    let result = String(text ?? "");
    const diceRegex = /(\d+d\d+(?:\+\d+)?)/gi;
    const matches = [...result.matchAll(diceRegex)];
    for (const match of matches) {
      const expr = match[1];
      const roll = await new Roll(expr).evaluate({ async: true });
      if (roll3d) roll3d.showForRoll(roll);
      result = result.replace(expr, String(roll.total));
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
    const value = String(raw ?? "").trim().toLowerCase();
    if (!value) return 0;
    if (/^\d+$/.test(value)) return Number(value);
    if (value === "a" || value === "an" || value === "one" || value === "next") return 1;
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
  const extractFearConditionCounts = text => {
    const plain = String(text ?? "").replace(/<[^>]*>/g, " ").toLowerCase();
    const counts = {};
    const add = (id, amount = 1) => {
      counts[id] = (counts[id] ?? 0) + Math.max(Number(amount) || 0, 0);
    };
    if (/\bfear\b|\bfrightened\b|\bshocked\b|\bpanic\b|\bsnap out of it\b|\bfrozen by terror\b/.test(plain)) counts.fear = 1;
    if (/\bprone\b/.test(plain)) add("prone");
    if (/\bblood\s+loss\b|\bbleeding\b/.test(plain)) add("bleeding");

    const stunnedRounds = extractRoundsByKeyword(plain, /\bstunned\b/);
    if (stunnedRounds > 0) add("stunned", stunnedRounds);
    else if (/\bstunned\b|\bfrozen by terror\b/.test(plain)) add("stunned", 1);

    const unconsciousRounds = extractRoundsByKeyword(plain, /\bunconscious\b/);
    if (unconsciousRounds > 0) add("unconscious", unconsciousRounds);
    else if (/\bunconscious\b|\bcatatonic\b|\bfainting dead away\b/.test(plain)) add("unconscious", 1);
    return counts;
  };

  new Dialog({
    title: "Fear Test",
    content: `<form>
<label><input type="checkbox" id="heretic"> Heretic</label><br><br>
Fear Level:<br>
<select id="fearMod">
<option value="0" ${suggestedFearLevel === 1 ? "selected" : ""}>Fear 1</option>
<option value="-10" ${suggestedFearLevel === 2 ? "selected" : ""}>Fear 2</option>
<option value="-20" ${suggestedFearLevel === 3 ? "selected" : ""}>Fear 3</option>
<option value="-30" ${suggestedFearLevel === 4 ? "selected" : ""}>Fear 4</option>
</select><br><br>
Custom Modifier:<br>
<input id="mod" type="number" value="0" style="width:70px"><br><br>
<hr>
<label><input type="checkbox" id="faith"> Unshakeable Faith/Will</label><br>
<label><input type="checkbox" id="iron"> Iron Resolve</label><br>
<label><input type="checkbox" id="adamant"> Adamantium Faith</label><br>
</form>`,
    buttons: {
      roll: {
        label: "Roll",
        callback: async html => {
          let target = actor.system.characteristics.willpower.total;
          const baseFearMod = Number(html.find("#fearMod").val());
          let testFearMod = baseFearMod;
          if (html.find("#heretic")[0].checked) testFearMod += 10;
          const customMod = Number(html.find("#mod").val()) || 0;
          target += testFearMod + customMod;
          target = Math.max(1, target);

          function getDoF(roll, notes, testTarget) {
            const rawDoF = Math.floor((roll - testTarget) / 10) + 1;
            let dof = rawDoF;
            let forcedSuccess = false;
            let wpbReduction = 0;

            if (html.find("#adamant")[0].checked) {
              const wp = actor.system.characteristics.willpower.total;
              const wpb = Math.floor(wp / 10);
              dof -= wpb;
              wpbReduction = wpb;
              if (rawDoF > 0) notes.push(`Adamantium Faith: −${wpb} DoF`);
              if (rawDoF > 0 && dof <= 0) {
                forcedSuccess = true;
                dof = 0;
                notes.push("Adamantium Faith turned failure into SUCCESS");
              }
            }

            if (dof < 0) dof = 0;
            return { dof, forcedSuccess, wpbReduction };
          }

          async function postResult(title, roll, rollHistory, notes, dof, wpbReduction, success, testTarget) {
            const fearText = html.find("#fearMod option:selected").text();
            const fearLine = baseFearMod >= 0 ? `+${baseFearMod}` : `${baseFearMod}`;
            const modsLine = customMod >= 0 ? `+${customMod}` : `${customMod}`;
            const heretic = html.find("#heretic")[0].checked;
            const dos = success ? Math.floor((testTarget - roll) / 10) + 1 : 0;

            const fateLine = title === "Fate Reroll"
              ? `<div style="color:gold; font-size:1.1em; text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black; font-weight:bold;">${actor.name} rerolled with Fate</div>`
              : "";

            const notesBlock = notes.length
              ? `<div style="margin-top:4px; font-style:italic; opacity:0.85;">${notes.join(" | ")}</div>`
              : "";

            ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              content: `
<div style="text-align:center; color:#000000; font-size:1.1em;">
${fateLine}
<div style="font-style:italic; font-size:1.1em;">
<b>${actor.name}</b> performs a <b>Fear Test</b> ${selectedTarget ? `against <b>${selectedTarget.name}</b>` : ""}
</div>
<hr>
<div><b>Fear Level:</b> ${fearText} (${fearLine})${heretic ? " | Heretic +10" : ""}</div>
<div><b>Modifier:</b> ${modsLine}</div>
<div style="margin-top:6px;font-size:1.2em;">
<b>Target:</b> <span style="color:#3aa0ff; font-weight:bold; text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;">${testTarget}</span>
</div>
<div style="font-size:1.2em; margin-top:4px;">
<b>Rolls:</b><br>${rollHistory.map(r => `${r.label}: <span style="color:#ff9f1a; font-weight:bold; text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;">${r.value}</span>`).join("<br>")}
</div>
${notesBlock}
${success
    ? `<div style="font-size:1.2em; font-weight:bold; color:#1aff1a; text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black; margin-top:6px;">${dos} Degrees of Success${wpbReduction ? `<br><span style="font-size:0.85em;">Reduced by WPB ${wpbReduction}</span>` : ""}</div>`
    : `<div style="font-size:1.2em; font-weight:bold; color:#ff2a2a; text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black; margin-top:6px;">${dof} Degrees of Failure${wpbReduction ? `<br><span style="font-size:0.85em;">Reduced by WPB ${wpbReduction}</span>` : ""}</div>`
}
</div>`
            });
          }

          async function rollFear(dof) {
            let insanityBlock = "";
            if (dof >= 3) {
              const insanityRoll = await new Roll("1d5").evaluate({ async: true });
              if (roll3d) roll3d.showForRoll(insanityRoll);
              const currentInsanity = actor.system.insanity ?? 0;
              const newInsanity = currentInsanity + insanityRoll.total;
              await actor.update({ "system.insanity": newInsanity });
              insanityBlock = `<div style="margin-top:6px; font-size:1.05em;"><b>Insanity Increase:</b> <span style="color:#ff9f1a; font-weight:900; text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;">${insanityRoll.total}</span><br><b>Insanity Total:</b> <span style="color:#ff2a2a; font-weight:900; text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;">${newInsanity}</span> <span style="font-size:0.9em;"><i>(${currentInsanity} + ${insanityRoll.total})</i></span></div>`;
            }

            const fearRoll = await d100();
            const result = fearRoll + dof * 10;
            const entry = FEAR_TABLE.find(e => result <= e.max);
            const baseText = entry?.text ?? "";
            const rolledText = await rollInlineDiceText(baseText);
            const text = stylizeConditionText(rolledText);
            const conditionCounts = extractFearConditionCounts(rolledText);
            const fearRecipientUuid = actor.uuid;
            for (const [conditionId, amountRaw] of Object.entries(conditionCounts)) {
              const amount = Math.max(Number(amountRaw ?? 0), 0);
              if (amount <= 0) continue;
              const mappedCondition = FEAR_CONDITION_MAP[conditionId];
              if (!mappedCondition) continue;
              await addConvenientEffectToActor({
                actorUuid: fearRecipientUuid,
                effectId: mappedCondition.id,
                effectName: mappedCondition.name,
                effectNames: mappedCondition.aliases ?? [],
                counter: amount > 1 ? amount : null
              });
            }

            ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              content: `
<div style="text-align:center; color:#000000; font-size:1.1em;">
<div style="font-style:italic;font-size:1.1em;"><b>${actor.name}</b> rolls on the <b>Shock Table</b></div>
${insanityBlock}
<hr>
<div><b>Shock Roll:</b> <span style="color:#ff9f1a; font-weight:bold; text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;">${fearRoll}</span> <span style="font-size:0.9em;"><i>(+${dof * 10} from DoF)</i></span></div>
<div style="margin-top:6px;font-size:1.2em;"><b>Shock Total:</b> <span style="color:#3aa0ff; font-weight:bold; text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;">${result}</span></div>
<div style="margin-top:8px; font-size:1.1em;">${text}</div>
</div>`
            });
          }

          let rollHistory = [];
          let notes = [];
          let roll = await d100();
          rollHistory.push({ label: "Initial Roll", value: roll });

          if (roll > target && html.find("#faith")[0].checked) {
            roll = await d100();
            rollHistory.push({ label: "Unshakeable Faith", value: roll });
            notes.push("Unshakeable Faith reroll");
          }

          let comparisonTarget = target;
          if (roll > comparisonTarget && html.find("#iron")[0].checked) {
            const ironTarget = target + 10;
            const newRoll = await d100();
            rollHistory.push({ label: "Iron Resolve", value: `${newRoll} vs ${ironTarget}` });
            notes.push("Iron Resolve reroll (+10 target)");
            roll = newRoll;
            comparisonTarget = ironTarget;
          }

          let { dof, forcedSuccess, wpbReduction } = getDoF(roll, notes, comparisonTarget);
          let success = (roll <= comparisonTarget) || forcedSuccess;

          await postResult("Initial Test", roll, rollHistory, notes, dof, wpbReduction, success, comparisonTarget);

          if (!success && fate > 0) {
            new Dialog({
              title: "Spend Fate?",
              content: `Spend 1 Fate to reroll?<br><b>(Current: ${fate})</b>`,
              buttons: {
                yes: {
                  label: "Reroll (Fate -1)",
                  callback: async () => {
                    fate--;
                    await actor.update({ "system.fate.value": fate });
                    rollHistory = [];
                    roll = await d100();
                    rollHistory.push({ label: "Fate Roll", value: roll });
                    notes = ["Fate reroll"];
                    ({ dof, forcedSuccess, wpbReduction } = getDoF(roll, notes, target));
                    success = (roll <= target) || forcedSuccess;
                    await postResult("Fate Reroll", roll, rollHistory, notes, dof, wpbReduction, success, target);
                    if (!success) await rollFear(dof);
                  }
                },
                no: { label: "No", callback: async () => { await rollFear(dof); } }
              }
            }).render(true);
          } else if (!success) {
            await rollFear(dof);
          }
        }
      },
      cancel: { label: "Cancel" }
    }
  }).render(true);
}


function hasActorEffectByIdOrName(actor, { effectId = "", effectName = "" } = {}) {
  if (!actor) return false;
  const effectIdLc = String(effectId ?? "").toLowerCase();
  const effectNameLc = String(effectName ?? "").toLowerCase();
  return actor.effects.some(effect => {
    const statuses = Array.isArray(effect.statuses) ? effect.statuses : Array.from(effect.statuses ?? []);
    const statusIds = statuses.map(status => String(status ?? "").toLowerCase());
    const coreStatus = String(effect.flags?.core?.statusId ?? "").toLowerCase();
    const ceId = String(effect.flags?.["dfreds-convenient-effects"]?.effectId ?? "").toLowerCase();
    const name = String(effect.name ?? "").toLowerCase();
    if (effectIdLc && (statusIds.includes(effectIdLc) || coreStatus === effectIdLc || ceId === effectIdLc || name === effectIdLc)) return true;
    if (effectNameLc && name.includes(effectNameLc)) return true;
    return false;
  });
}

function buildForceFieldOutlined(value, color) {
  return `<span style="color:${color};font-weight:900;text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;">${value}</span>`;
}

function getPreferredForceField(actor) {
  const fields = actor?.items?.filter(i => i.type === "forceField") ?? [];
  if (!fields.length) return null;
  return fields
    .slice()
    .sort((a, b) => Number(b?.system?.protectionRating ?? 0) - Number(a?.system?.protectionRating ?? 0))[0];
}

async function evaluateForceFieldForActor({ actor, token = null, field = null, postToChat = true, reason = "workflow" } = {}) {
  if (!actor) return { skipped: true, reason: "no-actor" };

  const overloaded = hasActorEffectByIdOrName(actor, { effectId: FORCE_FIELD_OVERLOADED_EFFECT_ID, effectName: FORCE_FIELD_OVERLOADED_EFFECT_NAME });
  if (overloaded) return { skipped: true, reason: "overloaded" };

  const active = hasActorEffectByIdOrName(actor, { effectId: FORCE_FIELD_ACTIVE_EFFECT_ID, effectName: FORCE_FIELD_ACTIVE_EFFECT_NAME });
  if (!active) return { skipped: true, reason: "inactive" };

  const selectedField = field ?? getPreferredForceField(actor);
  if (!selectedField) return { skipped: true, reason: "no-force-field" };

  const protection = Number(selectedField.system?.protectionRating ?? 0);
  const overload = Number(selectedField.system?.overloadChance ?? 0);
  const roll = await new Roll("1d100").roll({ async: true });
  await show3dDiceRoll(roll);
  const result = Number(roll.total ?? 0);

  const overloadedNow = result <= overload;
  const protectedHit = !overloadedNow && result <= protection;

  let text = "❌ FAILED";
  let color = "#ff2a2a";
  if (overloadedNow) {
    text = "⚡ OVERLOADED";
    color = "#ffad55";
  } else if (protectedHit) {
    text = "🛡 PROTECTED";
    color = "#1aff1a";
  }

  if (overloadedNow) {
    await removeConvenientEffectFromActor({
      actorUuid: actor.uuid,
      effectId: FORCE_FIELD_ACTIVE_EFFECT_ID,
      effectName: FORCE_FIELD_ACTIVE_EFFECT_NAME
    });
    await addConvenientEffectToActor({
      actorUuid: actor.uuid,
      effectId: FORCE_FIELD_OVERLOADED_EFFECT_ID,
      effectName: FORCE_FIELD_OVERLOADED_EFFECT_NAME
    });
  }

  const tokenName = token?.name || actor.name;
  if (postToChat) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor, token }),
      content: `
<div style="text-align:center; color:#000; font-size:1.05em;">
  <div style="font-style:italic; font-size:1.2em;"><b>${tokenName}</b>'s <b>${selectedField.name}</b> force field check.</div>
  <hr>
  <div><b>Protection:</b> ≤ ${buildForceFieldOutlined(protection, "#ffad55")}</div>
  <div><b>Overload:</b> ≤ ${buildForceFieldOutlined(overload, "#ffad55")}</div>
  <hr>
  <div><b>Roll:</b> ${buildForceFieldOutlined(result, "#bd7548")}</div>
  <hr>
  <div style="font-size:1.35em; font-weight:900; color:${color}; text-shadow:0 0 2px black;">${text}</div>
  ${reason === "workflow" ? `<div style="margin-top:6px; font-style:italic;">Attack interception check</div>` : ""}
</div>`
    });
  }

  return {
    skipped: false,
    outcome: overloadedNow ? "overloaded" : (protectedHit ? "protected" : "failed"),
    result,
    protection,
    overload,
    fieldId: selectedField.id,
    fieldName: selectedField.name,
    protectedHit,
    overloaded: overloadedNow
  };
}

async function resolveForceFieldIntercept({ tokenUuid = "", postToChat = true } = {}) {
  const tokenDoc = tokenUuid ? await fromUuid(tokenUuid) : canvas.tokens.controlled[0] ?? null;
  const actor = tokenDoc?.actor;
  if (!actor) return { skipped: true, reason: "no-actor" };
  return evaluateForceFieldForActor({ actor, token: tokenDoc, postToChat, reason: "workflow" });
}

async function openForceFieldCheck() {
  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can run manual Force Field checks.");
    return;
  }

  const token = canvas.tokens.controlled[0];
  if (!token?.actor) {
    ui.notifications.warn("Select a token first.");
    return;
  }

  const actor = token.actor;
  const fields = actor.items.filter(i => i.type === "forceField");
  if (!fields.length) {
    ui.notifications.warn("No Force Fields found on actor.");
    return;
  }

  const options = fields.map(field => `<option value="${field.id}">${field.name}</option>`).join("");

  new Dialog({
    title: "Force Field Check",
    content: `
<form>
  <div class="form-group">
    <label><b>Force Field</b></label>
    <select id="ff">${options}</select>
  </div>
</form>`,
    buttons: {
      roll: {
        label: "Roll Protection",
        callback: async html => {
          const fieldId = html.find("#ff").val();
          const selected = actor.items.get(fieldId) ?? fields[0];
          await evaluateForceFieldForActor({ actor, token, field: selected, postToChat: true, reason: "manual" });
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "roll"
  }).render(true);
}

async function runHudForceFieldCheck() {
  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can run Force Field checks.");
    return;
  }

  const token = canvas.tokens.controlled[0];
  if (!token?.actor) {
    ui.notifications.warn("Select a token first.");
    return;
  }

  await evaluateForceFieldForActor({ actor: token.actor, token, postToChat: true, reason: "manual" });
}

async function runStep(step) {
  const handlers = {
    attack: { gmOnly: false, execute: runAttackWorkflow },
    psychic: { gmOnly: false, execute: runPsychicPowerWorkflow },
    defense: { gmOnly: false, execute: runDefenseWorkflow },
    damage: { gmOnly: false, execute: runDamageWorkflow },
    master: { gmOnly: false, execute: openLauncher },
    gmMaster: { gmOnly: true, execute: openLauncher },
    applyDamage: { gmOnly: true, execute: runApplyDamageWorkflow },
    fear: { gmOnly: false, execute: openFearTest },
    forceField: { gmOnly: true, execute: openForceFieldCheck }
  };

  const handler = handlers[step];
  if (!handler) {
    ui.notifications.warn(`Warhammer 40k Cogitator: Unknown workflow step '${step}'.`);
    return;
  }

  if (handler.gmOnly && !game.user.isGM) {
    ui.notifications.warn("Warhammer 40k Cogitator: This workflow step is GM-only.");
    return;
  }

  await handler.execute();
}

function reportLegacyMacroSettings() {
  const legacyKeys = [
    "attackMacroName",
    "defenseMacroName",
    "damageMacroName",
    "masterMacroName",
    "autoCreateMacros"
  ];

  const worldSettings = game.settings.storage?.get("world");
  if (!worldSettings) return;

  const found = legacyKeys.filter(key => worldSettings.get(`${COGITATOR_ID}.${key}`));
  if (!found.length) return;

  console.info(`Warhammer 40k Cogitator | Legacy macro settings detected and ignored in macro-free mode: ${found.join(", ")}`);
}
