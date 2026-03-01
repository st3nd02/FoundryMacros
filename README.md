# FoundryMacros

## Dark Heresy V13 External Attack Workflow

`macros/dh2e_external_attack_workflow.js` now uses a **dialog-driven** flow (V13-safe), avoiding dependency on chat-button click hooks.

### Current Flow

1. **Attacker dialog** opens (width ~600px) and uses **Attack** button.
2. Attack is rolled immediately when dialog is submitted.
3. Workflow chat message is created/updated with full results and persistent state (`foundrymacros.dh2eExternalWorkflow`).
4. **Defense dialogs** are prompted per target with incoming hits.
5. **Damage dialog** is prompted back to attacker to roll per-target damage.

### Included Behavior

- Multi-target allocation (including full-auto round-robin)
- Per-target UUID tracking + token-name display
- Per-target distance auto-range with manual override in setup
- Per-target size mod with `Black Carapace` ignoring size bonus/penalty
- Swift/Lightning melee talent gating
- Semi/Full (+ suppressive variants) RoF gating

### Notes

- Defense and damage dialogs are implemented as the orchestration path requested; detailed follow-up behavior can be extended in the next pass.
