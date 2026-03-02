# FoundryMacros

## Dark Heresy V13 External Workflow Macros

### Macros

- `macros/dh2e_external_attack_workflow.js`
  - Uses your restored/working attack workflow baseline.
  - Handles attack setup, attack roll, hit allocation, per-target defense prompt (owner if local), per-target damage prompt, and persistent chat workflow state under `foundrymacros.dh2eExternalWorkflow`.
  - Grenades: scatter on miss, grenade damage rolls on hit/miss when formula exists, grenade item is deleted after use, and weapon damage prompt is skipped for grenade attacks.

- `macros/dh2e_external_defense_workflow.js`
  - Separate defender macro to resolve pending defenses for the selected defender token.
  - Reads pending targets from workflow chat flags, opens Dodge/Parry defense dialog (difficulty ladder, modifier, balanced bonus, fate reroll), and writes results back to the same workflow state.

### Usage

1. Attacker runs `dh2e_external_attack_workflow.js`.
2. Defender owner runs `dh2e_external_defense_workflow.js` when prompted/needed.
3. Workflow state stays on the same chat message flag and is updated by each macro.
