export async function runApplyDamageWorkflow() {
/**
 * DH2e External Apply Damage Workflow (Foundry V13)
 * Version: 1.4
 * GM-only damage application from `game.dh2eLastDamage`.
 */


if (!game.user.isGM) return ui.notifications.warn("Apply Damage is GM-only.");

//======================================
// Apply Damage Macro — Console Driven + Crits v.3.0.05
//======================================
const CRIT = {

Energy: {

Arm: [
"",
"The attack grazes the target's arm, causing it to spasm uncontrollably with pain. All tests involving that arm suffer a -30 penalty for 1d5 rounds.",
"The attack smashes into the arm, sending currents of energy crackling down to the fingers and up to the shoulder. The target suffers 1 level of Fatigue, and that arm is Useless for 1d5 rounds.",
"The arm suffers superficial burns inflicting no small amount of pain on the target. The target suffers 1d5 levels of Fatigue, and can take only a Half Action during his next turn.",
"The shock of the attack causes the character to temporarily lose control of his autonomous functions. He is Stunned for 1 roundand is knocked Prone. The arm is Useless for 1d10 rounds.",
"The attack causes energy to course through the target's arm. He is Stunned for 1 round, and the arm is Useless until the target receives medical treatment.",
"The attack wreathes the arm in flame, scorching clothing and armour, and temporarily fusing together the target's fingers. The target suffers 1d5 levels of Fatigue and 1d5 Weapon Skill and Ballistic Skill damage, and he must make a Challenging (+0) Toughness test or suffer the Lost Hand condition (see page 242).",
"With a terrible snapping sound, the heat of the attack boils the marrow in the target's arm, causing it to crack or even shatter. The target suffers 1d5 levels of Fatigue and is Stunned for 1 round. His arm is Useless until it is repaired.",
"Energy ripples across the target's arm, causing skin and muscle to slough disgustingly from the target's limb, revealing a sticky red mess of sinew and bone. The target suffers 1d10 levels of Fatigue and must make a Challenging (+0) Toughness test or be Stunned for 1d5 rounds. He now suffers from the Lost Arm condition (see page 242).",
"Fire consumes the target's arm, burning the flesh to a crisp right down to the bone. The target must make an immediate Challenging (+0) Toughness test or die from shock. If he survives, the target suffers 1d10 levels of Fatigue and is Stunned for 1 round. The target now suffers from the Lost Arm condition (see page 242).",
"The attack reduces the arm to a cloud of crimson ash and sends the target crumbling to the ground. He immediately dies from shock, clutching his smoking stump."
],

Body: [
"",
"A blow to the target's body steals the air from his lungs. The target can take only a Half Action on his next turn.",
"The blast punches the air from the targets body. He must make a Challenging (+0) Toughness test or be knocked Prone.",
"The attack cooks the flesh on the chest and abdomen. He suffers 2 levels of Fatigue and 1d5 Toughness damage.",
"The energy ripples all over the character, scorching his body with horrid third-degree burns. The target suffers 1d10 levels of Fatigue, and can only take a Half Action on his next turn.",
"The fury of the attack forces the target to the ground, helplessly covering his face and keening in agony. The target is knocked Prone and must make a Challenging (+0) Agility test or catch fire (see page 243). The target must also make a Challenging (+0) Toughness test or be Stunned for 1 round.",
"Struck by the full force of the attack, the target is sent reeling to the ground; smoke spiraling out from the wound. The target suffers 1d5 levels of Fatigue, is knocked Prone, and is Stunned for 1d10 rounds. In addition, he must make a Challenging (+0) Agility test or catch fire (see page 243).",
"The intense power of the energy attack cooks the targets organs, burning his lungs and heart with intense heat. The target is Stunned for 2d10 rounds, and his Toughness characteristic is permanently reduced by 1d10.",
"As the attack washes over the target, his skin turns black and peels off, while melted fat seeps from his clothing and armour. The target is Stunned for 2d10 rounds. His Strength, Toughness, and Agility characteristics are reduced by half (rounding up) until he receives medical treatment. Permanently reduce the character's Fellowship characteristic by 2d5.",
"The target is completely encased in fire, melting his skin and bursting his eyes like superheated eggs. He falls to the ground a lifeless corpse, blackened and charred with horrid burns.",
"As above, but if the target is carrying any ammunition, roll 1d10: on a result of 6 or higher, it explodes. Each target within 1d5 metres suffers a single hit for 1d10+5 Explosive damage to a randomly determined Hit Location. If the target carried any grenades or missiles, these detonate on the character's corpse with their normal effects one round after his demise."
],

Head: [
"",
"A grazing blow to the head disorientates the target. He suffers a -10 penalty to all tests (except Toughness tests) for 1 round.",
"The blast of energy dazzles the target. He is Blinded for 1 round.",
"The attack cooks off the target's ear, leaving him with a partially burned stump of cartilage. He is Deafened for 1d5 hours (or until he receives medical attention).",
"The energy attack burns away all of the hairs on the target's head, as well as leaving him reeling from the injury. The target suffers 2 levels of Fatigue and the target is Blinded for 1d5 rounds.",
"A blast of energy envelops the target's head, burning his face and hair, crisping his skin, and causing him to scream like a stuck grox. In addition to losing all hair on his scalp and face, he is Blinded for 1d10 rounds and Stunned for 1 round. Permanently reduce the target's Fellowship characteristic by 1.",
"The attack cooks the target's face, melting his features and damaging his eyes. The target suffers 1d5 levels of Fatigue and is Blinded for 1d10 hours. Permanently reduce his Fellowship and Perception characteristics by 1d5.",
"In a gruesome display, the flesh is burned from the target's head, exposing charred bone and muscle underneath. The target suffers 1d10 levels of Fatigue. He is Blinded permanently. Roll 1d10; this is the target's new Fellowship characteristic value. If his Fellowship value is already 10 or lower, this can be skipped as no one would notice any difference in his behaviour and demeanour.",
"The target's head is destroyed in a conflagration of fiery death. He does not survive.",
"Superheated by the attack, the target's brain explodes, tearing apart his skull and sending flaming chunks of meat flying at those nearby. The target is very, very dead.",
"As above, except the target's entire body catches fire and runs off headless 2d10 metres in a random direction (use the Scatter Diagram on page 230). Anything flammable it passes, including characters, must make a Challenging (+0) Agility test or catch fire (see page 243)."
],

Leg: [
"",
"The blast of energy sears the flesh and bone of the target's leg, leaving a nasty burn scar. The target cannot use the Run or Charge actions for 2 rounds.",
"The attack flash-fries the target's leg, cooking chunks of flesh into char. The target must pass a Challenging (+0) Toughness test or suffer 1 level of Fatigue.",
"A solid blow to the leg sends currents of agony coursing through the target. The target suffers 1 level of Fatigue and is knocked Prone. Reduce his Movement by half (rounding up) for 1d10 rounds.",
"The blast causes a nasty compound fracture in the target's leg. Until the target receives medical attention, reduce his Movement by half (rounding up), and he cannot use the Run or Charge actions.",
"The target's leg endures horrific burn damage, fusing clothing and armour with flesh and bone. The target suffers 1 level of Fatigue and is knocked Prone. Reduce his Movement by half (rounding up) for 2d10 rounds.",
"The attack burns the target's foot, charring the flesh and emitting a foul aroma. The target suffers 2 levels of Fatigue. He must also make a Challenging (+0) Toughness test. If he succeeds, reduce his Movement by half (rounding up) until he receives medical attention; if he fails, he suffers the Lost Foot condition (see page 243).",
"The energy attack fries the leg, leaving it a mess of blackened flesh. The leg is broken and until repaired, the target counts as having lost the leg. He suffers 1d5 levels of Fatigue. He must also make a Challenging (+0) Toughness test or be Stunned for 1 round. He now suffers the Lost Leg condition (see page 243).",
"Energy sears through the bone, causing the leg to be severed. The target suffers 1d10 levels of Fatigue and suffers Blood Loss. He must also make a Challenging (+0) Toughness test or be Stunned for 1 round. He now suffers the Lost Leg condition (see page 243).",
"The force of the attack reduces the leg to little more than a chunk of sizzling gristle. The target must make a Challenging (+0) Toughness test or die from shock. He now suffers the Lost Leg condition (see page 243).",
"In a terrifying display of power, the leg immolates and thick fire consumes the target completely. He dies in a matter of agonizing seconds, his scorched corpse surrounded with smoke and flames."
]

},

Explosive: {

Arm: [
"",
"The attack throws the limb backwards, painfully jerking it away from the body. The target suffers 1 level of Fatigue.",
"The force of the blast snaps the bones of the arm in half. The target drops anything held in that hand and must pass a Challenging (+0) Toughness test or be Stunned for 1 round.",
"The explosion removes 1 finger (and the tips from up to 1d5 others) from the target's hand. The target suffers 1d10 Weapon Skill and 1d10 Ballistic Skill damage, and anything he was carrying in that hand is destroyed. If this is an explosive such as a grenade, it detonates; immediately resolve the 9 effect on this table upon the target.",
"The blast rips the sinew of the arm straight from the bone. The target is Stunned for 1 round and must make a Challenging (+0) Toughness test or suffer Blood Loss. The limb is Useless until the target receives medical attention.",
"Fragments from the explosion tear into the target's hand, ripping away flesh and muscle alike. He must immediately make an Ordinary (+10) Toughness test. If he succeeds, permanently reduce his Weapon Skill and Ballistic Skill characteristics by 1; if he fails, he suffers the Lost Hand condition (see page 242).",
"The explosive attack shatters the bone and mangles the flesh, turning the target's arm into a red ruin. The target suffers Blood Loss and 1d5 levels of Fatigue. The arm is Useless until he receives medical attention",
"In a violent hail of flesh, the arm is blown apart. The target must immediately make a Challenging (+0) Toughness test or die from shock. If he survives, he suffers 1d10 levels of Fatigue, is Stunned for 1d10 rounds, and suffers Blood Loss. The target now suffers from the Lost Arm condition (see page 242).",
"The arm disintegrates under the force of the explosion, taking a good portion of the shoulder and chest with it. The target is sent screaming to the ground, where he dies in a pool of his own blood and organs.",
"With a mighty bang the arm is blasted from the target's body, killing the target instantly in a rain of blood droplets. In addition, if the target was carrying a weapon with a power source in his hand (such as a power sword or chainsword), then it violently explodes, inflicting a single hit for 1d10+5 Impact damage to a randomly determined Hit Location upon each target to anyone within two metres.",
"As above, except if the target is carrying any ammunition it explodes, inflicting a single hit for 1d10+5 Impact damage to a randomly determined Hit Location upon each target within 1d10 metres (in addition to the hit noted above). If the target is carrying any grenades or missiles, these also detonate immediately with their normal effects."
],

Body: [
"",
"The explosion flings the target backwards 1d5 metres. The target is knocked Prone.",
"The target is blown backwards 1d5 metres by a terrific explosion, suffering 1 level of Fatigue per metre travelled. The target is knocked Prone.",
"The force of the blast sends the target sprawling to the ground. The target is knocked backwards 1d5 metres, Stunned for 1 round, and is knocked Prone.",
"The power of the explosion rends flesh and bone with horrific results. The target must make a Challenging (+0) Toughness test or suffer from Blood Loss and be Stunned for 1 round.",
"Concussion from the explosion knocks the target to the ground and turns his innards into so much ground meat. The target suffers 1d5 levels of Fatigue and is knocked Prone. He must immediately make a Challenging (+0) Toughness test; if he fails, he suffers Blood Loss and his Toughness characteristic is permanently reduced by 1.",
"Chunks of the target's flesh are ripped free by the force of the attack leaving large, weeping wounds. The target is Stunned for 1 round and suffers Blood Loss.",
"The explosive force of the attack ruptures the target's flesh and scrambles his nervous system, knocking him to the ground. The target is Stunned for 1d10 rounds and is knocked Prone He also suffers Blood Loss, and must make a Challenging (+0) Toughness test or fall Unconscious.",
"The target's chest explodes outward, disgorging a river of partially cooked organs onto the ground, killing him instantly.",
"Pieces of the target's body fly in all directions as he is torn into bloody gobbets. If the target is carrying any ammunition, it explodes, inflicting a single hit for 1d10+5 Impact damage to a randomly determined Hit Location upon each target within 1d10 metres. If the target is carrying any grenades or missiles, these detonate immediately.",
"As above, except anyone within 1d10 metres of the target is drenched in gore. Each affected character must make a Challenging (+0) Agility test or suffer a -10 penalty to Weapon Skill and Ballistic Skill tests for 1 round, as blood fouls his sight."
],

Head: [
"",
"The explosion leaves the target confused. He can take only a Half Action on his next turn as he recovers his senses.",
"The flash and noise leaves the target Blinded and Deafened for 1 round.",
"The detonation leaves the target's face a bloody ruin from scores of cuts. Permanent scarring is very likely. The target suffers 2 levels of Fatigue and must make a Challenging (+0) Toughness test or suffer 1d10 points of Perception and Fellowship damage.",
"The force of the blast knocks the target to the ground and leaves him senseless. The target suffers 1d10 Intelligence damage and is knocked Prone. He must also pass a Challenging (+0) Toughness test; if he fails, he is Stunned for 2 rounds and his Intelligence characteristic is permanently reduced by 1.",
"The explosion flays the flesh from the target's face and bursts his eardrums with its force. The target is Stunned for 1d10 rounds and is permanently Deafened. Permanently reduce his Fellowship characteristic by 1d5.",
"The target's head explodes under the force of the attack, leaving his headless corpse to spurt blood from the neck for the next few minutes. Needless to say, this is instantly and messily fatal.",
"Both head and body are blown into a mangled mess, instantly killing the target. If he is carrying any ammunition, it explodes, inflicting a single hit for 1d10+5 Impact damage to a randomly determined Hit Location on each target within 1d5 metres. If the target was carrying any grenades or missiles, these also detonate immediately with their normal effects.",
"In a series of unpleasant explosions the target's head and torso peel apart, leaving a gory mess on the ground. For the rest of the fight, anyone moving over this spot must make a Challenging (+0) Agility test or fall Prone.",
"The target ceases to exist in any tangible way, entirely turning into a kind of bright red mist that spreads through the surrounding area. He cannot get much deader than this, except'",
"As above, except such is the unspeakably appalling manner in which the target was killed that each of the target's allies within two metres of where the target stood must make an immediate Challenging (+0) Willpower test. If an ally fails the test, he must spend his next turn fleeing from the attacker."
],

Leg: [
"",
"A glancing blast sends the character backwards one metre. The target must make a Challenging (+0) Toughness test or be knocked Prone.",
"The force of the explosion takes the target's feet out from under him. He is knocked Prone and cannot use any Movement action except for the Half Move action for 1d5 rounds.",
"The concussion causes the target's leg to fracture. The target suffers 2d10 Agility damage.",
"The explosion sends the target spinning through the air. He is flung 1d5 metres away in a random direction using the Scatter Diagram. It takes the target a Full Action to regain his feet, and his Movement is reduced by half (rounding up) for 1d10 rounds.",
"Explosive force removes part of the target's foot and scatters the ragged remnants over a wide area. The target must make a Difficult (-10) Toughness test or suffer 1d5 levels of Fatigue. Permanently reduce his Agility characteristic by 1d5.",
"The concussive force of the blast shatters the target's leg bones and splits apart flesh. The target suffers 1d10 levels of Fatigue. The leg is Useless until he receives medical attention. The target must make a Challenging (+0) Toughness test; if he fails, he suffers the Lost Foot condition (see page 198).",
"The explosion reduces the target's leg into a hunk of smoking meat. The target must immediately make a Challenging (+0) Toughness test or die from shock. If he survives, he suffers 1d10 levels of Fatigue, is Stunned for 1d10 rounds, and suffers Blood Loss. He now suffers the Lost Leg condition (see page 198).",
"The blast tears the leg from the body in a geyser of gore, sending him crashing to the ground, blood pumping from the ragged stump. This grievous wound is instantly fatal.",
"The leg explodes in an eruption of blood, killing the target immediately and sending tiny fragments of bone, clothing, and armour hurtling off in all directions. Each target within 2 metres suffers a single hit for 1d10+2 Impact damage to a randomly determined Hit Location.",
"As above, but if the target is carrying any ammunition it detonates, inflicting a single hit for 1d10+5 Impact damage to a randomly determined Hit Location upon each target within 1d10 metres (in addition to the hit noted above). If the target is carrying any grenades or missiles, these detonate immediately with their normal effects."
]

},

Impact: {

Arm: [
"",
"The attack strikes the target's limb with a powerful blow. He drops anything he was holding in that hand.",
"The strike leaves a deep bruise, possibly causing minor fractures in the arm. The target suffers 1 level of Fatigue.",
"The impact smashes into the arm or whatever the target is holding, ripping it away and leaving the target reeling from the pain. He is Stunned for 1 round and drops anything he was holding in that hand. Roll 1d10; on a result of 1, anything the target was holding in that hand is badly damaged and unusable until repaired.",
"The impact crushes flesh and bone. The target drops anything he was holding in that hand, and must make a Challenging (+0) Toughness test or suffer 1d10 Weapon Skill and 1d10 Ballistic Skill damage.",
"Muscle and bone take a pounding as the attack rips into the arm. The limb is Useless until the target receives medical attention.",
"The attack pulverises the target's hand, crushing and breaking 1d5 fingers. The target suffers 1 level of Fatigue. He must make a Challenging (+0) Toughness test; if he fails, permanently reduce his Weapon Skill and Ballistic Skill characteristics by 2.",
"With a loud snap, the arm bone is shattered and left hanging limply at the target's side, dribbling blood onto the ground. The target suffers Blood Loss. The arm is Useless until the target receives medical attention.",
"The force of the attack takes the arm off just below the shoulder, showering blood and gore across the ground. The target must immediately make a Challenging (+0) Toughness test or die from shock. If he survives, he suffers 1d5 levels of Fatigue, is Stunned for 1d10 rounds, and suffers Blood Loss. He also now suffers from the Lost Arm condition (see page 242).",
"In a rain of blood, gore, and meat, the target's arm is removed from his body. Screaming incoherently, he twists about in agony for a few seconds before collapsing to the ground and dying.",
"As per the effect directly above, except as the arm is removed by the force of the attack, bone, chunks of flesh, clothing, and armour fragments fly about like blood-soaked shrapnel. Each target within 2 metres suffers a single hit for 1d5-3 Impact damage to a randomly determined Hit Location."
],

Body: [
"",
"A blow to the target's body steals the breath from his lungs. The target can take only a Half Action on his next turn.",
"The impact punches the air from the target's body. He suffers 1 level of Fatigue and is knocked Prone.",
"The attack breaks a rib with a resounding crunch. The target is Stunned for 1 round and knocked Prone.",
"The blow batters the target, shattering a rib. The target suffers 1d10 Toughness damage and must make a Challenging (+0) Agility test or be knocked Prone.",
"A solid blow to the chest pulverises the target's innards, and he momentarily doubles over in pain, clutching himself and crying in agony. The target is Stunned for 2 rounds and must make a Challenging (+0) Toughness test or suffer 1d5 levels of Fatigue.",
"The attack knocks the target sprawling on the ground. The target suffers 1d5 levels of Fatigue, is flung 1d5 metres away from the attacker (stopping if he hits a solid object), and falls Prone. He is Stunned for 2 rounds.",
"With an audible crack, 1d5 of the target's ribs break. Permanently reduce the target's Toughness characteristic by 1d5. Until he receives medical attention, at the end of each round in which this character took an action, roll 1d10. On a result of 1 or 2, the character dies instantly as a shattered rib pierces a vital organ.",
"The force of the attack ruptures several of the target's organs and knocks him down, gasping in wretched pain. The target suffers Blood Loss. Permanently reduce his Toughness characteristic by 1d10.",
"The target jerks back from the force of the attack, throwing back his head and spewing out a jet of blood before crumpling to the ground dead.",
"As per the effect directly above, except the target's lifeless form is thrown 1d10 metres directly away from the attack. Any target in the corpse's path must make a Challenging (+0) Agility test or be knocked Prone."
],

Head: [
"",
"The impact fills the target's head with a terrible ringing noise. The target must make a Challenging (+0) Toughness test or suffer 1 level of Fatigue.",
"The hit causes the target's sight to blur and his head to spin. The target suffers a -10 penalty to Perception and Intelligence tests for 1d5 rounds.",
"The target's nose breaks in a torrent of blood, blinding him for 1 round. The target must make a Challenging (+0) Toughness test or be Stunned for 1 round.",
"The concussive strike staggers the target. The target must make a Challenging (+0) Toughness test or be Stunned for 1 round and knocked Prone.",
"The force of the blow sends the target reeling in pain. The target suffers 1 level of Fatigue, is Stunned for 1 round, and staggers backwards 1d5 metres. Permanently reduce his Intelligence characteristic by 1.",
"The target's head is snapped back by the attack, leaving him staggering around trying to control mind-numbing pain. The target is Stunned for 1d5 rounds, is knocked backwards 1d5 metres, and must make a Challenging (+0) Agility test or be knocked Prone.",
"The attack slams into the target's head, fracturing his skull and opening a long tear in his scalp. The target is Stunned for 1d10 rounds. His Movement is halved (rounding up) for 1d10 hours.",
"With a sickening crunch, the target's head snaps around to face the opposite direction. The twisted vertebrae immediately sever every connection within the target's neck, and his death is instantaneous.",
"The target's head bursts like an overripe fruit and sprays blood, bone, and brains in all directions. Each target within 4 metres of the deceased must make a Challenging (+0) Agility test or suffer a -10 penalty to his Weapon Skill and Ballistic Skill tests on his next turn, as gore gets in his eyes or obscures his visor.",
"As above, except that the attack was so powerful that it passes through the target and strikes another target nearby. If the hit was from a melee weapon, the attacker may immediately make another attack (with the same weapon) against any other target he can reach without moving. If the hit was from a ranged weapon, he may immediately make another attack (with the same weapon) against any target standing directly behind the original target and within range of his weapon."
],

Leg: [
"",
"A blow to the leg results in deep bruises and teeth-clenching pain. The target suffers 1 level of Fatigue.",
"A grazing strike against the leg slows the target. The target's Movement is reduced by half (rounding up) for 1 round. He must make a Challenging (+0) Toughness test or be Stunned for 1 round and fall Prone.",
"A solid blow to the leg sends lightning agony coursing through the target. He is knocked Prone and suffers 1d10 Agility damage.",
"A powerful impact causes micro-fractures in the target's bones, inflicting considerable agony. The target is knocked Prone and suffers 2d10 Agility damage.",
"The blow breaks the target's leg with an agonising snap. He is Stunned for 1 round and knocked Prone. Reduce his Movement to 1 metre until he receives medical attention.",
"With a sharp cracking noise, several of the tiny bones in the target's foot snap like twigs. The target suffers 2 levels of Fatigue, and his Movement is halved (rounded up) until he receives medical attention. He must make a Challenging (+0) Toughness test or suffer the Lost Foot condition (see page 243).",
"With a nasty crunch, the leg is broken and the target is left mewling in pain. He is Stunned for 2 round and falls Prone. The leg is Useless until the target receives medical attention.",
"The force of the attack rips the lower half of the leg away in a stream of blood. The target must immediately make a Challenging (+0) Toughness test or die from shock. If he survives, he suffers Blood Loss and suffers the Lost Leg condition (see page 243). Permanently reduce his Agility Characteristic by 1d5.",
"The hit rips apart the flesh of the leg, causing blood to spray out in all directions. Even as the target tries futilely to stop the sudden flood of vital fluid, he falls to the ground and dies in a spreading pool of gore.",
"As above, but such is the agony of the target's death that his terrible screams drown out all conversation within 2d10 metres for the rest of the round."
]

},

Rending: {

Arm: [
"",
"The slashing attack tears free whatever the target was carrying. He drops anything he was holding in that hand.",
"Deep cuts cause the target to drop his arm. He suffers 1 level of Fatigue and releases anything he was holding in that hand.",
"The attack shreds the target's arm into ribbons, causing the target to scream in pain. He drops anything he was holding in that hand, and must make a successful Challenging (+0) Toughness test or suffer Blood Loss.",
"The attack flays the skin from the limb, filling the air with blood and the sounds of his screaming. The target suffers 2 levels of Fatigue and falls Prone. The arm is Useless for 1d10 rounds.",
"A bloody and very painful-looking furrow is opened up in the target's arm. He suffers Blood Loss and drops anything he was holding in that hand. The arm is Useless until the target receives medical attention.",
"The blow mangles flesh and muscle as it hacks into the target's hand, liberating 1d5 fingers in the process (a roll of a 5 means that the thumb has been sheared off as well). The target is Stunned for 1 round and must immediately make a Challenging (+0) Toughness test or suffers the Lost Hand condition (see page 242).",
"The attack rips apart skin, muscle, bone, and sinew with ease, turning the target's arm into a dangling ruin of severed veins and spurting blood. He suffers Blood Loss and 1d10 Strength damage. The arm is Useless until the target receives medical attention.",
"With an assortment of unnatural, wet, ripping sounds, the arm flies free of the body trailing blood behind it in a crimson arc. The target must immediately make a Challenging (+0) Toughness test or die from shock. If he survives, he is Stunned for 1d10 rounds and suffers Blood Loss. He suffers from the Lost Arm condition (see page 242).",
"The attack slices clean through the arm and into the torso, drenching the ground in blood and gore. The target is killed instantly, leaving a ruined corpse on the ground.",
"As above, but as the arm falls to the ground its fingers spasm uncontrollably, pulling the trigger of any held weapon. If the target was carrying a ranged weapon, roll 1d100. On a result of 96 or higher, a single randomly determined target within 2d10 metres is hit struck by a single hit from that weapon on a randomly determined Hit Location."
],

Body: [
"",
"If the target is not wearing armour on this location, he suffers 1 level of Fatigue from a painful laceration. If he is wearing armour, there is no effect, and he thanks the Emperor for his foresight.",
"A powerful slash opens a painful rent in the target's body. He suffers 1 level of Fatigue and must make a Challenging (+0) Toughness test or be Stunned for 1 round.",
"The attack rips a large patch of skin from the target's torso, leaving him gasping in pain. The target is Stunned for 1 round and must make a Challenging (+0) Toughness test or suffer Blood Loss.",
"The blow opens up a long wound in the target's torso, causing him to double over in terrible pain. The target is Stunned for 1 round and suffers Blood Loss.",
"A torrent of blood spills from the deep cuts, making the ground slick with gore. The target suffers Blood Loss and suffers 1d10 Toughness damage. Any character attempting to move through this pool of blood must make a Challenging (+0) Agility test or fall Prone.",
"The mighty attack takes a sizeable chunk out of the target and knocks him to the ground as he clutches the oozing wound, shrieking in pain. The target is knocked Prone, suffers Blood Loss, and suffers 1d10 Toughness damage.",
"The attack cuts open the target's abdomen, threatening to expose his entrails. The target suffers Blood Loss. Permanently reduce his Toughness characteristic by 1d5. Until he receives medical attention, at the end of each round, if he took any actions (besides holding his guts in and waiting for a medic), roll 1d10. On a result of 1 or 2, he suffers an additional 2d10 Rending damage.",
"With a vile tearing noise, the skin on the target's chest comes away revealing a red ruin of muscle. He must succeed on a Challenging (+0) Toughness test or perish. If he survives, he is Stunned for 1 round and suffers Blood Loss. Permanently reduce his Toughness characteristic by 1d10.",
"The powerful blow cleaves the target from gullet to groin, revealing his internal organs and spilling them on to the ground before him. The target is now quite dead.",
"As above, except that the area and the target are awash with slippery gore. For the rest of the fight, any character who moves within four metres of the target's corpse must make a Challenging (+0) Agility test or fall Prone."
],

Head: [
"",
"The attack tears a painful rent in the target's face. If he is wearing a helmet, he suffers no ill effects; otherwise, he suffers 1 level of Fatigue.",
"The attack slices open the target's scalp, which immediately begins to bleed profusely, spilling into his eyes. The target suffers a -10 penalty to Weapon Skill and Ballistic Skill tests for the next 1d10 rounds. He must pass a Challenging (+0) Toughness test or suffer Blood Loss.",
"The attack rips open the target's face with a vicious shredding sound. He is Stunned for 1 round and suffers Blood Loss. If he is wearing a helmet, it is torn off.",
"The attack slices across one of the target's eye sockets, possibly scooping out the eye. The target suffers 1d10 Perception damage. He must make a Routine (+20) Toughness; test if he fails, he suffers the Lost Eye condition (see page 242).",
"The attack tears the target's helmet from his head. If he is not wearing a helmet, the target instead loses an ear and is Deafened until he receives medical attention. If he loses an ear, he must also must pass a Challenging (+0) Toughness test or have his Fellowship characteristic permanently reduced by 1. The target is Stunned for 1d5 rounds.",
"The blow rips violently across the target's face, taking with it an important feature. He suffers 1d5 levels of Fatigue and suffers Blood Loss. Roll 1d10 to see what the target has lost.\n1-3: Eye (see the Lost Eye condition on page 242),\n4-7: Nose (permanently reduce his Fellowship characteristic by 1d10),\n8-10: Ear (the target is Deafened until he receives medical attention).",
"In a splatter of skin and teeth, the attack removes most of the target's face. The strike might not have slain him, but the target's words are forever slurred as a result of this vicious injury. The target is Stunned for 1 round and suffers Blood Loss. He is permanently Blinded. Permanently reduce his Fellowship characteristic by 1d10.",
"The blow slices into the side of the target's head causing his eyes to pop out and his brain to ooze down his cheek like spilled jelly. He is dead before he hits the ground.",
"With a sound not unlike a wet sponge being torn in half, the target's head flies free of its body and sails through the air, landing harmlessly 2d10 metres away with a soggy thud. The target is instantly slain.",
"As above, except the target's neck spews blood in a torrent, drenching all those within 1d5 metres and forcing each effected target to make a Challenging (+0) Agility test. Each character who fails the Test suffers a -10 penalty to Weapon Skill and Ballistic Skill tests for 1 round, as gore fills his eyes or fouls his visor."
],

Leg: [
"",
"The attack knocks the limb backwards, painfully twisting it awkwardly. The target suffers 1 level of Fatigue.",
"The target's kneecap splits open. He must make a Challenging (+0) Agility test or fall Prone and suffer Blood Loss as the injured extremity hits the ground.",
"The attack rips a length of flesh from the leg. The target suffers Blood Loss and suffers 1d5 Agility damage.",
"The attack rips the kneecap free from the target's leg, and he collapses to the ground. The target is knocked Prone and suffers 1d10 Agility Damage. His Movement values are halved (rounding up) until he receives medical attention.",
"In a spray of blood, the target's leg is deeply slashed, exposing bone, sinew, and muscle. The target suffers Blood Loss. He must make a Challenging (+0) Toughness test; if he fails, permanently reduce his Agility characteristic by 1.",
"The blow slices a couple of centimetres off the end of the target's foot. The target suffers Blood Loss. He must make a Challenging (+0) Toughness test. If he succeeds, his Movement is halved (rounding up) until he receives medical attention. If he fails, he suffers the Lost Foot condition (see page 243).",
"The force of the blow cuts deep into the leg, grinding against bone and tearing ligaments apart. The target is Stunned for 1 round, is knocked Prone, and suffers Blood Loss. The leg is Useless until the target receives medical attention.",
"In a single bloody hack the target's leg is lopped off, spurting its vital fluids across the ground. The target must immediately make a Challenging (+0) Toughness test or die from shock. If he survives, he is Stunned for 1d10 rounds and suffers Blood Loss. He suffers the Lost Leg condition (see page 243).",
"With a meaty chop, the leg comes away at the hip. The target pitches to the ground howling in agony before dying.",
"As above, except that the tide of blood is so intense that, for the remainder of the encounter, any character who makes a Run or Charge action within 6 metres of the corpse must make a Challenging (+0) Agility test or be knocked Prone."
]

},
  
};

// ======================================
// Replace dice with ONLY rolled result
// ======================================
async function rollInlineDice(text){

  const diceRegex = /-?\d+d\d+/gi;

  const matches = [...text.matchAll(diceRegex)];

  for (const m of matches){

    const expr = m[0];

    const r = new Roll(expr);
    await r.evaluate({async:true});

    // replace entire dice expression with just the number
    text = text.replace(expr, r.total);
  }

  return text;
}
// ======================================
// Damage Type display (BEAUTIFIED)
// ======================================
function getDamageTypeHTML(damageType){

  if (!damageType) return "";

  const typeColors = {
    energy:    "#4fd1ff",
    explosive: "#ff9933",
    rending:   "#cc3333",
    impact:    "#aaaaaa"
  };

  const key = damageType.toLowerCase();
  const color = typeColors[key] || "#ffffff";

  return `
  <span style="
    color:${color};
    font-weight:900;
    letter-spacing:1px;
    text-shadow:
      0 0 1px black,
      0 0 2px black,
      1px 1px 0 black,
     -1px -1px 0 black;
  ">
    ${damageType.toUpperCase()}
  </span>
  `;
}
// ======================================
// Beautify critical text
// ======================================
function stylizeCriticalText(text){
  // -------------------------
  // Numbers → bold
  // -------------------------
  text = text.replace(/\b\d+\b/g, "<b>$&</b>");

  // -------------------------
  // Characteristics → bold
  // -------------------------
  const stats = [
    "Weapon Skill","Ballistic Skill","Strength","Toughness",
    "Agility","Intelligence","Perception","Willpower",
    "Fellowship","Influence"
  ];

  for (const s of stats){
    const r = new RegExp(`\\b${s}\\b`, "g");
    text = text.replace(r, `<b>${s}</b>`);
  }

  // -------------------------
  // Conditions → bold + color
  // -------------------------
  const styles = {
"Fatigue":    "#a67c52", // dusty brown (tired / drained)
"Fire":       "#ff7a00", // bright flame orange
"fire":       "#ff7a00",
"Blood Loss": "#b30000", // deep blood red
"Stunned":    "#00b3ff", // electric blue (shock/impact)
"Prone":      "#808080", // grey (down on the ground)
"Deafened":   "#5dade2", // soft blue (muffled/sensory loss)
"Blinded":    "#6c63ff"  // indigo (darkness/vision loss)
  };

  for (const [word,color] of Object.entries(styles)){
    const r = new RegExp(`\\b${word}\\b`, "g");
    text = text.replace(
      r,
      `<b style="color:${color}; text-shadow: 1px 1px #000000;">${word}</b>`
    );
  }

  return text;
}
const WORKFLOW_NS = "warhammer-40k-cogitator";
const WORKFLOW_KEY = "dh2eExternalWorkflow";

const buildWorkflowHtml = state => {
  const outlined = (text, color) => `<span style="font-weight:700;color:${color};text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;">${text}</span>`;
  const statusColor = status => {
    const normalized = String(status ?? "").toLowerCase();
    if (normalized.includes("jam")) return "#b267ff";
    if (normalized.includes("miss")) return "#ff3b3b";
    if (normalized.includes("hit") || normalized.includes("ok") || normalized.includes("out of ammo")) return "#1aff1a";
    return "#d9d9d9";
  };
  const joinedTargets = (predicate = null) => {
    const targets = (state.targets ?? []).filter(t => !predicate || predicate(t)).map(t => t.name);
    return targets.length ? targets.join(", ") : "the target";
  };
  const buildDescription = () => `<b>${state.attackerName}</b>'s attack with <b>${state.weaponName}</b> damages <b>${joinedTargets(t => t.damageApplied || t.damageResolved)}</b>`;

  const cards = (state.targets ?? []).map(t => {
    const sizeTxt = t.sizeIgnored ? `${t.sizeLabel} (Black Carapace ignores)` : `${t.sizeLabel} ${t.sizeMod >= 0 ? "+" : ""}${t.sizeMod}`;
    const damageSummary = t.damageSummary
      ? `<div style="margin-top:4px;padding:6px;border:1px solid #777;border-radius:6px;">${t.damageSummary}${t.applySummary ? `<hr>${t.applySummary}` : ""}</div>`
      : `<div style="text-align:center;"><b>Damage</b><div>—</div></div>`;

    return `<div style="border:1px solid #555;border-radius:6px;padding:6px;margin:6px 0;">
      <div><b>${t.name}</b></div>
      <div><b>Distance:</b> ${t.distanceMeters}m | <b>Range:</b> ${t.rangeLabel}</div>
      <div><b>Size:</b> ${sizeTxt}</div>
      <div><b>Target:</b> ${outlined(t.targetNumber, "#3aa0ff")} | <b>Roll:</b> ${outlined(state.attackRoll ?? "—", "#ff9f1a")}</div>
      <div><b>Hits:</b> ${t.allocatedHits}</div>
      ${t.defenseAction
        ? `<div><b>Defense (T vs R):</b> ${outlined(t.defenseTargetNumber ?? "—", "#3aa0ff")} vs ${outlined(t.defenseRoll ?? "—", "#ff9f1a")} (${t.defenseAction} — ${t.defenseOutcome ?? "—"})</div>`
        : `<div><b>Defense (T vs R):</b> ${outlined(t.defenseTargetNumber ?? "—", "#3aa0ff")} vs ${outlined(t.defenseRoll ?? "—", "#ff9f1a")} (${t.defenseOutcome ?? "—"})</div>`}
      ${damageSummary}
    </div>`;
  }).join("");

  return `<div data-workflow-id="${state.id}">
    <div style="margin:0 0 6px 0;font-size:1.05em;font-style:italic;">${buildDescription()}</div>
    <div><b>Attack Mode:</b> ${state.modeLabel} | <b>Power:</b> ${state.powerModeLabel}</div>
    <div><b>Craftsmanship:</b> ${state.craftName} | <b>Aim:</b> ${state.aimLabel}</div>
    <div><b>Attack Roll:</b> ${outlined(state.attackRoll ?? "—", "#ff9f1a")} | <b>Target:</b> ${outlined(state.bestTarget ?? Math.max(...(state.targets ?? []).map(t => Number(t.targetNumber ?? 0))), "#3aa0ff")}</div>
    <div><b>Status:</b> ${outlined(state.statusText ?? "Pending", statusColor(state.statusText))} | <b>Total Hits:</b> ${state.totalHits ?? 0}</div>
    <hr>${cards}
  </div>`;
};


const candidates = [];
for (const msg of game.messages.contents) {
  const state = msg.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
  if (!state?.targets?.length) continue;
  for (const target of state.targets) {
    if (!target.damageResolved || target.damageApplied) continue;
    const targetUuid = target.tokenUuid ?? target.targetTokenUuid;
    if (!targetUuid) continue;
    const damageData = target.damageApplicationData ?? {
      attacker: state.attackerName,
      target: target.name,
      targetTokenUuid: targetUuid,
      weapon: state.weaponName,
      damageType: "impact",
      penetration: 0,
      hits: (target.damageRolls ?? []).length,
      hitsData: (target.damageRolls ?? []).map((r, idx) => ({ hit: idx + 1, location: r.loc, damage: r.total, fury: null })),
      dos: state.dos ?? 0,
      fury: [],
      properties: []
    };

    if (!damageData?.hitsData?.length) continue;

    candidates.push({ msg, state, target, targetUuid, damageData, label: `${state.attackerName} -> ${target.name} (${damageData.hitsData.length} hit${damageData.hitsData.length === 1 ? "" : "s"}) [${state.weaponName}]` });
  }
}

if (!candidates.length) {
  const fallback = game.dh2eLastDamage;
  if (!fallback?.targetTokenUuid || !fallback?.hitsData?.length) return ui.notifications.warn("No pending workflow damage to apply.");
  candidates.push({ msg: null, state: null, target: null, targetUuid: fallback.targetTokenUuid, damageData: fallback, label: `${fallback.attacker} -> ${fallback.target} [legacy payload]` });
}

const optionHtml = candidates.map((c, i) => `<option value="${i}">${c.label}</option>`).join("");
const selectedIndex = await new Promise(resolve => {
  new Dialog({
    title: "Select Workflow Damage",
    content: `<form><div class="form-group"><label><b>Damage Entry</b></label><select id="pick">${optionHtml}</select></div></form>`,
    buttons: {
      ok: { label: "Continue", callback: html => resolve(Number(html.find("#pick").val() || 0)) },
      cancel: { label: "Cancel", callback: () => resolve(null) }
    },
    default: "ok"
  }).render(true, { width: 700 });
});
if (selectedIndex == null) return;
const selectedEntry = candidates[selectedIndex];
const dmg = selectedEntry.damageData;

async function clearSelectedDamageFromWorkflow() {
  if (selectedEntry.msg && selectedEntry.state) {
    const latest = selectedEntry.msg.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
    if (latest?.targets?.length) {
      const tgt = latest.targets.find(t => (t.tokenUuid ?? t.targetTokenUuid) === dmg.targetTokenUuid);
      if (tgt) {
        tgt.damageResolved = false;
        tgt.damageApplied = false;
        tgt.damageSummary = null;
        tgt.applySummary = null;
        tgt.damageRolls = [];
        tgt.damageApplicationData = null;
      }
      await selectedEntry.msg.update({
        content: buildWorkflowHtml(latest),
        flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: latest } }
      });
    }
  } else {
    game.dh2eLastDamage = null;
  }
}

