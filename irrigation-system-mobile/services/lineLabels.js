const LINE_META = {
  1: {
    name: 'Lawn',
    image: require('../assets/lines/line-trevnik.png'),
    accent: '#2E7D32',
  },
  2: {
    name: 'Tomatoes',
    image: require('../assets/lines/line-domati.png'),
    accent: '#C62828',
  },
  3: {
    name: 'Cucumbers',
    image: require('../assets/lines/line-krastavici.png'),
    accent: '#558B2F',
  },
};

export function getLineDisplayName(lineId) {
  const id = Number(lineId);
  return LINE_META[id]?.name || `Line ${id}`;
}

export function getLineMeta(lineId) {
  const id = Number(lineId);
  return (
    LINE_META[id] || {
      name: getLineDisplayName(id),
      image: null,
      accent: '#2E7D32',
    }
  );
}
