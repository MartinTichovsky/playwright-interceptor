import { deepCopy } from "./src/utils";
import { getCallLine, isCallLineEnabled } from "./test.unit.internal";

/**
 * This function is intended to be used in the application code to store any
 * information that you want to read in Playwright tests.
 *
 * If the call line is not enabled, it does nothing. Enable it in Playwright
 * tests with the `CallLine` controller (see `test.unit.node.ts`), typically in
 * a `beforeEach` hook via `callLine.enable()`.
 *
 * @param args Anything that you want to store
 */
export const lineCalled = (...args: unknown[]) => {
    if (!isCallLineEnabled()) {
        return;
    }

    getCallLine().call(args.length > 1 ? [...args] : args[0]);
};

/**
 * This function is the same as `lineCalled` but it clones the arguments
 * before storing them.
 *
 * @param args Anything that you want to store
 */
export const lineCalledWithClone = (...args: unknown[]) => {
    if (!isCallLineEnabled()) {
        return;
    }

    getCallLine().call(deepCopy(args.length > 1 ? [...args] : args[0]));
};
