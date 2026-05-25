import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getMoistureLevel, MOISTURE_TARGET } from '../services/moistureSensors';

export function MoistureReadout({ percent, isMock = false, compact = false }) {
  const level = getMoistureLevel(percent);
  const fillWidth = `${Math.max(4, Math.min(100, percent))}%`;

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Soil moisture</Text>
        <View style={styles.headerRight}>
          {isMock ? <Text style={styles.previewBadge}>Preview</Text> : null}
          <Text style={[styles.percent, { color: level.color }]}>{percent}%</Text>
        </View>
      </View>

      <View style={styles.barTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
        <View style={[styles.targetBand, styles.targetBandPosition]} />
        <View style={[styles.barFill, { width: fillWidth, backgroundColor: level.barColor }]} />
      </View>

      <View style={styles.footerRow}>
        <Text style={[styles.statusLabel, { color: level.color }]}>{level.label}</Text>
        <Text style={styles.targetHint}>
          Target {MOISTURE_TARGET.min}–{MOISTURE_TARGET.max}%
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.12)',
  },
  containerCompact: {
    marginTop: 8,
    paddingTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#33691E',
  },
  previewBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5D4037',
    backgroundColor: '#FFE0B2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    marginRight: 6,
  },
  percent: {
    fontSize: 16,
    fontWeight: '800',
  },
  barTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E0E0E0',
    overflow: 'hidden',
    position: 'relative',
  },
  targetBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(46, 125, 50, 0.18)',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(46, 125, 50, 0.35)',
    zIndex: 0,
  },
  targetBandPosition: {
    left: `${MOISTURE_TARGET.min}%`,
    width: `${MOISTURE_TARGET.max - MOISTURE_TARGET.min}%`,
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 5,
    zIndex: 1,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  targetHint: {
    fontSize: 11,
    color: '#888',
  },
});
