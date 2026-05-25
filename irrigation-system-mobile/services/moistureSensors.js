/** Target range for lawn/vegetable beds (mock until hardware is wired). */
export const MOISTURE_TARGET = { min: 35, max: 55 };

export const MOISTURE_RANGES = {
  '3d': { label: '3 days', hours: 72, pointCount: 24 },
  '1w': { label: '1 week', hours: 168, pointCount: 28 },
  '1m': { label: '1 month', hours: 720, pointCount: 30 },
};

const MOCK_PERCENT_BY_LINE = {
  1: 42,
  2: 28,
  3: 58,
};

export function getMoistureLevel(percent) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));

  if (value < 25) {
    return { label: 'Very dry', color: '#B71C1C', barColor: '#E53935' };
  }
  if (value < MOISTURE_TARGET.min) {
    return { label: 'Dry', color: '#E65100', barColor: '#FB8C00' };
  }
  if (value <= MOISTURE_TARGET.max) {
    return { label: 'Optimal', color: '#2E7D32', barColor: '#43A047' };
  }
  if (value <= 70) {
    return { label: 'Moist', color: '#1565C0', barColor: '#42A5F5' };
  }
  return { label: 'Wet', color: '#0D47A1', barColor: '#1E88E5' };
}

export function needsWatering(percent) {
  return (Number(percent) || 0) < MOISTURE_TARGET.min;
}

/**
 * Future: parse moisture from /status when firmware exposes it, e.g.
 * Line1.MoisturePercent or Line1.Moisture { Value: 42 }
 */
export function parseMoistureFromStatus(statusRes, lineId) {
  const line = statusRes?.[`Line${lineId}`];
  if (line == null) {
    return null;
  }

  const raw =
    line.MoisturePercent ??
    line.Moisture?.Value ??
    line.Moisture ??
    statusRes?.[`Moisture${lineId}`];

  if (raw == null || raw === '') {
    return null;
  }

  const percent = Number(raw);
  if (!Number.isFinite(percent)) {
    return null;
  }

  return {
    percent: Math.round(Math.max(0, Math.min(100, percent))),
    updatedAt: line.MoistureUpdatedAt || statusRes?.Time || null,
    isMock: false,
  };
}

export function getMockMoistureForLine(lineId) {
  const id = Number(lineId);
  const percent = MOCK_PERCENT_BY_LINE[id] ?? 40 + ((id * 11) % 25);

  return {
    percent,
    updatedAt: null,
    isMock: true,
  };
}

export function resolveMoistureForLine(statusRes, lineId) {
  const fromApi = parseMoistureFromStatus(statusRes, lineId);
  if (fromApi) {
    return fromApi;
  }
  return getMockMoistureForLine(lineId);
}

/** Deterministic mock history for UI preview until cloud/firmware stores samples. */
export function generateMockMoistureHistory(lineId, rangeKey = '3d') {
  const range = MOISTURE_RANGES[rangeKey] || MOISTURE_RANGES['3d'];
  const id = Number(lineId);
  const current = getMockMoistureForLine(id).percent;
  const now = Date.now();
  const stepMs = (range.hours * 3600000) / Math.max(1, range.pointCount - 1);

  const points = [];
  for (let i = 0; i < range.pointCount; i += 1) {
    const timestamp = now - (range.pointCount - 1 - i) * stepMs;
    const wave = Math.sin((i / range.pointCount) * Math.PI * 3 + id) * 10;
    const drift = Math.sin(i * 0.45 + id * 1.7) * 6;
    const noise = ((id * 19 + i * 11) % 9) - 4;
    const dip = i % 7 === 0 ? 12 : 0;
    const percent = Math.round(
      Math.max(12, Math.min(88, current + wave + drift + noise - dip)),
    );
    points.push({ timestamp, percent });
  }

  if (points.length) {
    points[points.length - 1].percent = current;
  }

  return points;
}
