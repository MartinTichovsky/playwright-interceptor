import { getExpect, getTest } from "./fixtures";

/**
 * A `@playwright/test` `test` object extended with the `interceptor`, `watchTheConsole` and
 * `wsInterceptor` fixtures.
 *
 * @example
 * import { test, expect } from "playwright-interceptor";
 *
 * test("captures requests", async ({ page, interceptor }) => {
 *     await page.goto("/");
 *     await interceptor.waitUntilRequestIsDone();
 *     expect(interceptor.callStack.length).toBeGreaterThan(0);
 * });
 */
export const test = getTest();
export const expect = getExpect();

export { extendTest, InterceptorFixtures, registerPlaywright } from "./fixtures";
export { Interceptor, InterceptorConstructorOptions } from "./Interceptor";
export * from "./Interceptor.types";
export * from "./report";
export { generateReport } from "./src/generateReport";
export { ReportClassName, ReportTestId, ReportTestIdPrefix } from "./src/generateReport.template";
export * from "./src/validator";
export { CallLine, CallLineConstructorOptions } from "./test.unit.node";
export type { CallLineStack, CallLineToFileOptions } from "./test.unit.types";
export { startTiming, stopTiming } from "./timing";
export { WatchTheConsole, WatchTheConsoleConstructorOptions } from "./WatchTheConsole";
export * from "./WatchTheConsole.types";
export {
    WebsocketInterceptor,
    WebsocketInterceptorConstructorOptions
} from "./WebsocketInterceptor";
export type {
    CallStackWebsocket,
    IWSMatcher,
    WaitUntilActionOptions,
    WebSocketAction,
    WebSocketActionCommon,
    WebSocketActionType,
    WriteStatsOptions as WriteWSStatsOptions,
    WSClose,
    WSCreate,
    WSOnError,
    WSOnMessage,
    WSSend
} from "./WebsocketInterceptor.types";
