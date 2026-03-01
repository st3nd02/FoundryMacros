# FoundryMacros

## Dark Heresy V13 External Attack Workflow

`macros/dh2e_external_attack_workflow.js` keeps the persistent external workflow while carrying forward attack-side behavior from the original macro.

### Included behavior

- ChatMessage-persistent state (`foundrymacros.dh2eExternalWorkflow`)
- Attack / Defense / Damage workflow buttons on chat card
- Vertical per-target chat blocks (no horizontal overflow table)
- Multi-target hit allocation with full-auto round-robin
- Per-target UUID tracking with token-name display
- Per-target distance auto-range (editable in setup)
- Per-target size modifiers from `Size (X)` traits
- `Black Carapace` ignores size modifier
- Ranged + melee attack modes
- Melee talent gating for Swift/Lightning attack
- RoF gating for Semi/Full and suppressive variants
- Weapon trait handling (`storm`, `twin`, `flame`, `reliable`, `unreliable`, grenade, inf ammo)
- Jam handling with craftsmanship interactions
- Ammo consumption by firing mode and power multiplier
- Expanded talents/items from original attack macro:
  - talents: deadeye, marksman, double tap, target selection, devastating assault, blademaster, whirlwind of death, berserk charge, twm melee/ranged, ambidextrous, two weapon master
  - items: custom grip, fluid action, modified stock, motion predictor, red-dot laser sight, targeter, telescopic sight, omni-scope

### Usage

1. Select attacker token.
2. Target one or more tokens.
3. Run macro and configure setup dialog.
4. Resolve from chat card:
   - **Roll Attack**
   - **Defense** per target
   - **Damage** per target
