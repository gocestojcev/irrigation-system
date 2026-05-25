import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { getMoistureLevel, needsWatering } from '../services/moistureSensors';

export function MoistureIconButton({ percent, onPress, size = 46, style }) {
  const level = getMoistureLevel(percent);
  const dry = needsWatering(percent);

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: dry ? '#EF6C00' : level.color,
          backgroundColor: dry ? '#FFF3E0' : `${level.barColor}22`,
        },
        style,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Soil moisture ${percent} percent. Open moisture history.`}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={styles.droplet}>💧</Text>
      <Text style={[styles.percent, { color: level.color }]}>{percent}%</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  droplet: {
    fontSize: 14,
    lineHeight: 16,
  },
  percent: {
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
});
