/**
 * Ported from `packages/share/e2e/mock.cy.ts`.
 *
 * Verifies response mocking through the interceptor: full mocks, partial mocks (body / generateBody
 * / headers / status code / status text), custom route matchers, throttled mocks, removing mocks by
 * id and the `allowHitTheNetwork` option.
 *
 * Adaptations from the Cypress suite:
 * - `cy.mockInterceptorResponse` -> `interceptor.mockResponse` (returns the mock id synchronously).
 * - `cy.throttleInterceptorRequest` -> `interceptor.throttleRequest`.
 * - `cy.interceptorLastRequest` -> `interceptor.getLastRequest`; `cy.interceptorStats` ->
 *   `interceptor.getStats`.
 * - `cy.startTiming` / `cy.stopTiming` -> `startTiming` / `stopTiming` helpers.
 * - Reading the rendered response sections is done with `getResponseBody` / `getResponseHeaders` /
 *   `getResponseStatus` / `getResponseDuration` from `../src/selectors`, which resolve the section
 *   the dynamic page renders once a request finishes.
 * - `checkResponseHeaders` is reimplemented locally on top of `getResponseHeaders` (there is no
 *   shared Playwright helper for it).
 * - `matcher` / `generateBody` functions run in Node (the interceptor lives in the test process), so
 *   they are passed as plain JS functions without any serialization.
 * - For non-`json` request body formats the network body is the raw serialized payload, so the
 *   request-body assertions inside `generateBody` are only made for `bodyFormat === "json"` (the raw
 *   formats only assert that the body is a string). This mirrors the shared `stats.spec.ts` port.
 * - The `allowHitTheNetwork` suite originally used `cy.intercept` to observe the raw network hits.
 *   Here the raw network hits are observed with a Playwright `page.on("request"/"response")` listener
 *   scoped to the `/test/api*` routes.
 */

import type { Page } from "@playwright/test";
import {
    CallStack,
    expect,
    IRouteMatcher,
    startTiming,
    stopTiming,
    test
} from "playwright-interceptor";
import {
    crossDomainFetch,
    I_TEST_ID_HEADER
} from "playwright-interceptor-server/src/resources/constants";
import { DynamicRequest } from "playwright-interceptor-server/src/types";
import { getDynamicUrl } from "playwright-interceptor-server/src/utils";

import { getCounter, resetCounter } from "../src/counter";
import {
    getResponseBody,
    getResponseDuration,
    getResponseHeaders,
    getResponseStatus
} from "../src/selectors";
import {
    createMatcher,
    getTestId,
    isObject,
    objectIncludes,
    TestArgs,
    testCaseDescribe
} from "../src/utils";

type Interceptor = TestArgs["interceptor"];

/**
 * Local replacement for the shared Cypress `checkResponseHeaders`: read the headers the dynamic page
 * rendered for the given request and check that every mock header is present with the same value.
 */
const checkResponseHeaders = async (
    page: Page,
    id: string,
    mockHeaders: Record<string, string>
): Promise<boolean> => {
    const headers = await getResponseHeaders(page, id);

    return Object.keys(mockHeaders).every((key) =>
        headers.some(
            ([headerKey, headerValue]) => headerKey === key && headerValue === mockHeaders[key]
        )
    );
};

interface VerifyExpectation {
    /** Expected `stats.response.body` (already stringified, or a raw string). */
    statsBody: string;
    /** Expected rendered response body (deep-equal). Defaults to `statsBody` parsed value. */
    renderBody: unknown;
    /** Read the rendered body as plain text instead of JSON. */
    renderPlain?: boolean;
    isMock: boolean;
    /** Whether `mockHeaders` should be included in the response headers. */
    headersIncluded: boolean;
    mockHeaders: Record<string, string>;
    method?: string;
    statusEq?: number;
    statusNotEq?: number;
    statusTextEq?: string;
    statusTextNotEq?: string;
    delayEq?: number;
    delayUndefined?: boolean;
    renderStatusEq?: number;
    renderStatusNotEq?: number;
    durationGte?: number;
    durationLt?: number;
}

/**
 * Verify both the interceptor stats and the rendered page section for a single request.
 */
const verifyPath = async (
    page: Page,
    interceptor: Interceptor,
    matcher: IRouteMatcher,
    id: string,
    e: VerifyExpectation
) => {
    const stats = interceptor.getLastRequest(matcher) as CallStack | undefined;

    expect(stats).not.toBeUndefined();

    if (e.method !== undefined) {
        expect(stats!.request.method).toEqual(e.method);
    }

    if (e.delayEq !== undefined) {
        expect(stats!.delay).toEqual(e.delayEq);
    }

    if (e.delayUndefined) {
        expect(stats!.delay).toBeUndefined();
    }

    expect(stats!.response).not.toBeUndefined();
    expect(stats!.response!.body).toEqual(e.statsBody);
    expect(stats!.response!.isMock).toEqual(e.isMock);
    expect(objectIncludes(stats!.response!.headers, e.mockHeaders)).toEqual(e.headersIncluded);

    if (e.statusEq !== undefined) {
        expect(stats!.response!.statusCode).toEqual(e.statusEq);
    }

    if (e.statusNotEq !== undefined) {
        expect(stats!.response!.statusCode).not.toEqual(e.statusNotEq);
    }

    if (e.statusTextEq !== undefined) {
        expect(stats!.response!.statusText).toEqual(e.statusTextEq);
    }

    if (e.statusTextNotEq !== undefined) {
        expect(stats!.response!.statusText).not.toEqual(e.statusTextNotEq);
    }

    expect(await getResponseBody(page, id, e.renderPlain)).toEqual(e.renderBody);

    if (e.durationGte !== undefined) {
        expect(await getResponseDuration(page, id)).toBeGreaterThanOrEqual(e.durationGte);
    }

    if (e.durationLt !== undefined) {
        expect(await getResponseDuration(page, id)).toBeLessThan(e.durationLt);
    }

    expect(await checkResponseHeaders(page, id, e.mockHeaders)).toEqual(e.headersIncluded);

    if (e.renderStatusEq !== undefined) {
        expect(await getResponseStatus(page, id)).toEqual(e.renderStatusEq);
    }

    if (e.renderStatusNotEq !== undefined) {
        expect(await getResponseStatus(page, id)).not.toEqual(e.renderStatusNotEq);
    }
};