const token = await fromUuid(dmg.targetTokenUuid);
if (!token) return ui.notifications.warn("Target token not found.");
const actor = token.actor;

async function applyConvenientEffect(actorDoc, { effectId, effectName, counter = null }) {
  if (!actorDoc) return false;
  const effectInterface = game.dfreds?.effectInterface;
  const paramsByPriority = [
    { effectId, uuid: actorDoc.uuid },
    { effectId, uuids: [actorDoc.uuid] },
    { effectName, uuid: actorDoc.uuid },
    { effectName, uuids: [actorDoc.uuid] }
  ].filter(params => params.effectId || params.effectName);

  if (effectInterface?.addEffect) {
    for (const params of paramsByPriority) {
      try {
        await effectInterface.addEffect(params);
        break;
      } catch (_) {
        // Keep trying CE signatures.
      }
    }
  }

  if (Number.isFinite(Number(counter)) && Number(counter) > 0) {
    const numericCounter = Number(counter);
    const activeEffect = actorDoc.effects.find(effect => {
      const statuses = Array.isArray(effect.statuses) ? effect.statuses : Array.from(effect.statuses ?? []);
      const ids = statuses.map(status => String(status ?? "").toLowerCase());
      const coreStatus = String(effect.flags?.core?.statusId ?? "").toLowerCase();
      const dfredsId = String(effect.flags?.["dfreds-convenient-effects"]?.effectId ?? "").toLowerCase();
      const name = String(effect.name ?? "").toLowerCase();
      return ids.includes(String(effectId ?? "").toLowerCase()) || coreStatus === String(effectId ?? "").toLowerCase() || dfredsId === String(effectId ?? "").toLowerCase() || name === String(effectName ?? "").toLowerCase();
    });
    if (activeEffect) {
      await activeEffect.update({
        "flags.statuscounter.counter": { value: numericCounter },
        "flags.statusIconCounters.counter": numericCounter,
        "flags.statusIconCounters.value": numericCounter,
        "flags.status-icon-counters.counter": numericCounter,
        "flags.status-icon-counters.value": numericCounter
      });
    }
  }

  return true;
}

