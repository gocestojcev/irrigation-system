import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert, ScrollView, FlatList, Platform, Modal, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';
import { parseLineIdsFromStatus } from './services/lineDiscovery';
import { getLineDisplayName, getLineMeta } from './services/lineLabels';
import { LineAvatar } from './components/LineAvatar';
import { MoistureIconButton } from './components/MoistureIconButton';
import { MoistureHistoryChart } from './components/MoistureHistoryChart';
import { MoistureReadout } from './components/MoistureReadout';
import {
  generateMockMoistureHistory,
  getMockMoistureForLine,
  MOISTURE_RANGES,
  resolveMoistureForLine,
} from './services/moistureSensors';
import { irrigationConfig } from './services/config';
import { createIrrigationApi } from './services/irrigationApi';
import {
  formatScheduleWindow,
  getNextScheduledRun,
  getScheduleForDisplay,
  hoursMinutesToTimeString,
  localTimeToUtcTime,
  scheduleFromApiToLocal,
  scheduleToDraft,
} from './services/scheduleTime';
import { getApiMode, getCloudBaseUrl, getCloudUsername, getDeviceId, getServerIP, setApiMode as persistApiMode, setCloudBaseUrl as persistCloudBaseUrl, setDeviceId as persistDeviceId, setServerIP as persistServerIP } from './services/storage';
import { isSignedIn as checkSignedIn, signIn as cognitoSignIn, signOut as cognitoSignOut } from './services/auth';

