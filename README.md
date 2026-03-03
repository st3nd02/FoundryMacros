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
4. Configurable world settings for macro names (including master macro) and auto-create behavior.
5. Socket-based player-to-player workflow coordination for defense requests and damage-ready prompts.

## Foundry V13 Usage (Module)

1. Install as Foundry module `warhammer-40k-cogitator` (manifest available both at repository root `module.json` and module folder `warhammer-40k-cogitator/module.json`).
2. Ensure the installed folder name is `warhammer-40k-cogitator`.
3. Enable the module in your world.
4. On world ready, the module can auto-create Attack/Defense/Damage/Master macros (if enabled in settings).
5. Players can run the auto-created **DH2e External Master Workflow** macro directly (recommended).
6. Alternative launcher access:
   - Keybinding `Ctrl+Shift+C`, or
   - `game.warhammer40kCogitator.openLauncher()` in console.

## Notes

- The current build focuses on workflow orchestration and migration from macro-only flow.
- This is a first module foundation intended for iterative expansion under the **Warhammer 40k Cogitator** project.

## Forge / Manifest Troubleshooting

If Forge reports **"Invalid manifest response received"**, check:

1. The URL points to the **raw JSON** file (not a GitHub HTML page).
2. The manifest is valid JSON and includes core fields (`id`/`name`, `title`, `version`, `compatibility`).
3. The module package URL you publish for installation includes a valid `download` zip URL in your hosted/public manifest (Forge needs this for one-click installs).
4. The manifest file and module folder structure match your esmodule paths.

For this repo, the canonical in-repo manifests are:
- Root: `module.json` (for repository-level distribution)
- Module folder: `warhammer-40k-cogitator/module.json`


### Forge-ready public manifest template

A ready-to-fill public manifest template is included at `forge-manifest.template.json`.

Use it like this:

1. Replace `<ORG>`, `<REPO>`, and `<BRANCH>`.
2. Upload a release ZIP named `warhammer-40k-cogitator.zip` (or adjust `download`).
3. Host/publish the final manifest at a raw JSON URL.
4. Paste that raw manifest URL into Forge Content Creator.

> Important: Forge generally needs a working `download` URL in the published manifest for install/update workflows.
