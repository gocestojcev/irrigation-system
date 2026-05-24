// scheduler.cpp
// All scheduling logic: time parsing, schedule evaluation, overlap detection,
// and runtime arbitration between lines.
// isIntervalScheduleActiveNow() supports both one-shot daily and recurring
// (intervalSec) schedules. schedulesOverlap() brute-force checks every second
// of the week. computeRuntimeLineStates() applies manual-over-scheduled
// arbitration and returns the desired relay state for each line.

#include "scheduler.h"
#include "config.h"
#include "globals.h"

int parseHmsToSec(const String &hms) {
  if (hms.length() != 8 || hms[2] != ':' || hms[5] != ':') return -1;
  int hh = hms.substring(0, 2).toInt();
  int mm = hms.substring(3, 5).toInt();
  int ss = hms.substring(6, 8).toInt();
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return -1;
  return hh * 3600 + mm * 60 + ss;
}

String secToHms(int secOfDay) {
  int hh = secOfDay / 3600;
  int mm = (secOfDay % 3600) / 60;
  int ss = secOfDay % 60;
  char buf[9];
  snprintf(buf, sizeof(buf), "%02d:%02d:%02d", hh, mm, ss);
  return String(buf);
}

bool isScheduleActiveNow(const LineSchedule &s, int secOfDay) {
  if (!s.enabled || s.durationSec <= 0) return false;
  if (s.durationSec >= 86400) return true;

  int end = s.startSec + s.durationSec;
  if (end < 86400) {
    return secOfDay >= s.startSec && secOfDay < end;
  }

  int wrappedEnd = end - 86400;
  return secOfDay >= s.startSec || secOfDay < wrappedEnd;
}

int dayOfWeekFromEpoch(uint32_t epoch) {
  return (int)(((epoch / 86400UL) + 4UL) % 7UL);
}

bool isDayEnabled(uint8_t daysMask, int dayOfWeek) {
  if (dayOfWeek < 0 || dayOfWeek > 6) return false;
  return ((daysMask >> dayOfWeek) & 0x01) == 1;
}

bool isScheduleActiveNow(const LineSchedule &s, int secOfDay, int dayOfWeek) {
  if (!s.enabled || s.durationSec <= 0) return false;
  if (s.daysMask == 0) return false;
  if (s.durationSec >= 86400) return isDayEnabled(s.daysMask, dayOfWeek);

  int end = s.startSec + s.durationSec;
  if (end < 86400) {
    return isDayEnabled(s.daysMask, dayOfWeek) && secOfDay >= s.startSec && secOfDay < end;
  }

  int wrappedEnd = end - 86400;
  if (secOfDay >= s.startSec) {
    return isDayEnabled(s.daysMask, dayOfWeek);
  }

  int prevDay = (dayOfWeek + 6) % 7;
  return secOfDay < wrappedEnd && isDayEnabled(s.daysMask, prevDay);
}

bool isIntervalScheduleActiveNow(const LineSchedule &s, int secOfDay, int dayOfWeek) {
  if (!s.enabled || s.durationSec <= 0) return false;
  if (s.daysMask == 0) return false;
  if (s.intervalSec <= 0) return isScheduleActiveNow(s, secOfDay, dayOfWeek);

  if (isDayEnabled(s.daysMask, dayOfWeek) && secOfDay >= s.startSec && secOfDay < s.endSec) {
    int elapsed = secOfDay - s.startSec;
    if ((elapsed % s.intervalSec) < s.durationSec) {
      return true;
    }
  }

  int prevDay = (dayOfWeek + 6) % 7;
  if (!isDayEnabled(s.daysMask, prevDay) || s.startSec >= 86400) {
    return false;
  }

  int lastOccurrence = s.startSec;
  int maxRepeats = (86399 - s.startSec) / s.intervalSec;
  lastOccurrence = s.startSec + maxRepeats * s.intervalSec;

  int spill = (lastOccurrence + s.durationSec) - 86400;
  return spill > 0 && secOfDay < spill;
}

