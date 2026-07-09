/**
 * Ported from `packages/share/e2e/wait.cy.ts`.
 *
 * Exercises `interceptor.waitUntilRequestIsDone` in all its shapes: canceled requests, the
 * `enforceCheck` flag, the string/RegExp/options matchers, the `waitForNextRequest` option, the
 * timeout (expected-fail) behaviour and the "provide an action" overload.
 *
 * Adaptations:
 * - Cypress commands map to Playwright as documented in the task: `cy.visit` -> `page.goto`,
 *   `cy.reload` -> `page.reload`, `cy.wait(ms)` -> `wait(ms)`, `cy.startTiming/stopTiming` ->
 *   `startTiming()/stopTiming(t)`, `cy.resetInterceptorWatch()` -> `interceptor.resetWatch()`,
 *   `cy.interceptorOptions()` -> `interceptor.setOptions()`,
 *   `cy.throttleInterceptorRequest()` -> `interceptor.throttleRequest()`.
 * - The "Expected fail" suite relied on Cypress' `fail` event plus `Cypress.env(...)` to swap the
 *   default request timeout (20000 in the Cypress config). Playwright resolves the interceptor's
 *   default timeout once when the fixture is created (10000 when `INTERCEPTOR_REQUEST_TIMEOUT` is
 *   unset, as it is here), and it cannot be changed per-test. The intent - "the wait rejects when
 *   the matching request never finishes" - is ported with `expect(...).rejects.toThrow()`. Where the
 *   Cypress test asserted the elapsed time matched the (env) default timeout, the assertion is kept
 *   against the value actually in effect for Playwright (the fixture default, or an explicit
 *   `timeout` option). This is noted inline on each affected test.
 */

import { expect, IRequestInit, startTiming, stopTiming, test } from "playwright-interceptor";
import { crossDomainFetch, HOST } from "playwright-interceptor-server/src/resources/constants";
import { DynamicRequest } from "playwright-interceptor-server/src/types";
import { getDynamicUrl } from "playwright-interceptor-server/src/utils";

import { fireRequest, testCaseDescribe, testCaseIt, toRegExp, wait } from "../src/utils";

