# Warhammer 40k Cogitator

## Project Scope

This repository now contains the **Warhammer 40k Cogitator** workflow project for Foundry VTT V13, focused on Dark Heresy 2e external combat orchestration.

## Included Deliverables

### Standalone Workflow Macros

- `macros/dh2e_external_attack_workflow.js` (Version 1.0)
- `macros/dh2e_external_defense_workflow.js` (Version 1.0)
- `macros/dh2e_external_damage_workflow.js` (Version 1.0)
- `macros/dh2e_external_master_workflow.js` (Version 1.0)

These can be used directly as script macros.

### Foundry Module Scaffold

- `warhammer-40k-cogitator/module.json`
- `warhammer-40k-cogitator/scripts/main.js`
- `warhammer-40k-cogitator/macros/*.js` (bundled copies of the workflow scripts)

The module provides:

1. **Project identity** as `warhammer-40k-cogitator` / "Warhammer 40k Cogitator".
2. A launcher API (`game.warhammer40kCogitator.openLauncher()`) with **Attack / Defense / Damage** choices.
3. Optional auto-creation of missing world macros from bundled module scripts.
4. Configurable world settings for macro names and auto-create behavior.

## Foundry V13 Usage (Module)

1. Install this folder as a module in Foundry under `Data/modules/warhammer-40k-cogitator`.
2. Enable the module in your world.
3. On world ready, the module can auto-create Attack/Defense/Damage macros (if enabled in settings).
4. Open launcher via:
   - Keybinding `Ctrl+Shift+C`, or
   - `game.warhammer40kCogitator.openLauncher()` in console.

## Notes

- The current build focuses on workflow orchestration and migration from macro-only flow.
- This is a first module foundation intended for iterative expansion under the **Warhammer 40k Cogitator** project.
