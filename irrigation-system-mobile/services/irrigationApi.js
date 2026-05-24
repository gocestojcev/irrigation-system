import axios from 'axios';

import { getAccessToken } from './auth';
import { normalizeCloudBaseUrl } from './config';

const COMMAND_POLL_INTERVAL_MS = 800;
const COMMAND_TIMEOUT_MS = 120_000;

async function cloudHeaders() {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in');
  return { Authorization: `Bearer ${token}` };
}

export function createIrrigationApi({ apiMode, serverIP, deviceId, cloudBaseUrl }) {
  const lanBaseUrl = `http://${serverIP}`;
  const cloudRoot = normalizeCloudBaseUrl(cloudBaseUrl);

  async function pollCommand(commandId) {
    const started = Date.now();
    while (Date.now() - started < COMMAND_TIMEOUT_MS) {
      const headers = await cloudHeaders();
      const response = await axios.get(
        `${cloudRoot}/devices/${deviceId}/commands/${commandId}`,
        { headers, timeout: 5000 },
      );
      const status = response.data?.status;
      if (status === 'applied' || status === 'failed' || status === 'timeout') {
        return response.data;
      }
      await new Promise((resolve) => setTimeout(resolve, COMMAND_POLL_INTERVAL_MS));
    }
    throw new Error('Command timed out while polling');
  }

  async function postCloudCommand(path, body) {
    const headers = await cloudHeaders();
    const response = await axios.post(`${cloudRoot}/devices/${deviceId}${path}`, body, {
      headers,
      timeout: 5000,
      validateStatus: (status) => status === 202 || status === 200,
    });
    if (response.status === 202 && response.data?.commandId) {
      return pollCommand(response.data.commandId);
    }
    return response.data;
  }

  return {
    async getStatus() {
      if (apiMode === 'lan') {
        const response = await axios.get(`${lanBaseUrl}/status`, { timeout: 5000 });
        return response.data;
      }
      const headers = await cloudHeaders();
      const response = await axios.get(`${cloudRoot}/devices/${deviceId}/status`, {
        headers,
        timeout: 5000,
      });
      return response.data;
    },

    async getSchedule(lineId) {
      if (apiMode === 'lan') {
        const response = await axios.get(`${lanBaseUrl}/schedule/${lineId}`, { timeout: 3000 });
        return response.data;
      }
      const headers = await cloudHeaders();
      const response = await axios.get(
        `${cloudRoot}/devices/${deviceId}/schedule/${lineId}`,
        { headers, timeout: 5000 },
      );
      return response.data;
    },

    async setLine(lineId, value) {
      const body = { Value: value };
      if (apiMode === 'lan') {
        const response = await axios.post(`${lanBaseUrl}/line/${lineId}`, body, { timeout: 3000 });
        return response.data;
      }
      await postCloudCommand(`/line/${lineId}`, body);
      const status = await this.getStatus();
      return status[`Line${lineId}`] ?? { Value: value };
    },

    async setSchedule(lineId, body) {
      if (apiMode === 'lan') {
        const response = await axios.post(`${lanBaseUrl}/schedule/${lineId}`, body, { timeout: 3000 });
        return response.data;
      }
      await postCloudCommand(`/schedule/${lineId}`, body);
      return this.getSchedule(lineId);
    },

    async getLogs(limit = 50) {
      if (apiMode === 'lan') {
        const response = await axios.get(`${lanBaseUrl}/logs?limit=${limit}`, { timeout: 5000 });
        return response.data;
      }
      const headers = await cloudHeaders();
      const response = await axios.get(
        `${cloudRoot}/devices/${deviceId}/logs?limit=${limit}`,
        { headers, timeout: 5000 },
      );
      return response.data;
    },

    async clearLogs() {
      if (apiMode === 'lan') {
        await axios.post(`${lanBaseUrl}/logs/clear`, {}, { timeout: 3000 });
        return { ok: true };
      }
      await postCloudCommand('/logs/clear', {});
      return { ok: true };
    },
  };
}