bool schedulesOverlap(const LineSchedule &a, const LineSchedule &b) {
  if (!a.enabled || !b.enabled) return false;
  if (a.durationSec <= 0 || b.durationSec <= 0) return false;
  if (a.daysMask == 0 || b.daysMask == 0) return false;

  for (int day = 0; day < 7; day++) {
    for (int sec = 0; sec < 86400; sec++) {
      if (isIntervalScheduleActiveNow(a, sec, day) && isIntervalScheduleActiveNow(b, sec, day)) {
        return true;
      }
    }
  }

  return false;
}

String daysMaskToJsonArray(uint8_t daysMask) {
  const char* names[7] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
  String out = "[";
  bool first = true;
  for (int d = 0; d < 7; d++) {
    if (((daysMask >> d) & 0x01) == 1) {
      if (!first) out += ",";
      out += "\"" + String(names[d]) + "\"";
      first = false;
    }
  }
  out += "]";
  return out;
}

static void arbitrateActiveLines(RuntimeLineStates &state) {
  int winner = -1;

  for (int line = 1; line <= LINE_COUNT; line++) {
    if (!state.line[line].on) continue;

    if (winner < 0) {
      winner = line;
      continue;
    }

    bool winnerManual = state.line[winner].manualOn;
    bool lineManual = state.line[line].manualOn;
    bool winnerScheduled = state.line[winner].scheduledOn;
    bool lineScheduled = state.line[line].scheduledOn;

    if (lineManual && winnerScheduled && !winnerManual) {
      winner = line;
    } else if (winnerManual && lineScheduled && !lineManual) {
      // keep winner
    } else if (line < winner) {
      winner = line;
    }
  }

  if (winner < 0) return;

  for (int line = 1; line <= LINE_COUNT; line++) {
    if (line != winner && state.line[line].on) {
      state.line[line].on = false;
      Serial.print("[WARN] Multiple active lines requested - line ");
      Serial.print(line);
      Serial.println(" suppressed");
    }
  }
}

RuntimeLineStates computeRuntimeLineStates(uint32_t epoch) {
  int secOfDay = epoch % 86400;
  int dayOfWeek = dayOfWeekFromEpoch(epoch);

  RuntimeLineStates state;
  for (int line = 1; line <= LINE_COUNT; line++) {
    state.line[line].scheduledOn = schedules[line].enabled
      && isIntervalScheduleActiveNow(schedules[line], secOfDay, dayOfWeek);
    state.line[line].manualOn = manualLineState[line];
    state.line[line].on = state.line[line].scheduledOn || state.line[line].manualOn;
  }

  arbitrateActiveLines(state);
  return state;
}

bool validateScheduleCandidate(int line, const LineSchedule &candidate, String &errorMessage) {
  for (int otherLine = 1; otherLine <= LINE_COUNT; otherLine++) {
    if (otherLine == line) continue;

    if (candidate.enabled && schedules[otherLine].enabled
        && schedulesOverlap(candidate, schedules[otherLine])) {
      errorMessage = "schedule overlaps with the other active line";
      return false;
    }
  }

  if (candidate.enabled) {
    uint32_t epoch = timeClient.getEpochTime();
    int secOfDay = epoch % 86400;
    int dayOfWeek = dayOfWeekFromEpoch(epoch);
    bool candidateActiveNow = isIntervalScheduleActiveNow(candidate, secOfDay, dayOfWeek);

    for (int otherLine = 1; otherLine <= LINE_COUNT; otherLine++) {
      if (otherLine == line) continue;

      bool otherActiveNow = schedules[otherLine].enabled
        ? isIntervalScheduleActiveNow(schedules[otherLine], secOfDay, dayOfWeek)
        : manualLineState[otherLine];

      if (candidateActiveNow && otherActiveNow) {
        errorMessage = "schedule would activate while another line is already on";
        return false;
      }
    }
  }

  return true;
}