test.describe("Mock Response", () => {
    // give the throttled / multi-request tests plenty of head-room
    test.beforeEach(() => {
        test.setTimeout(60000);
    });

    const testPath_api_1 = "test/api-1";
    const testPath_api_2 = "api/api-2";
    const testPath_api_3 = "test/api-3";

    const mockResponseBody = {
        response: {
            val: "value"
        }
    };
    const mockResponseHeaders = {
        custom: "value"
    };
    const mockResponseStatusCode = 203;

    const responseBody1 = { anyProp: "value-1" };
    const responseBody2 = { anyProp: "value-2" };
    const responseBody3 = { anyProp: "value-3" };

    const body1 = {
        arr: [3, 2, 1],
        bool: true,
        str: "string",
        num: 123,
        obj: {
            content: "some content"
        }
    };

    const headers1 = {
        mycustom: "some value"
    };

    const query1 = {
        page: "55",
        type: "request"
    };

    const scriptResponse = (id: string, body: unknown) =>
        `if (true) { const div = document.createElement("div"); div.setAttribute("data-response-type", "body"); div.innerHTML = '${JSON.stringify(body)}'; document.getElementById("${id}").appendChild(div); }`;

    testCaseDescribe("By resource type", (resourceType, bodyFormat, responseCatchType) => {
        const duration = 2000;

        test("Default once", async ({ page, interceptor }) => {
            const statusCode = 201;

            interceptor.mockResponse(
                { resourceType },
                {
                    body: mockResponseBody,
                    headers: mockResponseHeaders,
                    statusCode
                }
            );

            await page.goto(
                getDynamicUrl([
                    {
                        bodyFormat,
                        delay: 100,
                        method: "POST",
                        path: testPath_api_1,
                        responseBody: responseBody1,
                        responseCatchType,
                        status: 203,
                        type: resourceType
                    },
                    {
                        bodyFormat,
                        delay: 200,
                        duration,
                        method: "POST",
                        path: testPath_api_2,
                        responseBody: responseBody2,
                        responseCatchType,
                        status: 200,
                        type: resourceType
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_1}` },
                testPath_api_1,
                {
                    statsBody: JSON.stringify(mockResponseBody),
                    renderBody: mockResponseBody,
                    isMock: true,
                    headersIncluded: true,
                    mockHeaders: mockResponseHeaders,
                    statusEq: statusCode,
                    renderStatusEq: statusCode
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_2}` },
                testPath_api_2,
                {
                    statsBody: JSON.stringify(responseBody2),
                    renderBody: responseBody2,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusEq: 200,
                    renderStatusEq: 200
                }
            );
        });

        test("Times 2", async ({ page, interceptor }) => {
            const statusCode = 202;

            interceptor.mockResponse(
                { resourceType },
                {
                    body: mockResponseBody,
                    headers: mockResponseHeaders,
                    statusCode
                },
                { times: 2 }
            );

            await page.goto(
                getDynamicUrl([
                    {
                        bodyFormat,
                        delay: 100,
                        method: "POST",
                        path: testPath_api_1,
                        responseBody: responseBody1,
                        responseCatchType,
                        status: 200,
                        type: resourceType
                    },
                    {
                        bodyFormat,
                        delay: 200,
                        duration,
                        method: "POST",
                        path: testPath_api_2,
                        responseBody: responseBody2,
                        responseCatchType,
                        status: 200,
                        type: resourceType
                    },
                    {
                        bodyFormat,
                        delay: 300,
                        duration,
                        method: "POST",
                        path: testPath_api_3,
                        responseBody: responseBody3,
                        responseCatchType,
                        status: 200,
                        type: resourceType
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_1}` },
                testPath_api_1,
                {
                    statsBody: JSON.stringify(mockResponseBody),
                    renderBody: mockResponseBody,
                    isMock: true,
                    headersIncluded: true,
                    mockHeaders: mockResponseHeaders,
                    statusEq: statusCode,
                    renderStatusEq: statusCode
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_2}` },
                testPath_api_2,
                {
                    statsBody: JSON.stringify(mockResponseBody),
                    renderBody: mockResponseBody,
                    isMock: true,
                    headersIncluded: true,
                    mockHeaders: mockResponseHeaders,
                    statusEq: statusCode,
                    renderStatusEq: statusCode
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_3}` },
                testPath_api_3,
                {
                    statsBody: JSON.stringify(responseBody3),
                    renderBody: responseBody3,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusEq: 200,
                    renderStatusEq: 200
                }
            );
        });

        test("Infinitely", async ({ page, interceptor }) => {
            interceptor.mockResponse(
                { resourceType },
                {
                    body: mockResponseBody,
                    headers: mockResponseHeaders,
                    statusCode: mockResponseStatusCode
                },
                { times: Number.POSITIVE_INFINITY }
            );

            await page.goto(
                getDynamicUrl([
                    {
                        bodyFormat,
                        delay: 100,
                        method: "POST",
                        path: testPath_api_1,
                        responseBody: responseBody1,
                        responseCatchType,
                        status: 200,
                        type: resourceType
                    },
                    {
                        bodyFormat,
                        delay: 200,
                        duration,
                        method: "POST",
                        path: testPath_api_2,
                        responseBody: responseBody2,
                        responseCatchType,
                        status: 200,
                        type: resourceType
                    },
                    {
                        bodyFormat,
                        delay: 300,
                        duration,
                        method: "POST",
                        path: testPath_api_3,
                        responseBody: responseBody3,
                        responseCatchType,
                        status: 200,
                        type: resourceType
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone();

            for (const id of [testPath_api_1, testPath_api_2, testPath_api_3]) {
                await verifyPath(page, interceptor, { resourceType, url: `**/${id}` }, id, {
                    statsBody: JSON.stringify(mockResponseBody),
                    renderBody: mockResponseBody,
                    isMock: true,
                    headersIncluded: true,
                    mockHeaders: mockResponseHeaders,
                    statusEq: mockResponseStatusCode,
                    renderStatusEq: mockResponseStatusCode
                });
            }

            for (const id of [testPath_api_1, testPath_api_2, testPath_api_3]) {
                const stats = interceptor.getLastRequest({ url: `**/${id}` });

                expect(stats).not.toBeUndefined();
                expect(stats!.response).not.toBeUndefined();
            }
        });
    });

    testCaseDescribe("Partial mock", (resourceType, bodyFormat, responseCatchType) => {
        const throttleDelay = 4500;

        const config: DynamicRequest[] = [
            {
                body: body1,
                bodyFormat,
                delay: 100,
                headers: headers1,
                query: query1,
                method: "POST",
                path: testPath_api_1,
                responseBody: responseBody1,
                responseCatchType,
                status: 200,
                type: resourceType
            },
            {
                bodyFormat,
                delay: 200,
                method: "POST",
                path: testPath_api_2,
                responseBody: responseBody2,
                responseCatchType,
                status: 200,
                type: resourceType
            },
            {
                bodyFormat,
                delay: 300,
                method: "POST",
                path: testPath_api_3,
                responseBody: responseBody3,
                responseCatchType,
                status: 200,
                type: resourceType
            }
        ];

        const mockResponseStatusCode = 202;
        const mockResponseStatusText = "_MOCK_STATUS_TEXT";

        test("Only Body", async ({ page, interceptor }) => {
            interceptor.mockResponse(
                { resourceType },
                {
                    body: mockResponseBody
                }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_1}` },
                testPath_api_1,
                {
                    statsBody: JSON.stringify(mockResponseBody),
                    renderBody: mockResponseBody,
                    isMock: true,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    renderStatusNotEq: mockResponseStatusCode
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_2}` },
                testPath_api_2,
                {
                    statsBody: JSON.stringify(responseBody2),
                    renderBody: responseBody2,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    renderStatusEq: 200
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_3}` },
                testPath_api_3,
                {
                    statsBody: JSON.stringify(responseBody3),
                    renderBody: responseBody3,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    renderStatusEq: 200
                }
            );
        });

        test("Only Body With Throttle", async ({ page, interceptor }) => {
            interceptor.throttleRequest({ resourceType }, throttleDelay, {
                mockResponse: {
                    body: mockResponseBody
                }
            });

            const timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(throttleDelay);

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_1}` },
                testPath_api_1,
                {
                    statsBody: JSON.stringify(mockResponseBody),
                    renderBody: mockResponseBody,
                    isMock: true,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    delayEq: throttleDelay,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    durationGte: throttleDelay,
                    renderStatusNotEq: mockResponseStatusCode
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_2}` },
                testPath_api_2,
                {
                    statsBody: JSON.stringify(responseBody2),
                    renderBody: responseBody2,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    delayUndefined: true,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    durationLt: throttleDelay,
                    renderStatusEq: 200
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_3}` },
                testPath_api_3,
                {
                    statsBody: JSON.stringify(responseBody3),
                    renderBody: responseBody3,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    delayUndefined: true,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    durationLt: throttleDelay,
                    renderStatusEq: 200
                }
            );
        });

        test("Only GenerateBody", async ({ page, interceptor }) => {
            let captured: CallStack["request"] | undefined;
            let capturedJsonBody: unknown;

            interceptor.mockResponse(
                { resourceType },
                {
                    generateBody: (request, getJsonRequestBody) => {
                        captured = request;
                        capturedJsonBody = getJsonRequestBody();

                        return mockResponseBody;
                    }
                }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(captured).not.toBeUndefined();

            if (bodyFormat === "json") {
                expect(captured!.body).toEqual(JSON.stringify(body1));
                expect(capturedJsonBody).toEqual(body1);
            } else {
                expect(typeof captured!.body).toEqual("string");
            }

            expect(objectIncludes(captured!.headers, headers1)).toBe(true);
            expect(captured!.method).toEqual("POST");
            expect(objectIncludes(captured!.query, query1)).toBe(true);

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_1}` },
                testPath_api_1,
                {
                    statsBody: JSON.stringify(mockResponseBody),
                    renderBody: mockResponseBody,
                    isMock: true,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    renderStatusNotEq: mockResponseStatusCode
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_2}` },
                testPath_api_2,
                {
                    statsBody: JSON.stringify(responseBody2),
                    renderBody: responseBody2,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    renderStatusEq: 200
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_3}` },
                testPath_api_3,
                {
                    statsBody: JSON.stringify(responseBody3),
                    renderBody: responseBody3,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    renderStatusEq: 200
                }
            );
        });

        test("Only GenerateBody - Return a string", async ({ page, interceptor }) => {
            const mockResponseString = "mockResponseBody string";

            interceptor.mockResponse(
                { resourceType },
                {
                    generateBody: () => mockResponseString
                }
            );

            await page.goto(
                getDynamicUrl(config.map((entry) => ({ ...entry, jsonResponse: false })))
            );

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_1}` },
                testPath_api_1,
                {
                    statsBody: mockResponseString,
                    renderBody: mockResponseString,
                    renderPlain: true,
                    isMock: true,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    renderStatusNotEq: mockResponseStatusCode
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_2}` },
                testPath_api_2,
                {
                    statsBody: JSON.stringify(responseBody2),
                    renderBody: responseBody2,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    renderStatusEq: 200
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_3}` },
                testPath_api_3,
                {
                    statsBody: JSON.stringify(responseBody3),
                    renderBody: responseBody3,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    renderStatusEq: 200
                }
            );
        });

        test("Only GenerateBody With Throttle", async ({ page, interceptor }) => {
            let captured: CallStack["request"] | undefined;

            interceptor.throttleRequest({ resourceType }, throttleDelay, {
                mockResponse: {
                    generateBody: (request) => {
                        captured = request;

                        return mockResponseBody;
                    }
                }
            });

            const timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(throttleDelay);

            expect(captured).not.toBeUndefined();

            if (bodyFormat === "json") {
                expect(captured!.body).toEqual(JSON.stringify(body1));
            } else {
                expect(typeof captured!.body).toEqual("string");
            }

            expect(objectIncludes(captured!.headers, headers1)).toBe(true);
            expect(captured!.method).toEqual("POST");
            expect(objectIncludes(captured!.query, query1)).toBe(true);

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_1}` },
                testPath_api_1,
                {
                    statsBody: JSON.stringify(mockResponseBody),
                    renderBody: mockResponseBody,
                    isMock: true,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    delayEq: throttleDelay,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    durationGte: throttleDelay,
                    renderStatusNotEq: mockResponseStatusCode
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_2}` },
                testPath_api_2,
                {
                    statsBody: JSON.stringify(responseBody2),
                    renderBody: responseBody2,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    delayUndefined: true,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    durationLt: throttleDelay,
                    renderStatusEq: 200
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_3}` },
                testPath_api_3,
                {
                    statsBody: JSON.stringify(responseBody3),
                    renderBody: responseBody3,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    delayUndefined: true,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    durationLt: throttleDelay,
                    renderStatusEq: 200
                }
            );
        });

        test("Only Headers", async ({ page, interceptor }) => {
            interceptor.mockResponse(
                { resourceType },
                {
                    headers: mockResponseHeaders
                }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_1}` },
                testPath_api_1,
                {
                    statsBody: JSON.stringify(responseBody1),
                    renderBody: responseBody1,
                    isMock: true,
                    headersIncluded: true,
                    mockHeaders: mockResponseHeaders,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    renderStatusNotEq: mockResponseStatusCode
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_2}` },
                testPath_api_2,
                {
                    statsBody: JSON.stringify(responseBody2),
                    renderBody: responseBody2,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    renderStatusEq: 200
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_3}` },
                testPath_api_3,
                {
                    statsBody: JSON.stringify(responseBody3),
                    renderBody: responseBody3,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    renderStatusEq: 200
                }
            );
        });

        test("Only Headers With Throttle", async ({ page, interceptor }) => {
            interceptor.throttleRequest({ resourceType }, throttleDelay, {
                mockResponse: {
                    headers: mockResponseHeaders
                }
            });

            const timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(throttleDelay);

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_1}` },
                testPath_api_1,
                {
                    statsBody: JSON.stringify(responseBody1),
                    renderBody: responseBody1,
                    isMock: true,
                    headersIncluded: true,
                    mockHeaders: mockResponseHeaders,
                    delayEq: throttleDelay,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    durationGte: throttleDelay,
                    renderStatusNotEq: mockResponseStatusCode
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_2}` },
                testPath_api_2,
                {
                    statsBody: JSON.stringify(responseBody2),
                    renderBody: responseBody2,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    delayUndefined: true,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    durationLt: throttleDelay,
                    renderStatusEq: 200
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_3}` },
                testPath_api_3,
                {
                    statsBody: JSON.stringify(responseBody3),
                    renderBody: responseBody3,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    delayUndefined: true,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    durationLt: throttleDelay,
                    renderStatusEq: 200
                }
            );
        });

        test("Only Status Code", async ({ page, interceptor }) => {
            interceptor.mockResponse(
                { resourceType },
                {
                    statusCode: mockResponseStatusCode
                }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_1}` },
                testPath_api_1,
                {
                    statsBody: JSON.stringify(responseBody1),
                    renderBody: responseBody1,
                    isMock: true,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusEq: mockResponseStatusCode,
                    renderStatusEq: mockResponseStatusCode
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_2}` },
                testPath_api_2,
                {
                    statsBody: JSON.stringify(responseBody2),
                    renderBody: responseBody2,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    renderStatusEq: 200
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_3}` },
                testPath_api_3,
                {
                    statsBody: JSON.stringify(responseBody3),
                    renderBody: responseBody3,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    renderStatusEq: 200
                }
            );
        });

        test("Only Status Code With Throttle", async ({ page, interceptor }) => {
            interceptor.throttleRequest({ resourceType }, throttleDelay, {
                mockResponse: {
                    statusCode: mockResponseStatusCode
                }
            });

            const timing = startTiming();

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(throttleDelay);

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_1}` },
                testPath_api_1,
                {
                    statsBody: JSON.stringify(responseBody1),
                    renderBody: responseBody1,
                    isMock: true,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    delayEq: throttleDelay,
                    statusEq: mockResponseStatusCode,
                    durationGte: throttleDelay,
                    renderStatusEq: mockResponseStatusCode
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_2}` },
                testPath_api_2,
                {
                    statsBody: JSON.stringify(responseBody2),
                    renderBody: responseBody2,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    delayUndefined: true,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    durationLt: throttleDelay,
                    renderStatusEq: 200
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_3}` },
                testPath_api_3,
                {
                    statsBody: JSON.stringify(responseBody3),
                    renderBody: responseBody3,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    delayUndefined: true,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    durationLt: throttleDelay,
                    renderStatusEq: 200
                }
            );
        });

        test("Only Status Text", async ({ page, interceptor }) => {
            interceptor.mockResponse(
                { resourceType },
                {
                    statusText: mockResponseStatusText
                }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_1}` },
                testPath_api_1,
                {
                    statsBody: JSON.stringify(responseBody1),
                    renderBody: responseBody1,
                    isMock: true,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    statusTextEq: mockResponseStatusText,
                    renderStatusNotEq: mockResponseStatusCode
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_2}` },
                testPath_api_2,
                {
                    statsBody: JSON.stringify(responseBody2),
                    renderBody: responseBody2,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    statusTextNotEq: mockResponseStatusText,
                    renderStatusEq: 200
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_3}` },
                testPath_api_3,
                {
                    statsBody: JSON.stringify(responseBody3),
                    renderBody: responseBody3,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    statusNotEq: mockResponseStatusCode,
                    statusEq: 200,
                    statusTextNotEq: mockResponseStatusText,
                    renderStatusEq: 200
                }
            );
        });
    });

    testCaseDescribe("By custom match", (resourceType, bodyFormat, responseCatchType) => {
        const duration = 2000;

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
                bodyFormat,
                delay: 100,
                duration,
                headers: headers1,
                method: "GET",
                query: query1,
                path: testPath_api_1,
                responseBody: responseBody1,
                responseCatchType,
                type: resourceType
            },
            {
                body: body2,
                bodyFormat,
                delay: 200,
                duration,
                method: "POST",
                query: query2,
                path: testPath_api_2,
                responseBody: responseBody2,
                responseCatchType,
                type: resourceType
            },
            {
                body: body3,
                bodyFormat,
                delay: 300,
                duration,
                headers: headers3,
                method: "POST",
                query: { ...query1, ...query2 },
                path: testPath_api_3,
                responseBody: responseBody3,
                responseCatchType,
                type: resourceType
            },
            {
                delay: 400,
                method: "GET",
                path: crossDomainFetch,
                type: resourceType
            }
        ];

        test("Method", async ({ page, interceptor }) => {
            interceptor.mockResponse(
                { method: "POST" },
                {
                    body: mockResponseBody,
                    headers: mockResponseHeaders,
                    statusCode: mockResponseStatusCode
                }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(page, interceptor, `**/${testPath_api_1}`, testPath_api_1, {
                method: "GET",
                statsBody: JSON.stringify(responseBody1),
                renderBody: responseBody1,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            await verifyPath(page, interceptor, `**/${testPath_api_2}`, testPath_api_2, {
                method: "POST",
                statsBody: JSON.stringify(mockResponseBody),
                renderBody: mockResponseBody,
                isMock: true,
                headersIncluded: true,
                mockHeaders: mockResponseHeaders,
                statusEq: mockResponseStatusCode,
                renderStatusEq: mockResponseStatusCode
            });

            await verifyPath(page, interceptor, `**/${testPath_api_3}`, testPath_api_3, {
                method: "POST",
                statsBody: JSON.stringify(responseBody3),
                renderBody: responseBody3,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });
        });

        test("Query - shallow match", async ({ page, interceptor }) => {
            // first load
            interceptor.mockResponse(
                { queryMatcher: createMatcher({ page: query2.page }) },
                {
                    body: mockResponseBody,
                    headers: mockResponseHeaders,
                    statusCode: mockResponseStatusCode
                }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(page, interceptor, `**/${testPath_api_1}`, testPath_api_1, {
                method: "GET",
                statsBody: JSON.stringify(responseBody1),
                renderBody: responseBody1,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            await verifyPath(page, interceptor, `**/${testPath_api_2}`, testPath_api_2, {
                method: "POST",
                statsBody: JSON.stringify(mockResponseBody),
                renderBody: mockResponseBody,
                isMock: true,
                headersIncluded: true,
                mockHeaders: mockResponseHeaders,
                statusEq: mockResponseStatusCode,
                renderStatusEq: mockResponseStatusCode
            });

            await verifyPath(page, interceptor, `**/${testPath_api_3}`, testPath_api_3, {
                method: "POST",
                statsBody: JSON.stringify(responseBody3),
                renderBody: responseBody3,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            // second load
            interceptor.mockResponse(
                { queryMatcher: createMatcher({ list: query1.list }) },
                {
                    body: mockResponseBody,
                    headers: mockResponseHeaders,
                    statusCode: mockResponseStatusCode
                }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(page, interceptor, `**/${testPath_api_1}`, testPath_api_1, {
                method: "GET",
                statsBody: JSON.stringify(mockResponseBody),
                renderBody: mockResponseBody,
                isMock: true,
                headersIncluded: true,
                mockHeaders: mockResponseHeaders,
                statusEq: mockResponseStatusCode,
                renderStatusEq: mockResponseStatusCode
            });

            await verifyPath(page, interceptor, `**/${testPath_api_2}`, testPath_api_2, {
                method: "POST",
                statsBody: JSON.stringify(responseBody2),
                renderBody: responseBody2,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            await verifyPath(page, interceptor, `**/${testPath_api_3}`, testPath_api_3, {
                method: "POST",
                statsBody: JSON.stringify(responseBody3),
                renderBody: responseBody3,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            // third load
            interceptor.mockResponse(
                { queryMatcher: createMatcher({ state: query1.state }) },
                {
                    body: mockResponseBody,
                    headers: mockResponseHeaders,
                    statusCode: mockResponseStatusCode
                },
                { times: 2 }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(page, interceptor, `**/${testPath_api_1}`, testPath_api_1, {
                method: "GET",
                statsBody: JSON.stringify(mockResponseBody),
                renderBody: mockResponseBody,
                isMock: true,
                headersIncluded: true,
                mockHeaders: mockResponseHeaders,
                statusEq: mockResponseStatusCode,
                renderStatusEq: mockResponseStatusCode
            });

            await verifyPath(page, interceptor, `**/${testPath_api_2}`, testPath_api_2, {
                method: "POST",
                statsBody: JSON.stringify(mockResponseBody),
                renderBody: mockResponseBody,
                isMock: true,
                headersIncluded: true,
                mockHeaders: mockResponseHeaders,
                statusEq: mockResponseStatusCode,
                renderStatusEq: mockResponseStatusCode
            });

            await verifyPath(page, interceptor, `**/${testPath_api_3}`, testPath_api_3, {
                method: "POST",
                statsBody: JSON.stringify(responseBody3),
                renderBody: responseBody3,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });
        });

        test("Query - strict match - should not match", async ({ page, interceptor }) => {
            interceptor.mockResponse(
                { queryMatcher: createMatcher({ page: "99" }, true) },
                {
                    body: mockResponseBody,
                    headers: mockResponseHeaders,
                    statusCode: mockResponseStatusCode
                }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(page, interceptor, `**/${testPath_api_1}`, testPath_api_1, {
                method: "GET",
                statsBody: JSON.stringify(responseBody1),
                renderBody: responseBody1,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            await verifyPath(page, interceptor, `**/${testPath_api_2}`, testPath_api_2, {
                method: "POST",
                statsBody: JSON.stringify(responseBody2),
                renderBody: responseBody2,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            await verifyPath(page, interceptor, `**/${testPath_api_3}`, testPath_api_3, {
                method: "POST",
                statsBody: JSON.stringify(responseBody3),
                renderBody: responseBody3,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });
        });

        test("Query - strict match - should match", async ({ page, interceptor }) => {
            interceptor.mockResponse(
                {
                    // url contains extra params generated in the getDynamicUrl function
                    queryMatcher: createMatcher(
                        {
                            ...query2,
                            duration: duration.toString(),
                            path: testPath_api_2,
                            responseBody: JSON.stringify(responseBody2)
                        },
                        true
                    )
                },
                {
                    body: mockResponseBody,
                    headers: mockResponseHeaders,
                    statusCode: mockResponseStatusCode
                }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(page, interceptor, `**/${testPath_api_1}`, testPath_api_1, {
                method: "GET",
                statsBody: JSON.stringify(responseBody1),
                renderBody: responseBody1,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            await verifyPath(page, interceptor, `**/${testPath_api_2}`, testPath_api_2, {
                method: "POST",
                statsBody: JSON.stringify(mockResponseBody),
                renderBody: mockResponseBody,
                isMock: true,
                headersIncluded: true,
                mockHeaders: mockResponseHeaders,
                statusEq: mockResponseStatusCode,
                renderStatusEq: mockResponseStatusCode
            });

            await verifyPath(page, interceptor, `**/${testPath_api_3}`, testPath_api_3, {
                method: "POST",
                statsBody: JSON.stringify(responseBody3),
                renderBody: responseBody3,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });
        });

        test("Cross domain", async ({ page, interceptor }) => {
            interceptor.mockResponse(
                { crossDomain: true },
                {
                    body: scriptResponse(crossDomainFetch, mockResponseBody),
                    headers: mockResponseHeaders,
                    statusCode: mockResponseStatusCode
                }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(page, interceptor, `**/${testPath_api_1}`, testPath_api_1, {
                method: "GET",
                statsBody: JSON.stringify(responseBody1),
                renderBody: responseBody1,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            await verifyPath(page, interceptor, `**/${testPath_api_2}`, testPath_api_2, {
                method: "POST",
                statsBody: JSON.stringify(responseBody2),
                renderBody: responseBody2,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            await verifyPath(page, interceptor, `**/${testPath_api_3}`, testPath_api_3, {
                method: "POST",
                statsBody: JSON.stringify(responseBody3),
                renderBody: responseBody3,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            const crossStats = interceptor.getLastRequest({ resourceType, url: crossDomainFetch });

            expect(crossStats).not.toBeUndefined();
            expect(crossStats!.response).not.toBeUndefined();
            expect(crossStats!.response!.body).toEqual(
                scriptResponse(crossDomainFetch, mockResponseBody)
            );
            expect(crossStats!.response!.isMock).toBe(true);
            expect(objectIncludes(crossStats!.response!.headers, mockResponseHeaders)).toBe(true);
            expect(crossStats!.response!.statusCode).toEqual(mockResponseStatusCode);

            expect(await getResponseBody(page, crossDomainFetch, true)).toEqual(
                scriptResponse(crossDomainFetch, mockResponseBody)
            );
        });

        test("HTTPS", async ({ page, interceptor }) => {
            interceptor.mockResponse(
                { https: true },
                {
                    body: scriptResponse(crossDomainFetch, mockResponseBody),
                    headers: mockResponseHeaders,
                    statusCode: mockResponseStatusCode
                }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(page, interceptor, `**/${testPath_api_1}`, testPath_api_1, {
                method: "GET",
                statsBody: JSON.stringify(responseBody1),
                renderBody: responseBody1,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            await verifyPath(page, interceptor, `**/${testPath_api_2}`, testPath_api_2, {
                method: "POST",
                statsBody: JSON.stringify(responseBody2),
                renderBody: responseBody2,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            await verifyPath(page, interceptor, `**/${testPath_api_3}`, testPath_api_3, {
                method: "POST",
                statsBody: JSON.stringify(responseBody3),
                renderBody: responseBody3,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            const crossStats = interceptor.getLastRequest({ resourceType, url: crossDomainFetch });

            expect(crossStats).not.toBeUndefined();
            expect(crossStats!.response).not.toBeUndefined();
            expect(crossStats!.response!.body).toEqual(
                scriptResponse(crossDomainFetch, mockResponseBody)
            );
            expect(crossStats!.response!.isMock).toBe(true);
            expect(objectIncludes(crossStats!.response!.headers, mockResponseHeaders)).toBe(true);
            expect(crossStats!.response!.statusCode).toEqual(mockResponseStatusCode);

            expect(await getResponseBody(page, crossDomainFetch, true)).toEqual(
                scriptResponse(crossDomainFetch, mockResponseBody)
            );
        });

        test("URL - ends with", async ({ page, interceptor }) => {
            interceptor.mockResponse(
                { url: `**/${testPath_api_2}` },
                {
                    body: mockResponseBody,
                    headers: mockResponseHeaders,
                    statusCode: mockResponseStatusCode
                }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(page, interceptor, `**/${testPath_api_1}`, testPath_api_1, {
                method: "GET",
                statsBody: JSON.stringify(responseBody1),
                renderBody: responseBody1,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            await verifyPath(page, interceptor, `**/${testPath_api_2}`, testPath_api_2, {
                method: "POST",
                statsBody: JSON.stringify(mockResponseBody),
                renderBody: mockResponseBody,
                isMock: true,
                headersIncluded: true,
                mockHeaders: mockResponseHeaders,
                statusEq: mockResponseStatusCode,
                renderStatusEq: mockResponseStatusCode
            });

            await verifyPath(page, interceptor, `**/${testPath_api_3}`, testPath_api_3, {
                method: "POST",
                statsBody: JSON.stringify(responseBody3),
                renderBody: responseBody3,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });
        });

        test("URL - contains", async ({ page, interceptor }) => {
            interceptor.mockResponse(
                { url: "**/api/**" },
                {
                    body: mockResponseBody,
                    headers: mockResponseHeaders,
                    statusCode: mockResponseStatusCode
                }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(page, interceptor, `**/${testPath_api_1}`, testPath_api_1, {
                method: "GET",
                statsBody: JSON.stringify(responseBody1),
                renderBody: responseBody1,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            await verifyPath(page, interceptor, `**/${testPath_api_2}`, testPath_api_2, {
                method: "POST",
                statsBody: JSON.stringify(mockResponseBody),
                renderBody: mockResponseBody,
                isMock: true,
                headersIncluded: true,
                mockHeaders: mockResponseHeaders,
                statusEq: mockResponseStatusCode,
                renderStatusEq: mockResponseStatusCode
            });

            await verifyPath(page, interceptor, `**/${testPath_api_3}`, testPath_api_3, {
                method: "POST",
                statsBody: JSON.stringify(responseBody3),
                renderBody: responseBody3,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });
        });

        test("URL - RegExp", async ({ page, interceptor }) => {
            interceptor.mockResponse(
                { url: /api-2$/i },
                {
                    body: mockResponseBody,
                    headers: mockResponseHeaders,
                    statusCode: mockResponseStatusCode
                }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(page, interceptor, `**/${testPath_api_1}`, testPath_api_1, {
                method: "GET",
                statsBody: JSON.stringify(responseBody1),
                renderBody: responseBody1,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            await verifyPath(page, interceptor, `**/${testPath_api_2}`, testPath_api_2, {
                method: "POST",
                statsBody: JSON.stringify(mockResponseBody),
                renderBody: mockResponseBody,
                isMock: true,
                headersIncluded: true,
                mockHeaders: mockResponseHeaders,
                statusEq: mockResponseStatusCode,
                renderStatusEq: mockResponseStatusCode
            });

            await verifyPath(page, interceptor, `**/${testPath_api_3}`, testPath_api_3, {
                method: "POST",
                statsBody: JSON.stringify(responseBody3),
                renderBody: responseBody3,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });
        });

        test("Headers", async ({ page, interceptor }) => {
            interceptor.mockResponse(
                { headersMatcher: createMatcher(headers3) },
                {
                    body: mockResponseBody,
                    headers: mockResponseHeaders,
                    statusCode: mockResponseStatusCode
                }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(page, interceptor, `**/${testPath_api_1}`, testPath_api_1, {
                method: "GET",
                statsBody: JSON.stringify(responseBody1),
                renderBody: responseBody1,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            await verifyPath(page, interceptor, `**/${testPath_api_2}`, testPath_api_2, {
                method: "POST",
                statsBody: JSON.stringify(responseBody2),
                renderBody: responseBody2,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            await verifyPath(page, interceptor, `**/${testPath_api_3}`, testPath_api_3, {
                method: "POST",
                statsBody: JSON.stringify(mockResponseBody),
                renderBody: mockResponseBody,
                isMock: true,
                headersIncluded: true,
                mockHeaders: mockResponseHeaders,
                statusEq: mockResponseStatusCode,
                renderStatusEq: mockResponseStatusCode
            });
        });

        test("Body matcher", async ({ page, interceptor }) => {
            interceptor.mockResponse(
                {
                    // The Cypress interceptor normalizes every request body to JSON, but Playwright
                    // exposes the raw network body for non-json formats (blob/formdata/document/...).
                    // Fall back to a substring check so the matcher still identifies the `body2`
                    // request across all body formats while keeping the original intent.
                    bodyMatcher: (bodyString) => {
                        try {
                            const body = JSON.parse(bodyString);

                            return isObject(body) && "pre" in body && body.pre === body2.pre;
                        } catch {
                            return typeof bodyString === "string" && bodyString.includes(body2.pre);
                        }
                    }
                },
                {
                    body: mockResponseBody,
                    headers: mockResponseHeaders,
                    statusCode: mockResponseStatusCode
                }
            );

            await page.goto(getDynamicUrl(config));

            await interceptor.waitUntilRequestIsDone();

            await verifyPath(page, interceptor, `**/${testPath_api_1}`, testPath_api_1, {
                method: "GET",
                statsBody: JSON.stringify(responseBody1),
                renderBody: responseBody1,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });

            await verifyPath(page, interceptor, `**/${testPath_api_2}`, testPath_api_2, {
                method: "POST",
                statsBody: JSON.stringify(mockResponseBody),
                renderBody: mockResponseBody,
                isMock: true,
                headersIncluded: true,
                mockHeaders: mockResponseHeaders,
                statusEq: mockResponseStatusCode,
                renderStatusEq: mockResponseStatusCode
            });

            await verifyPath(page, interceptor, `**/${testPath_api_3}`, testPath_api_3, {
                method: "POST",
                statsBody: JSON.stringify(responseBody3),
                renderBody: responseBody3,
                isMock: false,
                headersIncluded: false,
                mockHeaders: mockResponseHeaders,
                statusEq: 200,
                renderStatusEq: 200
            });
        });
    });

    testCaseDescribe("By throttle request", (resourceType, bodyFormat, responseCatchType) => {
        const throttleDelay = 4500;

        test("Default once", async ({ page, interceptor }) => {
            const statusCode = 201;

            interceptor.throttleRequest({ resourceType }, throttleDelay, {
                mockResponse: {
                    body: mockResponseBody,
                    headers: mockResponseHeaders,
                    statusCode
                }
            });

            const timing = startTiming();

            await page.goto(
                getDynamicUrl([
                    {
                        bodyFormat,
                        delay: 100,
                        method: "POST",
                        path: testPath_api_1,
                        responseBody: responseBody1,
                        responseCatchType,
                        status: 200,
                        type: resourceType
                    },
                    {
                        bodyFormat,
                        delay: 200,
                        method: "POST",
                        path: testPath_api_2,
                        responseBody: responseBody2,
                        responseCatchType,
                        status: 200,
                        type: resourceType
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(throttleDelay);

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_1}` },
                testPath_api_1,
                {
                    statsBody: JSON.stringify(mockResponseBody),
                    renderBody: mockResponseBody,
                    isMock: true,
                    headersIncluded: true,
                    mockHeaders: mockResponseHeaders,
                    delayEq: throttleDelay,
                    statusEq: statusCode,
                    durationGte: throttleDelay,
                    renderStatusEq: statusCode
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_2}` },
                testPath_api_2,
                {
                    statsBody: JSON.stringify(responseBody2),
                    renderBody: responseBody2,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    delayUndefined: true,
                    statusEq: 200,
                    durationLt: throttleDelay,
                    renderStatusEq: 200
                }
            );
        });

        test("2 times", async ({ page, interceptor }) => {
            const statusCode = 201;

            interceptor.throttleRequest({ resourceType }, throttleDelay, {
                mockResponse: {
                    body: mockResponseBody,
                    headers: mockResponseHeaders,
                    statusCode
                },
                times: 2
            });

            const timing = startTiming();

            await page.goto(
                getDynamicUrl([
                    {
                        bodyFormat,
                        delay: 100,
                        method: "POST",
                        path: testPath_api_1,
                        responseBody: responseBody1,
                        responseCatchType,
                        status: 200,
                        type: resourceType
                    },
                    {
                        bodyFormat,
                        delay: 200,
                        method: "POST",
                        path: testPath_api_2,
                        responseBody: responseBody2,
                        responseCatchType,
                        status: 200,
                        type: resourceType
                    },
                    {
                        bodyFormat,
                        delay: 300,
                        method: "POST",
                        path: testPath_api_3,
                        responseBody: responseBody3,
                        responseCatchType,
                        status: 200,
                        type: resourceType
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(throttleDelay);

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_1}` },
                testPath_api_1,
                {
                    statsBody: JSON.stringify(mockResponseBody),
                    renderBody: mockResponseBody,
                    isMock: true,
                    headersIncluded: true,
                    mockHeaders: mockResponseHeaders,
                    delayEq: throttleDelay,
                    statusEq: statusCode,
                    durationGte: throttleDelay,
                    renderStatusEq: statusCode
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_2}` },
                testPath_api_2,
                {
                    statsBody: JSON.stringify(mockResponseBody),
                    renderBody: mockResponseBody,
                    isMock: true,
                    headersIncluded: true,
                    mockHeaders: mockResponseHeaders,
                    delayEq: throttleDelay,
                    statusEq: statusCode,
                    durationGte: throttleDelay,
                    renderStatusEq: statusCode
                }
            );

            await verifyPath(
                page,
                interceptor,
                { resourceType, url: `**/${testPath_api_3}` },
                testPath_api_3,
                {
                    statsBody: JSON.stringify(responseBody3),
                    renderBody: responseBody3,
                    isMock: false,
                    headersIncluded: false,
                    mockHeaders: mockResponseHeaders,
                    delayUndefined: true,
                    statusEq: 200,
                    durationLt: throttleDelay,
                    renderStatusEq: 200
                }
            );
        });

        test("Infinitely", async ({ page, interceptor }) => {
            const statusCode = 201;

            interceptor.throttleRequest({ resourceType }, throttleDelay, {
                mockResponse: {
                    body: mockResponseBody,
                    headers: mockResponseHeaders,
                    statusCode
                },
                times: Number.POSITIVE_INFINITY
            });

            const timing = startTiming();

            await page.goto(
                getDynamicUrl([
                    {
                        bodyFormat,
                        delay: 100,
                        method: "POST",
                        path: testPath_api_1,
                        responseBody: responseBody1,
                        responseCatchType,
                        status: 200,
                        type: resourceType
                    },
                    {
                        bodyFormat,
                        delay: 200,
                        method: "POST",
                        path: testPath_api_2,
                        responseBody: responseBody2,
                        responseCatchType,
                        status: 200,
                        type: resourceType
                    },
                    {
                        bodyFormat,
                        delay: 300,
                        method: "POST",
                        path: testPath_api_3,
                        responseBody: responseBody3,
                        responseCatchType,
                        status: 200,
                        type: resourceType
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(throttleDelay);

            for (const id of [testPath_api_1, testPath_api_2, testPath_api_3]) {
                await verifyPath(page, interceptor, { resourceType, url: `**/${id}` }, id, {
                    statsBody: JSON.stringify(mockResponseBody),
                    renderBody: mockResponseBody,
                    isMock: true,
                    headersIncluded: true,
                    mockHeaders: mockResponseHeaders,
                    delayEq: throttleDelay,
                    statusEq: statusCode,
                    durationGte: throttleDelay,
                    renderStatusEq: statusCode
                });
            }
        });
    });

    test("Remove mock by id", async ({ page, interceptor }) => {
        const config: DynamicRequest[] = [
            {
                method: "POST",
                path: testPath_api_1,
                responseBody: responseBody1,
                status: 200,
                type: "fetch"
            },
            {
                method: "GET",
                path: testPath_api_2,
                responseBody: responseBody2,
                status: 200,
                type: "fetch"
            },
            {
                method: "POST",
                path: testPath_api_3,
                responseBody: responseBody3,
                status: 200,
                type: "xhr"
            }
        ];

        const mock = {
            body: mockResponseBody,
            headers: mockResponseHeaders,
            statusCode: mockResponseStatusCode
        };

        const mockedExpectation: VerifyExpectation = {
            statsBody: JSON.stringify(mockResponseBody),
            renderBody: mockResponseBody,
            isMock: true,
            headersIncluded: true,
            mockHeaders: mockResponseHeaders,
            statusEq: mockResponseStatusCode,
            renderStatusEq: mockResponseStatusCode
        };

        const notMockedExpectation = (rb: Record<string, unknown>): VerifyExpectation => ({
            statsBody: JSON.stringify(rb),
            renderBody: rb,
            isMock: false,
            headersIncluded: false,
            mockHeaders: mockResponseHeaders,
            statusEq: 200,
            renderStatusEq: 200
        });

        const mock1Id = interceptor.mockResponse({ url: `**/${testPath_api_1}` }, mock, {
            times: Number.POSITIVE_INFINITY
        });
        const mock2Id = interceptor.mockResponse({ url: `**/${testPath_api_2}` }, mock, {
            times: Number.POSITIVE_INFINITY
        });
        const mock3Id = interceptor.mockResponse({ url: `**/${testPath_api_3}` }, mock, {
            times: Number.POSITIVE_INFINITY
        });

        // first load
        await page.goto(getDynamicUrl(config));
        await interceptor.waitUntilRequestIsDone();

        expect(interceptor.removeMock(mock1Id)).toBe(true);
        expect(interceptor.removeMock(mock1Id)).toBe(false);

        await verifyPath(
            page,
            interceptor,
            `**/${testPath_api_1}`,
            testPath_api_1,
            mockedExpectation
        );
        await verifyPath(
            page,
            interceptor,
            `**/${testPath_api_2}`,
            testPath_api_2,
            mockedExpectation
        );
        await verifyPath(
            page,
            interceptor,
            `**/${testPath_api_3}`,
            testPath_api_3,
            mockedExpectation
        );

        // second load
        await page.goto(getDynamicUrl(config));
        await interceptor.waitUntilRequestIsDone();

        expect(interceptor.removeMock(mock2Id)).toBe(true);
        expect(interceptor.removeMock(mock2Id)).toBe(false);

        await verifyPath(
            page,
            interceptor,
            `**/${testPath_api_1}`,
            testPath_api_1,
            notMockedExpectation(responseBody1)
        );
        await verifyPath(
            page,
            interceptor,
            `**/${testPath_api_2}`,
            testPath_api_2,
            mockedExpectation
        );
        await verifyPath(
            page,
            interceptor,
            `**/${testPath_api_3}`,
            testPath_api_3,
            mockedExpectation
        );

        // third load
        await page.goto(getDynamicUrl(config));
        await interceptor.waitUntilRequestIsDone();

        expect(interceptor.removeMock(mock3Id)).toBe(true);
        expect(interceptor.removeMock(mock3Id)).toBe(false);

        await verifyPath(
            page,
            interceptor,
            `**/${testPath_api_1}`,
            testPath_api_1,
            notMockedExpectation(responseBody1)
        );
        await verifyPath(
            page,
            interceptor,
            `**/${testPath_api_2}`,
            testPath_api_2,
            notMockedExpectation(responseBody2)
        );
        await verifyPath(
            page,
            interceptor,
            `**/${testPath_api_3}`,
            testPath_api_3,
            mockedExpectation
        );

        // fourth load
        await page.goto(getDynamicUrl(config));
        await interceptor.waitUntilRequestIsDone();

        await verifyPath(
            page,
            interceptor,
            `**/${testPath_api_1}`,
            testPath_api_1,
            notMockedExpectation(responseBody1)
        );
        await verifyPath(
            page,
            interceptor,
            `**/${testPath_api_2}`,
            testPath_api_2,
            notMockedExpectation(responseBody2)
        );
        await verifyPath(
            page,
            interceptor,
            `**/${testPath_api_3}`,
            testPath_api_3,
            notMockedExpectation(responseBody3)
        );
    });

    testCaseDescribe(
        "`allowHitTheNetwork` option",
        (resourceType, bodyFormat, responseCatchType) => {
            const api_path_1 = "test/api-1";
            const api_path_2 = "test/api-2";
            const api_path_3 = "test/api-3";

            const mockResponseBody1 = {
                response: {
                    val: "value"
                }
            };

            const mockResponseBody2 = {
                anything: {
                    res: ["value"]
                }
            };

            const mockResponseHeaders1 = {
                custom1: "value-1"
            };

            const mockResponseHeaders2 = {
                custom2: "value-2"
            };

            const mockResponseStatusCode1 = 201;
            const mockResponseStatusCode2 = 202;

            /**
             * The Cypress suite observed the raw network hits with `cy.intercept("/test/api*")`. Here the
             * real hits are read from the test server's request log (`getCounter`) by tagging every
             * dynamic request with the `X-Test-Id` header - a request only appears in the log when it
             * actually reaches the back-end, which is exactly what the original test asserts.
             */
            const buildConfig = (iTestId: string): DynamicRequest[] => [
                {
                    bodyFormat,
                    delay: 100,
                    headers: { [I_TEST_ID_HEADER]: iTestId },
                    method: "POST",
                    path: api_path_1,
                    responseBody: responseBody1,
                    responseCatchType,
                    status: 200,
                    type: resourceType
                },
                {
                    bodyFormat,
                    delay: 200,
                    headers: { [I_TEST_ID_HEADER]: iTestId },
                    method: "POST",
                    path: api_path_2,
                    responseBody: responseBody2,
                    responseCatchType,
                    status: 200,
                    type: resourceType
                },
                {
                    bodyFormat,
                    delay: 300,
                    headers: { [I_TEST_ID_HEADER]: iTestId },
                    method: "POST",
                    path: api_path_3,
                    responseBody: responseBody3,
                    responseCatchType,
                    status: 200,
                    type: resourceType
                }
            ];

            const check = async (page: Page, interceptor: Interceptor) => {
                const stats1 = interceptor.getStats({ resourceType, url: `**/${api_path_1}` });

                expect(stats1).toHaveLength(1);

                await verifyPath(
                    page,
                    interceptor,
                    { resourceType, url: `**/${api_path_1}` },
                    api_path_1,
                    {
                        statsBody: JSON.stringify(mockResponseBody1),
                        renderBody: mockResponseBody1,
                        isMock: true,
                        headersIncluded: true,
                        mockHeaders: mockResponseHeaders1,
                        delayUndefined: true,
                        statusEq: mockResponseStatusCode1,
                        renderStatusEq: mockResponseStatusCode1
                    }
                );

                const stats2 = interceptor.getStats({ resourceType, url: `**/${api_path_2}` });

                expect(stats2).toHaveLength(1);

                await verifyPath(
                    page,
                    interceptor,
                    { resourceType, url: `**/${api_path_2}` },
                    api_path_2,
                    {
                        statsBody: JSON.stringify(mockResponseBody2),
                        renderBody: mockResponseBody2,
                        isMock: true,
                        headersIncluded: true,
                        mockHeaders: mockResponseHeaders2,
                        delayEq: 100,
                        statusEq: mockResponseStatusCode2,
                        renderStatusEq: mockResponseStatusCode2
                    }
                );

                const stats3 = interceptor.getStats({ resourceType, url: `**/${api_path_3}` });

                expect(stats3).toHaveLength(1);

                await verifyPath(
                    page,
                    interceptor,
                    { resourceType, url: `**/${api_path_3}` },
                    api_path_3,
                    {
                        statsBody: JSON.stringify(responseBody3),
                        renderBody: responseBody3,
                        isMock: false,
                        headersIncluded: false,
                        mockHeaders: mockResponseHeaders1,
                        delayUndefined: true,
                        statusEq: 200,
                        renderStatusEq: 200
                    }
                );

                // the second set of mock headers must not be present on the non-mocked response either
                expect(objectIncludes(stats3[0].response!.headers, mockResponseHeaders2)).toBe(
                    false
                );
                expect(await checkResponseHeaders(page, api_path_3, mockResponseHeaders2)).toBe(
                    false
                );
            };

            test("Should hit the network when `body` provided", async ({
                page,
                request,
                interceptor
            }) => {
                const iTestId = getTestId(test.info());

                await resetCounter(request, iTestId);

                interceptor.mockResponse(`**/${api_path_1}`, {
                    allowHitTheNetwork: true,
                    body: mockResponseBody1,
                    headers: mockResponseHeaders1,
                    statusCode: mockResponseStatusCode1
                });

                interceptor.throttleRequest(`**/${api_path_2}`, 100, {
                    mockResponse: {
                        allowHitTheNetwork: true,
                        body: mockResponseBody2,
                        headers: mockResponseHeaders2,
                        statusCode: mockResponseStatusCode2
                    }
                });

                await page.goto(getDynamicUrl(buildConfig(iTestId)));

                await interceptor.waitUntilRequestIsDone();

                const counter = await getCounter(request, iTestId);

                expect(counter).toHaveLength(3);
                expect(counter[0].url.includes(api_path_1)).toBe(true);
                expect(counter[1].url.includes(api_path_2)).toBe(true);
                expect(counter[2].url.includes(api_path_3)).toBe(true);

                await check(page, interceptor);
            });

            test("Should hit the network when `generateBody` provided", async ({
                page,
                request,
                interceptor
            }) => {
                const iTestId = getTestId(test.info());

                await resetCounter(request, iTestId);

                interceptor.mockResponse(`**/${api_path_1}`, {
                    allowHitTheNetwork: true,
                    generateBody: () => mockResponseBody1,
                    headers: mockResponseHeaders1,
                    statusCode: mockResponseStatusCode1
                });

                interceptor.throttleRequest(`**/${api_path_2}`, 100, {
                    mockResponse: {
                        allowHitTheNetwork: true,
                        generateBody: () => mockResponseBody2,
                        headers: mockResponseHeaders2,
                        statusCode: mockResponseStatusCode2
                    }
                });

                await page.goto(getDynamicUrl(buildConfig(iTestId)));

                await interceptor.waitUntilRequestIsDone();

                const counter = await getCounter(request, iTestId);

                expect(counter).toHaveLength(3);
                expect(counter[0].url.includes(api_path_1)).toBe(true);
                expect(counter[1].url.includes(api_path_2)).toBe(true);
                expect(counter[2].url.includes(api_path_3)).toBe(true);

                await check(page, interceptor);
            });

            test("Should not hit the network when `body` provided", async ({
                page,
                request,
                interceptor
            }) => {
                const iTestId = getTestId(test.info());

                await resetCounter(request, iTestId);

                interceptor.mockResponse(`**/${api_path_1}`, {
                    body: mockResponseBody1,
                    headers: mockResponseHeaders1,
                    statusCode: mockResponseStatusCode1
                });

                interceptor.throttleRequest(`**/${api_path_2}`, 100, {
                    mockResponse: {
                        body: mockResponseBody2,
                        headers: mockResponseHeaders2,
                        statusCode: mockResponseStatusCode2
                    }
                });

                await page.goto(getDynamicUrl(buildConfig(iTestId)));

                await interceptor.waitUntilRequestIsDone();

                const counter = await getCounter(request, iTestId);

                expect(counter).toHaveLength(1);
                expect(counter[0].url.includes(api_path_3)).toBe(true);

                await check(page, interceptor);
            });

            test("Should not hit the network when `generateBody` provided", async ({
                page,
                request,
                interceptor
            }) => {
                const iTestId = getTestId(test.info());

                await resetCounter(request, iTestId);

                interceptor.mockResponse(`**/${api_path_1}`, {
                    generateBody: () => mockResponseBody1,
                    headers: mockResponseHeaders1,
                    statusCode: mockResponseStatusCode1
                });

                interceptor.throttleRequest(`**/${api_path_2}`, 100, {
                    mockResponse: {
                        generateBody: () => mockResponseBody2,
                        headers: mockResponseHeaders2,
                        statusCode: mockResponseStatusCode2
                    }
                });

                await page.goto(getDynamicUrl(buildConfig(iTestId)));

                await interceptor.waitUntilRequestIsDone();

                const counter = await getCounter(request, iTestId);

                expect(counter).toHaveLength(1);
                expect(counter[0].url.includes(api_path_3)).toBe(true);

                await check(page, interceptor);
            });
        }
    );
});