function prettyLoc(loc){
  return loc.replace(/([A-Z])/g," $1").replace(/^./,s=>s.toUpperCase());
}

function locKey(loc){
  return {
    "Head":"head",
    "Body":"body",
    "Left Arm":"leftArm",
    "Right Arm":"rightArm",
    "Left Leg":"leftLeg",
    "Right Leg":"rightLeg"
  }[loc] || "body";
}
function critLocKey(loc){
  if (loc.includes("Arm")) return "Arm";
  if (loc.includes("Leg")) return "Leg";
  if (loc === "Head") return "Head";
  return "Body";
}

function getCritText(type, loc, value){
  value = Math.clamp(value, 1, 10);
  return CRIT[type]?.[loc]?.[value] || null;
}
new Dialog({

title:`Apply Damage → ${actor.name}`,

content:`
<form>
<label>Cover:
<input type="number" id="cover" value="0" style="width:60px;"></label>
<br><br>

<label>Extra Damage (each hit):
<input type="number" id="extra" value="0" style="width:60px;"></label>
<br><br>

<label><input type="checkbox" id="ignoreArmour"> Ignore Armour</label><br>
<label><input type="checkbox" id="trueGrit"> True Grit</label>
</form>
`,

buttons:{
apply:{
label:"Apply",
callback: async (html)=>{

const coverStart = Number(html.find("#cover").val()) || 0;

if (dmg.horde?.active) {
  const currentWounds = Number(actor.system?.wounds?.value ?? 0);
  const maxWounds = Number(actor.system?.wounds?.max ?? currentWounds);
  const inflicted = Math.max(0, Number(dmg.horde.magnitudeHits ?? 0));
  const newWounds = Number.isFinite(maxWounds) && maxWounds >= 0
    ? Math.min(maxWounds, currentWounds + inflicted)
    : (currentWounds + inflicted);
  await actor.update({
    "system.wounds.value": newWounds,
    "system.wounds.critical": 0
  });

  const hordeSummary = `
<div style="text-align:center;">

<span style="font-weight:700;color:#000;">Damage done:</span> <span style="font-weight:700;color:#000;">${inflicted}</span><br>
<b>Horde Magnitude Damage:</b> ${currentWounds} -> ${newWounds}${Number.isFinite(maxWounds) && maxWounds >= 0 ? ` / ${maxWounds}` : ""}<br>
${(dmg.properties ?? []).length ? `${(dmg.properties ?? []).map(p => p === "Horde Target" ? `<b>${p}</b>` : p).join(", ")}<br>` : ""}
<i>Horde rules applied: no hit locations, no Righteous Fury, no critical effects.</i>
</div>`;

  if (selectedEntry.msg && selectedEntry.state) {
    const latest = selectedEntry.msg.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
    if (latest?.targets?.length) {
      const tgt = latest.targets.find(t => (t.tokenUuid ?? t.targetTokenUuid) === dmg.targetTokenUuid);
      if (tgt) {
        tgt.damageApplied = true;
        tgt.applySummary = hordeSummary;
      }
      await selectedEntry.msg.update({
        content: buildWorkflowHtml(latest),
        flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: latest } }
      });
    }
  } else {
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor}), content: hordeSummary });
  }
  return;
}