export default function App() {
  const weekDays = [
    { label: 'Sun', bit: 1 },
    { label: 'Mon', bit: 2 },
    { label: 'Tue', bit: 4 },
    { label: 'Wed', bit: 8 },
    { label: 'Thu', bit: 16 },
    { label: 'Fri', bit: 32 },
    { label: 'Sat', bit: 64 },
  ];
  const intervalHourOptions = [0, 1, 2, 4, 8, 12, 24];
  const [serverIP, setServerIPState] = useState(irrigationConfig.defaultServerIp);
  const [deviceId, setDeviceIdState] = useState(irrigationConfig.defaultDeviceId);
  const [cloudBaseUrl, setCloudBaseUrlState] = useState(irrigationConfig.defaultCloudBaseUrl);
  const [apiMode, setApiModeState] = useState('lan');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState([]);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [lines, setLines] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [scheduleDrafts, setScheduleDrafts] = useState({});
  const [scheduleDirty, setScheduleDirty] = useState({});
  const [savingScheduleLine, setSavingScheduleLine] = useState(null);
  const [openIntervalDropdownLine, setOpenIntervalDropdownLine] = useState(null);
  const [timePickerModal, setTimePickerModal] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [selectedMoistureLineId, setSelectedMoistureLineId] = useState(1);
  const [moistureRange, setMoistureRange] = useState('3d');
  const isFetchingRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);
  const nextAllowedFetchAtRef = useRef(0);
  const isWeb = Platform.OS === 'web';
  const insets = useSafeAreaInsets();

  const baseURL = `http://${serverIP}`;
  const api = useMemo(
    () => createIrrigationApi({ apiMode, serverIP, deviceId, cloudBaseUrl }),
    [apiMode, serverIP, deviceId, cloudBaseUrl],
  );

  const setServerIP = (value) => {
    setServerIPState(value);
    persistServerIP(value).catch(() => {});
  };

  const setDeviceId = (value) => {
    setDeviceIdState(value);
    persistDeviceId(value).catch(() => {});
  };

  const setCloudBaseUrl = (value) => {
    const normalized = value.trim().replace(/\/+$/, '');
    setCloudBaseUrlState(normalized);
    persistCloudBaseUrl(normalized).catch(() => {});
  };

  const switchToCloudMode = async () => {
    setApiModeState('cloud');
    await persistApiMode('cloud');
    consecutiveFailuresRef.current = 0;
    nextAllowedFetchAtRef.current = 0;
    setApiAvailable(true);
  };

  const promptSwitchToCloud = () => {
    Alert.alert(
      'Switch to Cloud mode?',
      'The device is not reachable on your local network. Cloud mode works over the internet and requires sign-in.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch to Cloud', onPress: () => { switchToCloudMode().catch(() => {}); } },
      ],
    );
  };

  useEffect(() => {
    (async () => {
      const [savedIp, savedDeviceId, savedCloudBaseUrl, savedMode, signedIn, savedUsername] = await Promise.all([
        getServerIP(irrigationConfig.defaultServerIp),
        getDeviceId(irrigationConfig.defaultDeviceId),
        getCloudBaseUrl(irrigationConfig.defaultCloudBaseUrl),
        getApiMode(),
        checkSignedIn(),
        getCloudUsername(),
      ]);
      setServerIPState(savedIp);
      setDeviceIdState(savedDeviceId);
      setCloudBaseUrlState(savedCloudBaseUrl);
      setApiModeState(savedMode);
      setIsAuthenticated(signedIn);
      if (savedUsername) setAuthUsername(savedUsername);
      setBootstrapped(true);
    })();
  }, []);

  const normalizeState = (value) => {
    if (typeof value === 'string') {
      const x = value.trim().toLowerCase();
      if (x === 'on' || x === '1' || x === 'true') return 'on';
      if (x === 'off' || x === '0' || x === 'false') return 'off';
    }
    if (typeof value === 'number') {
      return value === 1 ? 'on' : 'off';
    }
    if (typeof value === 'boolean') {
      return value ? 'on' : 'off';
    }
    return 'off';
  };

  const normalizeSource = (value, fallback = 'unknown') => {
    const source = String(value || '').trim().toLowerCase();
    if (['manual', 'scheduled', 'system', 'off', 'unknown'].includes(source)) {
      return source;
    }
    return fallback;
  };

  const formatSourceLabel = (source) => {
    switch (normalizeSource(source)) {
      case 'manual':
        return 'Manual';
      case 'scheduled':
        return 'Scheduled';
      case 'system':
        return 'System';
      case 'off':
        return 'Off';
      default:
        return 'Unknown';
    }
  };

  const parseLogsResponse = (data) => {
    const rawLogs = Array.isArray(data?.Logs) ? data.Logs : [];
    return rawLogs.map((item, index) => ({
      id: `${item.Epoch || Date.now()}-${index}`,
      timestamp: new Date((item.Epoch || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      lineId: Number.isFinite(item?.Line) ? item.Line : null,
      lineName: Number.isFinite(item?.Line) ? getLineDisplayName(item.Line) : 'System',
      action: String(item.Event || '').toLowerCase() === 'started' ? 'started' : 'stopped',
      source: normalizeSource(item?.Source),
      duration: Number.isFinite(item.DurationMin)
        ? item.DurationMin
        : Math.max(0, Math.round((item.DurationSec || 0) / 60)),
    }));
  };

  const formatScheduleDays = (item) => {
    if (Array.isArray(item?.Days) && item.Days.length > 0) {
      return item.Days.join(', ');
    }
    if (item?.DaysMask === 127) {
      return 'Every day';
    }
    if (item?.DaysMask === 62) {
      return 'Mon, Tue, Wed, Thu, Fri';
    }
    return 'No active days';
  };

  const updateScheduleDraft = (lineId, changes) => {
    setScheduleDrafts((prev) => ({
      ...prev,
      [lineId]: {
        ...prev[lineId],
        ...changes,
      },
    }));
    setScheduleDirty((prev) => ({
      ...prev,
      [lineId]: true,
    }));
  };

  const toggleScheduleDay = (lineId, bit) => {
    const currentMask = scheduleDrafts[lineId]?.daysMask ?? 127;
    const nextMask = currentMask & bit ? currentMask & ~bit : currentMask | bit;
    updateScheduleDraft(lineId, { daysMask: nextMask });
  };

  const saveSchedule = async (lineId) => {
    const draft = scheduleDrafts[lineId];
    if (!draft) {
      return;
    }

    const startHours = Number.parseInt(draft.startHours || '0', 10);
    const startMinutes = Number.parseInt(draft.startMinutes || '0', 10);
    const endHours = Number.parseInt(draft.endHours || '0', 10);
    const endMinutes = Number.parseInt(draft.endMinutes || '0', 10);

    if (!Number.isInteger(startHours) || startHours < 0 || startHours > 23) {
      Alert.alert('Invalid start hour', 'Start hour must be between 0 and 23.');
      return;
    }
    if (!Number.isInteger(startMinutes) || startMinutes < 0 || startMinutes > 59) {
      Alert.alert('Invalid start minute', 'Start minute must be between 0 and 59.');
      return;
    }
    if (!Number.isInteger(endHours) || endHours < 0 || endHours > 23) {
      Alert.alert('Invalid end hour', 'End hour must be between 0 and 23.');
      return;
    }
    if (!Number.isInteger(endMinutes) || endMinutes < 0 || endMinutes > 59) {
      Alert.alert('Invalid end minute', 'End minute must be between 0 and 59.');
      return;
    }

    const startSeconds = startHours * 3600 + startMinutes * 60;
    const endSeconds = draft.endIsEndOfDay ? 86400 : (endHours * 3600 + endMinutes * 60);
    if (endSeconds === startSeconds) {
      Alert.alert('Invalid end time', 'End time must differ from start time. Use End of day or let the window cross midnight if needed.');
      return;
    }

    const durationMinutes = Number.parseInt(draft.durationMinutes, 10);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
      Alert.alert('Invalid duration', 'Duration must be between 1 and 1440 minutes.');
      return;
    }

    const intervalHours = Number.parseInt(draft.intervalHours, 10);
    if (!Number.isInteger(intervalHours) || intervalHours < 0 || intervalHours > 24) {
      Alert.alert('Invalid interval', 'Repeat interval must be 0 (once/day) or between 1 and 24 hours.');
      return;
    }

    const durationSeconds = durationMinutes * 60;
    const intervalSeconds = intervalHours * 3600;
    if (intervalHours > 0 && intervalSeconds < durationSeconds) {
      Alert.alert('Invalid interval', 'Repeat interval must be 0 or greater than/equal to duration.');
      return;
    }

    if (draft.daysMask < 0 || draft.daysMask > 127) {
      Alert.alert('Invalid days', 'Days mask must stay between 0 and 127.');
      return;
    }

    const startTimeStr = hoursMinutesToTimeString(startHours, startMinutes);
    const endTimeStr = draft.endIsEndOfDay ? '24:00:00' : hoursMinutesToTimeString(endHours, endMinutes);

    const payload = {
      Enabled: draft.enabled,
      Start: localTimeToUtcTime(startTimeStr),
      End: localTimeToUtcTime(endTimeStr),
      Duration: durationSeconds,
      IntervalSec: intervalSeconds,
      DaysMask: draft.daysMask,
    };

    try {
      setSavingScheduleLine(lineId);
      const response = await api.setSchedule(lineId, payload);

      const updatedSchedule = scheduleFromApiToLocal({ line: lineId, ...response });
      setSchedule((prev) => {
        const previousItems = Array.isArray(prev) ? prev.filter((item) => item.line !== lineId) : [];
        return [...previousItems, updatedSchedule].sort((left, right) => left.line - right.line);
      });
      setScheduleDrafts((prev) => ({
        ...prev,
        [lineId]: scheduleToDraft(updatedSchedule),
      }));
      setScheduleDirty((prev) => ({
        ...prev,
        [lineId]: false,
      }));
      Alert.alert('Saved', `Schedule for ${getLineDisplayName(lineId)} updated.`);
    } catch (error) {
      console.error('saveSchedule error:', error?.message || error);
      const errorMessage = error?.message
        || error?.response?.data?.error
        || `Failed to save schedule for ${getLineDisplayName(lineId)}`;
      Alert.alert('Save failed', errorMessage);
    } finally {
      setSavingScheduleLine(null);
    }
  };

  const getSubnetPrefix = (ip) => {
    const parts = ip.split('.').map((x) => Number(x));
    if (
      parts.length !== 4 ||
      parts.some((x) => Number.isNaN(x) || x < 0 || x > 255)
    ) {
      return null;
    }
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  };

  const scanNetworkForDevices = async () => {
    const prefix = getSubnetPrefix(serverIP);
    if (!prefix) {
      Alert.alert('Invalid IP', 'Please enter a valid IPv4 address first.');
      return;
    }

    setScanning(true);

    try {
      const ips = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);
      const found = [];
      const chunkSize = 8;

      for (let i = 0; i < ips.length; i += chunkSize) {
        const chunk = ips.slice(i, i + chunkSize);
        const results = await Promise.all(
          chunk.map(async (ip) => {
            try {
              const res = await axios.get(`http://${ip}/line/1`, { timeout: 1200 });
              if (res?.status === 200) return ip;
            } catch (e) {
              // Ignore unreachable hosts
            }
            return null;
          })
        );

        results.forEach((ip) => {
          if (ip) found.push(ip);
        });
      }

      const uniqueFound = [...new Set(found)];
      if (uniqueFound.length === 0) {
        Alert.alert('Scan complete', 'No device found on this subnet.');
      } else if (uniqueFound.length === 1) {
        setServerIP(uniqueFound[0]);
        Alert.alert('Device selected', `Using device ${uniqueFound[0]}.`);
      } else {
        setScanResults(uniqueFound);
        setShowDeviceModal(true);
      }
    } catch (error) {
      console.error('scanNetworkForDevices error:', error?.message || error);
      Alert.alert('Scan failed', 'Could not complete network scan.');
    } finally {
      setScanning(false);
    }
  };

  // Fetch all data
  const fetchAllData = async ({ force = false } = {}) => {
    if (!force && Date.now() < nextAllowedFetchAtRef.current) {
      return;
    }

    if (isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    try {
      setLoading(true);
      setApiAvailable(true);

      const statusRes = await api.getStatus();
      const lineIds = parseLineIdsFromStatus(statusRes);
      if (lineIds.length === 0) {
        throw new Error('No lines reported in /status (missing LineCount or LineN fields)');
      }

      const scheduleResponses = await Promise.all(
        lineIds.map((lineId) => api.getSchedule(lineId))
      );

      const scheduleData = lineIds.map((lineId, index) =>
        scheduleFromApiToLocal({ line: lineId, ...scheduleResponses[index] })
      );

      setLines(
        lineIds.map((lineId, index) => {
          const moisture = resolveMoistureForLine(statusRes, lineId);
          return {
            id: lineId,
            name: getLineDisplayName(lineId),
            status: normalizeState(statusRes?.[`Line${lineId}`]?.Value),
            source: normalizeSource(statusRes?.[`Line${lineId}`]?.Source, 'off'),
            scheduleEnabled: !!scheduleResponses[index]?.Enabled,
            moisture,
          };
        })
      );
      setSchedule(scheduleData);
      setScheduleDrafts((prev) => {
        const nextDrafts = {};
        scheduleData.forEach((item) => {
          if (!scheduleDirty[item.line] || !prev[item.line]) {
            nextDrafts[item.line] = scheduleToDraft(item);
          } else {
            nextDrafts[item.line] = prev[item.line];
          }
        });
        return nextDrafts;
      });
      setScheduleDirty((prev) => {
        const nextDirty = {};
        lineIds.forEach((lineId) => {
          if (prev[lineId]) {
            nextDirty[lineId] = true;
          }
        });
        return nextDirty;
      });

      consecutiveFailuresRef.current = 0;
      nextAllowedFetchAtRef.current = 0;
    } catch (error) {
      console.warn('fetchAllData warning:', error?.message || error, error?.code || '');
      consecutiveFailuresRef.current += 1;
      const backoffMs = Math.min(10000 + (consecutiveFailuresRef.current - 1) * 5000, 30000);
      nextAllowedFetchAtRef.current = Date.now() + backoffMs;
      setApiAvailable(false);
      if (error?.response?.status === 404) {
        Alert.alert(
          apiMode === 'cloud' ? 'Device not found' : 'Endpoint not found',
          apiMode === 'cloud'
            ? 'No device shadow yet. Check device ID and wait for the ESP32 to connect.'
            : 'Server is reachable but /status or /schedule/{n} is missing.'
        );
      } else if (error?.response?.status === 502) {
        Alert.alert(
          'Device data invalid',
          'Cloud could not read the device shadow. Wait for the ESP32 to sync, then retry.'
        );
      } else if (error?.response?.status === 401 || error?.response?.status === 403) {
        Alert.alert(
          'Cloud access denied',
          'Sign in again or check that your account has access to this device.'
        );
      } else if (isWeb && !error?.response) {
        Alert.alert(
          'Network blocked in browser',
          'If CORS is enabled on ESP32, retry. Otherwise use Android/iOS app.'
        );
      }
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  };

  // Toggle line state
  const toggleLine = async (lineId) => {
    try {
      setLoading(true);
      const line = lines.find((l) => l.id === lineId);
      const newState = line.status === 'on' ? 'off' : 'on';

      const res = await api.setLine(lineId, newState);
      const updatedLines = lines.map((l) =>
        l.id === lineId
          ? {
            ...l,
            status: normalizeState(res?.Value ?? newState),
            source: newState === 'on' ? 'manual' : 'off',
          }
          : l
      );
      setLines(updatedLines);

      // Refresh to get updated runtime if needed
      setTimeout(() => fetchAllData({ force: true }), 500);
    } catch (error) {
      console.error('toggleLine error:', error?.message || error);
      Alert.alert('Error', error?.message || `Failed to toggle ${getLineDisplayName(lineId)}`);
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    try {
      setLoading(true);
      await api.clearLogs();

      setLogs([]);
    } catch (error) {
      console.error('clearLogs error:', error?.message || error);
      Alert.alert('Error', error?.message || 'Failed to clear logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!bootstrapped) return;
    if (apiMode === 'cloud' && !isAuthenticated) return;
    fetchAllData({ force: true });
  }, [serverIP, deviceId, cloudBaseUrl, apiMode, isAuthenticated, bootstrapped]);

  useEffect(() => {
    if (!lines.length) return;
    if (!lines.some((line) => line.id === selectedMoistureLineId)) {
      setSelectedMoistureLineId(lines[0].id);
    }
  }, [lines, selectedMoistureLineId]);

  const openMoistureTab = (lineId) => {
    if (lineId != null) {
      setSelectedMoistureLineId(lineId);
    }
    setActiveTab('moisture');
  };

  const handleTabPress = (tabName) => {
    setActiveTab(tabName);
    if (tabName === 'home') fetchAllData({ force: true });
    else if (tabName === 'schedules') refreshSchedules();
    else if (tabName === 'logs') refreshLogs();
  };

  const refreshLogs = async () => {
    try {
      setLoading(true);
      const logsRes = await api.getLogs(50);
      if (logsRes) {
        setLogs(parseLogsResponse(logsRes));
      }
    } catch (error) {
      console.error('refreshLogs error:', error?.message || error);
      Alert.alert('Error', 'Failed to refresh logs');
    } finally {
      setLoading(false);
    }
  };

  // Home Tab Content
  const renderHomeTab = () => (
    <ScrollView
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => fetchAllData({ force: true })} />}
    >
      {/* Lines section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Manual Line Control</Text>
        {lines.map((line) => (
          <TouchableOpacity
            key={line.id}
            style={[
              styles.lineCard,
              line.status === 'on' ? styles.lineCardActive : styles.lineCardInactive,
              { borderLeftColor: getLineMeta(line.id).accent },
            ]}
            onPress={() => toggleLine(line.id)}
            disabled={loading}
          >
            <View style={styles.lineCardContent}>
              <View style={styles.lineAvatarColumn}>
                <LineAvatar lineId={line.id} size={64} />
                {line.moisture ? (
                  <MoistureIconButton
                    percent={line.moisture.percent}
                    onPress={() => openMoistureTab(line.id)}
                    size={52}
                    style={styles.lineMoistureIcon}
                  />
                ) : null}
              </View>
              <View style={styles.lineCardBody}>
                <View style={styles.lineHeader}>
                  <Text style={styles.lineName}>{line.name}</Text>
                  <Text
                    style={[
                      styles.lineStatus,
                      line.status === 'on' ? styles.statusOn : styles.statusOff,
                    ]}
                  >
                    {line.status === 'on'
                      ? '🟢 ON'
                      : '⚫ OFF'}
                  </Text>
                </View>
                <Text style={styles.lineInfo}>
                  Runtime source: {formatSourceLabel(line.source)} • Scheduler {line.scheduleEnabled ? 'enabled' : 'disabled'}
                </Text>
                <Text style={styles.lineInfo}>
                  Tap line to switch {line.status === 'on' ? 'off' : 'on'} • Tap 💧 for moisture history
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Next schedule */}
      {Array.isArray(schedule) && schedule.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Line Schedules</Text>
          <View style={styles.scheduleCard}>
            <Text style={styles.scheduleDate}>Daily schedule (local time)</Text>
            {schedule.map((item) => {
              const displayItem = getScheduleForDisplay(item, { scheduleDirty, scheduleDrafts });
              return (
              <View key={`schedule-line-${item.line}`} style={styles.scheduleItemRow}>
                <View style={styles.scheduleItemHeader}>
                  <LineAvatar lineId={item.line} size={40} />
                  <Text style={styles.scheduleItemLine}>{getLineDisplayName(item.line)}</Text>
                </View>
                <Text style={styles.scheduleItemMeta}>
                  {formatScheduleWindow(displayItem)} • {Math.round((displayItem.Duration || 0) / 60)} min {displayItem.Enabled ? '' : '(disabled)'}
                </Text>
                <Text style={styles.scheduleItemDays}>
                  Repeat: {displayItem.IntervalSec > 0 ? `every ${Math.max(1, Math.round(displayItem.IntervalSec / 3600))}h within the window` : 'once per day at window start'}
                </Text>
                <Text style={styles.scheduleItemDays}>{formatScheduleDays(displayItem)}</Text>
                <Text style={styles.scheduleItemNext}>📅 Next: {getNextScheduledRun(displayItem)}</Text>
              </View>
              );
            })}
          </View>
        </View>
      )}

    </ScrollView>
  );

  const renderMoistureTab = () => {
    const selectedLine =
      lines.find((line) => line.id === selectedMoistureLineId) || lines[0];
    const lineId = selectedLine?.id ?? selectedMoistureLineId;
    const currentMoisture =
      selectedLine?.moisture ?? getMockMoistureForLine(lineId);
    const history = generateMockMoistureHistory(lineId, moistureRange);

    return (
      <ScrollView style={styles.tabContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Soil Moisture</Text>
          <Text style={styles.sectionSubtitle}>Preview data until sensors are installed</Text>

          <Text style={styles.moisturePickerLabel}>Line</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.moistureLinePicker}>
            {lines.map((line) => {
              const active = line.id === lineId;
              return (
                <TouchableOpacity
                  key={`moisture-line-${line.id}`}
                  style={[
                    styles.moistureLineChip,
                    active && styles.moistureLineChipActive,
                    active && { borderColor: getLineMeta(line.id).accent },
                  ]}
                  onPress={() => setSelectedMoistureLineId(line.id)}
                >
                  <LineAvatar lineId={line.id} size={36} />
                  <Text style={[styles.moistureLineChipText, active && styles.moistureLineChipTextActive]}>
                    {line.name}
                  </Text>
                  {line.moisture ? (
                    <Text style={styles.moistureLineChipMeta}>{line.moisture.percent}%</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <MoistureReadout
            percent={currentMoisture.percent}
            isMock={currentMoisture.isMock}
          />

          <Text style={styles.moisturePickerLabel}>History</Text>
          <View style={styles.rangeRow}>
            {Object.entries(MOISTURE_RANGES).map(([key, { label }]) => (
              <TouchableOpacity
                key={key}
                style={[styles.rangeChip, moistureRange === key && styles.rangeChipActive]}
                onPress={() => setMoistureRange(key)}
              >
                <Text style={[styles.rangeChipText, moistureRange === key && styles.rangeChipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <MoistureHistoryChart data={history} rangeKey={moistureRange} />
        </View>
      </ScrollView>
    );
  };

  // Settings Tab Content
  const renderSettingsTab = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection Mode</Text>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeButton, apiMode === 'cloud' && styles.modeButtonActive]}
            onPress={async () => {
              setApiModeState('cloud');
              await persistApiMode('cloud');
            }}
          >
            <Text style={styles.modeButtonText}>Cloud</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, apiMode === 'lan' && styles.modeButtonActive]}
            onPress={async () => {
              setApiModeState('lan');
              await persistApiMode('lan');
            }}
          >
            <Text style={styles.modeButtonText}>LAN</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.scheduleInfo}>
          {apiMode === 'cloud'
            ? 'Remote control via AWS API (requires sign-in).'
            : 'Direct HTTP to ESP32 on local network.'}
        </Text>
      </View>

      {apiMode === 'cloud' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cloud API</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>API base URL:</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={irrigationConfig.defaultCloudBaseUrl}
              value={cloudBaseUrl}
              onChangeText={setCloudBaseUrl}
            />
          </View>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Device ID (IoT Thing name):</Text>
            <TextInput
              style={styles.input}
              placeholder={irrigationConfig.defaultDeviceId}
              value={deviceId}
              onChangeText={setDeviceId}
            />
          </View>
          <Text style={styles.scheduleInfo}>
            Signed in as {isAuthenticated ? authUsername || 'cloud user' : 'not signed in'}.
          </Text>
          {isAuthenticated ? (
            <TouchableOpacity
              style={styles.scanButton}
              onPress={async () => {
                await cognitoSignOut();
                setIsAuthenticated(false);
              }}
            >
              <Text style={styles.scanButtonText}>Sign Out</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>LAN Settings</Text>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Server IP:</Text>
          <TextInput
            style={styles.input}
            placeholder={irrigationConfig.defaultServerIp}
            value={serverIP}
            onChangeText={setServerIP}
          />
        </View>

        <TouchableOpacity
          style={[styles.scanButton, scanning && styles.scanButtonDisabled]}
          onPress={scanNetworkForDevices}
          disabled={scanning || apiMode !== 'lan'}
        >
          <Text style={styles.scanButtonText}>
            {scanning ? 'Scanning network...' : 'Scan Network'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const refreshSchedules = async () => {
    try {
      setLoading(true);
      const statusRes = await api.getStatus();
      const lineIds = parseLineIdsFromStatus(statusRes);
      if (lineIds.length === 0) {
        throw new Error('No lines reported in /status');
      }

      const scheduleResponses = await Promise.all(
        lineIds.map((lineId) => api.getSchedule(lineId))
      );

      const scheduleData = lineIds.map((lineId, index) =>
        scheduleFromApiToLocal({ line: lineId, ...scheduleResponses[index] })
      );

      setSchedule(scheduleData);
      setScheduleDrafts(
        Object.fromEntries(scheduleData.map((item) => [item.line, scheduleToDraft(item)]))
      );
      setScheduleDirty({});
    } catch (error) {
      console.error('refreshSchedules error:', error?.message || error);
      Alert.alert('Error', 'Failed to refresh schedules');
    } finally {
      setLoading(false);
    }
  };

  const renderSchedulesTab = () => (
    <ScrollView
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshSchedules} />}
    >
      {(Array.isArray(schedule) ? schedule : []).map((item) => {
        const draft = scheduleDirty[item.line] && scheduleDrafts[item.line]
          ? scheduleDrafts[item.line]
          : scheduleToDraft(item);

        return (
          <View key={`schedule-editor-${item.line}`} style={styles.section}>
            <View style={styles.schedulerSectionHeader}>
              <LineAvatar lineId={item.line} size={36} />
              <Text style={styles.schedulerSectionTitle}>{getLineDisplayName(item.line)} Scheduler</Text>
            </View>

            <TouchableOpacity
              style={[styles.toggleButton, draft.enabled && styles.toggleButtonActive]}
              onPress={() => updateScheduleDraft(item.line, { enabled: !draft.enabled })}
            >
              <Text style={styles.toggleButtonText}>
                {draft.enabled ? '✅ Scheduler Enabled' : '⏸️ Scheduler Disabled'}
              </Text>
            </TouchableOpacity>

            <View style={styles.scheduleEditorRow}>
              <View style={styles.scheduleEditorField}>
                <Text style={styles.label}>Start time</Text>
                <View style={styles.timePickerRow}>
                  <TouchableOpacity
                    style={styles.timePickerButton}
                    onPress={() => setTimePickerModal({ line: item.line, type: 'startHours' })}
                  >
                    <Text style={styles.timePickerButtonText}>{String(draft.startHours).padStart(2, '0')}</Text>
                  </TouchableOpacity>
                  <Text style={styles.timePickerSeparator}>:</Text>
                  <TouchableOpacity
                    style={styles.timePickerButton}
                    onPress={() => setTimePickerModal({ line: item.line, type: 'startMinutes' })}
                  >
                    <Text style={styles.timePickerButtonText}>{String(draft.startMinutes).padStart(2, '0')}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.scheduleEditorField}>
                <Text style={styles.label}>End time</Text>
                <View style={styles.timePickerRow}>
                  <TouchableOpacity
                    style={styles.timePickerButton}
                    onPress={() => setTimePickerModal({ line: item.line, type: 'endHours' })}
                  >
                    <Text style={styles.timePickerButtonText}>{draft.endIsEndOfDay ? '24' : String(draft.endHours).padStart(2, '0')}</Text>
                  </TouchableOpacity>
                  <Text style={styles.timePickerSeparator}>:</Text>
                  <TouchableOpacity
                    style={styles.timePickerButton}
                    onPress={() => setTimePickerModal({ line: item.line, type: 'endMinutes' })}
                  >
                    <Text style={styles.timePickerButtonText}>{draft.endIsEndOfDay ? '00' : String(draft.endMinutes).padStart(2, '0')}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.endOfDayButton, draft.endIsEndOfDay && styles.endOfDayButtonActive]}
                  onPress={() => updateScheduleDraft(item.line, { endIsEndOfDay: !draft.endIsEndOfDay })}
                >
                  <Text style={[styles.endOfDayButtonText, draft.endIsEndOfDay && styles.endOfDayButtonTextActive]}>
                    {draft.endIsEndOfDay ? '✅ End of day (24:00)' : 'Use end of day (24:00)'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.scheduleEditorRow}>
              <View style={styles.scheduleEditorField}>
                <Text style={styles.label}>Duration (min)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="120"
                  value={draft.durationMinutes}
                  onChangeText={(value) => updateScheduleDraft(item.line, { durationMinutes: value.replace(/[^0-9]/g, '') })}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.scheduleEditorField}>
                <Text style={styles.label}>Repeat interval (hours)</Text>
                <TouchableOpacity
                  style={styles.intervalDropdownButton}
                  onPress={() =>
                    setOpenIntervalDropdownLine((prev) => (prev === item.line ? null : item.line))
                  }
                >
                  <Text style={styles.intervalDropdownButtonText}>
                    {Number.parseInt(draft.intervalHours || '0', 10) === 0
                      ? 'Once/day'
                      : `${Number.parseInt(draft.intervalHours || '0', 10)}h`}
                  </Text>
                </TouchableOpacity>
                {openIntervalDropdownLine === item.line && (
                  <View style={styles.intervalDropdownList}>
                    {intervalHourOptions.map((hours) => (
                      <TouchableOpacity
                        key={`line-${item.line}-interval-${hours}`}
                        style={styles.intervalDropdownItem}
                        onPress={() => {
                          updateScheduleDraft(item.line, { intervalHours: String(hours) });
                          setOpenIntervalDropdownLine(null);
                        }}
                      >
                        <Text style={styles.intervalDropdownItemText}>
                          {hours === 0 ? 'Once/day' : `${hours}h`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>

            <Text style={styles.label}>Active days</Text>
            <View style={styles.dayChipsRow}>
              {weekDays.map((day) => {
                const selected = (draft.daysMask & day.bit) !== 0;
                return (
                  <TouchableOpacity
                    key={`line-${item.line}-${day.label}`}
                    style={[styles.dayChip, selected && styles.dayChipActive]}
                    onPress={() => toggleScheduleDay(item.line, day.bit)}
                  >
                    <Text style={[styles.dayChipText, selected && styles.dayChipTextActive]}>{day.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.scheduleInfo}>Current days: {formatScheduleDays({ DaysMask: draft.daysMask, Days: weekDays.filter((day) => (draft.daysMask & day.bit) !== 0).map((day) => day.label) })}</Text>
            <Text style={styles.scheduleInfo}>Times are shown in local time and converted to UTC when saved.</Text>
            <Text style={styles.scheduleInfo}>The window may cross midnight. Use End of day for a window that closes at 24:00.</Text>

            <TouchableOpacity
              style={[styles.saveScheduleButton, savingScheduleLine === item.line && styles.scanButtonDisabled]}
              onPress={() => saveSchedule(item.line)}
              disabled={savingScheduleLine === item.line}
            >
              <Text style={styles.saveScheduleButtonText}>
                {savingScheduleLine === item.line ? 'Saving...' : `Save ${getLineDisplayName(item.line)} Schedule`}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );

  // Logs Tab Content
  const renderLogsTab = () => (
    <ScrollView
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshLogs} />}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Activity Log</Text>
        {apiMode === 'cloud' && (
          <Text style={styles.scheduleInfo}>
            Cloud logs sync from the device when it is online over MQTT.
          </Text>
        )}
        <TouchableOpacity style={styles.clearLogsButton} onPress={clearLogs} disabled={loading}>
          <Text style={styles.clearLogsButtonText}>Clear Logs</Text>
        </TouchableOpacity>
        <FlatList
          scrollEnabled={false}
          data={logs}
          ListEmptyComponent={<Text style={styles.emptyLogsText}>No log entries yet</Text>}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.logItem}>
              <View style={styles.logItemHeader}>
                {item.lineId ? <LineAvatar lineId={item.lineId} size={32} /> : null}
                <View style={styles.logItemBody}>
                  <Text style={styles.logTime}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
                  <Text style={styles.logLine}>{item.lineName}</Text>
                  <Text style={styles.logAction}>
                    {item.action === 'started' ? '▶️ Started' : '⏹️ Stopped'} - {item.duration} min
                  </Text>
                  <Text style={styles.logSource}>Source: {formatSourceLabel(item.source)}</Text>
                </View>
              </View>
            </View>
          )}
        />
      </View>
    </ScrollView>
  );

  if (!bootstrapped) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>🌱 Irrigation System</Text>
        <Text style={styles.scheduleInfo}>Loading settings...</Text>
      </View>
    );
  }

  if (apiMode === 'cloud' && !isAuthenticated) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>🌱 Irrigation System</Text>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cloud Sign In</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              value={authUsername}
              onChangeText={setAuthUsername}
            />
          </View>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={authPassword}
              onChangeText={setAuthPassword}
            />
          </View>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={async () => {
              try {
                await cognitoSignIn(authUsername.trim(), authPassword);
                setIsAuthenticated(true);
              } catch (error) {
                Alert.alert('Sign in failed', error?.message || 'Unable to sign in');
              }
            }}
          >
            <Text style={styles.scanButtonText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scanButton, { marginTop: 12, backgroundColor: '#607D8B' }]}
            onPress={async () => {
              setApiModeState('lan');
              await persistApiMode('lan');
            }}
          >
            <Text style={styles.scanButtonText}>Use LAN Mode Instead</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🌱 Irrigation System</Text>

      {!apiAvailable && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            {apiMode === 'cloud'
              ? '⚠️ Cloud API unavailable. Check sign-in, device ID, and that the ESP32 is online.'
              : '⚠️ Device not reachable on LAN. Check server IP, Wi-Fi, and device power—or switch to Cloud mode.'}
          </Text>
          <View style={styles.offlineActions}>
            <TouchableOpacity style={styles.tryNowButton} onPress={() => fetchAllData({ force: true })}>
              <Text style={styles.tryNowText}>↻ Try LAN</Text>
            </TouchableOpacity>
            {apiMode === 'lan' && (
              <TouchableOpacity style={styles.cloudSwitchButton} onPress={promptSwitchToCloud}>
                <Text style={styles.cloudSwitchButtonText}>☁ Switch to Cloud</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <Modal
        transparent
        visible={showDeviceModal}
        animationType="fade"
        onRequestClose={() => setShowDeviceModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select a device</Text>
            <Text style={styles.modalSubtitle}>Multiple ESP32 devices were found on this subnet.</Text>
            <View style={styles.modalList}>
              {scanResults.map((ip) => (
                <TouchableOpacity
                  key={`scan-result-${ip}`}
                  style={styles.modalItem}
                  onPress={() => {
                    setServerIP(ip);
                    setShowDeviceModal(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{ip}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowDeviceModal(false)}>
              <Text style={styles.modalCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Time Picker Modal */}
      <Modal
        transparent
        visible={timePickerModal !== null}
        animationType="fade"
        onRequestClose={() => setTimePickerModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {timePickerModal?.type?.includes('Hours') ? 'Select Hour' : 'Select Minute'}
            </Text>
            <ScrollView style={styles.timePickerModalList}>
              {(timePickerModal?.type?.includes('Hours')
                ? Array.from({ length: 24 }, (_, i) => i)
                : Array.from({ length: 60 }, (_, i) => i)
              ).map((value) => (
                <TouchableOpacity
                  key={`time-picker-${value}`}
                  style={styles.timePickerModalItem}
                  onPress={() => {
                    updateScheduleDraft(timePickerModal.line, {
                      [timePickerModal.type]: String(value),
                      ...(timePickerModal.type.startsWith('end') ? { endIsEndOfDay: false } : {}),
                    });
                    setTimePickerModal(null);
                  }}
                >
                  <Text style={styles.timePickerModalItemText}>{String(value).padStart(2, '0')}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancelButton} onPress={() => setTimePickerModal(null)}>
              <Text style={styles.modalCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Tab content */}
      {activeTab === 'home' && renderHomeTab()}
      {activeTab === 'moisture' && renderMoistureTab()}
      {activeTab === 'schedules' && renderSchedulesTab()}
      {activeTab === 'logs' && renderLogsTab()}
      {activeTab === 'settings' && renderSettingsTab()}

      {/* Bottom navigation */}
      <View style={[styles.bottomNav, { paddingBottom: Math.max(8, insets.bottom) }]}>
        <TouchableOpacity
          style={[styles.navButton, activeTab === 'home' && styles.navButtonActive]}
          onPress={() => handleTabPress('home')}
        >
          <Text style={styles.navButtonText}>🏠{'\n'}Home</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, activeTab === 'moisture' && styles.navButtonActive]}
          onPress={() => handleTabPress('moisture')}
        >
          <Text style={styles.navButtonText}>💧{'\n'}Moisture</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, activeTab === 'schedules' && styles.navButtonActive]}
          onPress={() => handleTabPress('schedules')}
        >
          <Text style={styles.navButtonText}>🗓{'\n'}Sched</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, activeTab === 'logs' && styles.navButtonActive]}
          onPress={() => handleTabPress('logs')}
        >
          <Text style={styles.navButtonText}>📋{'\n'}Logs</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, activeTab === 'settings' && styles.navButtonActive]}
          onPress={() => handleTabPress('settings')}
        >
          <Text style={styles.navButtonText}>⚙️{'\n'}Set</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8F5E9',
    paddingTop: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#2E7D32',
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  section: {
    marginBottom: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#81C784',
    paddingBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
    marginTop: -4,
  },
  // Input
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#81C784',
    padding: 10,
    borderRadius: 8,
    fontSize: 14,
    backgroundColor: '#F1F8E9',
  },
  // Toggle button (Mock/Real API)
  toggleButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#FFECB3',
    borderWidth: 2,
    borderColor: '#FFA000',
    marginTop: 12,
  },
  toggleButtonActive: {
    backgroundColor: '#A5D6A7',
    borderColor: '#2E7D32',
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  scanButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#1565C0',
    marginTop: 8,
    marginBottom: 12,
  },
  scanButtonDisabled: {
    opacity: 0.6,
  },
  scanButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  modeButton: {
    flex: 1,
    backgroundColor: '#E0E0E0',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#2E7D32',
  },
  modeButtonText: {
    color: '#111',
    fontWeight: '700',
  },
  // Line card
  lineCard: {
    padding: 12,
    marginBottom: 10,
    borderRadius: 10,
    borderLeftWidth: 4,
    backgroundColor: '#F1F8E9',
    overflow: 'hidden',
  },
  lineCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  lineAvatarColumn: {
    alignItems: 'center',
    marginRight: 12,
  },
  lineMoistureIcon: {
    marginTop: 8,
  },
  lineCardBody: {
    flex: 1,
    paddingTop: 2,
  },
  lineCardActive: {
    borderLeftColor: '#2E7D32',
    backgroundColor: '#C8E6C9',
  },
  lineCardInactive: {
    borderLeftColor: '#999',
    backgroundColor: '#F5F5F5',
  },
  lineCardDisabled: {
    opacity: 0.6,
  },
  lineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  lineName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1B5E20',
  },
  lineStatus: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusOn: {
    color: '#2E7D32',
  },
  statusOff: {
    color: '#666',
  },
  lineInfo: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  moisturePickerLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#33691E',
    marginTop: 4,
    marginBottom: 8,
  },
  moistureLinePicker: {
    marginBottom: 4,
  },
  moistureLineChip: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
    minWidth: 88,
  },
  moistureLineChipActive: {
    backgroundColor: '#E8F5E9',
  },
  moistureLineChipText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  moistureLineChipTextActive: {
    color: '#1B5E20',
  },
  moistureLineChipMeta: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7D32',
  },
  rangeRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  rangeChip: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#EEEEEE',
    alignItems: 'center',
  },
  rangeChipActive: {
    backgroundColor: '#C8E6C9',
  },
  rangeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  rangeChipTextActive: {
    color: '#1B5E20',
  },
  // Schedule card
  scheduleCard: {
    backgroundColor: '#B3E5FC',
    padding: 14,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#01579B',
  },
  scheduleDate: {
    fontSize: 16,
    fontWeight: '700',
    color: '#01579B',
    marginBottom: 4,
  },
  scheduleTime: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#01579B',
    marginBottom: 8,
  },
  scheduleInfo: {
    fontSize: 13,
    color: '#0D47A1',
    marginTop: 4,
  },
  scheduleItemRow: {
    backgroundColor: '#E1F5FE',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 8,
  },
  scheduleItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  schedulerSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#81C784',
    paddingBottom: 8,
  },
  schedulerSectionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#1B5E20',
  },
  scheduleItemLine: {
    fontSize: 14,
    fontWeight: '700',
    color: '#01579B',
  },
  scheduleItemMeta: {
    fontSize: 13,
    color: '#0D47A1',
    marginTop: 3,
  },
  scheduleItemDays: {
    fontSize: 12,
    color: '#1565C0',
    marginTop: 4,
  },
  scheduleItemNext: {
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '600',
    marginTop: 6,
  },
  scheduleEditorRow: {
    flexDirection: 'row',
    gap: 12,
  },
  scheduleEditorField: {
    flex: 1,
  },
  intervalDropdownButton: {
    backgroundColor: '#F9FCF9',
    borderWidth: 1,
    borderColor: '#A5D6A7',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  intervalDropdownButtonText: {
    color: '#1B5E20',
    fontSize: 14,
    fontWeight: '600',
  },
  intervalDropdownList: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#A5D6A7',
    borderRadius: 8,
    backgroundColor: '#FFF',
    overflow: 'hidden',
  },
  intervalDropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8F5E9',
  },
  intervalDropdownItemText: {
    color: '#2E7D32',
    fontSize: 14,
    fontWeight: '600',
  },
  endOfDayButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#81C784',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#F1F8E9',
  },
  endOfDayButtonActive: {
    backgroundColor: '#2E7D32',
    borderColor: '#2E7D32',
  },
  endOfDayButtonText: {
    color: '#2E7D32',
    fontSize: 12,
    fontWeight: '700',
  },
  endOfDayButtonTextActive: {
    color: '#FFF',
  },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  timePickerButton: {
    backgroundColor: '#F9FCF9',
    borderWidth: 1,
    borderColor: '#A5D6A7',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 50,
    alignItems: 'center',
  },
  timePickerButtonText: {
    color: '#1B5E20',
    fontSize: 16,
    fontWeight: '700',
  },
  timePickerSeparator: {
    color: '#2E7D32',
    fontSize: 16,
    fontWeight: '700',
    marginHorizontal: 6,
  },
  dayChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    marginBottom: 8,
  },
  dayChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#81C784',
    backgroundColor: '#F1F8E9',
    marginRight: 8,
    marginBottom: 8,
  },
  dayChipActive: {
    backgroundColor: '#2E7D32',
    borderColor: '#2E7D32',
  },
  dayChipText: {
    color: '#2E7D32',
    fontSize: 13,
    fontWeight: '600',
  },
  dayChipTextActive: {
    color: '#FFF',
  },
  // Log
  logItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  logItemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  logItemBody: {
    flex: 1,
  },
  logTime: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  logLine: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1B5E20',
  },
  logAction: {
    fontSize: 13,
    color: '#555',
    marginTop: 2,
  },
  logSource: {
    fontSize: 12,
    color: '#607D8B',
    marginTop: 2,
  },
  emptyLogsText: {
    fontSize: 13,
    color: '#777',
    textAlign: 'center',
    paddingVertical: 12,
  },
  // Buttons
  refreshButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 12,
  },
  refreshButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  clearLogsButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#D32F2F',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 12,
  },
  clearLogsButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  saveScheduleButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
    alignItems: 'center',
  },
  saveScheduleButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  // Bottom navigation
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'space-around',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  navButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 2,
    marginHorizontal: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
  },
  navButtonActive: {
    backgroundColor: '#C8E6C9',
    borderBottomWidth: 3,
    borderBottomColor: '#2E7D32',
  },
  navButtonText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    lineHeight: 13,
  },
  offlineBanner: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FFEBEE',
    borderColor: '#D32F2F',
    borderWidth: 1,
  },
  offlineText: {
    color: '#B71C1C',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  offlineActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tryNowButton: {
    backgroundColor: '#D32F2F',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  tryNowText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
  cloudSwitchButton: {
    marginLeft: 8,
    backgroundColor: '#1565C0',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  cloudSwitchButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#4E342E',
    marginBottom: 12,
  },
  modalList: {
    maxHeight: 220,
  },
  modalItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A5D6A7',
    marginBottom: 8,
    backgroundColor: '#F1F8E9',
  },
  modalItemText: {
    fontSize: 14,
    color: '#1B5E20',
    fontWeight: '600',
  },
  modalCancelButton: {
    marginTop: 4,
    alignSelf: 'flex-end',
    backgroundColor: '#EEEEEE',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modalCancelButtonText: {
    color: '#333',
    fontSize: 13,
    fontWeight: '700',
  },
  timePickerModalList: {
    maxHeight: 400,
    borderWidth: 1,
    borderColor: '#81C784',
    borderRadius: 8,
    backgroundColor: '#F1F8E9',
    overflow: 'hidden',
    marginVertical: 12,
  },
  timePickerModalItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#81C784',
    alignItems: 'center',
  },
  timePickerModalItemText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1B5E20',
  },
});
