const PRECOGNITIVE_DEFENSES = Object.freeze([
  Object.freeze({ type: "foreboding", name: "Foreboding" }),
  Object.freeze({ type: "precognitiveDodge", name: "Precognitive Dodge" })
]);

export function getAvailablePrecognitiveDefenses(actor) {
  const psyRating = Number(actor?.system?.psy?.rating ?? 0);
  if (psyRating <= 0) return [];

  const powerNames = new Set((actor?.items ?? [])
    .filter(item => item?.type === "psychicPower")
    .map(item => String(item?.name ?? "").trim().toLowerCase()));

  return PRECOGNITIVE_DEFENSES.filter(option => powerNames.has(option.name.toLowerCase()));
}

export function isPrecognitiveDefense(type) {
  return PRECOGNITIVE_DEFENSES.some(option => option.type === type);
}

export function getPrecognitiveDefenseName(type) {
  return PRECOGNITIVE_DEFENSES.find(option => option.type === type)?.name ?? null;
}