const extra = Number(html.find("#extra").val()) || 0;
const ignoreArmour = html.find("#ignoreArmour")[0].checked;
const trueGrit = html.find("#trueGrit")[0].checked;
const warpWeaponIgnoresArmour = (dmg.properties ?? []).some((property) => String(property ?? "").toLowerCase().includes("warp weapon"));
const armourIgnored = ignoreArmour || warpWeaponIgnoresArmour;

dmg.talentModifier = dmg.talentModifier ?? {
  attack: { attackRoll: 0, penetration: 0, damage: 0, defense: 0, notes: [] },
  defense: { attackRoll: 0, penetration: 0, damage: 0, defense: 0, notes: [] },
  damage: { attackRoll: 0, penetration: 0, damage: 0, defense: 0, notes: [] },
  applyDamage: { attackRoll: 0, penetration: 0, damage: 0, defense: 0, notes: [] }
};
dmg.talentModifier.applyDamage.notes.push("Apply Damage workflow resolved.");

let coverRemaining = coverStart;

// ===== PULL STATS (same pattern as original) =====
const TBtotal = actor.system.characteristics.toughness.total || 0;
const TBunnat = actor.system.characteristics.toughness.unnatural || 0;
const TBBonus = Math.floor(TBtotal/10);
const felling = Math.max(Number(dmg.felling ?? 0), 0);
const effectiveUnnaturalTB = Math.max(TBunnat - felling, 0);
const TB = TBBonus + effectiveUnnaturalTB;

