/**
 * Ported from `packages/share/e2e/stats.cy.ts`.
 *
 * Verifies the statistics captured by the interceptor for a single request fired from a dynamic
 * page across the supported resource types and body formats.
 */

import { CallStack, expect, test } from "playwright-interceptor";
import { getDynamicUrl } from "playwright-interceptor-server/src/utils";

import { testCaseDescribe } from "../src/utils";

test.describe("Stats", () => {
    const testPath_api_1 = "test/api-1";

    const duration = 2000;

    const responseBodyFetch = {
        arr: [0, "h", "g", 9, -9, true],
        bool: false,
        obj: {
            arr: [-1, 1, "s", false],
            b: true,
            e: 5,
            s: ""
        },
        num: -159,
        str: "string"
    };

    testCaseDescribe("Simple", (resourceType, bodyFormat, responseCatchType, testName) => {
        test(testName("Resource"), async ({ page, interceptor }) => {
            const body = {
                start: true,
                items: [9, false, "s", -1],
                limit: 999
            };

            const query = {
                custom: "custom"
            };

            const customHeaderKey = "custom-header";
            const customHeaderValue = "custom-value";

            const timeStart = new Date().getTime();

            await page.goto(
                getDynamicUrl([
                    {
                        body,
                        bodyFormat,
                        delay: 100,
                        duration,
                        headers: {
                            [customHeaderKey]: customHeaderValue
                        },
                        method: "POST",
                        path: testPath_api_1,
                        responseBody: responseBodyFetch,
                        responseCatchType,
                        query,
                        type: resourceType
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone();

            const timeEnd = new Date().getTime();

            const testStats = (stats: CallStack) => {
                expect(stats.crossDomain).toBe(false);
                expect(stats.delay).toBeUndefined();
                expect(stats.duration).toBeGreaterThan(duration);
                expect(stats.isPending).toBe(false);

                if (bodyFormat === "json") {
                    expect(stats.request.body).toEqual(JSON.stringify(body));
                } else {
                    // raw serialized body at network level
                    expect(typeof stats.request.body).toEqual("string");
                }

                expect(stats.request.headers[customHeaderKey]).toEqual(customHeaderValue);
                expect(stats.request.query).toEqual({
                    ...query,
                    duration: duration.toString(),
                    path: testPath_api_1,
                    responseBody: JSON.stringify(responseBodyFetch)
                });
                expect(stats.request.method).toEqual("POST");
                expect(new Date(stats.timeStart).getTime()).toBeGreaterThan(timeStart);
                expect(stats.resourceType).toEqual(resourceType);
                expect(stats.response).not.toBeUndefined();
                expect(stats.response!.body).toEqual(JSON.stringify(responseBodyFetch));
                expect(stats.response!.statusCode).toEqual(200);
                expect(stats.response!.statusText).toEqual("OK");
                expect(stats.response!.timeEnd).not.toBeUndefined();
                expect(new Date(stats.response!.timeEnd).getTime()).toBeLessThan(timeEnd);
                expect(stats.url.pathname.endsWith(testPath_api_1)).toBe(true);
            };

            const stats = interceptor.getStats({ resourceType });

            expect(stats).toHaveLength(1);
            testStats(stats[0]);

            const lastRequest = interceptor.getLastRequest({ resourceType });

            expect(lastRequest).not.toBeUndefined();
            testStats(lastRequest!);

            expect(interceptor.requestCalls({ resourceType })).toEqual(1);
        });
    });
});
