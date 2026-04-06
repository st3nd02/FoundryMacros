const OUTLINE_TEXT_SHADOW = "0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black";

const styleValue = (value, color) => `<span style="color:${color};font-weight:bold;text-shadow:${OUTLINE_TEXT_SHADOW};">${value}</span>`;

export const resolveD100Outcome = ({ targetNumber, rollResult }) => {
  const target = Math.max(1, Number(targetNumber ?? 0));
  const roll = Number(rollResult ?? 0);
  const success = roll === 1 ? true : (roll === 100 ? false : roll <= target);
  const dos = success ? (1 + Math.floor((target - roll) / 10)) : 0;
  const dof = success ? 0 : (1 + Math.floor((roll - target) / 10));
  return { target, roll, success, dos, dof };
};

export const getActorFateValue = actorDoc => {
  const fate = actorDoc?.system?.fate;
  if (typeof fate === "number") return Math.max(0, Number(fate ?? 0));
  return Math.max(0, Number(fate?.value ?? 0));
};

export const canActorSpendFate = actorDoc => {
  if (!actorDoc) return false;
  if (!actorDoc.isOwner && !game.user?.isGM) return false;
  return getActorFateValue(actorDoc) > 0;
};

export const spendActorFate = async actorDoc => {
  const current = getActorFateValue(actorDoc);
  const next = Math.max(0, current - 1);
  if (typeof actorDoc?.system?.fate === "number") {
    await actorDoc.update({ "system.fate": next });
  } else {
    await actorDoc.update({ "system.fate.value": next });
  }
  return next;
};

export const askForFateReroll = async ({ actor, rollType = "Test Roll", targetNumber, rollResult, dof }) => {
  if (!canActorSpendFate(actor)) return false;
  const fateCurrent = getActorFateValue(actor);

  return new Promise(resolve => {
    new Dialog({
      title: "Spend Fate?",
      content: `
<div style="font-size:1.02em;">
  <div><b>Test Failed:</b> ${rollType}</div>
  <div style="margin-top:6px;"><b>Roll Target:</b> ${styleValue(targetNumber, "#3aa0ff")}</div>
  <div><b>Roll Result:</b> ${styleValue(rollResult, "#ff9f1a")}</div>
  <div><b>Degrees of Failure:</b> ${styleValue(dof, "#ff2a2a")}</div>
  <hr>
  <div>Current Fate: <b>${fateCurrent}</b></div>
</div>`,
      buttons: {
        yes: { label: "Reroll with Fate", callback: () => resolve(true) },
        no: { label: "Keep Result", callback: () => resolve(false) }
      },
      default: "no",
      close: () => resolve(false)
    }).render(true);
  });
};

export const postFateRerollReport = async ({ actor, speaker = null, rollType = "Test Roll", targetNumber, rollResult, dos = 0, dof = 0 }) => {
  const safeSpeaker = speaker ?? ChatMessage.getSpeaker({ actor });
  const degreeSuccess = Math.max(0, Number(dos ?? 0));
  const degreeFailure = Math.max(0, Number(dof ?? 0));

  await ChatMessage.create({
    speaker: safeSpeaker,
    content: `
<div style="text-align:center; color:#000; font-size:1.05em;">
  <div style="color:gold; font-size:1.2em; font-weight:900; text-shadow:${OUTLINE_TEXT_SHADOW};">Rerolled with Fate</div>
  <div style="margin-top:6px;"><b>${rollType}</b></div>
  <hr>
  <div><b>Roll Target:</b> ${styleValue(targetNumber, "#3aa0ff")} | <b>Roll Result:</b> ${styleValue(rollResult, "#ff9f1a")}</div>
  <div style="margin-top:6px;"><b>Degrees of Success:</b> ${styleValue(degreeSuccess, "#1aff1a")}</div>
  <div><b>Degrees of Failure:</b> ${styleValue(degreeFailure, "#ff2a2a")}</div>
</div>`
  });
};

export const maybeApplyFateReroll = async ({
  actor,
  rollType,
  targetNumber,
  rollResult,
  reroll,
  speaker = null,
  postReport = true,
  allow = true
}) => {
  const base = resolveD100Outcome({ targetNumber, rollResult });
  if (!allow || base.success || !canActorSpendFate(actor)) {
    return { usedFate: false, ...base };
  }

  const useFate = await askForFateReroll({
    actor,
    rollType,
    targetNumber: base.target,
    rollResult: base.roll,
    dof: base.dof
  });
  if (!useFate) {
    return { usedFate: false, ...base };
  }

  await spendActorFate(actor);
  const rerollValue = await reroll();
  const rerolled = resolveD100Outcome({ targetNumber: base.target, rollResult: rerollValue });

  if (postReport) {
    await postFateRerollReport({
      actor,
      speaker,
      rollType,
      targetNumber: rerolled.target,
      rollResult: rerolled.roll,
      dos: rerolled.dos,
      dof: rerolled.dof
    });
  }

  return { usedFate: true, ...rerolled };
};
