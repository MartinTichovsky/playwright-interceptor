/**
 * Ported from `packages/share/e2e/serverFunctionality.cy.ts`.
 *
 * Exercises the test server's dynamic endpoint behaviour (delay, duration, request/response body,
 * response status, nested "following" requests, fire-on-click requests and response headers) and
 * verifies the interceptor logs everything correctly.
 *
 * Adaptations:
 * - The Cypress suite installs a `Cypress.on("uncaught:exception", () => false)` handler in a
 *   `beforeEach` because the static `public/` page throws an intentional error. Playwright does not
 *   fail a test on uncaught page errors, so that hook has no equivalent and is omitted.
 * - `cy.startTiming()`/`cy.stopTiming()` map to `startTiming()`/`stopTiming(timing)` from
 *   `playwright-interceptor`.
 * - The final "response headers" test cannot import `server/src/resources/dynamic` (that module
 *   touches `window`/`document`/`location` at import time and only runs in the browser). Instead the
 *   request is issued directly inside `page.evaluate`, building the same URL the dynamic helper would
 *   produce, keeping the original intent (assert the custom response headers are returned).
 */

import { expect, startTiming, stopTiming, test } from "playwright-interceptor";
import { HOST } from "playwright-interceptor-server/src/resources/constants";
import {
    DEFAULT_WAITTIME,
    generateUrl,
    getDelayWait,
    getDynamicUrl
} from "playwright-interceptor-server/src/utils";

import { getLoadedSector, getResponseBody } from "../src/selectors";
import { fireRequest, resourceTypeIt, wait } from "../src/utils";

test.describe("Testing that the Interceptor logs requests correctly", () => {
    test("With custom options", async ({ page, interceptor }) => {
        await page.goto(generateUrl("public/"));

        await interceptor.waitUntilRequestIsDone();

        expect(interceptor.callStack.length).toEqual(2);

        expect(interceptor.getStats()).toHaveLength(2);

        const getStats = interceptor.getStats({ method: "GET", resourceType: "fetch" });

        expect(getStats[0]).not.toBeUndefined();
        expect(getStats[0].delay).toBeUndefined();
        expect(getStats[0].resourceType).toEqual("fetch");
        expect(getStats[0].url.toString()).toEqual(`http://${HOST}/fetch`);

        const postStats = interceptor.getStats({ method: "POST", resourceType: "fetch" });

        expect(postStats[0]).not.toBeUndefined();
        expect(postStats[0].delay).toBeUndefined();
        expect(postStats[0].resourceType).toEqual("fetch");
        expect(postStats[0].url.toString()).toEqual(`http://${HOST}/fetch`);
    });
});

