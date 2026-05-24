import React from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { getLineMeta } from '../services/lineLabels';

export function LineAvatar({ lineId, size = 56, style }) {
  const meta = getLineMeta(lineId);

  if (meta.image) {
    return (
      <Image
        source={meta.image}
        style={[styles.image, { width: size, height: size, borderRadius: size * 0.22 }, style]}
        resizeMode="cover"
        accessibilityLabel={meta.name}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size * 0.22, backgroundColor: meta.accent },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#E8F5E9',
  },
  fallback: {
    opacity: 0.85,
  },
});
