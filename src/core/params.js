// URL parameters (debug + test hooks). All optional.
const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')

export const params = {
  perf: q.has('perf'),
  bench: q.has('bench'),
  autotest: q.has('autotest'),
  autopilot: q.has('autopilot') || q.has('autotest') || q.has('bench'),
  race: q.has('race') || q.has('autotest') || q.has('bench'),
  route: (q.get('route') || '').toUpperCase(),
  stage: q.get('stage') || null, // "r-c"
  startS: q.has('s') ? Number(q.get('s')) : 0,
  preset: q.get('preset') || null,
  ff: q.has('ff') ? Math.max(1, Number(q.get('ff'))) : 0, // virtual steps multiplier
  car: q.get('car') || null,
  mute: q.has('mute') || q.has('autotest') || q.has('bench'),
  noTraffic: q.has('notraffic'),
  seed: q.get('seed') || null,
  mode: q.get('mode') || 'outrun',
  nopost: q.has('nopost'),
  v0: q.has('v') ? Number(q.get('v')) / 3.6 : 0, // debug start speed (km/h)
  hide: (q.get('hide') || '').split(',').filter(Boolean), // debug: hide scene objects by name
}
