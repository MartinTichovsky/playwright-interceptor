import type { ConsoleMessage, Page } from "@playwright/test";

import { deepCopy, removeCircular, removeUndefinedFromObject } from "./src/utils";
import { getFilePath, writeFile } from "./src/utils.node";
import {
    ConsoleLog,
    ConsoleLogType,
    WatchTheConsoleOptions,
    WriteLogOptions
} from "./WatchTheConsole.types";

const defaultOptions: Required<WatchTheConsoleOptions> = {
    cloneConsoleArguments: false
};

export interface WatchTheConsoleConstructorOptions {
    /**
     * The test title path (describe blocks + the test name). Used to auto-generate log file names.
     */
    titlePath?: string[];
}

/**
 * Map a Playwright `ConsoleMessage.type()` to the shared `ConsoleLogType`. Playwright emits
 * `"warning"` where the browser API is `console.warn`, and does not surface `console.log`/`info`/
 * `error` under different names. Any other console type (`debug`, `trace`, `table`, ...) is ignored.
 */
const CONSOLE_TYPE_MAP: Record<string, ConsoleLogType | undefined> = {
    error: ConsoleLogType.ConsoleError,
    info: ConsoleLogType.ConsoleInfo,
    log: ConsoleLogType.ConsoleLog,
    warning: ConsoleLogType.ConsoleWarn
};

const getCurrentTime = (): [number, string] => {
    const currentTime = new Date();

    return [
        currentTime.getTime(),
        `${currentTime.toLocaleTimeString("en-GB", {
            day: "numeric",
            month: "numeric",
            year: "numeric"
        })}.${currentTime.getMilliseconds()}`
    ];
};

export class WatchTheConsole {
    private _records: ConsoleLog[] = [];
    private _options: Required<WatchTheConsoleOptions> = {
        ...defaultOptions
    };
    private _active = false;
    /**
     * Reading the console arguments (`JSHandle.jsonValue()`) is asynchronous, but the getters are
     * synchronous. To keep the records in the exact order the events fired, every handler appends
     * its (async) work to this promise chain, so entries are pushed to `_records` serially.
     */
    private _processing: Promise<void> = Promise.resolve();

    private readonly page: Page;
    private titlePath: string[];

    private readonly _consoleHandler: (msg: ConsoleMessage) => void;
    private readonly _pageErrorHandler: (error: Error) => void;

    constructor(page: Page, options: WatchTheConsoleConstructorOptions = {}) {
        this.page = page;
        this.titlePath = options.titlePath ?? [];
        this._consoleHandler = (msg) => this.handleConsole(msg);
        this._pageErrorHandler = (error) => this.handlePageError(error);
    }

    /**
     * Start watching the console. This is called automatically by the fixture.
     */
    public start() {
        if (this._active) {
            return;
        }

        this._active = true;

        this.page.on("console", this._consoleHandler);
        this.page.on("pageerror", this._pageErrorHandler);
    }

    /**
     * Stop watching the console by removing the listeners.
     */
    public destroy() {
        if (!this._active) {
            return;
        }

        this._active = false;

        this.page.off("console", this._consoleHandler);
        this.page.off("pageerror", this._pageErrorHandler);
    }

    /**
     * Wait until all pending (asynchronously resolved) console entries have been recorded.
     *
     * Because Playwright resolves console arguments asynchronously, an entry may not be present in
     * the getters immediately after the browser logged it. Awaiting this settles the internal queue.
     */
    public async flush() {
        await this._processing;
    }

    /**
     * console.error
     */
    get error() {
        return deepCopy(this._records).filter(
            (record) => record.type === ConsoleLogType.ConsoleError
        );
    }

    /**
     * console.info
     */
    get info() {
        return deepCopy(this._records).filter(
            (record) => record.type === ConsoleLogType.ConsoleInfo
        );
    }

    /**
     * JavaScript errors
     */
    get jsError() {
        return deepCopy(this._records).filter((record) => record.type === ConsoleLogType.Error);
    }

    /**
     * console.log
     */
    get log() {
        return deepCopy(this._records).filter(
            (record) => record.type === ConsoleLogType.ConsoleLog
        );
    }

