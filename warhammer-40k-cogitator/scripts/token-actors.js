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

function parseTokenUuid(reference) {
  const value = String(reference ?? "").trim();
  if (!value) return { sceneId: null, tokenId: null };

  const parts = value.split(".");
  const tokenIndex = parts.lastIndexOf("Token");
  if (tokenIndex >= 0 && parts[tokenIndex + 1]) {
    const sceneIndex = parts.lastIndexOf("Scene", tokenIndex);
    return {
      sceneId: sceneIndex >= 0 ? parts[sceneIndex + 1] ?? null : null,
      tokenId: parts[tokenIndex + 1]
    };
  }

  return { sceneId: null, tokenId: value.includes(".") ? null : value };
}

/**
 * Resolve a stored Token UUID or ID across Foundry's v14 document/placeable split.
 *
 * A TokenDocument can resolve even when its Scene is not currently displayed. If
 * UUID resolution fails, legacy payloads still recover through the stored Scene
 * collection or the active canvas Token placeable.
 */
export async function resolveTokenReference(reference, {
  fromUuid: uuidResolver = globalThis.foundry?.utils?.fromUuid ?? globalThis.fromUuid,
  canvas = globalThis.canvas,
  scenes = globalThis.game?.scenes,
  actors = globalThis.game?.actors
} = {}) {
  if (!reference) return null;

  let resolved = typeof reference === "object" ? reference : null;
  const { sceneId, tokenId } = parseTokenUuid(reference);

  if (!resolved && typeof uuidResolver === "function") {
    try {
      resolved = await uuidResolver(String(reference));
    } catch (_error) {
      resolved = null;
    }
  }

  const sceneTokenDocument = sceneId && tokenId
    ? scenes?.get?.(sceneId)?.tokens?.get?.(tokenId) ?? null
    : null;
  const canvasToken = tokenId
    ? canvas?.tokens?.get?.(tokenId)
      ?? canvas?.tokens?.placeables?.find?.(token => token?.id === tokenId)
      ?? null
    : null;

  const resolvedIsPlaceable = !!resolved?.document;
  const document = resolvedIsPlaceable
    ? resolved.document
    : resolved ?? sceneTokenDocument ?? canvasToken?.document ?? null;
  const placeable = resolvedIsPlaceable
    ? resolved
    : document?.object ?? canvasToken ?? null;
  const actor = resolveTokenActor(placeable ?? document, actors);

  if (!document && !placeable && !actor) return null;
  return { document, placeable, actor };
}
