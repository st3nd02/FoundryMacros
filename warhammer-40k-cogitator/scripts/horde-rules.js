export function calculateSprayHordeBaseMagnitude({ weaponRange, d5Roll }) {
  const rangeValue = Number(weaponRange ?? 0);
  const normalizedRange = Number.isFinite(rangeValue) ? Math.max(0, rangeValue) : 0;
  const normalizedD5Roll = Math.min(5, Math.max(1, Math.trunc(Number(d5Roll ?? 1)) || 1));
  const rangeBonus = Math.ceil(normalizedRange / 4);
  return {
    d5Roll: normalizedD5Roll,
    rangeBonus,
    baseMagnitudeHits: normalizedD5Roll + rangeBonus
  };
}