const woundsMax = actor.system.wounds.max;
let woundsCurrent = actor.system.wounds.value;
let critCurrent = actor.system.wounds.critical || 0;

const armourValues = actor.system.armour;
const armourLocationKeys = ["head", "body", "leftArm", "rightArm", "leftLeg", "rightLeg"];
const startingArmourByLocation = Object.fromEntries(
  armourLocationKeys.map((key) => [key, Number(armourValues?.[key]?.value ?? 0)])
);

let report = "";
let lastCritLocation = null;
let realCritToApply = 0;
let furyCrits = [];
  
// ===== ARMOUR BLOCK =====
const armourBlock = `
Head ${armourValues.head?.value||0} |
Body ${armourValues.body?.value||0} |
LA ${armourValues.leftArm?.value||0} |
RA ${armourValues.rightArm?.value||0} |
LL ${armourValues.leftLeg?.value||0} |
RL ${armourValues.rightLeg?.value||0}
`;

// ===============================
// LOOP HITS
// ===============================
let totalInflicted = 0;
const hasCorrosive = (dmg.properties ?? []).some((property) => String(property ?? "").toLowerCase().includes("corrosive"));
let corrosiveArmourDamageTotal = 0;
let corrosiveWoundsDamageTotal = 0;
for (let hit of dmg.hitsData){
  const loc = locKey(hit.location);
  const currentLocationArmour = Number(armourValues?.[loc]?.value ?? 0);

  const coverUsed = Math.max(coverRemaining,0);

  let corrosiveRoll = null;
  let corrosiveArmourDamage = 0;
  let corrosiveWoundDamage = 0;
  if (hasCorrosive) {
    corrosiveRoll = await new Roll("1d10").evaluate();
    if (game.dice3d) await game.dice3d.showForRoll(corrosiveRoll, game.user, true);
    corrosiveArmourDamage = Math.min(currentLocationArmour, Number(corrosiveRoll.total ?? 0));
    corrosiveWoundDamage = Math.max(Number(corrosiveRoll.total ?? 0) - currentLocationArmour, 0);

    if (armourValues?.[loc]) {
      armourValues[loc].value = Math.max(currentLocationArmour - corrosiveArmourDamage, 0);
    }

    corrosiveArmourDamageTotal += corrosiveArmourDamage;
    corrosiveWoundsDamageTotal += corrosiveWoundDamage;
  }

  const armourAfterCorrosive = Number(armourValues?.[loc]?.value ?? 0);
  const totalArmour = armourAfterCorrosive + coverUsed;

  const effectiveArmour = armourIgnored
    ? 0
    : Math.max(totalArmour - dmg.penetration, 0);

  const soak = effectiveArmour + TB;

  const baseDamage = hit.damage;
  const damage = Math.max(baseDamage + extra, 0);

  const inflicted = Math.max(damage - soak, 0);
  totalInflicted += inflicted;

  const woundsBefore = woundsCurrent;

  let newWounds = woundsCurrent + inflicted + corrosiveWoundDamage;
  let critDamage = 0;

  if (newWounds > woundsMax){
    critDamage = newWounds - woundsMax;
    newWounds = woundsMax;
  }

  if (trueGrit && critDamage > 0){
    critDamage = Math.max(critDamage - TB, 1);
  }

  woundsCurrent = newWounds;
  critCurrent += critDamage;
  if (critDamage > 0){
    lastCritLocation = hit.location;
    realCritToApply = critCurrent;
  }

  if (hit.fury){
    furyCrits.push({
      location: hit.location,
      value: Number(hit?.fury?.result ?? hit?.fury ?? 1) || 1
    });
  }

  const corrosiveHitHtml = hasCorrosive
    ? `<b>Corrosive (1d10):</b> ${Number(corrosiveRoll?.total ?? 0)} → Armour -${corrosiveArmourDamage}${corrosiveWoundDamage > 0 ? ` | Wounds +${corrosiveWoundDamage} (ignores armour & TB)` : ""}<br>`
    : "";

  report += `
  <hr>
  <b>Hit ${hit.hit}</b> — <i>${prettyLoc(hit.location)}</i><br>

  <b>Cover:</b> ${coverUsed} → <i>Remaining:</i> ${Math.max(coverRemaining-1,0)}<br>

  <b>Damage:</b> <span style="
  color:#bd7548;
  font-weight:bold;
  font-size:1.1em;
  text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;
">${baseDamage}${extra?` + ${extra}`:""}</span><br>

  ${corrosiveHitHtml}
  <b>Soak:</b> ${soak}<br>

  <b>Inflicted:</b> <span style="color:#ff2a2a;font-weight:900; text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;">${inflicted}</span><br>

  <b>Wounds:</b> ${woundsBefore} → ${woundsCurrent}/${woundsMax}<br>

  <b>Critical Damage:</b> ${critDamage} (${critCurrent} total)

 <span style="
    color:gold;
    font-size:1.0em;
    font-weight:bold;
    text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;
  "> ${hit.fury ? "<br><i>Righteous Fury Applied</i>" : ""}</span>
  `;

  coverRemaining--;
}

