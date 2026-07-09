import type { Page } from "@playwright/test";

import { getFilePath, writeFile } from "./src/utils.node";
import { CallLineStack, CallLineToFileOptions } from "./test.unit.types";

/**
 * The browser-side setup function injected by the `CallLine` controller.
 *
 * It installs a plain store object on `window.__callLine__` that is compatible with the
 * `isCallLineEnabled` / `getCallLine` helpers in `test.unit.internal.ts` (it exposes the same
 * `name` marker and a `call` method). It is written as a self-contained function because it is
 * serialized and executed in the browser context, so it cannot reference anything from Node.
 */
const installCallLineStore = () => {
    const store: {
        name: string;
        _stack: { args: unknown[]; date: Date }[];
        call: (args: unknown) => void;
    } = {
        name: "CallLine",
        _stack: [],
        call(args: unknown) {
            this._stack.push({
                args: Array.isArray(args) ? [...args] : [args],
                date: new Date()
            });
        }
    };

    (window as unknown as { __callLine__?: unknown }).__callLine__ = store;
};

export interface CallLineConstructorOptions {
    /**
     * The test title path (describe blocks + the test name). Used to auto-generate file names in
     * `writeToFile`.
     */
    titlePath?: string[];
}

/**
 * A Node-side controller for the call line stored in the browser `window` object.
 *
 * It replaces the Cypress `cy.callLine*` commands. Enable it (typically in a `beforeEach` hook)
 * so the browser-side `lineCalled` / `lineCalledWithClone` functions start storing entries, then
 * read them back through the controller.
 *
 * @example
 * ```ts
 * const callLine = new CallLine(page, { titlePath: test.info().titlePath });
 * await callLine.enable();
 * await page.goto("/");
 * // ... application code calls lineCalled("something")
 * expect(await callLine.next()).toEqual("something");
 * ```
 */
export class CallLine {
    private readonly page: Page;
    private titlePath: string[];
    private i = -1;
    private _enabled = false;
    private _initScriptAdded = false;

    constructor(page: Page, options: CallLineConstructorOptions = {}) {
        this.page = page;
        this.titlePath = options.titlePath ?? [];
    }

    /**
     * True if the call line has been enabled through this controller.
     */
    get isEnabled() {
        return this._enabled;
    }

    /**
     * Enable the call line. The store is installed before every navigation (so entries logged
     * during the initial page load are captured) and also on the current page.
     */
    public async enable() {
        if (!this._initScriptAdded) {
            await this.page.addInitScript(installCallLineStore);
            this._initScriptAdded = true;
        }

        // install on the already-loaded page as well (addInitScript only affects future loads)
        try {
            await this.page.evaluate(installCallLineStore);
        } catch {
            // no document yet (e.g. about:blank before the first goto) - the init script covers it
        }

        this._enabled = true;
    }

    /**
     * Disable the call line on the current page. Note: because Playwright cannot remove an init
     * script, the store is re-installed on the next navigation while the controller has been
     * enabled. Call `disable()` after the last navigation to stop collecting entries.
     */
    public async disable() {
        try {
            await this.page.evaluate(() => {
                (window as unknown as { __callLine__?: unknown }).__callLine__ = undefined;
            });
        } catch {
            // no document - nothing to disable
        }

        this._enabled = false;
    }

    /**
     * Get a copy of the stack of the call line (each entry has its `args` and `date`).
     */
    public async array(): Promise<CallLineStack[]> {
        const stack = await this.page.evaluate(() => {
            const store = (
                window as unknown as {
                    __callLine__?: { _stack?: { args: unknown[]; date: Date }[] };
                }
            ).__callLine__;

            return store && Array.isArray(store._stack) ? store._stack : [];
        });

        // dates come back as serialized ISO strings - revive them
        return stack.map((entry) => ({
            args: [...entry.args],
            date: new Date(entry.date)
        }));
    }

    /**
     * Get the number of all entries.
     */
    public async length(): Promise<number> {
        return (await this.array()).length;
    }

    /**
     * The last existing entry returned by `next`. It can be `undefined` if there is no entry at the
     * moment or if `next` has not been called yet. Otherwise it always returns the last entry
     * invoked by `next`.
     */
    public async current(): Promise<unknown | unknown[] | undefined> {
        const array = await this.array();

        return this.i === -1 || this.i >= array.length
            ? undefined
            : array[this.i].args.length === 1
              ? array[this.i].args[0]
              : array[this.i].args;
    }

    /**
     * Get the next entry. If there is no next entry, it returns `undefined`.
     *
     * If the entry was added as a single argument like `lineCalled("something")`, it returns the
     * single value `"something"`. But if it was added as multiple arguments like
     * `lineCalled("something", 1, true)`, it returns an array `["something", 1, true]`.
     */
    public async next(): Promise<unknown | unknown[] | undefined> {
        const array = await this.array();

        if (array.length && array.length > this.i + 1) {
            this.i++;

            return array[this.i].args.length === 1 ? array[this.i].args[0] : array[this.i].args;
        }

        return undefined;
    }

    /**
     * Clean the call line array (in the browser) and start storing the values from the beginning.
     */
    public async clean() {
        try {
            await this.page.evaluate(() => {
                const store = (window as unknown as { __callLine__?: { _stack?: unknown[] } })
                    .__callLine__;

                if (store && Array.isArray(store._stack)) {
                    store._stack = [];
                }
            });
        } catch {
            // no document - nothing to clean
        }

        this.reset();
    }

    /**
     * Resets the counter and starts from the first entry on the next call to `next`.
     */
    public reset() {
        this.i = -1;
    }

    /**
     * Save the call line entries to a file. Arguments passed to `lineCalled` are stored as arrays.
     *
     * @example writeToFile("./out") => the output file will be "./out/[Description] It.callLine.json"
     * @example writeToFile("./out", { fileName: "file_name" }) => the output file will be "./out/file_name.callLine.json"
     * @example writeToFile("./out", { filter: (entry) => entry.args.length > 1 }) => save only entries with multiple arguments
     * @example writeToFile("./out", { maxLength: 30 }) => cut the generated file name to a maximum of 30 characters
     * @example writeToFile("./out", { prettyOutput: true }) => format the output JSON with tabs
     *
     * @param outputDir The folder to save the call line
     * @param options The options for the file
     */
    public async writeToFile(outputDir: string, options?: CallLineToFileOptions) {
        let stack = await this.array();

        if (options?.filter) {
            stack = stack.filter(options.filter);
        }

        if (!stack.length) {
            return;
        }

        writeFile(
            getFilePath({
                fileName: options?.fileName,
                maxLength: options?.maxLength,
                outputDir,
                titlePath: this.titlePath,
                type: "callLine"
            }),
            JSON.stringify(stack, undefined, options?.prettyOutput ? 4 : undefined)
        );
    }
}
