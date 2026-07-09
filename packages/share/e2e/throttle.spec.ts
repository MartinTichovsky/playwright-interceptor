/**
 * Ported from `packages/share/e2e/throttle.cy.ts`.
 *
 * Throttling delays the RESPONSE: the request hits the network first and the response is held for
 * the given delay before it is returned to the page. `stats.delay` equals the throttle delay when a
 * request was throttled, and is `undefined` otherwise.
 */

import { expect, startTiming, stopTiming, test } from "playwright-interceptor";
import { crossDomainFetch } from "playwright-interceptor-server/src/resources/constants";
import { DynamicRequest } from "playwright-interceptor-server/src/types";
import { getDynamicUrl } from "playwright-interceptor-server/src/utils";

import { getResponseDuration } from "../src/selectors";
import { createMatcher, resourceTypeDescribe, resourceTypeIt } from "../src/utils";

test.describe("Throttle Request", () => {
    const testPath_api_1 = "test/api-1";
    const testPath_api_2 = "api/api-2";
    const testPath_api_3 = "test/api-3";

    const duration = 1500;
    const throttleDelay = duration * 4;

    resourceTypeDescribe("By resource type", (resourceType, resourceTypeSecondary) => {
        test("All", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest({ resourceType: "all" }, duration, {
                times: Number.POSITIVE_INFINITY
            });

            const timing = startTiming();

            await page.goto(
                getDynamicUrl([
                    {
                        delay: 100,
                        duration,
                        method: "POST",
                        path: testPath_api_1,
                        requests: [
                            {
                                duration,
                                method: "GET",
                                path: testPath_api_2,
                                type: resourceTypeSecondary
                            }
                        ],
                        type: resourceType
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration * 4);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toEqual(duration);

            expect(await getResponseDuration(page, testPath_api_1)).toBeGreaterThan(duration * 2);

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toEqual(duration);
        });

        test("Default once", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest({ resourceType }, throttleDelay);

            const timing = startTiming();

            await page.goto(
                getDynamicUrl([
                    {
                        delay: 100,
                        duration,
                        method: "POST",
                        path: testPath_api_1,
                        type: resourceType
                    },
                    {
                        delay: 200,
                        duration,
                        method: "POST",
                        path: testPath_api_2,
                        type: resourceType
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toEqual(throttleDelay);
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_1)).toBeGreaterThan(
                duration + throttleDelay
            );

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toBeUndefined();
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            const responseDuration2 = await getResponseDuration(page, testPath_api_2);

            expect(responseDuration2).toBeGreaterThan(duration);
            expect(responseDuration2).toBeLessThan(duration + throttleDelay);
        });

        test("2 times", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest({ resourceType }, throttleDelay, { times: 2 });

            const timing = startTiming();

            await page.goto(
                getDynamicUrl([
                    {
                        delay: 100,
                        duration,
                        method: "POST",
                        path: testPath_api_1,
                        type: resourceType
                    },
                    {
                        delay: 200,
                        duration,
                        method: "POST",
                        path: testPath_api_2,
                        type: resourceType
                    },
                    {
                        delay: 300,
                        duration,
                        method: "POST",
                        path: testPath_api_3,
                        type: resourceType
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toEqual(throttleDelay);
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_1)).toBeGreaterThan(
                duration + throttleDelay
            );

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toEqual(throttleDelay);
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_2)).toBeGreaterThan(
                duration + throttleDelay
            );

            const stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

            expect(stats3!.delay).toBeUndefined();
            expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

            const responseDuration3 = await getResponseDuration(page, testPath_api_3);

            expect(responseDuration3).toBeGreaterThan(duration);
            expect(responseDuration3).toBeLessThan(duration + throttleDelay);
        });

        test("Infinitely", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest({ resourceType }, throttleDelay, {
                times: Number.POSITIVE_INFINITY
            });

            const timing = startTiming();

            await page.goto(
                getDynamicUrl([
                    {
                        delay: 100,
                        duration,
                        method: "POST",
                        path: testPath_api_1,
                        type: resourceType
                    },
                    {
                        delay: 200,
                        duration,
                        method: "POST",
                        path: testPath_api_2,
                        type: resourceType
                    },
                    {
                        delay: 300,
                        duration,
                        method: "POST",
                        path: testPath_api_3,
                        type: resourceType
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toEqual(throttleDelay);
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_1)).toBeGreaterThan(
                duration + throttleDelay
            );

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toEqual(throttleDelay);
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_2)).toBeGreaterThan(
                duration + throttleDelay
            );

            const stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

            expect(stats3).not.toBeUndefined();
            expect(stats3!.delay).toEqual(throttleDelay);
            expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_3)).toBeGreaterThan(
                duration + throttleDelay
            );
        });
    });

    resourceTypeDescribe("By url match", (resourceType, resourceTypeSecondary) => {
        const config: DynamicRequest[] = [
            {
                delay: 100,
                duration,
                method: "GET",
                path: testPath_api_2,
                type: resourceType
            },
            {
                delay: 200,
                duration,
                method: "POST",
                path: testPath_api_1,
                type: resourceType
            }
        ];

        test("All", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest("*", duration, { times: Number.POSITIVE_INFINITY });

            const timing = startTiming();

            await page.goto(
                getDynamicUrl([
                    {
                        delay: 100,
                        duration,
                        method: "POST",
                        path: testPath_api_1,
                        requests: [
                            {
                                duration,
                                method: "GET",
                                path: testPath_api_2,
                                type: resourceTypeSecondary
                            }
                        ],
                        type: resourceType
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration * 4);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toEqual(duration);

            expect(await getResponseDuration(page, testPath_api_1)).toBeGreaterThan(duration * 2);

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toEqual(duration);
        });

        test("Default once", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest(`**/${testPath_api_1}`, throttleDelay);

            const timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toEqual(throttleDelay);
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_1)).toBeGreaterThan(
                duration + throttleDelay
            );

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toBeUndefined();
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            const responseDuration2 = await getResponseDuration(page, testPath_api_2);

            expect(responseDuration2).toBeGreaterThan(duration);
            expect(responseDuration2).toBeLessThan(duration + throttleDelay);
        });

        test("2 times", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest(`**/${testPath_api_1}`, throttleDelay, { times: 2 });

            // first load

            let timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

            let stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toEqual(throttleDelay);
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_1)).toBeGreaterThan(
                duration + throttleDelay
            );

            let stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toBeUndefined();
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            let responseDuration2 = await getResponseDuration(page, testPath_api_2);

            expect(responseDuration2).toBeGreaterThan(duration);
            expect(responseDuration2).toBeLessThan(duration + throttleDelay);

            // second load

            timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

            stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toEqual(throttleDelay);
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_1)).toBeGreaterThan(
                duration + throttleDelay
            );

            stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toBeUndefined();
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            responseDuration2 = await getResponseDuration(page, testPath_api_2);

            expect(responseDuration2).toBeGreaterThan(duration);
            expect(responseDuration2).toBeLessThan(duration + throttleDelay);

            // third load

            timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            const elapsed = stopTiming(timing);

            expect(elapsed).toBeGreaterThan(duration);
            expect(elapsed).toBeLessThan(duration + throttleDelay);

            stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toBeUndefined();
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            const responseDuration1 = await getResponseDuration(page, testPath_api_1);

            expect(responseDuration1).toBeGreaterThan(duration);
            expect(responseDuration1).toBeLessThan(duration + throttleDelay);

            stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toBeUndefined();
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            responseDuration2 = await getResponseDuration(page, testPath_api_2);

            expect(responseDuration2).toBeGreaterThan(duration);
            expect(responseDuration2).toBeLessThan(duration + throttleDelay);
        });

        test("Infinitely", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            const doCheck = async (timing: number) => {
                expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

                const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

                expect(stats1).not.toBeUndefined();
                expect(stats1!.delay).toEqual(throttleDelay);
                expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

                expect(await getResponseDuration(page, testPath_api_1)).toBeGreaterThan(
                    duration + throttleDelay
                );

                const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

                expect(stats2).not.toBeUndefined();
                expect(stats2!.delay).toBeUndefined();
                expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

                const responseDuration2 = await getResponseDuration(page, testPath_api_2);

                expect(responseDuration2).toBeGreaterThan(duration);
                expect(responseDuration2).toBeLessThan(duration + throttleDelay);
            };

            interceptor.throttleRequest(`**/${testPath_api_1}`, throttleDelay, {
                times: Number.POSITIVE_INFINITY
            });

            // first load

            let timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await doCheck(timing);

            // second load

            timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await doCheck(timing);

            // third load

            timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await doCheck(timing);
        });
    });

    resourceTypeDescribe("By custom match", (resourceType, resourceTypeSecondary) => {
        const body2 = {
            pre: "abRdtD",
            num: 954
        };

        const body3 = {
            arr: [0, "M", -99, false],
            obj: {
                val: "value"
            }
        };

        const headers1 = {
            "custom-header-1": "custom-value-1"
        };

        const headers3 = {
            "custom-header-3": "custom-value-3"
        };

        const query1 = {
            list: "99",
            order: "aaBC",
            state: "true"
        };

        const query2 = {
            page: "99",
            state: query1.state
        };

        const config: DynamicRequest[] = [
            {
                delay: 100,
                duration,
                headers: headers1,
                method: "GET",
                query: query1,
                path: testPath_api_1,
                type: resourceType
            },
            {
                body: body2,
                delay: 200,
                duration,
                method: "POST",
                query: query2,
                path: testPath_api_2,
                type: resourceType
            },
            {
                body: body3,
                delay: 300,
                duration,
                headers: headers3,
                method: "POST",
                query: { ...query1, ...query2 },
                path: testPath_api_3,
                type: resourceType
            },
            {
                delay: 400,
                method: "GET",
                path: crossDomainFetch,
                type: resourceTypeSecondary
            }
        ];

        test("Method", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest({ method: "POST" }, throttleDelay);

            const timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toBeUndefined();
            expect(stats1!.request.method).toEqual("GET");
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            const responseDuration1 = await getResponseDuration(page, testPath_api_1);

            expect(responseDuration1).toBeGreaterThan(duration);
            expect(responseDuration1).toBeLessThan(duration + throttleDelay);

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toEqual(throttleDelay);
            expect(stats2!.request.method).toEqual("POST");
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_2)).toBeGreaterThan(
                duration + throttleDelay
            );

            const stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

            expect(stats3).not.toBeUndefined();
            expect(stats3!.delay).toBeUndefined();
            expect(stats3!.request.method).toEqual("POST");
            expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

            const responseDuration3 = await getResponseDuration(page, testPath_api_3);

            expect(responseDuration3).toBeGreaterThan(duration);
            expect(responseDuration3).toBeLessThan(duration + throttleDelay);
        });

        test("Query - shallow match", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            // first load
            interceptor.throttleRequest(
                { queryMatcher: createMatcher({ page: query2.page }) },
                throttleDelay
            );

            let timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

            let stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toBeUndefined();
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            const responseDuration1 = await getResponseDuration(page, testPath_api_1);

            expect(responseDuration1).toBeGreaterThan(duration);
            expect(responseDuration1).toBeLessThan(duration + throttleDelay);

            let stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toEqual(throttleDelay);
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_2)).toBeGreaterThan(
                duration + throttleDelay
            );

            let stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

            expect(stats3).not.toBeUndefined();
            expect(stats3!.delay).toBeUndefined();
            expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

            let responseDuration3 = await getResponseDuration(page, testPath_api_3);

            expect(responseDuration3).toBeGreaterThan(duration);
            expect(responseDuration3).toBeLessThan(duration + throttleDelay);

            // second load
            interceptor.throttleRequest(
                { queryMatcher: createMatcher({ list: query1.list }) },
                throttleDelay
            );

            timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

            stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toEqual(throttleDelay);
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_1)).toBeGreaterThan(
                duration + throttleDelay
            );

            stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toBeUndefined();
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            const responseDuration2 = await getResponseDuration(page, testPath_api_2);

            expect(responseDuration2).toBeGreaterThan(duration);
            expect(responseDuration2).toBeLessThan(duration + throttleDelay);

            stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

            expect(stats3).not.toBeUndefined();
            expect(stats3!.delay).toBeUndefined();
            expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

            responseDuration3 = await getResponseDuration(page, testPath_api_3);

            expect(responseDuration3).toBeGreaterThan(duration);
            expect(responseDuration3).toBeLessThan(duration + throttleDelay);

            // third load
            interceptor.throttleRequest(
                { queryMatcher: createMatcher({ state: query1.state }) },
                throttleDelay,
                {
                    times: 2
                }
            );

            timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

            stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toEqual(throttleDelay);
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_1)).toBeGreaterThan(
                duration + throttleDelay
            );

            stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toEqual(throttleDelay);
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_2)).toBeGreaterThan(
                duration + throttleDelay
            );

            stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

            expect(stats3).not.toBeUndefined();
            expect(stats3!.delay).toBeUndefined();
            expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

            responseDuration3 = await getResponseDuration(page, testPath_api_3);

            expect(responseDuration3).toBeGreaterThan(duration);
            expect(responseDuration3).toBeLessThan(duration + throttleDelay);
        });

        test("Query - sctrict match - should not match", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest(
                { queryMatcher: createMatcher({ page: "99" }, true) },
                throttleDelay
            );

            const timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            const elapsed = stopTiming(timing);

            expect(elapsed).toBeGreaterThan(duration);
            expect(elapsed).toBeLessThan(duration + throttleDelay);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toBeUndefined();
            expect(stats1!.request.method).toEqual("GET");
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            const responseDuration1 = await getResponseDuration(page, testPath_api_1);

            expect(responseDuration1).toBeGreaterThan(duration);
            expect(responseDuration1).toBeLessThan(duration + throttleDelay);

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toBeUndefined();
            expect(stats2!.request.method).toEqual("POST");
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            const responseDuration2 = await getResponseDuration(page, testPath_api_2);

            expect(responseDuration2).toBeGreaterThan(duration);
            expect(responseDuration2).toBeLessThan(duration + throttleDelay);

            const stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

            expect(stats3).not.toBeUndefined();
            expect(stats3!.delay).toBeUndefined();
            expect(stats3!.request.method).toEqual("POST");
            expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

            const responseDuration3 = await getResponseDuration(page, testPath_api_3);

            expect(responseDuration3).toBeGreaterThan(duration);
            expect(responseDuration3).toBeLessThan(duration + throttleDelay);
        });

        test("Query - sctrict match - should match", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest(
                {
                    // url contain extra params generated in getDynamicUrl function
                    queryMatcher: createMatcher(
                        { ...query2, duration: duration.toString(), path: testPath_api_2 },
                        true
                    )
                },
                throttleDelay
            );

            const timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toBeUndefined();
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            const responseDuration1 = await getResponseDuration(page, testPath_api_1);

            expect(responseDuration1).toBeGreaterThan(duration);
            expect(responseDuration1).toBeLessThan(duration + throttleDelay);

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toEqual(throttleDelay);
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_2)).toBeGreaterThan(
                duration + throttleDelay
            );

            const stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

            expect(stats3).not.toBeUndefined();
            expect(stats3!.delay).toBeUndefined();
            expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

            const responseDuration3 = await getResponseDuration(page, testPath_api_3);

            expect(responseDuration3).toBeGreaterThan(duration);
            expect(responseDuration3).toBeLessThan(duration + throttleDelay);
        });

        test("Cross domain", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest({ crossDomain: true }, throttleDelay);

            const timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(throttleDelay);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toBeUndefined();
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            const responseDuration1 = await getResponseDuration(page, testPath_api_1);

            expect(responseDuration1).toBeGreaterThan(duration);
            expect(responseDuration1).toBeLessThan(throttleDelay);

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toBeUndefined();
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            const responseDuration2 = await getResponseDuration(page, testPath_api_2);

            expect(responseDuration2).toBeGreaterThan(duration);
            expect(responseDuration2).toBeLessThan(throttleDelay);

            const stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

            expect(stats3).not.toBeUndefined();
            expect(stats3!.delay).toBeUndefined();
            expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

            const responseDuration3 = await getResponseDuration(page, testPath_api_3);

            expect(responseDuration3).toBeGreaterThan(duration);
            expect(responseDuration3).toBeLessThan(throttleDelay);

            const statsCrossDomain = interceptor.getLastRequest(crossDomainFetch);

            expect(statsCrossDomain).not.toBeUndefined();
            expect(statsCrossDomain!.delay).toEqual(throttleDelay);
            expect(statsCrossDomain!.response).not.toBeUndefined();
        });

        test("Igore Cross domain", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest({ crossDomain: false }, throttleDelay, {
                times: Number.POSITIVE_INFINITY
            });

            const timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(throttleDelay);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toEqual(throttleDelay);
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_1)).toBeGreaterThanOrEqual(
                throttleDelay
            );

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toEqual(throttleDelay);
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_2)).toBeGreaterThanOrEqual(
                throttleDelay
            );

            const stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

            expect(stats3).not.toBeUndefined();
            expect(stats3!.delay).toEqual(throttleDelay);
            expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_3)).toBeGreaterThanOrEqual(
                throttleDelay
            );

            const statsCrossDomain = interceptor.getLastRequest(crossDomainFetch);

            expect(statsCrossDomain).not.toBeUndefined();
            expect(statsCrossDomain!.delay).toBeUndefined();
        });

        test("HTTP", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest({ resourceType, https: false }, throttleDelay, {
                times: Number.POSITIVE_INFINITY
            });

            const timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toEqual(throttleDelay);
            expect(stats1!.request.method).toEqual("GET");

            expect(await getResponseDuration(page, testPath_api_1)).toBeGreaterThan(
                duration + throttleDelay
            );

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toEqual(throttleDelay);
            expect(stats2!.request.method).toEqual("POST");

            expect(await getResponseDuration(page, testPath_api_2)).toBeGreaterThan(
                duration + throttleDelay
            );

            const stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

            expect(stats3).not.toBeUndefined();
            expect(stats3!.delay).toEqual(throttleDelay);
            expect(stats3!.request.method).toEqual("POST");

            expect(await getResponseDuration(page, testPath_api_3)).toBeGreaterThan(
                duration + throttleDelay
            );

            const statsCrossDomain = interceptor.getLastRequest(crossDomainFetch);

            expect(statsCrossDomain).not.toBeUndefined();
            expect(statsCrossDomain!.delay).toBeUndefined();
        });

        test("HTTPS", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest({ https: true }, throttleDelay);

            const timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(throttleDelay);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toBeUndefined();
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            let responseDuration1 = await getResponseDuration(page, testPath_api_1);

            expect(responseDuration1).toBeGreaterThan(duration);
            expect(responseDuration1).toBeLessThan(throttleDelay);

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toBeUndefined();
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            responseDuration1 = await getResponseDuration(page, testPath_api_1);

            expect(responseDuration1).toBeGreaterThan(duration);
            expect(responseDuration1).toBeLessThan(throttleDelay);

            const stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

            expect(stats3).not.toBeUndefined();
            expect(stats3!.delay).toBeUndefined();
            expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

            const responseDuration3 = await getResponseDuration(page, testPath_api_3);

            expect(responseDuration3).toBeGreaterThan(duration);
            expect(responseDuration3).toBeLessThan(throttleDelay);

            const statsCrossDomain = interceptor.getLastRequest(crossDomainFetch);

            expect(statsCrossDomain).not.toBeUndefined();
            expect(statsCrossDomain!.delay).toEqual(throttleDelay);
        });

        test("URL - ends with", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest({ url: `**/${testPath_api_2}` }, throttleDelay);

            const timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toBeUndefined();
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            const responseDuration1 = await getResponseDuration(page, testPath_api_1);

            expect(responseDuration1).toBeGreaterThan(duration);
            expect(responseDuration1).toBeLessThan(duration + throttleDelay);

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toEqual(throttleDelay);
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_2)).toBeGreaterThan(
                duration + throttleDelay
            );

            const stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

            expect(stats3).not.toBeUndefined();
            expect(stats3!.delay).toBeUndefined();
            expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

            const responseDuration3 = await getResponseDuration(page, testPath_api_3);

            expect(responseDuration3).toBeGreaterThan(duration);
            expect(responseDuration3).toBeLessThan(duration + throttleDelay);
        });

        test("URL - contains", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest({ url: "**/api/**" }, throttleDelay);

            const timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toBeUndefined();
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            const responseDuration1 = await getResponseDuration(page, testPath_api_1);

            expect(responseDuration1).toBeGreaterThan(duration);
            expect(responseDuration1).toBeLessThan(duration + throttleDelay);

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toEqual(throttleDelay);
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_2)).toBeGreaterThan(
                duration + throttleDelay
            );

            const stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

            expect(stats3).not.toBeUndefined();
            expect(stats3!.delay).toBeUndefined();
            expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

            const responseDuration3 = await getResponseDuration(page, testPath_api_3);

            expect(responseDuration3).toBeGreaterThan(duration);
            expect(responseDuration3).toBeLessThan(duration + throttleDelay);
        });

        test("URL - RegExp", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest({ url: /api-2$/i }, throttleDelay);

            const timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toBeUndefined();
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            const responseDuration1 = await getResponseDuration(page, testPath_api_1);

            expect(responseDuration1).toBeGreaterThan(duration);
            expect(responseDuration1).toBeLessThan(duration + throttleDelay);

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toEqual(throttleDelay);
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_2)).toBeGreaterThan(
                duration + throttleDelay
            );

            const stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

            expect(stats3).not.toBeUndefined();
            expect(stats3!.delay).toBeUndefined();
            expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

            const responseDuration3 = await getResponseDuration(page, testPath_api_3);

            expect(responseDuration3).toBeGreaterThan(duration);
            expect(responseDuration3).toBeLessThan(duration + throttleDelay);
        });

        test("Headers", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest({ headersMatcher: createMatcher(headers3) }, throttleDelay);

            const timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toBeUndefined();
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            const responseDuration1 = await getResponseDuration(page, testPath_api_1);

            expect(responseDuration1).toBeGreaterThan(duration);
            expect(responseDuration1).toBeLessThan(duration + throttleDelay);

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toBeUndefined();
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            const responseDuration2 = await getResponseDuration(page, testPath_api_2);

            expect(responseDuration2).toBeGreaterThan(duration);
            expect(responseDuration2).toBeLessThan(duration + throttleDelay);

            const stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

            expect(stats3).not.toBeUndefined();
            expect(stats3!.delay).toEqual(throttleDelay);
            expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_3)).toBeGreaterThan(
                duration + throttleDelay
            );
        });

        test("Body matcher", async ({ page, interceptor }) => {
            test.setTimeout(120000);

            interceptor.throttleRequest(
                {
                    bodyMatcher: (bodyString) => {
                        try {
                            const body = JSON.parse(bodyString);

                            return "pre" in body && body.pre === body2.pre;
                        } catch {
                            return false;
                        }
                    }
                },
                throttleDelay
            );

            const timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration + throttleDelay);

            const stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

            expect(stats1).not.toBeUndefined();
            expect(stats1!.delay).toBeUndefined();
            expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

            const responseDuration1 = await getResponseDuration(page, testPath_api_1);

            expect(responseDuration1).toBeGreaterThan(duration);
            expect(responseDuration1).toBeLessThan(duration + throttleDelay);

            const stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

            expect(stats2).not.toBeUndefined();
            expect(stats2!.delay).toEqual(throttleDelay);
            expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

            expect(await getResponseDuration(page, testPath_api_2)).toBeGreaterThan(
                duration + throttleDelay
            );

            const stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

            expect(stats3).not.toBeUndefined();
            expect(stats3!.delay).toBeUndefined();
            expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

            const responseDuration3 = await getResponseDuration(page, testPath_api_3);

            expect(responseDuration3).toBeGreaterThan(duration);
            expect(responseDuration3).toBeLessThan(duration + throttleDelay);
        });
    });

    resourceTypeIt("Remove throttle by id", async (resourceType, { page, interceptor }) => {
        test.setTimeout(120000);

        const localThrottleDelay = 2000;

        const config: DynamicRequest[] = [
            {
                method: "POST",
                path: testPath_api_1,
                status: 200,
                type: resourceType
            },
            {
                method: "GET",
                path: testPath_api_2,
                status: 200,
                type: resourceType
            },
            {
                method: "POST",
                path: testPath_api_3,
                status: 200,
                type: resourceType
            }
        ];

        const throttle1Id = interceptor.throttleRequest(
            `**/${testPath_api_1}`,
            localThrottleDelay,
            {
                times: Number.POSITIVE_INFINITY
            }
        );
        const throttle2Id = interceptor.throttleRequest(
            `**/${testPath_api_2}`,
            localThrottleDelay,
            {
                times: Number.POSITIVE_INFINITY
            }
        );
        const throttle3Id = interceptor.throttleRequest(
            `**/${testPath_api_3}`,
            localThrottleDelay,
            {
                times: Number.POSITIVE_INFINITY
            }
        );

        // first load

        let timing = startTiming();

        await page.goto(getDynamicUrl(config));

        await interceptor.waitUntilRequestIsDone();

        expect(interceptor.removeThrottle(throttle1Id)).toBe(true);
        expect(interceptor.removeThrottle(throttle1Id)).toBe(false);

        expect(stopTiming(timing)).toBeGreaterThanOrEqual(localThrottleDelay);

        let stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

        expect(stats1).not.toBeUndefined();
        expect(stats1!.delay).toEqual(localThrottleDelay);
        expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

        expect(await getResponseDuration(page, testPath_api_1)).toBeGreaterThan(localThrottleDelay);

        let stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

        expect(stats2).not.toBeUndefined();
        expect(stats2!.delay).toEqual(localThrottleDelay);
        expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

        expect(await getResponseDuration(page, testPath_api_2)).toBeGreaterThan(localThrottleDelay);

        let stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

        expect(stats3).not.toBeUndefined();
        expect(stats3!.delay).toEqual(localThrottleDelay);
        expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

        expect(await getResponseDuration(page, testPath_api_3)).toBeGreaterThan(localThrottleDelay);

        // second load

        timing = startTiming();

        await page.goto(getDynamicUrl(config));

        await interceptor.waitUntilRequestIsDone();

        expect(interceptor.removeThrottle(throttle2Id)).toBe(true);
        expect(interceptor.removeThrottle(throttle2Id)).toBe(false);

        expect(stopTiming(timing)).toBeGreaterThanOrEqual(localThrottleDelay);

        stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

        expect(stats1).not.toBeUndefined();
        expect(stats1!.delay).toBeUndefined();
        expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

        expect(await getResponseDuration(page, testPath_api_1)).toBeLessThan(localThrottleDelay);

        stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

        expect(stats2).not.toBeUndefined();
        expect(stats2!.delay).toEqual(localThrottleDelay);
        expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

        expect(await getResponseDuration(page, testPath_api_2)).toBeGreaterThan(localThrottleDelay);

        stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

        expect(stats3).not.toBeUndefined();
        expect(stats3!.delay).toEqual(localThrottleDelay);
        expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

        expect(await getResponseDuration(page, testPath_api_3)).toBeGreaterThan(localThrottleDelay);

        // third load

        timing = startTiming();

        await page.goto(getDynamicUrl(config));

        await interceptor.waitUntilRequestIsDone();

        expect(interceptor.removeThrottle(throttle3Id)).toBe(true);
        expect(interceptor.removeThrottle(throttle3Id)).toBe(false);

        expect(stopTiming(timing)).toBeGreaterThanOrEqual(localThrottleDelay);

        stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

        expect(stats1).not.toBeUndefined();
        expect(stats1!.delay).toBeUndefined();
        expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

        expect(await getResponseDuration(page, testPath_api_1)).toBeLessThan(localThrottleDelay);

        stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

        expect(stats2).not.toBeUndefined();
        expect(stats2!.delay).toBeUndefined();
        expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

        expect(await getResponseDuration(page, testPath_api_2)).toBeLessThan(localThrottleDelay);

        stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

        expect(stats3).not.toBeUndefined();
        expect(stats3!.delay).toEqual(localThrottleDelay);
        expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

        expect(await getResponseDuration(page, testPath_api_3)).toBeGreaterThan(localThrottleDelay);

        // fourth load

        timing = startTiming();

        await page.goto(getDynamicUrl(config));

        await interceptor.waitUntilRequestIsDone();

        expect(stopTiming(timing)).toBeLessThan(localThrottleDelay);

        stats1 = interceptor.getLastRequest(`**/${testPath_api_1}`);

        expect(stats1).not.toBeUndefined();
        expect(stats1!.delay).toBeUndefined();
        expect(stats1!.url.pathname.endsWith(testPath_api_1)).toBe(true);

        expect(await getResponseDuration(page, testPath_api_1)).toBeLessThan(localThrottleDelay);

        stats2 = interceptor.getLastRequest(`**/${testPath_api_2}`);

        expect(stats2).not.toBeUndefined();
        expect(stats2!.delay).toBeUndefined();
        expect(stats2!.url.pathname.endsWith(testPath_api_2)).toBe(true);

        expect(await getResponseDuration(page, testPath_api_2)).toBeLessThan(localThrottleDelay);

        stats3 = interceptor.getLastRequest(`**/${testPath_api_3}`);

        expect(stats3).not.toBeUndefined();
        expect(stats3!.delay).toBeUndefined();
        expect(stats3!.url.pathname.endsWith(testPath_api_3)).toBe(true);

        expect(await getResponseDuration(page, testPath_api_3)).toBeLessThan(localThrottleDelay);
    });
});
