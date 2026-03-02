# FoundryMacros

## Dark Heresy V13 External Workflow Macros

### Version
All workflow macros are currently marked **Version 1.0** in their headers.

### Macros

- `macros/dh2e_external_attack_workflow.js`
  - Attacker-side workflow macro (restored baseline).
  - Handles attack setup, attack roll, hit allocation, local defense prompts, owner defense request messaging, and workflow flag state updates.
  - Grenades: scatter on miss, grenade damage on hit/miss (if formula exists), grenade item deletion after use, and no standard damage dialog for grenade attacks.

- `macros/dh2e_external_defense_workflow.js`
  - Defender-side workflow macro.
  - Finds pending defenses for selected defender token from workflow flags.
  - Supports Dodge/Parry flow, difficulty ladder, modifiers, balanced parry bonus, and Fate reroll.
  - Writes defense results back to workflow state.

- `macros/dh2e_external_damage_workflow.js`
  - Damage-side workflow macro.
  - Finds pending damage for selected attacker token from workflow flags.
  - Uses the provided damage-card style flow (traits/talents/options), rolls per-hit damage, posts result card, and updates workflow target damage state.

- `macros/dh2e_external_master_workflow.js`
  - One launcher macro with options: **Attack / Defense / Damage**.
  - Executes the corresponding macro by macro-name lookup.

### Suggested Usage

1. Run `dh2e_external_master_workflow`.
2. Choose **Attack** to create/advance attack workflow.
3. Defender owner chooses **Defense** to resolve pending defense.
4. Attacker chooses **Damage** to resolve pending damage.

### Important Note

The master launcher executes existing Foundry macro entities by name. Ensure you have macros created/imported with matching names:
- `DH2e External Attack Workflow`
- `DH2e External Defense Workflow`
- `DH2e External Damage Workflow`
