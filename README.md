# Warhammer 40k Cogitator

## Project Scope

This repository now contains the **Warhammer 40k Cogitator** workflow project for Foundry VTT V13, focused on Dark Heresy 2e external combat orchestration.

## Included Deliverables

### Standalone Workflow Macros

- `macros/dh2e_external_attack_workflow.js` (Version 1.0)
- `macros/dh2e_external_defense_workflow.js` (Version 1.0)
- `macros/dh2e_external_damage_workflow.js` (Version 1.0)
- `macros/dh2e_external_master_workflow.js` (Version 1.1)
- `macros/dh2e_external_gm_master_workflow.js` (Version 1.0, GM-only)
- `macros/dh2e_external_apply_damage_workflow.js` (Version 1.2, GM-only)

These can be used directly as script macros.

### Foundry Module Scaffold

- `module.json` (single canonical manifest for Forge/Foundry installs)
- `warhammer-40k-cogitator/scripts/main.js`
- `warhammer-40k-cogitator/macros/*.js` (bundled copies of the workflow scripts)

The module provides:

1. **Project identity** as `warhammer-40k-cogitator` / "Warhammer 40k Cogitator".
2. A launcher API (`game.warhammer40kCogitator.openLauncher()`) with **Attack / Defense / Damage** choices.
3. Optional auto-creation of missing world macros from bundled module scripts.
4. Configurable world settings for macro names (including master macro) and auto-create behavior.
5. Socket-based player-to-player workflow coordination for defense requests and damage-ready prompts.

## Foundry V13 Usage (Module)

1. Install as Foundry module `warhammer-40k-cogitator` using root manifest `module.json`.
2. Ensure the installed folder name is `warhammer-40k-cogitator`.
3. Enable the module in your world.
4. Log in as a **GM** at least once after enabling (macro creation/update is GM-only).
5. On world ready, the module auto-creates or updates Attack/Defense/Damage/Master plus GM Master/Apply Damage macros in the **Warhammer 40k Cogitator** macro folder (if enabled in settings).
6. Players can run the auto-created **DH2e External Master Workflow** macro directly (recommended).
7. Alternative launcher access:
   - Keybinding `Ctrl+Shift+C`, or
   - `game.warhammer40kCogitator.openLauncher()` in console.

## Forge / Manifest Troubleshooting

If Forge reports **"Invalid manifest response received"**, check:

1. The URL points to the **raw JSON** file (not a GitHub HTML page).
2. The manifest is valid JSON and includes core fields (`id`/`name`, `title`, `version`, `compatibility`).
3. The published manifest includes a valid `download` ZIP URL (required for Forge install/update workflows).
4. Only one manifest for this module ID is shipped in the install ZIP (to avoid loader ambiguity).

Direct Forge manifest URL:
- `https://raw.githubusercontent.com/st3nd02/FoundryMacros/main/module.json`

### Forge-ready public manifest template

A ready-to-fill public manifest template is included at `forge-manifest.template.json`.

Use it like this:

1. Confirm the repo/branch URLs match your intended release branch (currently `main`).
2. Upload a release ZIP named `warhammer-40k-cogitator.zip` (or adjust `download`).
3. Host/publish the final manifest at a raw JSON URL.
4. Paste that raw manifest URL into Forge Content Creator.

> Important: Forge generally needs a working `download` URL in the published manifest for install/update workflows.
