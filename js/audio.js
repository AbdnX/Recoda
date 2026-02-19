/**
 * AudioContext management: mixing, analyser creation.
 */

let audioCtx = null;

/** Get or create the shared AudioContext */
export function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

/**
 * Mix multiple audio streams into a single output stream.
 * @param  {...MediaStream} streams
 * @returns {MediaStreamTrack[]} Mixed audio tracks.
 */
export function mixAudioStreams(...streams) {
  const ctx = getAudioContext();
  const dest = ctx.createMediaStreamDestination();
  for (const stream of streams) {
    ctx.createMediaStreamSource(stream).connect(dest);
  }
  return dest.stream.getAudioTracks();
}

/**
 * Create an AnalyserNode wired to a stream.
 * @param {MediaStream} stream
 * @returns {AnalyserNode}
 */
export function createAnalyser(stream) {
  const ctx = getAudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.75;
  src.connect(analyser);
  return analyser;
}

/** Close and dispose the AudioContext */
export function closeAudio() {
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}
