const MAX_LINES = 32;

/**
 * Line IDs reported by GET /status.
 * Prefer firmware `LineCount`; otherwise discover `Line1`..`LineN` keys.
 */
export function parseLineIdsFromStatus(statusData) {
  const count = Number(statusData?.LineCount);
  if (Number.isInteger(count) && count > 0 && count <= MAX_LINES) {
    return Array.from({ length: count }, (_, index) => index + 1);
  }

  return Object.keys(statusData || {})
    .map((key) => /^Line(\d+)$/.exec(key))
    .filter(Boolean)
    .map((match) => Number.parseInt(match[1], 10))
    .filter((lineId) => {
      const entry = statusData[`Line${lineId}`];
      return lineId > 0 && lineId <= MAX_LINES && entry && typeof entry === 'object';
    })
    .sort((left, right) => left - right);
}
