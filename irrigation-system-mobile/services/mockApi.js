// Mock API Service for ESP32 Irrigation Controller
// This simulates backend responses

const maskToDays = (daysMask) => {
  const dayBits = [
    { label: 'Sun', bit: 1 },
    { label: 'Mon', bit: 2 },
    { label: 'Tue', bit: 4 },
    { label: 'Wed', bit: 8 },
    { label: 'Thu', bit: 16 },
    { label: 'Fri', bit: 32 },
    { label: 'Sat', bit: 64 },
  ];

  return dayBits.filter((day) => (daysMask & day.bit) !== 0).map((day) => day.label);
};

const generateMockData = () => {
  const now = new Date();
  const nowEpoch = Math.floor(now.getTime() / 1000);

  return {
    lineStates: {
      1: 'on',
      2: 'off',
      3: 'off',
    },
    schedules: {
      1: { Enabled: true, Start: '08:30:00', Duration: 1200, IntervalSec: 0, DaysMask: 62, Days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
      2: { Enabled: false, Start: '18:45:00', Duration: 900, IntervalSec: 0, DaysMask: 65, Days: ['Sun', 'Sat'] },
      3: { Enabled: false, Start: '12:00:00', Duration: 600, IntervalSec: 0, DaysMask: 127, Days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
    },
    logs: [
      {
        Epoch: nowEpoch - 600,
        Time: new Date((nowEpoch - 600) * 1000).toLocaleTimeString('en-GB', { hour12: false }),
        Line: 1,
        Event: 'Started',
        DurationSec: 600,
        DurationMin: 10,
      },
      {
        Epoch: nowEpoch - 3600,
        Time: new Date((nowEpoch - 3600) * 1000).toLocaleTimeString('en-GB', { hour12: false }),
        Line: 2,
        Event: 'Stopped',
        DurationSec: 840,
        DurationMin: 14,
      },
      {
        Epoch: nowEpoch - 7200,
        Time: new Date((nowEpoch - 7200) * 1000).toLocaleTimeString('en-GB', { hour12: false }),
        Line: 1,
        Event: 'Stopped',
        DurationSec: 660,
        DurationMin: 11,
      },
    ],
  };
};

let mockData = generateMockData();

// API Methods
export const mockApi = {
  // Get single line status
  getLine: async (lineId) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const state = mockData.lineStates[lineId];
        if (state !== undefined) {
          resolve({
            data: { Value: state },
            status: 200,
          });
        } else {
          reject(new Error(`Line ${lineId} not found`));
        }
      }, 200);
    });
  },

  // Toggle line on/off
  toggleLine: async (lineId, newState) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (mockData.lineStates[lineId] !== undefined) {
          mockData.lineStates[lineId] = newState;

          const nowEpoch = Math.floor(Date.now() / 1000);
          const durationSec = newState === 'on' ? 0 : 180;
          mockData.logs.unshift({
            Epoch: nowEpoch,
            Time: new Date(nowEpoch * 1000).toLocaleTimeString('en-GB', { hour12: false }),
            Line: lineId,
            Event: newState === 'on' ? 'Started' : 'Stopped',
            DurationSec: durationSec,
            DurationMin: Math.round(durationSec / 60),
          });
          mockData.logs = mockData.logs.slice(0, 60);

          resolve({
            data: { Value: mockData.lineStates[lineId] },
            status: 200,
          });
        } else {
          reject(new Error(`Line ${lineId} not found`));
        }
      }, 300);
    });
  },

  // Get scheduler info per line
  getSchedule: async (lineId) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const schedule = mockData.schedules[lineId];
        if (schedule) {
          resolve({
            data: schedule,
            status: 200,
          });
        } else {
          reject(new Error(`Schedule ${lineId} not found`));
        }
      }, 250);
    });
  },

  // Update scheduler per line
  updateSchedule: async (lineId, scheduleData) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const current = mockData.schedules[lineId];
        if (!current) {
          reject(new Error(`Schedule ${lineId} not found`));
          return;
        }
        const nextSchedule = { ...current, ...scheduleData };
        if (scheduleData.DaysMask !== undefined) {
          nextSchedule.Days = maskToDays(scheduleData.DaysMask);
        }
        mockData.schedules[lineId] = nextSchedule;
        resolve({
          data: mockData.schedules[lineId],
          status: 200,
        });
      }, 300);
    });
  },

  // Get logs
  getLogs: async (limit = 20) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          data: {
            Count: Math.min(limit, mockData.logs.length),
            Logs: mockData.logs.slice(0, limit),
          },
          status: 200,
        });
      }, 250);
    });
  },

  clearLogs: async () => {
    return new Promise((resolve) => {
      setTimeout(() => {
        mockData.logs = [];
        resolve({
          data: { ok: true },
          status: 200,
        });
      }, 250);
    });
  },

  // Placeholder to keep app interval hook stable in mock mode
  updateRuntimeSimulation: () => {},
};

export default mockApi;
