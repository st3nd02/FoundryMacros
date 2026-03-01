# FoundryMacros

## Dark Heresy V13 External Attack Workflow

`macros/dh2e_external_attack_workflow.js` is a **dialog-driven** external workflow (V13-safe) that keeps persistent state on the chat message flag `foundrymacros.dh2eExternalWorkflow`.

### Current Flow

1. Run macro and choose **Attack** tab to start a new workflow.
2. Attack is rolled immediately and workflow chat card is created/updated.
3. Targets with incoming hits are marked as **Awaiting Defender**.
4. Defender owner runs the same macro, chooses **Defend** tab, and resolves defense from pending workflow entries.
5. Damage is only prompted after defense is resolved (attacker-owner side when available).

### Included Behavior

- Horde handling (`Horde?` + horde bonus)
- Shooting into melee handling (`-20`, negated by Target Selection)
- Two-weapon attack handling (Master / Wielder / Ambidextrous penalties)
- Weapon range display in attack dialog (`Melee` or numeric weapon range)
- Craftsmanship handling (melee bonus and ranged jam interaction)
- Multi-target allocation (including full-auto round-robin)
- Per-target UUID tracking internally + token-name-only display on chat card
- Grenade handling (scatter on miss, damage roll on hit or miss if damage formula exists, grenade deleted after use)
- Per-target distance auto-range with manual override in setup
- Melee weapons show **Melee** in target range column and internally ignore range bands
- Internal range-distance adjustment for targets with size traits: effective distance reduced by 1m per size step above 4
- Per-target size mod with `Black Carapace` ignoring size bonus/penalty
- Swift/Lightning melee talent gating
- Semi/Full (+ suppressive variants) RoF gating
- Power Mode control only shown for **Las** or **Plasma** weapons
- Talents in attack dialog plus weapon-modification auto-detection and applied attack modifiers
- Ammo consumption restored (mode-based), including Storm and Power Mode multiplier costs for Las/Plasma
- Defense tab includes Dodge/Parry, difficulty ladder, manual modifier, Balanced parry bonus, and Fate reroll support

### Notes

- This is now intended as an **all-in-one macro**: attacker and defenders both run the same macro, but choose different tabs.
- Defense resolution updates the same persistent workflow state so attacker-side damage can proceed from updated hit totals.
