import type {
    Page,
    Request as PlaywrightRequest,
    Response as PlaywrightResponse,
    Route
} from "@playwright/test";
import { expect, Interceptor, test } from "playwright-interceptor";
import { HOST } from "playwright-interceptor-server/src/resources/constants";

/**
 * A "pure" test: it never navigates a page. Instead it builds a fake Playwright `Page` that records
 * the handlers the Interceptor registers on `start()`, then drives those handlers directly with
 * hand-crafted fake `Route` / `Request` / `Response` objects.
 *
 * This is deliberately artificial: the goal is to force the defensive error/edge branches that a
 * real browser almost never triggers, and which therefore stayed uncovered:
 * - a non-fetch/xhr request whose `route.continue()` throws (the "ignored resource" catch),
 * - an unparsable url-encoded body (the `normalizeRequestBody` catch),
 * - an invalid `page.url()` (the `isCrossDomain` catch),
 * - `route.continue()` throwing a non-closed error (the `onRequestError` path),
 * - `response.text()` throwing (the body-read catch),
 * - `page.unroute()` rejecting on teardown (the `destroy` catch).
 */
type RouteHandler = (route: Route, request: PlaywrightRequest) => Promise<void>;

test.describe("Interceptor - pure error paths", () => {
    test("covers the defensive branches with fake route objects", async () => {
        const listeners: Record<string, (arg: unknown) => unknown> = {};
        let routeHandler: RouteHandler | undefined;
        let pageUrl = `http://${HOST}/`;
        let unrouteShouldThrow = false;

        // a fake Page that just records what the interceptor subscribes to
        const fakePage = {
            url: () => pageUrl,
            on: (event: string, handler: (arg: unknown) => unknown) => {
                listeners[event] = handler;
            },
            off: () => undefined,
            route: async (_pattern: string, handler: RouteHandler) => {
                routeHandler = handler;
            },
            unroute: async () => {
                if (unrouteShouldThrow) {
                    throw new Error("unroute failed");
                }
            }
        } as unknown as Page;

        const interceptor = new Interceptor(fakePage, { titlePath: ["pure"] });

        await interceptor.start();

        expect(routeHandler).toBeDefined();

        const handleRoute = routeHandler!;
        const handleResponse = listeners["response"]!;
        const handleRequestFailed = listeners["requestfailed"]!;

        const makeRequest = (over: Record<string, () => unknown>) =>
            ({
                resourceType: () => "fetch",
                url: () => `http://${HOST}/api/pure`,
                method: () => "GET",
                headers: () => ({}),
                postData: () => null,
                ...over
            }) as unknown as PlaywrightRequest;

        // 1) a non-fetch/xhr resource whose continue() throws -> the "ignored resource" catch
        await handleRoute(
            {
                continue: async () => {
                    throw new Error("closing");
                }
            } as unknown as Route,
            makeRequest({ resourceType: () => "image" })
        );

        // 2) a fetch with an unparsable url-encoded body (normalizeRequestBody catch) + an invalid
        //    page url (isCrossDomain catch) + continue() throwing a non-closed error, which routes
        //    through the onRequestError path.
        pageUrl = "not a valid url";

        let capturedError: unknown;

        interceptor.onRequestError((_init, error) => {
            capturedError = error;
        });

        await handleRoute(
            {
                continue: async () => {
                    throw new Error("boom");
                },
                // abort also throwing exercises the inner abort catch
                abort: async () => {
                    throw new Error("abort failed");
                }
            } as unknown as Route,
            makeRequest({
                method: () => "POST",
                headers: () => ({ "content-type": "application/x-www-form-urlencoded" }),
                // an array is an invalid URLSearchParams init and makes the parser throw
                postData: () => [1, 2, 3]
            })
        );

        expect(capturedError).toBeInstanceOf(Error);

        pageUrl = `http://${HOST}/`;

        // 3) a passthrough fetch (adds an item) followed by a response whose text() throws ->
        //    the body-read catch in handleResponse. Throwing synchronously means the fallback
        //    `sleep(BODY_READ_TIMEOUT)` is never created (no dangling timer).
        const passthroughRequest = makeRequest({ url: () => `http://${HOST}/api/pure-2` });

        await handleRoute(
            { continue: async () => undefined } as unknown as Route,
            passthroughRequest
        );

        await handleResponse({
            request: () => passthroughRequest,
            text: () => {
                throw new Error("cannot read body");
            },
            headers: () => ({}),
            status: () => 200,
            statusText: () => "OK"
        } as unknown as PlaywrightResponse);

        const item = interceptor
            .getStats()
            .find((entry) => entry.url.toString().includes("pure-2"));

        expect(item).not.toBeUndefined();
        expect(item!.response?.body).toEqual("");

        // 4) a `requestfailed` for a request that was never routed -> the early-return guard in
        //    handleRequestFailed (the request is not in the internal map).
        handleRequestFailed(makeRequest({ url: () => `http://${HOST}/api/never-seen` }));

        // 5) destroy while unroute() rejects -> the unroute catch
        unrouteShouldThrow = true;

        await interceptor.destroy();
    });
});