// ===============================
// TRAIT TEST RESULTS (resolved in damage workflow)
// ===============================
if (dmg.flame?.resolved) {
  report += `
  <hr>
  <b>🔥 FLAME AGILITY TEST</b><br>
  Target: <b>${dmg.flame.target}</b><br>
  Roll: <b>${dmg.flame.roll}</b><br>
  Result: ${dmg.flame.success ? "<span style='color:#6EC1FF;font-weight:900;'>SUCCESS</span>" : "<span style='color:#ff9f1a;font-weight:900;'>FAILED</span>"}
  `;
}

if (dmg.spray?.resolved) {
  report += `
  <hr>
  <b>💨 SPRAY AGILITY TEST</b><br>
  Target: <b>${dmg.spray.target}</b><br>
  Roll: <b>${dmg.spray.roll}</b><br>
  Result: ${dmg.spray.success ? "<span style='color:#6EC1FF;font-weight:900;'>SUCCESS</span>" : "<span style='color:#ff9f1a;font-weight:900;'>FAILED</span>"}
  `;
}

if (dmg.concussive?.resolved) {
  report += `
  <hr>
  <b>💥 CONCUSSIVE TOUGHNESS TEST</b><br>
  Target: <b>${dmg.concussive.target}</b><br>
  Roll: <b>${dmg.concussive.roll}</b><br>
  Result: ${dmg.concussive.success ? "<span style='color:#6EC1FF;font-weight:900;'>RESISTED</span>" : `<span style='color:#ff9f1a;font-weight:900;'>FAILED</span> (Stunned ${Number(dmg.concussive.value ?? 1)} round${Number(dmg.concussive.value ?? 1) === 1 ? "" : "s"})`}
  `;

  if (!dmg.concussive.success) {
    await applyConvenientEffect(actor, {
      effectId: "stunned",
      effectName: "Stunned",
      counter: Number(dmg.concussive.value ?? 1)
    });
  }
}

