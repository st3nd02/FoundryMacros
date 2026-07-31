const PSYCHIC_PHENOMENA_TABLE = [
  { max: 3, text: `Dark Foreboding: A faint breeze blows past the psyker and those near him, and everyone gets the feeling that somewhere in the galaxy something unfortunate just happened.` },
  { max: 5, text: `Warp Echo: For a few moments, all noises cause echoes, regardless of the surroundings.` },
  { max: 8, text: `Unholy Stench: The air around the psyker becomes permeated with a bizarre and foul smell.` },
  { max: 11, text: `Mind Warp: The psyker suffers a -5 penalty to Willpower tests until the start of his next turn as his own inherent phobias, suspicions, and hatreds surge to the surface of his mind in a wave of unbound emotion.` },
  { max: 14, text: `Hoarfrost: The temperature plummets for an instant, and a thin coating of frost forms to cover everything within 3d10 metres.` },
  { max: 17, text: `Aura of Taint: All animals within 1d100 metres become spooked and agitated; characters can use the Psyniscience skill to pinpoint the psyker as the cause` },
  { max: 20, text: `Memory Worm: All people within line of sight of the psyker forget some trivial fact or minor personal memory.` },
  { max: 23, text: `Spoilage: Food and drink go bad in a 5d10 metre radius.` },
  { max: 26, text: `Haunting Breeze: Winds whip up around the psyker for a few moments, blowing light objects around and guttering fires within 3d10 metres.` },
  { max: 29, text: `Veil of Darkness: For a brief moment (effectively, until the end of the round), the area within 3d10 metres is plunged into immediate and impenetrable darkness.` },
  { max: 32, text: `Distorted Reflections: Mirrors and other reflective surfaces within a radius of 5d10 metres distort or shatter.` },
  { max: 35, text: `Breath Leech: Each character (including the psyker) within a 3d10 metre radius becomes short of breath for one round and cannot make any Run or Charge actions.` },
  { max: 38, text: `Daemonic Mask: For a fleeting moment, the psyker takes on a daemonic appearance and gains the Fear (1) trait until the start of the next turn. However, he also gains 1 Corruption point.` },
  { max: 41, text: `Unnatural Decay: All plant life within 3d10 metres of the psyker withers and dies.` },
  { max: 44, text: `Spectral Gale: Howling winds erupt around the psyker, requiring each character (including the psyker) within 4d10 metres to make an Easy (+30) Agility or Strength test to avoid being knocked Prone.` },
  { max: 47, text: `Bloody Tears: Blood weeps from stone and wood within 3d10 metres of the psyker. If there are any paintings, pict-displays, statues, or other representations of people inside this area, they appear to be crying blood.` },
  { max: 50, text: `The Earth Protests: The ground suddenly shakes, and each character (including the psyker) within a 5d10 metre radius must make an Ordinary (+10) Agility test or be knocked down.` },
  { max: 53, text: `Actinic Discharge: Static electricity fills the air within 5d10 metres causing hair to stand on end and unprotected electronics to short out, while the psyker is wreathed in eldritch lightning.` },
  { max: 56, text: `Warp Ghosts: Ghostly apparitions fill the air within 3d10 metres around the psyker, flying about and howling in pain for a few brief moments. Everyone in the radius (except the psyker himself) must test against a Fear rating of 1.` },
  { max: 59, text: `Falling Upwards: Everything within 2d10 metres of the psyker (including the psyker himself) rises 1d10 metres into the air as gravity briefly ceases. Almost immediately, everything crashes back to earth, suffering falling Damage as appropriate for the distances fallen.` },
  { max: 62, text: `Banshee Howl: A shrill keening rings out across the immediate area, shattering glass and forcing every mortal creature able to hear it (including the psyker) to pass a Challenging (+0) Toughness Test or be deafened for 1d10 rounds.` },
  { max: 65, text: `The Furies: The Psyker is assailed by unseen horrors. He is slammed to the ground and suffers 1d5 Damage (ignoring Armour, but not Toughness Bonus) and he must test against Fear (2).` },
  { max: 68, text: `Shadow of the Warp: For a split second, the world changes in appearance, and everyone within 1d100 metres has brief but horrific glimpse of the shadow of the Warp. Everyone in the area (including the psyker) must make a Difficult (-10) Willpower Test or gain 1d5 Corruption Points.` },
  { max: 71, text: `Tech Scorn: The machine spirits reject your unnatural ways. All un-warded technology within 5d10 metres malfunctions momentarily, and all ranged weapons Jam, whilst characters with cybernetic implants must pass a Routine (+10) Toughness Test or suffer 1d5 Damage, ignoring Toughness Bonus and Armour.` },
  { max: 74, text: `Warp Madness: A violent ripple of tainted discord causes all creatures within 2d10 metres (with the exception of the psyker) to become Frenzied for a Round and suffer 1d5 Corruption Points unless they can pass a Difficult (-10) Willpower Test.` },
  { max: 100, text: `Perils of the Warp` }
];

