import type {
    Expect,
    PlaywrightTestArgs,
    PlaywrightTestOptions,
    PlaywrightWorkerArgs,
    PlaywrightWorkerOptions,
    TestType
} from "@playwright/test";

import { Interceptor } from "./Interceptor";
import { WatchTheConsole } from "./WatchTheConsole";
import { WebsocketInterceptor } from "./WebsocketInterceptor";

export interface InterceptorFixtures {
    /**
     * An instance of the HTTP Interceptor, bound to the current page. It is started automatically
     * before the test and intercepts all `fetch` and `XMLHttpRequest` requests.
     */
    interceptor: Interceptor;
    /**
     * An instance of WatchTheConsole, bound to the current page. It is started automatically before
     * the test and records all console output and uncaught JavaScript errors.
     */
    watchTheConsole: WatchTheConsole;
    /**
     * An instance of the WebSocket Interceptor, bound to the current page.
     */
    wsInterceptor: WebsocketInterceptor;
}

// The `test` object must belong to the SAME `@playwright/test` instance that the runner uses to
// execute the specs. If the fixtures extended a different copy (for example the one hoisted to the
// monorepo root while a runner package uses its own pinned version), Playwright throws
// "Playwright Test did not expect test.describe() to be called here". To support running the shared
// specs against several Playwright versions at once, each runner injects its own copy through
// `registerPlaywright()`; a normal single-version consumer needs nothing and falls back to a plain
// `require("@playwright/test")`.

/**
 * The shape of the stock `@playwright/test` `test` object (before any custom fixtures are added).
 * Matches the type of the default `test` export so the fixture callbacks below are fully typed.
 */
type BaseTest = TestType<
    PlaywrightTestArgs & PlaywrightTestOptions,
    PlaywrightWorkerArgs & PlaywrightWorkerOptions
>;

// The injected module is typed loosely on purpose: a runner may pin ANY Playwright version, whose
// declarations are structurally incompatible with the copy this package is built against (a newer
// version adds fields like `abort`, an older one lacks them). The seam is validated at runtime, so
// these are cast to the build-time types inside `runtime()`.
interface PlaywrightRuntime {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    test: any;
}

let injected: PlaywrightRuntime | undefined;
let cachedTest: ReturnType<typeof extendTest> | undefined;

/**
 * Register the `@playwright/test` module that the interceptor fixtures should extend.
 *
 * Version-specific runner packages call this from their `playwright.config` (which resolves
 * `@playwright/test` to their own pinned version) before any spec is loaded. This guarantees the
 * `test`/`expect` exported from `playwright-interceptor` belong to the exact Playwright instance
 * executing the tests.
 *
 * @example
 * // packages/playwright-1.30.0/playwright.config.ts
 * import { expect, test } from "@playwright/test";
 * import { registerPlaywright } from "playwright-interceptor/register";
 *
 * registerPlaywright({ expect, test });
 */
export const registerPlaywright = (playwright: PlaywrightRuntime): void => {
    injected = playwright;
    cachedTest = undefined;
};

const runtime = (): { expect: Expect; test: BaseTest } =>
    injected ??
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("@playwright/test") as { expect: Expect; test: BaseTest });

const getRequestTimeout = () => {
    const fromEnv = process.env.INTERCEPTOR_REQUEST_TIMEOUT;
    const parsed = fromEnv ? Number(fromEnv) : NaN;

    return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Extend a base `@playwright/test` `test` object with the `interceptor`, `watchTheConsole` and
 * `wsInterceptor` fixtures. Exposed so a runner can build the fixtures against its own
 * `@playwright/test` version.
 *
 * @example
 * import { test as base } from "@playwright/test";
 * import { extendTest } from "playwright-interceptor";
 *
 * export const test = extendTest(base);
 */
export const extendTest = (base: BaseTest) =>
    base.extend<InterceptorFixtures>({
        interceptor: async ({ page }, use, testInfo) => {
            const interceptor = new Interceptor(page, {
                requestTimeout: getRequestTimeout(),
                titlePath: testInfo.titlePath
            });

            await interceptor.start();

            await use(interceptor);

            await interceptor.destroy();
        },
        watchTheConsole: async ({ page }, use, testInfo) => {
            const watchTheConsole = new WatchTheConsole(page, {
                titlePath: testInfo.titlePath
            });

            watchTheConsole.start();

            await use(watchTheConsole);

            watchTheConsole.destroy();
        },
        wsInterceptor: async ({ page }, use, testInfo) => {
            const wsInterceptor = new WebsocketInterceptor(page, {
                requestTimeout: getRequestTimeout(),
                titlePath: testInfo.titlePath
            });

            wsInterceptor.start();

            await use(wsInterceptor);

            wsInterceptor.destroy();
        }
    });

/**
 * The `@playwright/test` `test` object extended with the interceptor fixtures, built against the
 * registered (or default) Playwright instance. Prefer importing `test` from the package index.
 */
export const getTest = () => (cachedTest ??= extendTest(runtime().test));

/**
 * The `expect` from the registered (or default) `@playwright/test` instance. Prefer importing
 * `expect` from the package index.
 */
export const getExpect = (): Expect => runtime().expect;
