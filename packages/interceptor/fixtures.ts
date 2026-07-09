import { test as base } from "@playwright/test";

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

const getRequestTimeout = () => {
    const fromEnv = process.env.INTERCEPTOR_REQUEST_TIMEOUT;
    const parsed = fromEnv ? Number(fromEnv) : NaN;

    return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * A `@playwright/test` `test` object extended with the `interceptor` and `wsInterceptor` fixtures.
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
export const test = base.extend<InterceptorFixtures>({
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

export { expect } from "@playwright/test";