    /**
     * Get the logged console output
     */
    get records() {
        return deepCopy(this._records);
    }

    /**
     * console.warn
     */
    get warn() {
        return deepCopy(this._records).filter(
            (record) => record.type === ConsoleLogType.ConsoleWarn
        );
    }

    private handleConsole(msg: ConsoleMessage) {
        const type = CONSOLE_TYPE_MAP[msg.type()];

        // ignore console types we do not track (debug, trace, table, ...)
        if (type === undefined) {
            return;
        }

        this._processing = this._processing.then(async () => {
            const [dateTime, currentTime] = getCurrentTime();

            const handles = msg.args();

            // Resolve each argument to its serialized JSON value. Values that do not survive
            // serialization (functions, symbols, DOM nodes, ...) resolve to `undefined`/`null` or
            // throw - in which case we fall back to the textual representation of the message.
            let args: unknown[];

            if (handles.length) {
                args = await Promise.all(
                    handles.map((handle) => handle.jsonValue().catch(() => msg.text()))
                );
            } else {
                args = [msg.text()];
            }

            // `jsonValue()` reconstructs the browser object graph in Node, circular references
            // included. Collapse those to "[Circular]" so the records can be safely copied and
            // serialized (mirrors the `cypress-interceptor` output).
            args = args.map((arg) => removeCircular(arg));

            this._records.push({
                args,
                currentTime,
                dateTime,
                type
            });
        });
    }

    private handlePageError(error: Error) {
        const [dateTime, currentTime] = getCurrentTime();

        this._processing = this._processing.then(() => {
            this._records.push({
                args: [error.message, error.stack],
                currentTime,
                dateTime,
                type: ConsoleLogType.Error
            });
        });
    }

    /**
     * Set the WatchTheConsole options.
     *
     * Note: `cloneConsoleArguments` is a no-op in Playwright (see `WatchTheConsoleOptions`). The
     * option is accepted and stored for API parity with `cypress-interceptor`.
     *
     * @param options Options
     * @returns The current WatchTheConsole options
     */
    public setOptions(options: WatchTheConsoleOptions = this._options): WatchTheConsoleOptions {
        this._options = {
            ...this._options,
            ...removeUndefinedFromObject(options)
        };

        return deepCopy(this._options);
    }

    /**
     * Write the logged console output to a file
     *
     * @example writeLogToFile("./out") => the output file will be "./out/[Description] It.console.json"
     * @example writeLogToFile("./out", { fileName: "file_name" }) =>  the output file will be "./out/file_name.console.json"
     * @example writeLogToFile("./out", { types: [ConsoleLogType.ConsoleError, ConsoleLogType.Error] }) => write only the
     * console errors and unhandled JavaScript errors to the output file
     * @example writeLogToFile("./out", { filter: (type, ...args) => typeof args[0] === "string" && args[0].startsWith("Custom log:") }) =>
     * filter all console output to include only entries starting with "Custom log:"
     * @example writeLogToFile("./out", { maxLength: 30 }) => cut the generated file name to a maximum of 30 characters
     * @example writeLogToFile("./out", { maxLength: { describe: 20, testName: 30 } }) => cut the describe section to 20 and the test name to 30 characters
     *
     * @param outputDir The path for the output folder
     * @param options Options
     */
    public writeLogToFile(outputDir: string, options?: WriteLogOptions) {
        const types = options?.types;

        let filteredLog = this._records;

        if (types) {
            filteredLog = filteredLog.filter(({ type }) => types.includes(type));
        }

        const customFilter = options?.filter;

        if (customFilter) {
            filteredLog = filteredLog.filter(({ type, args }) => customFilter(type, ...args));
        }

        if (!filteredLog.length) {
            return;
        }

        writeFile(
            getFilePath({
                fileName: options?.fileName,
                maxLength: options?.maxLength,
                outputDir,
                titlePath: this.titlePath,
                type: "console"
            }),
            JSON.stringify(filteredLog, undefined, options?.prettyOutput ? 4 : undefined)
        );
    }
}
