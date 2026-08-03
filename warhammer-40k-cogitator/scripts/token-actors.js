export function resolveTokenActor(tokenLike, actors = globalThis.game?.actors) {
  const tokenDocument = tokenLike?.document ?? tokenLike;
  const actor = tokenLike?.actor
    ?? tokenDocument?.actor
    ?? tokenLike?.baseActor
    ?? tokenDocument?.baseActor
    ?? null;
  if (actor) return actor;

  const actorId = tokenDocument?.actorId ?? tokenDocument?._source?.actorId ?? null;
  return actorId ? actors?.get?.(actorId) ?? null : null;
}
