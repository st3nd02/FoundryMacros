/**
 * DH2e External GM Master Workflow (Foundry V13)
 * Version: 1.0
 * GM-only launcher macro: Attack / Defense / Damage / Apply Damage
 */

(async () => {
  if (!game.user.isGM) {
    ui.notifications.warn("This macro is GM-only.");
    return;
  }

  if (game.warhammer40kCogitator?.openLauncher) {
    const choice = await new Promise(resolve => {
      new Dialog({
        title: "DH2e External GM Workflow",
        content: `<p>Select which step to run:</p>`,
        buttons: {
          attack: { label: "Attack", callback: () => resolve("attack") },
          defense: { label: "Defense", callback: () => resolve("defense") },
          damage: { label: "Damage", callback: () => resolve("damage") },
          applyDamage: { label: "Apply Damage", callback: () => resolve("applyDamage") },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "attack"
      }).render(true, { width: 460 });
    });

    if (!choice) return;
    if (choice === "applyDamage") {
      const macro = game.macros.getName("DH2e External Apply Damage Workflow") ?? game.macros.getName("dh2e_external_apply_damage_workflow");
      if (!macro) return ui.notifications.warn("Could not find apply damage macro by name. Create/import it first.");
      await macro.execute();
      return;
    }

    await game.warhammer40kCogitator.runStep(choice);
    return;
  }

  const macroNames = {
    attack: ["DH2e External Attack Workflow", "dh2e_external_attack_workflow"],
    defense: ["DH2e External Defense Workflow", "dh2e_external_defense_workflow"],
    damage: ["DH2e External Damage Workflow", "dh2e_external_damage_workflow"],
    applyDamage: ["DH2e External Apply Damage Workflow", "dh2e_external_apply_damage_workflow"]
  };

  const findMacro = keys => {
    for (const name of keys) {
      const m = game.macros.getName(name);
      if (m) return m;
    }
    return null;
  };

  const choice = await new Promise(resolve => {
    new Dialog({
      title: "DH2e External GM Workflow",
      content: `<p>Select which step to run:</p>`,
      buttons: {
        attack: { label: "Attack", callback: () => resolve("attack") },
        defense: { label: "Defense", callback: () => resolve("defense") },
        damage: { label: "Damage", callback: () => resolve("damage") },
        applyDamage: { label: "Apply Damage", callback: () => resolve("applyDamage") },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "attack"
    }).render(true, { width: 460 });
  });

  if (!choice) return;

  const macro = findMacro(macroNames[choice]);
  if (!macro) {
    return ui.notifications.warn(`Could not find ${choice} macro by name. Create/import it first.`);
  }

  await macro.execute();
})();