test.describe("Testing that the server works correctly", () => {
    const testPath1 = "api-1";
    const testPath2 = "api-2";
    const testPath3 = "api-3";
    const testPath4 = "api-4";
    const testPath5 = "api-5";

    resourceTypeIt("Delay", async (resourceType, { page, interceptor }) => {
        const delay = 1500;

        await page.goto(
            getDynamicUrl([
                { delay, path: resourceType, type: resourceType, method: "GET" },
                { delay, path: resourceType, type: resourceType, method: "POST" }
            ])
        );

        expect(interceptor.callStack.length).toEqual(0);

        expect(interceptor.getStats({ resourceType })).toHaveLength(0);

        await wait(delay / 2);

        expect(interceptor.getStats({ resourceType })).toHaveLength(0);

        await wait(getDelayWait(delay / 2));
        await interceptor.waitUntilRequestIsDone();

        const stats = interceptor.getStats({ resourceType });

        expect(stats).toHaveLength(2);
        expect(stats[0].delay).toBeUndefined();
        expect(stats[0].isPending).toBe(false);
        expect(stats[1].delay).toBeUndefined();
        expect(stats[1].isPending).toBe(false);
    });

    resourceTypeIt("Duration", async (resourceType, { page, interceptor }) => {
        test.setTimeout(60000);

        const duration = 5000;

        await page.goto(
            getDynamicUrl([
                { duration, path: resourceType, type: resourceType, method: "GET" },
                { duration, path: resourceType, type: resourceType, method: "POST" }
            ])
        );

        const timing = startTiming();

        await wait(DEFAULT_WAITTIME);

        expect(interceptor.callStack.length).toEqual(2);

        let stats = interceptor.getStats({ resourceType });

        expect(stats).toHaveLength(2);
        expect(stats[0].isPending).toBe(true);
        expect(stats[1].isPending).toBe(true);

        await wait(duration / 2);

        stats = interceptor.getStats({ resourceType });

        expect(stats).toHaveLength(2);
        expect(stats[0].isPending).toBe(true);
        expect(stats[1].isPending).toBe(true);

        await interceptor.waitUntilRequestIsDone();

        stats = interceptor.getStats({ resourceType });

        expect(stats).toHaveLength(2);
        expect(stats[0].duration).toBeGreaterThanOrEqual(duration);
        expect(stats[0].isPending).toBe(false);
        expect(stats[1].duration).toBeGreaterThanOrEqual(duration);
        expect(stats[1].isPending).toBe(false);

        expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration);
    });

    resourceTypeIt("Body and Response - POST", async (resourceType, { page, interceptor }) => {
        const query = {
            val1: "value1",
            val2: "123"
        };
        const requestBody = {
            bool: true,
            num: 123,
            object: { arr: [1, 2], bool: false, str: "value" },
            property: "something"
        };
        const responseBody = {
            ...requestBody,
            arr: ["string", 0, 9]
        };

        await page.goto(
            getDynamicUrl([
                {
                    body: requestBody,
                    path: resourceType,
                    query,
                    responseBody,
                    type: resourceType,
                    method: "POST"
                }
            ])
        );

        await interceptor.waitUntilRequestIsDone();

        const stats = interceptor.getLastRequest();

        expect(stats).not.toBeUndefined();
        expect(stats!.request.query).toHaveProperty("val1", query.val1);
        expect(stats!.request.query).toHaveProperty("val2", query.val2);
        expect(stats!.request.body).toEqual(JSON.stringify(requestBody));
        expect(stats!.response).not.toBeUndefined();
        expect(stats!.response!.body).toEqual(JSON.stringify(responseBody));
    });

    resourceTypeIt("Body and Response - GET", async (resourceType, { page, interceptor }) => {
        const query = {
            val1: "value2",
            val2: "432"
        };
        const responseBody = {
            property: "something",
            num: 321,
            arr: [false, 999, "abc"]
        };

        await page.goto(
            getDynamicUrl([
                {
                    path: resourceType,
                    query,
                    responseBody,
                    type: resourceType,
                    method: "GET"
                }
            ])
        );

        await interceptor.waitUntilRequestIsDone();

        const stats = interceptor.getLastRequest();

        expect(stats).not.toBeUndefined();
        expect(stats!.request.query).toHaveProperty("val1", query.val1);
        expect(stats!.request.query).toHaveProperty("val2", query.val2);
        expect(stats!.response).not.toBeUndefined();
        expect(stats!.response!.body).toEqual(JSON.stringify(responseBody));
    });

    test("Response status", async ({ page, interceptor }) => {
        const fetchGetPath = "fetch-get";
        const fetchGetResponseStatus = 405;
        const fethPostPath = "fetch-post";
        const fetchPostResponseStatus = 301;

        const xhrGetPath = "xhr-get";
        const xhrGetResponseStatus = 202;
        const xhrPostPath = "xhr-post";
        const xhrPostResponseStatus = 204;

        await page.goto(
            getDynamicUrl([
                {
                    path: fetchGetPath,
                    status: fetchGetResponseStatus,
                    type: "fetch",
                    method: "GET"
                },
                {
                    path: fethPostPath,
                    status: fetchPostResponseStatus,
                    type: "fetch",
                    method: "GET"
                },
                {
                    path: xhrGetPath,
                    status: xhrGetResponseStatus,
                    type: "xhr",
                    method: "GET"
                },
                {
                    path: xhrPostPath,
                    status: xhrPostResponseStatus,
                    type: "xhr",
                    method: "POST"
                }
            ])
        );

        await interceptor.waitUntilRequestIsDone();

        const fetchGetStats = interceptor.getLastRequest(`**/${fetchGetPath}`);

        expect(fetchGetStats).not.toBeUndefined();
        expect(fetchGetStats!.response).not.toBeUndefined();
        expect(fetchGetStats!.response!.statusCode).toEqual(fetchGetResponseStatus);

        const fetchPostStats = interceptor.getLastRequest(`**/${fethPostPath}`);

        expect(fetchPostStats).not.toBeUndefined();
        expect(fetchPostStats!.response).not.toBeUndefined();
        expect(fetchPostStats!.response!.statusCode).toEqual(fetchPostResponseStatus);

        const xhrGetStats = interceptor.getLastRequest(`**/${xhrGetPath}`);

        expect(xhrGetStats).not.toBeUndefined();
        expect(xhrGetStats!.response).not.toBeUndefined();
        expect(xhrGetStats!.response!.statusCode).toEqual(xhrGetResponseStatus);

        const xhrPostStats = interceptor.getLastRequest(`**/${xhrPostPath}`);

        expect(xhrPostStats).not.toBeUndefined();
        expect(xhrPostStats!.response).not.toBeUndefined();
        expect(xhrPostStats!.response!.statusCode).toEqual(xhrPostResponseStatus);
    });

    test("Following Requests - Multiple", async ({ page, interceptor }) => {
        test.setTimeout(60000);

        const duration1 = 1000;
        const duration2 = 1500;
        const duration3 = 2500;
        const duration4 = 1400;
        const duration5 = 1200;

        await page.goto(
            getDynamicUrl([
                {
                    delay: 100,
                    duration: duration1,
                    method: "POST",
                    path: testPath1,
                    requests: [
                        {
                            duration: duration2,
                            method: "GET",
                            path: testPath2,
                            requests: [
                                {
                                    duration: duration4,
                                    fetchObjectInit: true,
                                    method: "POST",
                                    path: testPath4,
                                    type: "fetch"
                                }
                            ],
                            type: "xhr"
                        },
                        {
                            duration: duration3,
                            path: testPath3,
                            method: "GET",
                            requests: [
                                {
                                    duration: duration5,
                                    method: "POST",
                                    path: testPath5,
                                    type: "xhr"
                                }
                            ],
                            type: "fetch"
                        }
                    ],
                    type: "fetch"
                }
            ])
        );

        const timing = startTiming();

        await interceptor.waitUntilRequestIsDone();

        expect(interceptor.getStats()).toHaveLength(5);

        const fetchStats = interceptor.getStats({ resourceType: "fetch" });

        expect(fetchStats[0].delay).toBeUndefined();
        expect(fetchStats[0].duration).toBeGreaterThanOrEqual(duration1);
        expect(fetchStats[0].isPending).toBe(false);
        expect(fetchStats[0].url.pathname.endsWith(testPath1)).toBe(true);

        expect(fetchStats[1].delay).toBeUndefined();
        expect(fetchStats[1].duration).toBeGreaterThanOrEqual(duration3);
        expect(fetchStats[1].isPending).toBe(false);
        expect(fetchStats[1].url.pathname.endsWith(testPath3)).toBe(true);

        expect(fetchStats[2].delay).toBeUndefined();
        expect(fetchStats[2].duration).toBeGreaterThanOrEqual(duration4);
        expect(fetchStats[2].isPending).toBe(false);
        expect(fetchStats[2].url.pathname.endsWith(testPath4)).toBe(true);

        const xhrStats = interceptor.getStats({ resourceType: "xhr" });

        expect(xhrStats[0].delay).toBeUndefined();
        expect(xhrStats[0].duration).toBeGreaterThanOrEqual(duration2);
        expect(xhrStats[0].isPending).toBe(false);
        expect(xhrStats[0].url.pathname.endsWith(testPath2)).toBe(true);

        expect(xhrStats[1].delay).toBeUndefined();
        expect(xhrStats[1].duration).toBeGreaterThanOrEqual(duration5);
        expect(xhrStats[1].isPending).toBe(false);
        expect(xhrStats[1].url.pathname.endsWith(testPath5)).toBe(true);

        expect(stopTiming(timing)).toBeGreaterThanOrEqual(
            Math.max(duration1 + duration2 + duration4, duration1 + duration3 + duration5)
        );
    });

    test("Request on Click - No delay", async ({ page, interceptor }) => {
        const responseBody = { respoonse: "RESPONSE TEXT" };

        await page.goto(
            getDynamicUrl([
                {
                    fireOnClick: true,
                    path: testPath1,
                    method: "GET",
                    type: "fetch"
                },
                {
                    fireOnClick: true,
                    path: testPath2,
                    method: "POST",
                    type: "xhr"
                },
                {
                    fetchObjectInit: true,
                    fireOnClick: true,
                    method: "POST",
                    path: testPath3,
                    responseBody,
                    type: "fetch"
                }
            ])
        );

        await expect(getLoadedSector(page, testPath1)).toHaveCount(0);

        await fireRequest(page);

        await interceptor.waitUntilRequestIsDone();

        await expect(getLoadedSector(page, testPath1)).toHaveCount(1);
        await expect(getLoadedSector(page, testPath2)).toHaveCount(0);

        await fireRequest(page);

        await interceptor.waitUntilRequestIsDone();

        await expect(getLoadedSector(page, testPath2)).toHaveCount(1);
        await expect(getLoadedSector(page, testPath3)).toHaveCount(0);

        await fireRequest(page);

        await interceptor.waitUntilRequestIsDone();

        await expect(getLoadedSector(page, testPath3)).toHaveCount(1);
        expect(await getResponseBody(page, testPath3)).toEqual(responseBody);
    });

    test("Request on Click - with delay", async ({ page, interceptor }) => {
        test.setTimeout(60000);

        const delayDuration1 = 500;
        const delayDuration2 = 1500;
        const delayDuration3 = 2500;

        const responseBody = { respoonse: "RESPONSE TEXT" };

        await page.goto(
            getDynamicUrl([
                {
                    delay: delayDuration1,
                    duration: delayDuration1,
                    fireOnClick: true,
                    method: "GET",
                    path: testPath1,
                    type: "fetch"
                },
                {
                    delay: delayDuration2,
                    duration: delayDuration2,
                    fireOnClick: true,
                    method: "POST",
                    path: testPath2,
                    type: "xhr"
                },
                {
                    delay: delayDuration3,
                    duration: delayDuration3,
                    fireOnClick: true,
                    method: "POST",
                    path: testPath3,
                    responseBody,
                    type: "fetch"
                }
            ])
        );

        await expect(getLoadedSector(page, testPath1)).toHaveCount(0);

        await fireRequest(page);

        expect(interceptor.getLastRequest(`**/${testPath1}`)).toBeUndefined();
        await expect(getLoadedSector(page, testPath1)).toHaveCount(0);

        await wait(delayDuration1 / 2);

        expect(interceptor.getLastRequest(`**/${testPath1}`)).toBeUndefined();
        await expect(getLoadedSector(page, testPath1)).toHaveCount(0);

        await wait(delayDuration1 / 2);

        await expect
            .poll(() => interceptor.getLastRequest(`**/${testPath1}`) !== undefined)
            .toBe(true);
        await expect(getLoadedSector(page, testPath1)).toHaveCount(0);

        await interceptor.waitUntilRequestIsDone();

        await expect(getLoadedSector(page, testPath1)).toHaveCount(1);

        // next request

        await expect(getLoadedSector(page, testPath2)).toHaveCount(0);

        await fireRequest(page);

        expect(interceptor.getLastRequest(`**/${testPath2}`)).toBeUndefined();
        await expect(getLoadedSector(page, testPath2)).toHaveCount(0);

        await wait(delayDuration2 / 2);

        expect(interceptor.getLastRequest(`**/${testPath2}`)).toBeUndefined();
        await expect(getLoadedSector(page, testPath2)).toHaveCount(0);

        await wait(delayDuration2 / 2);

        await expect
            .poll(() => interceptor.getLastRequest(`**/${testPath2}`) !== undefined)
            .toBe(true);
        await expect(getLoadedSector(page, testPath2)).toHaveCount(0);

        await interceptor.waitUntilRequestIsDone();

        await expect(getLoadedSector(page, testPath2)).toHaveCount(1);

        // next request

        await expect(getLoadedSector(page, testPath3)).toHaveCount(0);

        await fireRequest(page);

        expect(interceptor.getLastRequest(`**/${testPath3}`)).toBeUndefined();
        await expect(getLoadedSector(page, testPath3)).toHaveCount(0);

        await wait(delayDuration3 / 2);

        expect(interceptor.getLastRequest(`**/${testPath3}`)).toBeUndefined();
        await expect(getLoadedSector(page, testPath3)).toHaveCount(0);

        await wait(delayDuration3 / 2);

        await expect
            .poll(() => interceptor.getLastRequest(`**/${testPath3}`) !== undefined)
            .toBe(true);
        await expect(getLoadedSector(page, testPath3)).toHaveCount(0);

        await interceptor.waitUntilRequestIsDone();

        await expect(getLoadedSector(page, testPath3)).toHaveCount(1);
        expect(await getResponseBody(page, testPath3)).toEqual(responseBody);
    });

    test("Should return response headers", async ({ page, interceptor }) => {
        await interceptor.destroy();

        const responseHeaders = {
            "X-Custom-Header": "custom-value",
            "My-Header": "my-value"
        };

        await page.goto("/");

        const result = await page.evaluate(
            async ({ path, responseHeaders }) => {
                const url = new URL(`/${path}`, window.location.origin);

                url.searchParams.set("responseHeaders", JSON.stringify(responseHeaders));
                url.searchParams.set("status", "200");

                const response = await fetch(url.toString(), {
                    headers: { "Content-Type": "application/json" },
                    method: "GET"
                });

                const received: Record<string, string | null> = {};

                Object.keys(responseHeaders).forEach((key) => {
                    received[key] = response.headers.get(key);
                });

                return received;
            },
            { path: "response-headers", responseHeaders }
        );

        // the response contains the expected custom headers from responseHeaders
        Object.entries(responseHeaders).forEach(([key, value]) => {
            expect(result[key]).toEqual(value);
        });
    });
});
