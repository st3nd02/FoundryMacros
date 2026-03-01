# FoundryMacros

## Dark Heresy V13 External Attack Workflow

`macros/dh2e_external_attack_workflow.js` now focuses on **legacy-behavior parity** from your original macro while using a chat-persistent external workflow.

### Included behavior

- ChatMessage-persistent workflow state (`foundrymacros.dh2eExternalWorkflow`)
- Multi-target hit allocation with full-auto round-robin distribution
- Per-target defense and per-target damage resolution
- Permission-aware action buttons (attacker owner / target owner / GM)
- Per-target distance auto-range selection (editable in setup)
- Per-target size modifiers from `Size (X)` trait
- `Black Carapace` correctly nullifies size modifier
- Weapon traits integration for jam and hit logic (`reliable`, `unreliable`, `storm`, `twin`, `flame`)
- Ammo spend by firing mode + power multiplier, with clip updates
- Targets tracked by UUID and displayed by token name

### Usage

1. Select attacker token.
2. Target one or more tokens.
3. Run the macro and configure setup options.
4. Resolve attack/defense/damage from the workflow chat card.
