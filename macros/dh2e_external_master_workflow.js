/**
 * DH2e External Master Workflow (Foundry V13)
 * Version: 1.2
 * Launcher macro: Attack / Defense / Damage / Characteristic Test
 */

(async () => {
  if (game.warhammer40kCogitator?.openLauncher) {
    await game.warhammer40kCogitator.openLauncher();
    return;
  }

  const macroNames = {
    attack: ["DH2e External Attack Workflow", "dh2e_external_attack_workflow"],
    defense: ["DH2e External Defense Workflow", "dh2e_external_defense_workflow"],
    damage: ["DH2e External Damage Workflow", "dh2e_external_damage_workflow"]
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
      title: "DH2e External Workflow",
      content: `<p>Select which step to run:</p>`,
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
    if (game.warhammer40kCogitator?.openCharacteristicTest) {
      await game.warhammer40kCogitator.openCharacteristicTest();
      return;
    }

    return ui.notifications.warn("Characteristic Test requires the Warhammer 40k Cogitator module API.");
  }

  const macro = findMacro(macroNames[choice]);
  if (!macro) {
    return ui.notifications.warn(`Could not find ${choice} macro by name. Create/import it first.`);
  }

  await macro.execute();
})();