test.describe("Wait For Requests", () => {
    const testPath_api_1 = "test/api-1";
    const testPath_api_2 = "test/api-2";
    const testPath_api_3 = "test/api-3";
    const testPath_api_4 = "test/api-4";

    const delay = 1000;
    const duration = 1500;
    const doubleDuration = duration * 2;
    const tripleDuration = duration * 3;

    test.describe("Canceled requests", () => {
        test("POST request without body", async ({ page, interceptor }) => {
            await page.goto(
                getDynamicUrl([
                    {
                        cancelIn: duration / 2,
                        delay: 100,
                        duration,
                        method: "POST",
                        path: testPath_api_1,
                        type: "fetch"
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone({ resourceType: "fetch" });

            const stats = interceptor.getStats({ resourceType: "fetch" });

            expect(stats).toHaveLength(1);
            expect(stats[0].isPending).toBe(false);
            expect(stats[0].requestError).not.toBeUndefined();
        });

        test("GET request", async ({ page, interceptor }) => {
            await page.goto(
                getDynamicUrl([
                    {
                        cancelIn: duration / 2,
                        delay: 100,
                        duration,
                        method: "GET",
                        path: testPath_api_1,
                        type: "fetch"
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone({ resourceType: "fetch" });

            const stats = interceptor.getStats({ resourceType: "fetch" });

            expect(stats).toHaveLength(1);
            expect(stats[0].isPending).toBe(false);
            expect(stats[0].requestError).not.toBeUndefined();
        });

        test("On fetch error", async ({ page, interceptor }) => {
            let error: Error | undefined;
            let init: IRequestInit | undefined;
            let calls = 0;

            interceptor.onRequestError((_init, _error) => {
                calls++;
                init = _init;
                error = _error;
            });

            await page.goto(
                getDynamicUrl([
                    {
                        cancelIn: 1000,
                        delay: 100,
                        duration,
                        method: "GET",
                        path: testPath_api_1,
                        type: "fetch"
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone({ resourceType: "fetch" });

            expect(calls).toBe(1);
            expect(init).not.toBeUndefined();
            expect(init!.url.toString()).toEqual(
                `http://${HOST}/${testPath_api_1}?duration=1500&path=${encodeURIComponent(testPath_api_1)}`
            );
            expect(error).not.toBeUndefined();

            const stats = interceptor.getStats({ resourceType: "fetch" });

            expect(stats).toHaveLength(1);
            expect(stats[0].isPending).toBe(false);
            expect(stats[0].requestError).not.toBeUndefined();
        });

        testCaseIt(
            "POST request",
            async (resourceType, bodyFormat, responseCatchType, { page, interceptor }) => {
                await page.goto(
                    getDynamicUrl([
                        {
                            bodyFormat,
                            cancelIn: duration / 2,
                            body: { data: 5 },
                            delay: 100,
                            duration,
                            method: "POST",
                            path: testPath_api_1,
                            responseBody: { response: "some" },
                            responseCatchType,
                            type: resourceType
                        }
                    ])
                );

                await interceptor.waitUntilRequestIsDone({ resourceType });

                const stats = interceptor.getStats({ resourceType });

                expect(stats).toHaveLength(1);
                expect(stats[0].isPending).toBe(false);
                expect(stats[0].requestError).not.toBeUndefined();
            }
        );

        test("Refresh during XHR request", async ({ page, interceptor }) => {
            await page.goto(
                getDynamicUrl([
                    {
                        delay: 100,
                        duration,
                        method: "POST",
                        path: testPath_api_1,
                        type: "xhr"
                    }
                ])
            );

            await wait(duration / 2);

            await page.reload();

            await interceptor.waitUntilRequestIsDone({ resourceType: "xhr" });

            const stats = interceptor.getStats({ resourceType: "xhr" });

            expect(stats).toHaveLength(2);
            expect(stats[0].isPending).toBe(false);
            expect(stats[0].requestError).not.toBeUndefined();
            expect(stats[1].isPending).toBe(false);
            expect(stats[1].requestError).toBeUndefined();

            expect(interceptor.requestCalls({ resourceType: "xhr" })).toEqual(2);
        });

        test("Refresh during Fetch request", async ({ page, interceptor }) => {
            await page.goto(
                getDynamicUrl([
                    {
                        delay: 100,
                        duration,
                        method: "POST",
                        path: testPath_api_1,
                        type: "fetch"
                    }
                ])
            );

            await wait(duration / 2);

            await page.reload();

            await interceptor.waitUntilRequestIsDone({ resourceType: "fetch" });

            const stats = interceptor.getStats({ resourceType: "fetch" });

            expect(stats).toHaveLength(2);
            expect(stats[0].isPending).toBe(false);
            expect(stats[0].requestError).not.toBeUndefined();
            expect(stats[1].isPending).toBe(false);
            expect(stats[1].requestError).toBeUndefined();
        });

        test("Multiple requests - fast cancel", async ({ page, interceptor }) => {
            const timing = startTiming();

            await page.goto(
                getDynamicUrl([
                    {
                        cancelIn: 100,
                        delay: 100,
                        duration,
                        method: "POST",
                        path: testPath_api_1,
                        type: "fetch"
                    },
                    {
                        delay: 100,
                        duration,
                        method: "POST",
                        path: testPath_api_1,
                        type: "fetch"
                    },
                    {
                        delay: 100,
                        duration,
                        method: "POST",
                        path: testPath_api_2,
                        type: "xhr"
                    },
                    {
                        cancelIn: 100,
                        delay: 100,
                        duration,
                        method: "POST",
                        path: testPath_api_2,
                        type: "xhr"
                    },
                    {
                        delay: 100,
                        duration,
                        method: "GET",
                        path: testPath_api_3,
                        type: "fetch"
                    },
                    {
                        cancelIn: 100,
                        delay: 200,
                        duration,
                        method: "GET",
                        path: testPath_api_3,
                        type: "fetch"
                    },
                    {
                        delay: 100,
                        duration,
                        method: "GET",
                        path: testPath_api_4,
                        type: "xhr"
                    },
                    {
                        cancelIn: 100,
                        delay: 200,
                        duration,
                        method: "GET",
                        path: testPath_api_4,
                        type: "xhr"
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone({ resourceType: ["fetch", "xhr"] });

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration);
        });

        test("Multiple requests - slow cancel", async ({ page, interceptor }) => {
            const duration = 3000;

            const timing = startTiming();

            await page.goto(
                getDynamicUrl([
                    {
                        cancelIn: duration / 2,
                        delay: 100,
                        duration,
                        fetchObjectInit: true,
                        jsonResponse: false,
                        method: "POST",
                        path: testPath_api_1,
                        type: "fetch"
                    },
                    {
                        delay: 200,
                        duration,
                        fetchObjectInit: true,
                        jsonResponse: false,
                        method: "POST",
                        path: testPath_api_2,
                        type: "fetch"
                    },
                    {
                        cancelIn: duration / 2,
                        delay: 100,
                        duration,
                        fetchObjectInit: true,
                        jsonResponse: false,
                        method: "POST",
                        path: testPath_api_3,
                        type: "xhr"
                    },
                    {
                        delay: 200,
                        duration,
                        fetchObjectInit: true,
                        jsonResponse: false,
                        method: "POST",
                        path: testPath_api_4,
                        type: "xhr"
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone({ resourceType: ["fetch", "xhr"] });

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration);

            const statsFetch = interceptor.getStats({ resourceType: "fetch" });

            expect(statsFetch).toHaveLength(2);
            expect(statsFetch[0].isPending).toBe(false);
            expect(statsFetch[0].requestError).not.toBeUndefined();
            expect(statsFetch[0].resourceType).toEqual("fetch");
            expect(statsFetch[1].isPending).toBe(false);
            expect(statsFetch[1].requestError).toBeUndefined();
            expect(statsFetch[1].resourceType).toEqual("fetch");

            const statsXhr = interceptor.getStats({ resourceType: "xhr" });

            expect(statsXhr).toHaveLength(2);
            expect(statsXhr[0].isPending).toBe(false);
            expect(statsXhr[0].requestError).not.toBeUndefined();
            expect(statsXhr[0].resourceType).toEqual("xhr");
            expect(statsXhr[1].isPending).toBe(false);
            expect(statsXhr[1].requestError).toBeUndefined();
            expect(statsXhr[1].resourceType).toEqual("xhr");

            expect(interceptor.requestCalls({ resourceType: "fetch" })).toEqual(2);
            expect(interceptor.requestCalls({ resourceType: "xhr" })).toEqual(2);
            expect(interceptor.requestCalls({ resourceType: ["fetch", "xhr"] })).toEqual(4);
        });
    });

    test.describe("Enforce check = false", () => {
        test("By resource type", async ({ page, interceptor }) => {
            const timeout = 5000;

            const timing = startTiming();

            await page.goto(
                getDynamicUrl([
                    {
                        delay: 200,
                        duration: timeout * 2,
                        method: "POST",
                        path: testPath_api_1,
                        type: "fetch"
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone({
                enforceCheck: false,
                resourceType: "xhr",
                timeout
            });

            expect(stopTiming(timing)).toBeLessThan(timeout);

            expect(interceptor.getStats({ resourceType: "xhr" })).toHaveLength(0);

            const statsFetch = interceptor.getStats({ resourceType: "fetch" });

            expect(statsFetch).toHaveLength(1);
            expect(statsFetch[0].isPending).toBe(true);
        });

        test("By URL match", async ({ page, interceptor }) => {
            const timeout = 5000;

            const timing = startTiming();

            await page.goto(
                getDynamicUrl([
                    {
                        delay: 200,
                        duration: timeout * 2,
                        method: "POST",
                        path: testPath_api_1,
                        type: "fetch"
                    },
                    {
                        delay: 200,
                        duration: timeout * 2,
                        method: "POST",
                        path: testPath_api_2,
                        type: "xhr"
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone({
                enforceCheck: false,
                url: `**/${testPath_api_3}`,
                timeout
            });

            expect(stopTiming(timing)).toBeLessThan(timeout);

            const statsXhr = interceptor.getStats({ resourceType: "xhr" });

            expect(statsXhr).toHaveLength(1);
            expect(statsXhr[0].isPending).toBe(true);

            const statsFetch = interceptor.getStats({ resourceType: "fetch" });

            expect(statsFetch).toHaveLength(1);
            expect(statsFetch[0].isPending).toBe(true);
        });

        test("Must wait for the pending request", async ({ page, interceptor }) => {
            const timing = startTiming();

            await page.goto(
                getDynamicUrl([
                    {
                        delay: 200,
                        duration: doubleDuration,
                        method: "POST",
                        path: testPath_api_1,
                        type: "fetch"
                    },
                    {
                        delay: 200,
                        duration,
                        method: "POST",
                        path: testPath_api_2,
                        type: "xhr"
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone({
                enforceCheck: false,
                url: `**/${testPath_api_2}`
            });

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration);

            const statsXhr = interceptor.getStats({ resourceType: "xhr" });

            expect(statsXhr).toHaveLength(1);
            expect(statsXhr[0].isPending).toBe(false);

            const statsFetch = interceptor.getStats({ resourceType: "fetch" });

            expect(statsFetch).toHaveLength(1);
            expect(statsFetch[0].isPending).toBe(true);
        });
    });

    testCaseDescribe(
        "Enforce check = true",
        (resourceType, bodyFormat, responseCatchType, testName) => {
            test(testName("With following request - auto"), async ({ page, interceptor }) => {
                const timing = startTiming();

                await page.goto(
                    getDynamicUrl([
                        {
                            bodyFormat,
                            delay: 100,
                            duration,
                            method: "POST",
                            path: testPath_api_1,
                            requests: [
                                {
                                    bodyFormat,
                                    delay,
                                    duration: tripleDuration,
                                    method: "POST",
                                    path: testPath_api_2,
                                    responseCatchType,
                                    type: resourceType
                                }
                            ],
                            responseCatchType,
                            type: resourceType
                        }
                    ])
                );

                await interceptor.waitUntilRequestIsDone(`**/${testPath_api_2}`);

                expect(stopTiming(timing)).toBeGreaterThanOrEqual(
                    delay + duration + tripleDuration
                );

                const stats = interceptor.getStats({ resourceType });

                expect(stats).toHaveLength(2);
                expect(stats[0].isPending).toBe(false);
                expect(stats[1].isPending).toBe(false);
            });

            test(testName("With following request - by click"), async ({ page, interceptor }) => {
                let timing = startTiming();

                await page.goto(
                    getDynamicUrl([
                        {
                            bodyFormat,
                            delay: 100,
                            duration,
                            method: "POST",
                            path: testPath_api_1,
                            requests: [
                                {
                                    bodyFormat,
                                    delay,
                                    duration: tripleDuration,
                                    fireOnClick: true,
                                    method: "POST",
                                    path: testPath_api_2,
                                    responseCatchType,
                                    type: resourceType
                                }
                            ],
                            responseCatchType,
                            type: resourceType
                        }
                    ])
                );

                await interceptor.waitUntilRequestIsDone(`**/${testPath_api_1}`);

                expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration);

                let stats = interceptor.getStats({ resourceType });

                expect(stats).toHaveLength(1);
                expect(stats[0].isPending).toBe(false);

                timing = startTiming();

                await fireRequest(page);

                await interceptor.waitUntilRequestIsDone(`**/${testPath_api_2}`);

                expect(stopTiming(timing)).toBeGreaterThanOrEqual(delay + tripleDuration);

                stats = interceptor.getStats({ resourceType });

                expect(stats).toHaveLength(2);
                expect(stats[0].isPending).toBe(false);
                expect(stats[1].isPending).toBe(false);
            });

            test(
                testName("With following repetitive request - by click (resetInterceptorWatch)"),
                async ({ page, interceptor }) => {
                    await page.goto(
                        getDynamicUrl([
                            {
                                bodyFormat,
                                delay: 100,
                                method: "POST",
                                path: testPath_api_1,
                                requests: [
                                    {
                                        bodyFormat,
                                        delay,
                                        duration: tripleDuration,
                                        fireOnClick: true,
                                        method: "POST",
                                        path: testPath_api_2,
                                        responseCatchType,
                                        type: resourceType
                                    }
                                ],
                                responseCatchType,
                                type: resourceType
                            },
                            {
                                bodyFormat,
                                delay: 200,
                                method: "POST",
                                path: testPath_api_2,
                                responseCatchType,
                                type: resourceType
                            }
                        ])
                    );

                    await interceptor.waitUntilRequestIsDone(
                        {
                            url: new RegExp(
                                `(${toRegExp(testPath_api_1)})|(${toRegExp(testPath_api_2)})$`,
                                "gi"
                            )
                        },
                        "waitUntilRequestIsDone with RegExp"
                    );

                    let stats = interceptor.getStats({ resourceType });

                    expect(stats).toHaveLength(2);
                    expect(stats[0].isPending).toBe(false);
                    expect(stats[1].isPending).toBe(false);

                    interceptor.resetWatch();

                    const timing = startTiming();

                    await fireRequest(page);

                    await interceptor.waitUntilRequestIsDone(`**/${testPath_api_2}`);

                    expect(stopTiming(timing)).toBeGreaterThanOrEqual(delay + tripleDuration);

                    stats = interceptor.getStats({ resourceType });

                    expect(stats).toHaveLength(3);
                    expect(stats[0].isPending).toBe(false);
                    expect(stats[1].isPending).toBe(false);
                    expect(stats[2].isPending).toBe(false);
                }
            );

            test(testName("With requests in progress - auto"), async ({ page, interceptor }) => {
                const timing = startTiming();

                await page.goto(
                    getDynamicUrl([
                        {
                            bodyFormat,
                            delay: 100,
                            method: "POST",
                            path: testPath_api_1,
                            requests: [
                                {
                                    bodyFormat,
                                    delay,
                                    duration: tripleDuration,
                                    method: "POST",
                                    path: testPath_api_2,
                                    responseCatchType,
                                    type: resourceType
                                }
                            ],
                            responseCatchType,
                            type: resourceType
                        },
                        {
                            bodyFormat,
                            delay: 200,
                            duration: tripleDuration * 2,
                            method: "POST",
                            path: testPath_api_1,
                            responseCatchType,
                            type: resourceType
                        },
                        {
                            bodyFormat,
                            delay: 300,
                            duration: tripleDuration * 3,
                            method: "POST",
                            path: testPath_api_3,
                            responseCatchType,
                            type: resourceType
                        }
                    ])
                );

                await interceptor.waitUntilRequestIsDone(`**/${testPath_api_2}`);

                expect(stopTiming(timing)).toBeGreaterThanOrEqual(delay + tripleDuration);

                const stats = interceptor.getStats({ resourceType });

                expect(stats).toHaveLength(4);
                expect(stats[0].isPending).toBe(false);
                expect(stats[0].url.pathname.endsWith(testPath_api_1)).toBe(true);
                expect(stats[1].isPending).toBe(true);
                expect(stats[1].url.pathname.endsWith(testPath_api_1)).toBe(true);
                expect(stats[2].isPending).toBe(true);
                expect(stats[2].url.pathname.endsWith(testPath_api_3)).toBe(true);
                expect(stats[3].isPending).toBe(false);
                expect(stats[3].url.pathname.endsWith(testPath_api_2)).toBe(true);
            });

            test(
                testName("With requests in progress - by click (resetInterceptorWatch)"),
                async ({ page, interceptor }) => {
                    await page.goto(
                        getDynamicUrl([
                            {
                                bodyFormat,
                                delay: 100,
                                method: "POST",
                                path: testPath_api_1,
                                requests: [
                                    {
                                        bodyFormat,
                                        delay,
                                        duration: tripleDuration,
                                        fireOnClick: true,
                                        method: "POST",
                                        path: testPath_api_2,
                                        responseCatchType,
                                        type: resourceType
                                    }
                                ],
                                responseCatchType,
                                type: resourceType
                            },
                            {
                                bodyFormat,
                                delay: 200,
                                duration: tripleDuration * 2,
                                method: "POST",
                                path: testPath_api_2,
                                responseCatchType,
                                type: resourceType
                            },
                            {
                                bodyFormat,
                                delay: 300,
                                duration: tripleDuration * 2,
                                method: "POST",
                                path: testPath_api_2,
                                responseCatchType,
                                type: resourceType
                            },
                            {
                                bodyFormat,
                                delay: 400,
                                duration: tripleDuration * 3,
                                method: "POST",
                                path: testPath_api_3,
                                responseCatchType,
                                type: resourceType
                            },
                            {
                                bodyFormat,
                                delay: 500,
                                duration: tripleDuration * 3,
                                method: "POST",
                                path: testPath_api_3,
                                responseCatchType,
                                type: resourceType
                            }
                        ])
                    );

                    await interceptor.waitUntilRequestIsDone(`**/${testPath_api_1}`);

                    let stats = interceptor.getStats({ resourceType });

                    expect(stats).toHaveLength(5);
                    expect(stats[0].isPending).toBe(false);
                    expect(stats[0].url.pathname.endsWith(testPath_api_1)).toBe(true);
                    expect(stats[1].isPending).toBe(true);
                    expect(stats[1].url.pathname.endsWith(testPath_api_2)).toBe(true);
                    expect(stats[2].isPending).toBe(true);
                    expect(stats[2].url.pathname.endsWith(testPath_api_2)).toBe(true);
                    expect(stats[3].isPending).toBe(true);
                    expect(stats[3].url.pathname.endsWith(testPath_api_3)).toBe(true);
                    expect(stats[4].isPending).toBe(true);
                    expect(stats[4].url.pathname.endsWith(testPath_api_3)).toBe(true);

                    interceptor.resetWatch();

                    await fireRequest(page);

                    await interceptor.waitUntilRequestIsDone(`**/${testPath_api_2}`);

                    stats = interceptor.getStats({ resourceType });

                    expect(stats).toHaveLength(6);
                    expect(stats[0].isPending).toBe(false);
                    expect(stats[0].url.pathname.endsWith(testPath_api_1)).toBe(true);
                    expect(stats[1].isPending).toBe(true);
                    expect(stats[1].url.pathname.endsWith(testPath_api_2)).toBe(true);
                    expect(stats[2].isPending).toBe(true);
                    expect(stats[2].url.pathname.endsWith(testPath_api_2)).toBe(true);
                    expect(stats[3].isPending).toBe(true);
                    expect(stats[3].url.pathname.endsWith(testPath_api_3)).toBe(true);
                    expect(stats[4].isPending).toBe(true);
                    expect(stats[4].url.pathname.endsWith(testPath_api_3)).toBe(true);
                    expect(stats[5].isPending).toBe(false);
                    expect(stats[5].url.pathname.endsWith(testPath_api_2)).toBe(true);
                }
            );

            test(testName("Ignore Cross Domain request"), async ({ page, interceptor }) => {
                interceptor.setOptions({ ignoreCrossDomain: true });
                interceptor.throttleRequest(crossDomainFetch, duration * 3);

                const timing = startTiming();

                await page.goto(
                    getDynamicUrl([
                        {
                            bodyFormat,
                            delay: 100,
                            duration,
                            method: "POST",
                            path: testPath_api_1,
                            responseCatchType,
                            type: resourceType
                        },
                        {
                            delay: 250,
                            method: "GET",
                            path: crossDomainFetch,
                            type: resourceType
                        }
                    ])
                );

                await interceptor.waitUntilRequestIsDone();

                const elapsed = stopTiming(timing);

                expect(elapsed).toBeGreaterThanOrEqual(duration);
                expect(elapsed).toBeLessThan(duration * 3);

                const stats = interceptor.getStats({ resourceType });

                expect(stats).toHaveLength(2);
                expect(stats[0].crossDomain).toBe(false);
                expect(stats[0].isPending).toBe(false);
                expect(stats[1].crossDomain).toBe(true);
                expect(stats[1].isPending).toBe(false);
                expect(stats[1].response).toBeUndefined();

                expect(interceptor.requestCalls({ method: "POST" })).toEqual(1);
                expect(interceptor.requestCalls({ method: "GET" })).toEqual(1);
            });
        }
    );

    testCaseDescribe("Wait Options", (resourceType, bodyFormat, responseCatchType, testName) => {
        test(
            testName("With following request - will not wait to the second request"),
            async ({ page, interceptor }) => {
                const delay = 4000;

                const timing = startTiming();

                await page.goto(
                    getDynamicUrl([
                        {
                            bodyFormat,
                            delay: 100,
                            duration,
                            method: "POST",
                            path: testPath_api_1,
                            requests: [
                                {
                                    bodyFormat,
                                    delay,
                                    duration: doubleDuration,
                                    method: "POST",
                                    path: testPath_api_2,
                                    responseCatchType,
                                    type: resourceType
                                }
                            ],
                            responseCatchType,
                            type: resourceType
                        }
                    ])
                );

                await interceptor.waitUntilRequestIsDone();

                expect(stopTiming(timing)).toBeLessThan(delay + duration + doubleDuration);

                const stats = interceptor.getStats({ resourceType });

                expect(stats).toHaveLength(1);
                expect(stats[0].isPending).toBe(false);
            }
        );

        test(
            testName("With following request - will wait to the second request"),
            async ({ page, interceptor }) => {
                const delay = 3000;

                const timing = startTiming();

                await page.goto(
                    getDynamicUrl([
                        {
                            bodyFormat,
                            delay: 100,
                            duration,
                            method: "POST",
                            path: testPath_api_1,
                            requests: [
                                {
                                    bodyFormat,
                                    delay,
                                    duration: doubleDuration,
                                    method: "POST",
                                    path: testPath_api_2,
                                    responseCatchType,
                                    type: resourceType
                                }
                            ],
                            responseCatchType,
                            type: resourceType
                        }
                    ])
                );

                // The following request is fired `delay` (3000ms) after the first one finishes, so
                // the `waitForNextRequest` window must be strictly larger than `delay` to reliably
                // cover it. Using exactly `delay` puts the follow-up right at the window edge, which
                // races the single post-sleep pending check and flakes under load. The extra
                // `duration` margin absorbs browser `setTimeout`/network registration jitter.
                await interceptor.waitUntilRequestIsDone({ waitForNextRequest: delay + duration });

                expect(stopTiming(timing)).toBeGreaterThanOrEqual(
                    delay + duration + doubleDuration
                );

                const stats = interceptor.getStats({ resourceType });

                expect(stats).toHaveLength(2);
                expect(stats[0].isPending).toBe(false);
                expect(stats[1].isPending).toBe(false);
            }
        );

        test(testName("With following request - do not wait"), async ({ page, interceptor }) => {
            const delay = 3000;

            const timing = startTiming();

            await page.goto(
                getDynamicUrl([
                    {
                        bodyFormat,
                        delay: 100,
                        duration,
                        method: "POST",
                        path: testPath_api_1,
                        requests: [
                            {
                                bodyFormat,
                                delay,
                                duration: doubleDuration,
                                method: "POST",
                                path: testPath_api_2,
                                responseCatchType,
                                type: resourceType
                            }
                        ],
                        responseCatchType,
                        type: resourceType
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone({ waitForNextRequest: false });

            const elapsed = stopTiming(timing);

            expect(elapsed).toBeGreaterThanOrEqual(duration);
            expect(elapsed).toBeLessThan(delay);

            const stats = interceptor.getStats({ resourceType });

            expect(stats).toHaveLength(1);
            expect(stats[0].isPending).toBe(false);
        });

        test(testName("Do not wait for Cross Domain request"), async ({ page, interceptor }) => {
            interceptor.throttleRequest(crossDomainFetch, duration * 3);

            const timing = startTiming();

            await page.goto(
                getDynamicUrl([
                    {
                        bodyFormat,
                        delay: 100,
                        duration,
                        method: "POST",
                        path: testPath_api_1,
                        responseCatchType,
                        type: resourceType
                    },
                    {
                        delay: 250,
                        method: "GET",
                        path: crossDomainFetch,
                        type: resourceType
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone({ crossDomain: false });

            const elapsed = stopTiming(timing);

            expect(elapsed).toBeGreaterThanOrEqual(duration);
            expect(elapsed).toBeLessThan(duration * 3);

            const stats = interceptor.getStats({ resourceType });

            expect(stats).toHaveLength(2);
            expect(stats[0].crossDomain).toBe(false);
            expect(stats[0].isPending).toBe(false);
            expect(stats[1].crossDomain).toBe(true);
            expect(stats[1].isPending).toBe(true);
        });
    });

    test.describe("Expected fail", () => {
        const errMessage = "<EXPECTED ERROR>";

        testCaseIt(
            "Max wait",
            async (resourceType, bodyFormat, responseCatchType, { page, interceptor }) => {
                const duration = 9999;

                await page.goto(
                    getDynamicUrl([
                        {
                            bodyFormat,
                            delay: 100,
                            duration,
                            method: "POST",
                            path: testPath_api_1,
                            responseCatchType,
                            type: resourceType
                        }
                    ])
                );

                await expect(
                    interceptor.waitUntilRequestIsDone({ timeout: duration / 2 }, errMessage)
                ).rejects.toThrow(errMessage);
            }
        );

        // The Cypress test relied on `Cypress.env("INTERCEPTOR_REQUEST_TIMEOUT")` (20000). With the
        // env var unset the Playwright fixture uses its 10000 default, so the elapsed time is
        // asserted against that default.
        test("Default functionality", async ({ page, interceptor }) => {
            test.setTimeout(30000);

            const timing = startTiming();

            await page.goto(getDynamicUrl([]));

            await expect(
                interceptor.waitUntilRequestIsDone({ resourceType: "fetch" })
            ).rejects.toThrow();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(10000);
        });

        test("Enforce check", async ({ page, interceptor }) => {
            const timing = startTiming();

            await page.goto(getDynamicUrl([]));

            await expect(
                interceptor.waitUntilRequestIsDone(
                    { resourceType: "fetch", timeout: 5000 },
                    errMessage
                )
            ).rejects.toThrow(errMessage);

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(5000);
        });

        // Cypress cleared the env var to fall back to its 10000 default; the Playwright fixture
        // default is already 10000 when the env var is unset.
        test("Default timeout", async ({ page, interceptor }) => {
            test.setTimeout(30000);

            const timing = startTiming();

            await page.goto(getDynamicUrl([]));

            await expect(
                interceptor.waitUntilRequestIsDone({ resourceType: "fetch" }, errMessage)
            ).rejects.toThrow(errMessage);

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(10000);
        });

        // Cypress used the env default of 20000; Playwright cannot change the fixture default
        // per-test, so the same "honour a large timeout" intent is expressed with an explicit
        // `timeout: 20000` option.
        test("Env timeout", async ({ page, interceptor }) => {
            test.setTimeout(30000);

            const timing = startTiming();

            await page.goto(getDynamicUrl([]));

            await expect(
                interceptor.waitUntilRequestIsDone(
                    { resourceType: "fetch", timeout: 20000 },
                    errMessage
                )
            ).rejects.toThrow(errMessage);

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(20000);
        });

        // Uses the "provide an action" overload; the action resolves but no matching request is ever
        // fired, so the wait rejects on the (10000) fixture default timeout.
        test("Action chainable", async ({ page, interceptor }) => {
            test.setTimeout(30000);

            const timing = startTiming();

            await page.goto(getDynamicUrl([]));

            await expect(
                interceptor.waitUntilRequestIsDone(
                    () => Promise.resolve(null),
                    { resourceType: "fetch" },
                    errMessage
                )
            ).rejects.toThrow(errMessage);

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(10000);
        });

        test("Action void", async ({ page, interceptor }) => {
            test.setTimeout(30000);

            const timing = startTiming();

            await page.goto(getDynamicUrl([]));

            await expect(
                interceptor.waitUntilRequestIsDone(
                    () => {
                        (() => {
                            return 123;
                        })();
                    },
                    { resourceType: "fetch" },
                    errMessage
                )
            ).rejects.toThrow(errMessage);

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(10000);
        });
    });

    testCaseDescribe(
        "Providing action",
        (resourceType, bodyFormat, responseCatchType, testName) => {
            const config: DynamicRequest[] = [
                {
                    bodyFormat,
                    delay: 100,
                    method: "POST",
                    path: testPath_api_1,
                    requests: [
                        {
                            bodyFormat,
                            delay,
                            duration: tripleDuration,
                            fireOnClick: true,
                            method: "POST",
                            path: testPath_api_1,
                            responseCatchType,
                            type: resourceType
                        }
                    ],
                    responseCatchType,
                    type: resourceType
                }
            ];

            test(testName("Providing chainable action"), async ({ page, interceptor }) => {
                await page.goto(getDynamicUrl(config));

                // let the page load
                await wait(2000);

                const timing = startTiming();

                const anyReturnObject = { anything: 123 };

                const passedReturn = await interceptor.waitUntilRequestIsDone(
                    () => fireRequest(page).then(() => anyReturnObject),
                    `**/${testPath_api_1}`
                );

                expect(passedReturn).toBe(anyReturnObject);

                expect(stopTiming(timing)).toBeGreaterThanOrEqual(tripleDuration);

                const stats = interceptor.getStats({ resourceType });

                expect(stats).toHaveLength(2);
                expect(stats[0].isPending).toBe(false);
                expect(stats[1].isPending).toBe(false);
            });

            test(testName("Providing void action"), async ({ page, interceptor }) => {
                await page.goto(getDynamicUrl(config));

                // let the page load
                await wait(2000);

                const timing = startTiming();

                const result = await interceptor.waitUntilRequestIsDone(() => {
                    void fireRequest(page);
                }, `**/${testPath_api_1}`);

                expect(stopTiming(timing)).toBeGreaterThanOrEqual(tripleDuration);

                expect(result).toBeUndefined();

                const stats = interceptor.getStats({ resourceType });

                expect(stats).toHaveLength(2);
                expect(stats[0].isPending).toBe(false);
                expect(stats[1].isPending).toBe(false);
            });

            test(testName("Providing not chainable action"), async ({ page, interceptor }) => {
                await page.goto(getDynamicUrl(config));

                // let the page load
                await wait(2000);

                const timing = startTiming();

                const anyReturnObject = { anything: true, then: 1 };

                const result = await interceptor.waitUntilRequestIsDone(() => {
                    void fireRequest(page);

                    return anyReturnObject;
                }, `**/${testPath_api_1}`);

                expect(stopTiming(timing)).toBeGreaterThanOrEqual(tripleDuration);

                expect(result).toBe(anyReturnObject);

                const stats = interceptor.getStats({ resourceType });

                expect(stats).toHaveLength(2);
                expect(stats[0].isPending).toBe(false);
                expect(stats[1].isPending).toBe(false);
            });
        }
    );
});