if (dmg.toxic?.resolved) {
  report += `
  <hr>
  <b>☣ TOXIC TEST</b><br>
  Target: <b>${dmg.toxic.target}</b><br>
  Roll: <b>${dmg.toxic.roll}</b><br>
  Result: ${dmg.toxic.success
    ? "<span style='color:#6EC1FF;font-weight:900;'>RESISTED</span>"
    : "<span style='color:#66cc66;font-weight:900;'>FAILED</span>"}
  `;

  if (!dmg.toxic.success && Number(dmg.toxic.damage ?? 0) > 0){
    const toxicDamage = Number(dmg.toxic.damage);
    const woundsBefore = woundsCurrent;
    woundsCurrent += toxicDamage;

    report += `
    <div style="font-size:1.1em; color:#66cc66; text-shadow:
      0 0 2px #000,
      0 0 4px #000,
      0 0 6px #000;"><b>☣ TOXIC DAMAGE ☣</b><br>
    Damage: ${toxicDamage}<br>
    <span style="font-weight:900;">Inflicted: ${toxicDamage} (ignores armour & TB)</span></div><br>
    Wounds: ${woundsBefore} → ${woundsCurrent}/${woundsMax}
    `;
  }
} else if (dmg.toxic?.result && totalInflicted > 0) {
  // Backward compatibility for old payloads
  const toxicDamage = Number(dmg.toxic.result);
  const woundsBefore = woundsCurrent;
  woundsCurrent += toxicDamage;
  report += `<hr><b>☣ TOXIC DAMAGE ☣</b><br>Damage: ${toxicDamage}<br>Wounds: ${woundsBefore} → ${woundsCurrent}/${woundsMax}`;
}

if (dmg.hallucinogenic?.resolved) {
  const hallucinogenic = dmg.hallucinogenic;
  const hallucinogenicBaseTarget = Number(hallucinogenic.target ?? 0)
    + Number(hallucinogenic.penalty ?? 0)
    - Number(hallucinogenic.respiratorBonus ?? 0);

  const hallucinogenicResultTable = {
    1: "Bugsbugsbugsbugs! The character drops to the floor, flailing and screaming as he tries to claw off imaginary insects devouring his skin and flesh. The character gains the Prone and Stunned conditions.",
    2: "My hands…! The character believes his hands have turned into slimy tentacles, or perhaps the flesh has begun to strip off the bone in bloody lumps. Regardless of the particulars, the character drops everything he is carrying and spends the duration staring at his hands and screaming. The character is Stunned.",
    3: "They're coming through the walls! The character sees gruesome aliens bursting through the walls/ceiling/floor/bushes and opens fire. The character must spend each turn firing at a random piece of terrain within his line of sight. Any creatures caught in the line of fire are subject to attacks as normal. Each round, choose a new target at random (use the Scatter Diagram) to determine which direction that is, with a "7" meaning he shoots the ground, and a "10" meaning he fires wildly into the air.",
    4: "Nobody can see me! The character believes he is invisible and wanders aimlessly, making faces at those around him. He waddles about in random directions each round (use the Scatter Diagram), using a Full Action to move. The character retains his Reactions.",
    5: "I can fly! The sky looks so big and inviting, the character flaps his arms trying to imitate a pterasquirrel. He might do nothing but jump up and down on the spot. If he is standing above ground level, he may throw himself off in a random direction, with the usual consequences for falling—appalling injury or death being the likely outcomes.",
    6: "They've got it in for me…! The character is overcome with paranoia, believing even his own comrades are out to get him. On the character's turn, he must move to a position of cover, getting out of line of sight from any other characters. He remains hidden until the effect ends, moving to new cover as needed to stay as hidden as possible.",
    7: "They got me! The character believes that the gas is toxic and collapses to the floor as if dead; he counts as being Helpless. Other characters who sees him "die" must pass a Challenging (+0) Intelligence test; should they fail then they also think the character is dead.",
    8: "I'll take you all on! The character is filled with a burning rage and a desire for violence. The character becomes Frenzied (see page 127) for the duration of the effects, and must attack the closest opponent.",
    9: "I'm only little! The character believes he has shrunk to half his normal size and everything else is big and frightening now. All other characters count as having the Fear (3) trait to the character.",
    10: "The worms! The character desperately tries to remove a massive fanged worm he thinks is slowly winding its way up his leg. If holding a gun, he shoots himself with it or, if not, he hits himself in the leg with whatever melee weapon he is holding. If the character is currently holding no weapon, he draws a random weapon from those he carries and attacks himself with it. Randomly determine which leg the character believes to be trapped by the worm. The attack automatically inflicts a single hit with 1d5 degrees of success that deals damage normally."
  };

  const resultText = hallucinogenic.resultText ?? hallucinogenicResultTable[Number(hallucinogenic.effectRoll ?? 0)] ?? "";
  const inlineRolls = hallucinogenic.resultInlineRolls
    ?? (Number(hallucinogenic.effectRoll ?? 0) === 3 || Number(hallucinogenic.effectRoll ?? 0) === 4
      ? "Scatter Diagram: [[/r 1d10]]"
      : (Number(hallucinogenic.effectRoll ?? 0) === 10 ? "1d5 degrees of success: [[/r 1d5]]" : ""));

  report += `
  <hr>
  <b>🌀 HALLUCINOGENIC (${Number(hallucinogenic.value ?? 1)}) TOUGHNESS TEST</b><br>
  Target: <b>${hallucinogenic.target}</b> (T ${hallucinogenicBaseTarget} - ${Number(hallucinogenic.penalty ?? 0)}${Number(hallucinogenic.respiratorBonus ?? 0) > 0 ? ` + ${Number(hallucinogenic.respiratorBonus ?? 0)} Respirator` : ""})<br>
  Roll: <b>${hallucinogenic.roll}</b><br>
  Result: ${hallucinogenic.success
    ? "<span style='color:#6EC1FF;font-weight:900;'>RESISTED</span>"
    : `<span style='color:#ff9f1a;font-weight:900;'>FAILED</span> (Duration: <b>${hallucinogenic.duration}</b> round${Number(hallucinogenic.duration ?? 0) === 1 ? "" : "s"})<br>${resultText}${inlineRolls ? `<br>${inlineRolls}` : ""}`}
  `;
}

let shockingOutcomeSummary = "";
let snareOutcomeSummary = "";
const hasShocking = Boolean(dmg.shocking?.active)
  || (dmg.properties ?? []).some(p => String(p).toLowerCase().includes("shocking"));

if (hasShocking && totalInflicted > 0) {
  const shockingTarget = Math.max(1, Number(actor.system?.characteristics?.toughness?.total ?? 0));
  const shockingRoll = await new Roll("1d100").evaluate();
  if (game.dice3d) await game.dice3d.showForRoll(shockingRoll, game.user, true);

  const succeeded = shockingRoll.total <= shockingTarget && shockingRoll.total !== 100;
  const dof = succeeded ? 0 : Math.max(1, 1 + Math.floor((shockingRoll.total - shockingTarget) / 10));

  report += `
  <hr>
  <b><span style='color:#ffd200;'>⚡</span> <span style='color:#00b3ff;'>SHOCKING TOUGHNESS TEST</span></b><br>
  Target: <b>${shockingTarget}</b><br>
  Roll: <b>${shockingRoll.total}</b><br>
  Result: ${succeeded
    ? "<span style='color:#6EC1FF;font-weight:900;'>SUCCESS</span>"
    : `<span style='color:#00b3ff;font-weight:900;'>FAILED</span> (DoF ${dof})`}
  `;

  if (succeeded) {
    shockingOutcomeSummary = `<br><b>${dmg.target}</b> succeeded vs <span style='color:#00b3ff;font-weight:900;'>Shocking</span>.`;
  } else {
    const currentFatigue = Number(actor.system?.fatigue?.value ?? 0);
    await actor.update({ "system.fatigue.value": currentFatigue + 1 });
    await applyConvenientEffect(actor, {
      effectId: "stunned",
      effectName: "Stunned",
      counter: dof
    });
    shockingOutcomeSummary = `<br><b>${dmg.target}</b> is <span style='color:#00b3ff;font-weight:900;'>stunned</span> for <b>${dof}</b> round${dof === 1 ? "" : "s"}.`;
  }
}


const snareProperty = (dmg.properties ?? []).find((property) => /snare/i.test(String(property ?? "")));
const snareValue = snareProperty
  ? Number(String(snareProperty).match(/snare\s*\((\d+)\)/i)?.[1] ?? 0)
  : 0;
const hasSnare = Boolean(snareProperty);

if (hasSnare && totalInflicted > 0) {
  const agilityTotal = Number(actor.system?.characteristics?.agility?.total ?? 0);
  const snarePenalty = snareValue * 10;
  const snareTarget = Math.max(1, agilityTotal - snarePenalty);
  const snareRoll = await new Roll("1d100").evaluate();
  if (game.dice3d) await game.dice3d.showForRoll(snareRoll, game.user, true);

  const succeeded = snareRoll.total <= snareTarget && snareRoll.total !== 100;

  report += `
  <hr>
  <b><span style='color:#89d185;'>🪤 SNARE AGILITY TEST</span></b><br>
  Target: <b>${snareTarget}</b> ${snarePenalty > 0 ? `(Ag ${agilityTotal} - ${snarePenalty})` : ""}<br>
  Roll: <b>${snareRoll.total}</b><br>
  Result: ${succeeded
    ? "<span style='color:#6EC1FF;font-weight:900;'>SUCCESS</span>"
    : "<span style='color:#ff9f1a;font-weight:900;'>FAILED</span>"}
  `;

  snareOutcomeSummary = succeeded
    ? `<br><b>${dmg.target}</b> avoided the <span style='color:#89d185;font-weight:900;'>Snare</span>.`
    : `<br><b>${dmg.target}</b> is <span style='color:#89d185;font-weight:900;'>Immobilized</span> by <span style='color:#89d185;font-weight:900;'>Snare</span>.`;
}

