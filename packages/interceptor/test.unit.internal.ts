/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * For internal use only (browser-side).
 *
 * This module is safe to bundle into the application under test. It manages a call-line store on
 * the `window` object. The store is written to by `lineCalled` / `lineCalledWithClone` (see
 * `test.unit.ts`) and read from Node through the `CallLine` controller (see `test.unit.node.ts`).
 */

import { CallLineStack } from "./test.unit.types";

const __CALL_LINE__ = "__callLine__";
const __CALL_LINE_NAME__ = "CallLine";

type CallLineWindowType = Window & { [__CALL_LINE__]?: CallLineStore };

// #region Main functions

/**
 * Disable the call line in the window object.
 *
 * @param childWindow An optional additional window instance (e.g. an iframe's `contentWindow`)
 */
export const disableCallLine = (childWindow?: CallLineWindowType) => {
    const parentWindow: CallLineWindowType = globalThis.window;

    parentWindow[__CALL_LINE__] = undefined;

    if (childWindow) {
        childWindow[__CALL_LINE__] = undefined;
    }
};

/**
 * Enable the call line in the window object and create a new instance of the CallLineStore class.
 *
 * In Playwright this is normally injected from Node via `CallLine.enable()`
 * (see `test.unit.node.ts`), but it can also be called directly in the application code.
 *
 * @param childWindow An optional additional window instance (e.g. an iframe's `contentWindow`)
 */
export const enableCallLine = (childWindow?: CallLineWindowType) => {
    const parentWindow: CallLineWindowType = globalThis.window;

    parentWindow[__CALL_LINE__] = new CallLineStore();

    if (childWindow) {
        childWindow[__CALL_LINE__] = parentWindow[__CALL_LINE__];
    }
};

/**
 * Check if the call line is enabled.
 *
 * @returns True if the call line is enabled
 */
export const isCallLineEnabled = (win: CallLineWindowType = window) =>
    __CALL_LINE__ in win &&
    win[__CALL_LINE__] !== undefined &&
    "name" in win[__CALL_LINE__] &&
    win[__CALL_LINE__].name === __CALL_LINE_NAME__;

/**
 * Get the created instance of the CallLineStore class. It is not intended to be used directly;
 * read the call line from Node with the `CallLine` controller instead.
 *
 * @returns An instance of the CallLineStore class
 */
export const getCallLine = () => {
    const win: CallLineWindowType = window;

    return isCallLineEnabled(win) ? win[__CALL_LINE__]! : new CallLineStore();
};

// #endregion

/**
 * A helper class for the call line that is stored in the window object.
 */
export class CallLineStore {
    private _stack: CallLineStack[] = [];

    /**
     * Get a copy of the stack of the call line.
     */
    get array() {
        return this._stack.map((stack) => ({
            args: [...stack.args],
            date: stack.date
        }));
    }

    /**
     * True if the CallLine feature is globally enabled.
     */
    get isEnabled() {
        return isCallLineEnabled();
    }

    /**
     * Get the number of all entries.
     */
    get length() {
        return this._stack.length;
    }

    get name() {
        return __CALL_LINE_NAME__;
    }

    /**
     * Add a new entry to the call line.
     *
     * @param args The arguments to store
     */
    call(args: any | any[]) {
        this._stack.push({ args: Array.isArray(args) ? [...args] : [args], date: new Date() });
    }

    /**
     * Clean the call line and start storing the values from the beginning.
     */
    clean() {
        this._stack = [];
    }
}
