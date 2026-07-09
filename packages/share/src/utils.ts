import type { PlaywrightTestArgs, TestInfo } from "@playwright/test";
import { InterceptorFixtures, test } from "playwright-interceptor";
import {
    BodyFormatFetch,
    BodyFormatXHR,
    ResponseCatchType
} from "playwright-interceptor-server/src/types";

/**
 * The fixtures available to a shared test body: the built-in Playwright fixtures plus the
 * interceptor fixtures provided by `playwright-interceptor`.
 */
export type TestArgs = PlaywrightTestArgs & InterceptorFixtures;

export type ResourceType = "fetch" | "xhr";

/**
 * Build a unique, header-safe test id from the current test's title path. Mirrors the behaviour of
 * `getTestId` in the Cypress test suite (used as the `X-Test-Id` request header value).
 */
export const getTestId = (testInfo: TestInfo) =>
    testInfo.titlePath
        .join(" ")
        .replace(/[^a-zA-Z0-9_\-.() ]/gi, "")
        .replace(/( )+/g, " ")
        .trim()
        .slice(0, 200);

export const wait = async (timeout: number) =>
    new Promise((resolve) => setTimeout(resolve, timeout));

export interface DynamicRequestParams {
    responseBody?: Record<string, unknown>;
    responseHeaders?: Record<string, string>;
    status?: number;
}

/**
 * Build the URL for the test server's dynamic endpoint. The server reads the query params
 * (`responseBody`, `responseHeaders`, `status`) and reflects them in the response.
 */
export const buildDynamicUrl = (path: string, params: DynamicRequestParams = {}) => {
    const searchParams = new URLSearchParams();

    if (params.responseBody !== undefined) {
        searchParams.set("responseBody", JSON.stringify(params.responseBody));
    }

    if (params.responseHeaders !== undefined) {
        searchParams.set("responseHeaders", JSON.stringify(params.responseHeaders));
    }

    if (params.status !== undefined) {
        searchParams.set("status", String(params.status));
    }

    const search = searchParams.toString();

    return `${path}${search ? `?${search}` : ""}`;
};

/**
 * Fire a request that was registered with `fireOnClick: true` in the dynamic page.
 */
export const fireRequest = (page: PlaywrightTestArgs["page"]) =>
    page.locator("#fire_request").click();

export const isObject = (val: unknown): val is Record<string, unknown> =>
    typeof val === "object" && !Array.isArray(val) && val !== null;

export const objectIncludes = (
    object1: Record<string, unknown> | undefined,
    object2: Record<string, unknown>
) =>
    Object.keys(object2).every((key) => object1 && key in object1 && object1[key] === object2[key]);

export const toRegExp = (value: string) => value.replace(/\//g, "\\/").replace(/\./g, "\\.");

export const createMatcher =
    (subject: Record<string, string | number>, strictMatch = false) =>
    (query: Record<string, string | string[] | number>) =>
        Object.keys(subject).every((key) => key in query && query[key] === subject[key])
            ? strictMatch
                ? Object.keys(query).every((key) => key in subject && query[key] === subject[key])
                : true
            : false;

const resourceTypes: ResourceType[] = ["fetch", "xhr"];

const secondaryResourceType = (index: number) =>
    resourceTypes[index === 0 ? resourceTypes.length - 1 : index - 1];

/**
 * Run a test for both `fetch` and `xhr` resource types.
 */
export const resourceTypeIt = (
    name: string,
    execution: (
        resourceType: ResourceType,
        args: TestArgs,
        resourceTypeSecondary: ResourceType
    ) => Promise<void> | void
) => {
    resourceTypes.forEach((resourceType, index) => {
        test(`${name} [resourceType='${resourceType}']`, async ({
            page,
            context,
            request,
            interceptor,
            watchTheConsole,
            wsInterceptor
        }) => {
            await execution(
                resourceType,
                { page, context, request, interceptor, watchTheConsole, wsInterceptor },
                secondaryResourceType(index)
            );
        });
    });
};

/**
 * Run a describe block for both `fetch` and `xhr` resource types.
 */
export const resourceTypeDescribe = (
    name: string,
    execution: (
        resourceType: ResourceType,
        resourceTypeSecondary: ResourceType,
        testName: (name: string) => string
    ) => void
) => {
    resourceTypes.forEach((resourceType, index) => {
        const testName = (name: string) => `${name} [resourceType='${resourceType}']`;

        test.describe(testName(name), () =>
            execution(resourceType, secondaryResourceType(index), testName)
        );
    });
};

const testCases: {
    bodyFormats: (BodyFormatFetch | BodyFormatXHR)[];
    resourceType: ResourceType;
    responseCatchTypes: (ResponseCatchType | undefined)[];
}[] = [
    {
        bodyFormats: ["blob", "formdata", "json", "urlencoded"],
        resourceType: "fetch",
        responseCatchTypes: [undefined]
    },
    {
        bodyFormats: ["arraybuffer", "blob", "document", "formdata", "typedarray", "urlencoded"],
        resourceType: "xhr",
        responseCatchTypes: [undefined]
    },
    {
        bodyFormats: ["json"],
        resourceType: "xhr",
        responseCatchTypes: ["addEventListener", "onload", "onreadystatechange"]
    }
];

export const testCaseDescribe = (
    name: string,
    execution: (
        resourceType: ResourceType,
        bodyFormat: BodyFormatFetch | BodyFormatXHR,
        responseCatchType: ResponseCatchType | undefined,
        testName: (name: string) => string
    ) => void
) => {
    testCases.forEach(({ bodyFormats, resourceType, responseCatchTypes }) =>
        bodyFormats.forEach((bodyFormat) =>
            responseCatchTypes.forEach((responseCatchType) => {
                const testName = (name: string) =>
                    `${name} [resourceType='${resourceType}'] [bodyFormat='${bodyFormat}']${responseCatchType ? ` [responseCatchType='${responseCatchType}']` : ""}`;

                test.describe(testName(name), () =>
                    execution(resourceType, bodyFormat, responseCatchType, testName)
                );
            })
        )
    );
};

export const testCaseIt = (
    name: string,
    execution: (
        resourceType: ResourceType,
        bodyFormat: BodyFormatFetch | BodyFormatXHR,
        responseCatchType: ResponseCatchType | undefined,
        args: TestArgs
    ) => Promise<void> | void
) => {
    testCases.forEach(({ bodyFormats, resourceType, responseCatchTypes }) =>
        bodyFormats.forEach((bodyFormat) =>
            responseCatchTypes.forEach((responseCatchType) => {
                const testName = (name: string) =>
                    `${name} [resourceType='${resourceType}'] [bodyFormat='${bodyFormat}']${responseCatchType ? ` [responseCatchType='${responseCatchType}']` : ""}`;

                test(
                    testName(name),
                    async ({
                        page,
                        context,
                        request,
                        interceptor,
                        watchTheConsole,
                        wsInterceptor
                    }) =>
                        execution(resourceType, bodyFormat, responseCatchType, {
                            page,
                            context,
                            request,
                            interceptor,
                            watchTheConsole,
                            wsInterceptor
                        })
                );
            })
        )
    );
};