if (dmg.force?.resolved) {
  report += `
  <hr>
  <div style="color:#cc3333; text-shadow:0 0 2px #000,0 0 4px #000,0 0 6px #000; font-weight:900;"><b>✦ FORCE OPPOSED TEST ✦</b></div><br>
  Attacker WP: ${dmg.force.attackerWP} Roll <b>${dmg.force.attackerRoll}</b> (DoS ${dmg.force.attackerDoS})<br>
  Target WP: ${dmg.force.targetWP} Roll <b>${dmg.force.targetRoll}</b> (DoS ${dmg.force.targetDoS})<br>
  `;

  if (dmg.force.won && Number(dmg.force.result ?? 0) > 0) {
    const forceDamage = Number(dmg.force.result);
    const woundsBefore = woundsCurrent;
    let newWounds = woundsCurrent + forceDamage;
    let critDamage = 0;

    if (newWounds > woundsMax){
      critDamage = newWounds - woundsMax;
      newWounds = woundsMax;
    }
    if (trueGrit && critDamage > 0){
      critDamage = Math.max(critDamage - TB, 1);
    }

    woundsCurrent = newWounds;
    critCurrent += critDamage;
    if (critDamage > 0 && lastCritLocation){
      realCritToApply = critCurrent;
    }

    report += `
    <span style="color:#66cc66;font-weight:900;">ATTACKER WINS</span><br>
    <b>✦ FORCE DAMAGE ✦</b><br>
    Damage: ${forceDamage} (${dmg.force.dos}d10)<br>
    <span style="color:#cc3333;font-weight:900;">Inflicted: ${forceDamage} (ignores armour & TB)</span><br>
    Wounds: ${woundsBefore} → ${woundsCurrent}/${woundsMax}<br>
    Crit Added: ${critDamage} (${critCurrent} total)
    `;
  } else {
    report += `<span style="color:#6EC1FF;font-weight:900;">TARGET RESISTS FORCE</span>`;
  }
} else if (dmg.force?.used && dmg.force.result) {
  // Backward compatibility for old payloads
  const forceDamage = Number(dmg.force.result);
  const woundsBefore = woundsCurrent;
  woundsCurrent = Math.min(woundsCurrent + forceDamage, woundsMax);
  report += `<hr><b>✦ FORCE DAMAGE ✦</b><br>Damage: ${forceDamage}<br>Wounds: ${woundsBefore} → ${woundsCurrent}/${woundsMax}`;
}

// ===== UPDATE ACTOR (same as original logic) =====
const armourUpdates = {};
for (const key of armourLocationKeys) {
  const startingArmour = Number(startingArmourByLocation[key] ?? 0);
  const currentArmour = Number(armourValues?.[key]?.value ?? 0);
  if (currentArmour !== startingArmour) {
    armourUpdates[`system.armour.${key}.value`] = currentArmour;
  }
}

await actor.update({
  "system.wounds.value": Math.min(woundsCurrent, woundsMax),
  "system.wounds.critical": critCurrent,
  ...armourUpdates
});
let critReport = "";

const damageType = String(dmg.damageType ?? "");
const critType = damageType.charAt(0).toUpperCase() + damageType.slice(1);

// ==========================
// Righteous Fury effects
// ==========================
for (let i = 0; i < furyCrits.length; i++){

  const fury = furyCrits[i];
  const loc = critLocKey(fury.location);

  let text = getCritText(critType, loc, fury.value);
  if (text){
    text = await rollInlineDice(text);
    text = stylizeCriticalText(text);

    critReport += `
    <hr>
    <b>Righteous Fury ${i+1}:</b>
    ${loc} – ${fury.value}<br>
    ${text}
    `;
  }
}

// ==========================
// REAL CRITICAL (total)
// ==========================
if (realCritToApply > 0 && lastCritLocation){

  const loc = critLocKey(lastCritLocation);

  let text = getCritText(critType, loc, realCritToApply);

  if (text){
    text = await rollInlineDice(text);
    text = stylizeCriticalText(text);

    critReport += `
    <hr>
    <div style="font-size:1.1em;font-weight:900;color:#ff2a2a; text-shadow:0 0 1px black,0 0 2px black,1px 1px 0 black,-1px -1px 0 black;">
    ☠ CRITICAL DAMAGE ☠
    </div>
    ${getDamageTypeHTML(critType)} – ${loc} – ${realCritToApply}<br>
    ${text}
    `;
  }
}

  const corrosiveSummary = hasCorrosive
  ? `<hr><b>☣ CORROSIVE</b><br>Armour Damage: <b>${corrosiveArmourDamageTotal}</b>${corrosiveWoundsDamageTotal > 0 ? `<br>Direct Wounds: <b>${corrosiveWoundsDamageTotal}</b> (ignores armour & TB)` : ""}`
  : "";

const damageTypeHTML = getDamageTypeHTML(dmg.damageType);
  const reminderTraits = ["Crippling", "Sanctified", "Haywire"].filter((trait) =>
    (dmg.properties ?? []).some((property) => String(property ?? "").toLowerCase().includes(trait.toLowerCase()))
  );
  const traitReminderHtml = reminderTraits.length
    ? `<hr><b>Trait Reminder:</b> ${reminderTraits.join(", ")}`
    : "";
  
// ===============================
// WORKFLOW CARD INTEGRATION
// ===============================
const applySummary = `
<div style="text-align:center;">
<b>Armour:</b><br>${armourBlock}<br>
<b>Toughness Bonus:</b> ${TBBonus}<br>
<b>Unnatural Toughness:</b> ${TBunnat}${felling > 0 ? ` (Felling ${felling} → ${effectiveUnnaturalTB})` : ""}
<hr>
<b>Damage Type:</b> ${damageTypeHTML} <br>
<b>Penetration:</b> ${dmg.penetration}<br>
<b>Properties:</b> ${dmg.properties?.join(", ") || "None"}
${report}
${shockingOutcomeSummary}
${snareOutcomeSummary}
${corrosiveSummary}
${trueGrit ? "<hr><i>True Grit applied</i>" : ""}
${armourIgnored ? `<br><i>Armour ignored${warpWeaponIgnoresArmour && !ignoreArmour ? " (Warp Weapon)" : ""}</i>` : ""}
${critReport}
${traitReminderHtml}
</div>`;

if (selectedEntry.msg && selectedEntry.state) {
  const latest = selectedEntry.msg.getFlag(WORKFLOW_NS, WORKFLOW_KEY);
  if (latest?.targets?.length) {
    const tgt = latest.targets.find(t => (t.tokenUuid ?? t.targetTokenUuid) === dmg.targetTokenUuid);
    if (tgt) {
      tgt.damageApplied = true;
      tgt.applySummary = applySummary;
    }

    await selectedEntry.msg.update({
      content: buildWorkflowHtml(latest),
      flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: latest } }
    });

    const allApplied = latest.targets
      .filter(t => (t.allocatedHits ?? 0) > 0)
      .every(t => t.damageApplied);

    if (allApplied && latest.devastatingFollowUp?.available && !latest.devastatingFollowUp?.prompted) {
      const attackerActor = game.actors.get(latest.attackerActorId);
      const hasDevastatingEffect = attackerActor?.effects?.some(effect => {
        const statusValues = Array.isArray(effect.statuses) ? effect.statuses : Array.from(effect.statuses ?? []);
        const statusIds = statusValues.map(status => String(status ?? "").toLowerCase());
        const effectId = String(effect.flags?.["dfreds-convenient-effects"]?.effectId ?? "").toLowerCase();
        const name = String(effect.name ?? "").toLowerCase();
        return statusIds.includes("ce-devastating-assault") || effectId === "ce-devastating-assault" || name.includes("devastating assault");
      });

      if (!hasDevastatingEffect) {
        const ownerIds = game.warhammer40kCogitator?.getDefenseRecipients?.(attackerActor ?? actor)?.map(user => user.id) ?? [];
        ChatMessage.create({
          speaker: { alias: "System" },
          style: CONST.CHAT_MESSAGE_STYLES.OTHER,
          whisper: ownerIds,
          content: "<b>Devastating Assault:</b> You hit. Your next attack against the same target gains the follow-up all out attack setup."
        });
        if (attackerActor) {
          await game.warhammer40kCogitator?.applyDevastatingAssaultEffect?.(attackerActor);

          const ownerIds = game.warhammer40kCogitator?.getDefenseRecipients?.(attackerActor)?.map(user => user.id) ?? [];
          const setup = latest.devastatingFollowUp?.setup ?? null;
          if (ownerIds.length && setup) {
            game.warhammer40kCogitator?.emitSocket?.("mirrorAttackReady", {
              ownerIds,
              attackerName: latest.attackerName,
              setup
            });
          }
        }
      }

      latest.devastatingFollowUp.prompted = true;
      await selectedEntry.msg.update({
        content: buildWorkflowHtml(latest),
        flags: { [WORKFLOW_NS]: { [WORKFLOW_KEY]: latest } }
      });
    }
  }
} else {
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({actor}),
    content: applySummary
  });
}

}
},
delete:{
label:"Delete",
callback: async ()=>{
  await clearSelectedDamageFromWorkflow();
  ui.notifications.info("Pending damage was deleted from the workflow.");
}
},
cancel:{
label:"Cancel"
}
}

}).render(true);
}
