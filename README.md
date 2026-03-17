# Warhammer 40k Cogitator

## Project Scope

This repository contains the **Warhammer 40k Cogitator** Foundry VTT V13 module for Dark Heresy 2e workflow orchestration.

## Module Architecture (Macro-Free)

The module is now fully **macro-free at runtime**:

- Workflow execution is driven directly by module code in `warhammer-40k-cogitator/scripts/main.js` and internal workflow handlers.
- `runStep(step)` dispatches directly to module-owned handlers for:
  - `attack`
  - `defense`
  - `damage`
  - `master`
  - `gmMaster`
  - `applyDamage`
- No `macro.execute()` fallback path is used by the launcher or Workflow HUD.

## Runtime Usage

1. Install as Foundry module `warhammer-40k-cogitator` using root manifest `module.json`.
2. Ensure the installed folder name is `warhammer-40k-cogitator`.
3. Enable the module in your world.
4. Use any of the built-in module entry points:
   - Workflow HUD (canvas bar)
   - Launcher hotkey `Ctrl+Shift+C`
   - `game.warhammer40kCogitator.openLauncher()` from console

Available launcher/HUD actions:

- Player + GM: Attack, Defense, Damage, Skill Test, Characteristic Test
- GM only: Apply Damage

## Permissions and Networking

- GM-only actions remain GM-only (including Apply Damage).
- Player-available actions remain player-available.
- Socket-based defense and damage coordination remains active for multi-user workflows.

## Migration Notes

- Legacy macro-related world settings from older versions are safely ignored.
- No macro auto-create/update behavior is performed on startup.
- Existing worlds with old macro settings continue loading without crashes.

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
