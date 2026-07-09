/**
 * Start a time measurement (a helper function).
 *
 * @returns `performance.now()` when the code is executed
 */
export const startTiming = () => performance.now();

/**
 * Stop a time measurement (a helper function).
 *
 * @param start The value returned by `startTiming`
 * @returns The time difference since `startTiming` was called (in ms)
 */
export const stopTiming = (start: number) => performance.now() - start;
