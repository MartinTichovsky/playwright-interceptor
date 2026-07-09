import { FileNameMaxLength } from "./Interceptor.types";

export enum ConsoleLogType {
    ConsoleInfo = "console.info",
    ConsoleError = "console.error",
    ConsoleLog = "console.log",
    ConsoleWarn = "console.warn",
    // this is equal to an unhandled JavaScript error
    Error = "error"
}

export type CurrentTime = string;

export type DateTime = number;

export interface ConsoleLog {
    /**
     * The console output or the unhandled JavaScript error message and stack trace
     */
    args: unknown[];
    /**
     * The customized date and time in the format dd/MM/yyyy, hh:mm:ss.milliseconds. (for better visual checking)
     */
    currentTime: CurrentTime;
    /**
     * The getTime() of the Date when the console was logged (for future investigation)
     */
    dateTime: DateTime;
    /**
     * Console Type
     */
    type: ConsoleLogType;
}

export interface WatchTheConsoleOptions {
    /**
     * In the Cypress interceptor this deeply clones the logged object (to snapshot it and remove
     * circular references) because the console arguments are live references to browser objects.
     *
     * In Playwright this option is a **no-op**: the console arguments arrive from the browser as
     * already-serialized JSON values (resolved via Playwright's `JSHandle.jsonValue()`), so there
     * are no live references to snapshot and circular references are already collapsed by the
     * serialization boundary. The option is kept for API parity with `cypress-interceptor`.
     */
    cloneConsoleArguments?: boolean;
}

export interface WriteLogOptions {
    /**
     * The name of the file. If `undefined`, it will be generated from the running test.
     */
    fileName?: string;
    /**
     * An option to filter the logged items
     *
     * @param type The type of the console log
     * @param args The console log arguments
     * @returns `false` if the item should be skipped
     */
    filter?: (type: ConsoleLogType, ...args: unknown[]) => boolean;
    /**
     * The maximal length of the generated file name. Has no effect when `fileName` is provided.
     */
    maxLength?: FileNameMaxLength;
    /**
     * When set to `true`, the output JSON will be formatted with tabs
     */
    prettyOutput?: boolean;
    /**
     * If the type is not provided, it logs all console entries
     */
    types?: ConsoleLogType[];
}
