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

- Horde handling (`Horde?` + horde bonus)
- Shooting into melee handling (`-20`, negated by Target Selection)
- Two-weapon attack handling (Master / Wielder / Ambidextrous penalties)
- Weapon range display in attack dialog (`Melee` or numeric weapon range)
- Craftsmanship handling (melee bonus and ranged jam interaction)
- Multi-target allocation (including full-auto round-robin)
- Per-target UUID tracking internally + token-name-only display on chat card
- Grenade handling restored (scatter on miss, damage roll on hit or miss if damage formula exists, grenade deleted after use)
- Per-target distance auto-range with manual override in setup
- Melee weapons show **Melee** in target range column and internally ignore range bands
- Internal range-distance adjustment for targets with size traits: effective distance is reduced by 1m per size step above 4
- Per-target size mod with `Black Carapace` ignoring size bonus/penalty
- Swift/Lightning melee talent gating
- Semi/Full (+ suppressive variants) RoF gating
- Power Mode control only shown for **Las** or **Plasma** weapons
- Talents section in attack dialog plus weapon-modification auto-detection (no item checkboxes; mods shown when they apply to selected weapon) and applied attack modifiers
- Ammo consumption restored (mode-based), including Storm and Power Mode multiplier costs for Las/Plasma

### Notes

- Defense and damage dialogs are implemented as the orchestration path requested; detailed follow-up behavior can be extended in the next pass.
