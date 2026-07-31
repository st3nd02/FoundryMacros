function foundryGeneration() {
  const generation = Number(game.release?.generation);
  if (Number.isFinite(generation)) return generation;
  return Number.parseInt(String(game.version ?? "0").split(".")[0], 10) || 0;
}

export function readEffectCounter(effect) {
  return Number(
    effect?.statusCounter?.displayValue
    ?? effect?.getFlag?.("statuscounter", "value")
    ?? effect?.flags?.statuscounter?.value
    ?? effect?.flags?.statuscounter?.counter?.value
    ?? effect?.flags?.statusIconCounters?.value
    ?? effect?.flags?.statusIconCounters?.counter
    ?? effect?.flags?.["status-icon-counters"]?.value
    ?? effect?.flags?.["status-icon-counters"]?.counter
    ?? 0
  ) || 0;
}

function currentEffectDuration(effect) {
  const remainingSource = effect?.duration?.remaining;
  const remaining = Number(remainingSource);
  if (remainingSource != null && Number.isFinite(remaining)) return Math.max(0, Math.ceil(remaining));

  const sourceValue = Number(effect?._source?.duration?.value);
  if (Number.isFinite(sourceValue)) return Math.max(0, sourceValue);

  const legacyRounds = Number(effect?._source?.duration?.rounds ?? effect?.duration?.rounds);
  return Number.isFinite(legacyRounds) ? Math.max(0, legacyRounds) : 0;
}

function actorTurnEffectStart(actor) {
  const combat = game.combat;
  const turns = Array.from(combat?.turns ?? []);
  const turn = turns.findIndex(combatant => combatant?.actor?.id === actor?.id);
  if (!combat || turn < 0) return null;

  const combatant = turns[turn];
  const getEffectStart = foundry.documents?.ActiveEffect?.implementation?.getEffectStart;
  const start = typeof getEffectStart === "function" ? getEffectStart(combat) : {};
  const initiativeSource = combatant?.initiative;
  const initiative = initiativeSource == null ? null : Number(initiativeSource);
  let round = Number(combat.round ?? 0);
  const currentTurn = Number(combat.turn ?? 0);
  if (Number.isInteger(currentTurn) && turn < currentTurn) round += 1;

  return {
    ...start,
    combat: combat.id ?? start.combat ?? null,
    combatant: combatant?.id ?? null,
    initiative: Number.isFinite(initiative) ? initiative : null,
    round,
    turn
  };
}

function fallbackDurationUpdate(effect, value, expiryActor = null) {
  const actorStart = expiryActor ? actorTurnEffectStart(expiryActor) : null;
  if (foundryGeneration() >= 14) {
    const duration = {
      value,
      units: "rounds",
      expired: false
    };
    if (effect?.duration?.expiry == null) duration.expiry = "turnStart";

    const getEffectStart = foundry.documents?.ActiveEffect?.implementation?.getEffectStart;
    const start = actorStart ?? (typeof getEffectStart === "function" ? getEffectStart() : undefined);
    return start ? { duration, start } : { duration };
  }

  return {
    "duration.rounds": value,
    "duration.startRound": Number(actorStart?.round ?? game.combat?.round ?? 0),
    "duration.startTurn": Number(actorStart?.turn ?? game.combat?.turn ?? 0)
  };
}

/**
 * Increment a stacked status and keep its remaining round duration at least as
 * large as its stack count. Existing legacy flags are read, then normalized to
 * Status Icon Counters' supported v3 API and data source.
 */
export async function incrementEffectCounter(effect, increment, { expiryActor = null } = {}) {
  if (!effect) return null;

  const numericIncrement = Number(increment);
  if (!Number.isFinite(numericIncrement) || numericIncrement <= 0) return null;

  const nextCounter = readEffectCounter(effect) + numericIncrement;
  const nextDuration = Math.max(currentEffectDuration(effect), nextCounter);

  await effect.update({
    "flags.statuscounter.config.type": "default",
    "flags.statuscounter.config.dataSource": "flags.statuscounter.value",
    "flags.statuscounter.config.modifyDuration": true
  });

  const statusCounter = effect.statusCounter;
  const canSetValue = typeof statusCounter?.setValue === "function";
  const canSetDuration = typeof statusCounter?.setDuration === "function";
  if (canSetValue) {
    await statusCounter.setValue(nextCounter);
  }

  const needsExplicitDuration = Boolean(expiryActor) || (foundryGeneration() >= 14 && !effect?.duration?.units);
  if (canSetDuration && !needsExplicitDuration) {
    await statusCounter.setDuration(nextDuration);
  } else {
    const update = fallbackDurationUpdate(effect, nextDuration, expiryActor);
    if (!canSetValue) {
      update["flags.statuscounter.value"] = nextCounter;
      update["flags.statuscounter.visible"] = nextCounter > 1;
    }
    await effect.update(update);
  }

  return { value: nextCounter, duration: nextDuration };
}
