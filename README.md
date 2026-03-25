![Warhammer 40k Cogitator Cover](<WH40k Cogitator Cover.png>)

# Warhammer 40k Cogitator

## What this module does

The **Warhammer 40k Cogitator** is a Foundry VTT v13 module for Dark Heresy 2e that runs a complete, macro-free combat workflow and utility toolkit:

- Attack → Defense → Damage → Apply Damage orchestration
- Multiplayer owner/GM handoff with socket coordination
- Persistent canvas HUD + launcher + keybind access
- Test and management utilities (skill, characteristic, fear, medicae, healing, fate, fatigue, ammo)
- Psychic power workflow and force-field interception flow

## Core architecture

This module is **macro-free at runtime**. All execution is dispatched from module code through `runStep(step)` and internal handlers.

### Main handlers
- `attack`
- `psychic`
- `defense`
- `damage`
- `applyDamage`
- launcher/master entry points (`master`, `gmMaster`)

The module exposes a public API on `game.warhammer40kCogitator` for launcher opening, workflow dispatch, socket emission, defense/damage submission, effect helpers, and HUD refresh.

## Workflow systems

### 1) Attack workflow
The attack workflow handles:

- Attacker/target selection validation
- Melee and ranged attack mode selection
- Range band and power mode handling
- Weapon trait and weapon-item modifiers
- Talent-based modifiers and special logic
- Attack roll and hit allocation per target
- Auto creation/update of rich workflow chat cards

Special combat behavior includes support for:

- **Double Tap** target priming/follow-up
- **Devastating Assault** mirrored follow-up prompt
- **Blademaster** reroll behavior
- **Jam** and **Weapon Recharging** status handling
- **Spray** evasion handling
- **Horde**-specific hit/magnitude handling
- Grenade scatter and grenade damage handling

### 2) Defense workflow
The defense workflow resolves pending incoming attacks for the defending owner:

- Dodge / Parry / Foreboding defense paths
- Parry weapon validation and trait checks (Balanced/Defensive/Unbalanced/Unwieldy/Flexible)
- Condition-aware penalties (e.g., prone, blinded, stunned, unconscious)
- Inescapable Attack penalty integration
- Optional Fate rerolls on failed defenses
- Writes structured defense results back into workflow cards

### 3) Damage workflow
The damage workflow resolves pending damage for the attacker side:

- Lists pending post-defense targets
- Uses attack context (mode, traits, talents, modifiers)
- Builds per-hit location and damage data
- Handles penetration and damage type context
- Stores result payloads for downstream application

### 4) Apply Damage workflow (GM)
The apply-damage workflow is GM-only and:

- Selects pending resolved damage entries
- Applies damage payloads to target actors
- Updates workflow cards with application summaries
- Supports legacy payload fallback (`game.dh2eLastDamage`)
- Integrates critical effect text/table handling

## Multiplayer and permissions

The module coordinates player/GM resolution with socket events:

- Defense requests routed to valid token owners
- Damage-ready notices routed to attacker owners
- GM-authorized application paths for defense and damage results
- Context synchronization and cleanup across connected users

Permission boundaries are preserved:

- GM-only actions stay GM-only (e.g., Apply Damage, manual Force Field checks, healing/fate/fatigue/ammo tools)
- Player-available actions remain player-available

## Combat turn automation

On combat turn/round changes, the module can:

- Clear spent defense reaction tracking for active actors
- Apply bleeding fatigue tick at round start
- Remove expired turn-start effects (stunned, blinded, deafened variants)
- Expire stale pending workflow states on round advance
- Post GM-facing cleanup notifications

## Effect and condition integration

The module integrates with Convenient Effects / status systems and can:

- Apply/remove status effects locally or via GM socket execution
- Handle duplicate stackable effects (e.g., Used Evasion)
- Sync and maintain counters/durations for supported counter modules
- Manage named combat effects like:
  - Used Evasion
  - Double Tap
  - Devastating Assault
  - Weapon Recharging
  - Force Field Active / Overloaded

## Launcher, HUD, and controls

You can access module functionality through:

- **Workflow HUD** (persistent draggable/lockable canvas bar)
- **Launcher dialog**
- **Hotkey**: `Ctrl+Shift+C`
- Console API: `game.warhammer40kCogitator.openLauncher()`

The HUD supports player and GM action sets; GM-only actions are shown only to GMs.

## Utility tools

### Skill Test
- Interactive DH2e skill test dialog
- Difficulty/modifier controls
- Specialty handling
- Talent-aware behavior for relevant skill families
- Fate reroll prompts
- Styled chat output with DoS/DoF

### Characteristic Test
- Characteristic picker
- Difficulty/modifier controls
- Unnatural bonus handling
- Fate reroll flow
- Styled chat result output

### Fear Test
- Fear level configuration and trait support
- Talent/trait toggles (e.g., faith/resolve style mitigations)
- Shock table roll flow on failed fear tests
- Insanity handling when applicable
- Automatic condition extraction/application from shock results

### Medical Flow
- First Aid / Extended Care / Diagnose / Staunch Blood Loss modes
- Medical talent/item modifiers
- Healing roll generation and chat reporting
- Optional immediate handoff to GM healing application
- Healing roll history for quick reuse

### Apply Healing (GM)
- Applies healing to critical first, then wounds
- Supports prefilled values and history source
- Posts treatment summary to chat

### Fate Restore (GM)
- Full or partial fate restoration controls
- Chat reporting of restoration and over-cap gain

### Fatigue Manager (GM)
- Add or reset fatigue values
- Applies unconscious effect when threshold reached
- Chat reporting with threshold warnings

### Ammo Reload (GM)
- Weapon + compatible ammunition selection
- Full or partial reload controls
- Ammo consumption/update/delete handling
- Chat reporting

## Psychic workflow

Psychic powers are handled in a dedicated workflow with:

- Power selection and focus-test normalization
- Formula parsing/resolution with PR/stat substitution
- Opposed test awareness
- Range parsing and measurement behavior
- Psychic phenomena / perils integration
- Inline dice resolution within phenomena/perils text
- Condition extraction/application from result text
- Owner-target defense request routing for psychic attacks

## Force field workflow

Force field logic supports both automatic and manual checks:

- Selects preferred/selected force field item
- Rolls protection and overload checks
- Handles active vs overloaded effect transitions
- Can automatically intercept incoming hits during workflows
- Posts formatted chat outcomes (protected / failed / overloaded)

## Data-driven rules support

The module includes data tables used during play:

- `scripts/data/talents.json` for talent behavior metadata
- `scripts/data/criticals.js` for critical effect tables
- `scripts/data/psychic_events.js` for psychic phenomena and perils tables

## Installation and packaging

- Module ID: `warhammer-40k-cogitator`
- Foundry compatibility: v13
- Entry module: `warhammer-40k-cogitator/scripts/main.js`
- Socket support enabled
- Required modules:
  - `dfreds-convenient-effects`
  - `statuscounter`
  - `socketlib`