const PERILS_OF_WARP_TABLE = [
  { max: 5, text: `The Gibbering: The psyker screams in pain as uncontrolled Warp energies surge through his unprepared mind. He must make a Challenging (+0) Willpower Test or be stunned for 1d5 Rounds.` },
  { max: 9, text: `Warp Burn: A violent burst of energy from the Warp smashes into the psyker's mind, sending him reeling. He suffers 2d5 Damage, ignoring Toughness Bonus and Armour, and is stunned for 1d5 Rounds.` },
  { max: 13, text: `Psychic Concussion: With a crack of energy, the psyker is knocked unconscious for 1d5 Rounds, and everyone within 3d10 metres must make a Routine (+10) Willpower Test or be Stunned for one Round.` },
  { max: 18, text: `Psy Blast: There is an explosion of power and the psyker is thrown 3d10 metres into the air, falling to the ground moments later.` },
  { max: 24, text: `Soul Sear: Warp power courses through the psyker's body, scorching his soul. The psyker cannot use any powers for the next hour and gains 2d5 Corruption Points.` },
  { max: 30, text: `Locked In: The power cages the psyker's mind in an ethereal prison. Each Round he must spend a Full Action to make a Difficult (-10) Willpower Test to escape.` },
  { max: 38, text: `Chronological Incontinence: Time warps around the psyker. He winks out of existence and reappears in 1d10 Rounds, suffering permanent damage and 1d5 Corruption Points.` },
  { max: 46, text: `Psychic Mirror: The psyker's power is turned back on him.` },
  { max: 55, text: `Warp Whispers: The voices of daemons fill the air within 4d10 metres. All must test or suffer 1d5 Corruption Points and Willpower damage.` },
  { max: 58, text: `Vice Versa: The psyker swaps consciousness with another being for 1d10 rounds.` },
  { max: 67, text: `Dark Summoning: A Bloodletter appears within 3d10 metres for 1d5 plus Toughness Bonus rounds.` },
  { max: 72, text: `Rending the Veil: All sentient creatures within 1d100 metres must test against Fear (2), the psyker against Fear (4) for 1d5 Rounds.` },
  { max: 78, text: `Blood Rain: A psychic storm erupts in 5d10 metres for 1d5 Rounds. The psyker gains 1d5+1 Corruption Points.` },
  { max: 82, text: `Cataclysmic Blast: Everyone within 1d10 metres takes 1d10 Energy Damage with Pen 5.` },
  { max: 86, text: `Mass Possession: Every character within 1d100 metres resists possession for up to 2d10 Rounds.` },
  { max: 90, text: `Reality Quake: Everyone within 3d10 metres takes 2d10 Rending Damage ignoring Armour.` },
  { max: 99, text: `Grand Possession: A powerful daemon attempts to possess the psyker.` },
  { max: 100, text: `Annihilation: The psyker is immediately and irrevocably destroyed.` }
];

const getTableEntry = (table, roll) => {
  for (const row of table) {
    if (roll <= row.max) return row.text;
  }
  return table[table.length - 1].text;
};

export const getPsychicPhenomenaEntry = roll => getTableEntry(PSYCHIC_PHENOMENA_TABLE, Number(roll));
export const getPerilsOfWarpEntry = roll => getTableEntry(PERILS_OF_WARP_TABLE, Number(roll));

export const inlineRollPsychicText = async text => {
  const diceRegex = /(\d+d\d+)/gi;
  let result = String(text ?? "");
  for (const match of result.match(diceRegex) || []) {
    const roll = await new Roll(match).evaluate();
    result = result.replace(match, roll.total);
  }
  return result;
};
