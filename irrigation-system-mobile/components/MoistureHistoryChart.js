import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getMoistureLevel, MOISTURE_TARGET } from '../services/moistureSensors';

function formatAxisLabel(timestamp, rangeKey) {
  const date = new Date(timestamp);
  if (rangeKey === '3d') {
    return date.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  if (rangeKey === '1w') {
    return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function MoistureHistoryChart({ data, rangeKey }) {
  const labelIndexes = useMemo(() => {
    if (!data?.length) return [];
    if (data.length <= 3) return data.map((_, index) => index);
    const mid = Math.floor((data.length - 1) / 2);
    return [0, mid, data.length - 1];
  }, [data]);

  if (!data?.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No moisture history yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.chartRow}>
        <View style={styles.yAxis}>
          <Text style={styles.yLabel}>100</Text>
          <Text style={styles.yLabel}>50</Text>
          <Text style={styles.yLabel}>0</Text>
        </View>

        <View style={styles.plotArea}>
          <View style={styles.gridLineTop} />
          <View style={styles.gridLineMid} />
          <View
            style={[
              styles.targetBand,
              {
                bottom: `${MOISTURE_TARGET.min}%`,
                height: `${MOISTURE_TARGET.max - MOISTURE_TARGET.min}%`,
              },
            ]}
          />

          <View style={styles.barsRow}>
            {data.map((point, index) => {
              const level = getMoistureLevel(point.percent);
              return (
                <View key={`${point.timestamp}-${index}`} style={styles.barColumn}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: `${Math.max(4, point.percent)}%`,
                          backgroundColor: level.barColor,
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.xAxisRow}>
        <View style={styles.yAxisSpacer} />
        <View style={styles.xLabels}>
          {labelIndexes.map((index) => (
            <Text key={`label-${index}`} style={styles.xLabel}>
              {formatAxisLabel(data[index].timestamp, rangeKey)}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 8,
  },
  chartRow: {
    flexDirection: 'row',
    height: 220,
  },
  yAxis: {
    width: 28,
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  yLabel: {
    fontSize: 10,
    color: '#888',
    textAlign: 'right',
  },
  plotArea: {
    flex: 1,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#BDBDBD',
    position: 'relative',
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  gridLineTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '0%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  gridLineMid: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  targetBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(46, 125, 50, 0.12)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(46, 125, 50, 0.25)',
    zIndex: 0,
  },
  barsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    zIndex: 1,
  },
  barColumn: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 1,
  },
  barTrack: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    minHeight: 4,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  xAxisRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  yAxisSpacer: {
    width: 28,
  },
  xLabels: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xLabel: {
    fontSize: 10,
    color: '#666',
  },
  empty: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 13,
  },
});
