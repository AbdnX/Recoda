/**
 * Central state machine.
 * Emits custom events when state changes so other modules can react.
 *
 * States: 'idle' | 'recording' | 'paused'
 */

const emitter = new EventTarget();

let currentState = 'idle';

/**
 * Get the current app state.
 * @returns {'idle'|'recording'|'paused'}
 */
export function getState() {
  return currentState;
}

/**
 * Set the app state and dispatch a 'statechange' event.
 * @param {'idle'|'recording'|'paused'} newState
 */
export function setState(newState) {
  const prev = currentState;
  currentState = newState;
  emitter.dispatchEvent(
    new CustomEvent('statechange', { detail: { state: newState, prev } })
  );
}

/**
 * Subscribe to state changes.
 * @param {(detail: {state: string, prev: string}) => void} callback
 * @returns {() => void} Unsubscribe function.
 */
export function onStateChange(callback) {
  const handler = (e) => callback(e.detail);
  emitter.addEventListener('statechange', handler);
  return () => emitter.removeEventListener('statechange', handler);
}
