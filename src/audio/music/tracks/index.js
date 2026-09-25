import coastlineDrive from './coastlineDrive.js'
import splitHorizon from './splitHorizon.js'
import lastWave from './lastWave.js'

/** The three built-in (original) tracks, in radio order. */
export const TRACKS = [coastlineDrive, splitHorizon, lastWave]

export const getTrack = (id) => TRACKS.find((t) => t.id === id) || null
