/**
 * Ported from `packages/share/e2e/custom.cy.ts`.
 *
 * Verifies the interceptor options accessor, writing the captured stats to a file (auto-generated
 * name, strict name, max-length cutting, matcher/filter/mapper), the empty-log behaviour and the
 * error handling when a response mock is misconfigured or throws.
 *
 * Adaptations from the Cypress suite:
 * - `cy.interceptorOptions()` -> `interceptor.setOptions()` (returns the current options).
 * - `cy.writeInterceptorStatsToLog(dir, opts)` -> `interceptor.writeStatsToLog(dir, opts)`. This
 *   writes the JSON stats file to disk synchronously (Node `fs`), so there is no `.then(...)`.
 * - `cy.readFile(path)` -> `JSON.parse(fs.readFileSync(path, "utf8"))`; `cy.task("doesFileExist", p)`
 *   -> `fs.existsSync(p)`; `cy.task("clearLogs", ...)` -> `fs.rmSync(...)`.
 * - The auto-generated file name is derived by the interceptor from the test title path (the fixture
 *   feeds it `testInfo.titlePath`). `createOutputFileName` reproduces the exact same path using the
 *   library's own `getFilePath` + `test.info().titlePath`, so the name always matches what
 *   `writeStatsToLog` produced. This replaces the Cypress-specific `Cypress.spec.name` based path.
 * - `chai` assertions -> Playwright `expect`. After `JSON.parse`, `entry.url` is a string (a `URL`
 *   serializes to its href), so `new URL(entry.url).pathname` is used to inspect the path.
 * - Request-body assertions in the matcher/filter/mapper test are only made verbatim for
 *   `bodyFormat === "json"`; Playwright intercepts at the network level where non-JSON bodies are
 *   already serialized, so the raw formats only assert the body is a string (mirrors `stats.spec.ts`
 *   and `mock.spec.ts`).
 * - `cy.mockInterceptorResponse` -> `interceptor.mockResponse`; `cy.interceptorLastRequest` ->
 *   `interceptor.getLastRequest`.
 * - "Should return null when log is empty": Playwright's `writeStatsToLog` returns nothing and simply
 *   writes no file when the call stack is empty, so this is adapted to assert that no file is created.
 *
 * Skipped (Cypress-implementation-specific, no Playwright equivalent):
 * - "stopTiming": the Cypress `cy.stopTiming()` command returning `undefined` has no counterpart -
 *   the Playwright `stopTiming(start)` helper requires a start value.
 * - The "convertToString" suite: it unit-tests `convertInputBodyToString` from `cypress-interceptor`
 *   against the browser AUT `window`; there is no such browser-side conversion utility in
 *   `playwright-interceptor` (it intercepts at the network level).
 * - "destroy and recreate interceptor - fetch / XMLHttpRequest": these assert on `window.originFetch`
 *   / `window.originXMLHttpRequest`, i.e. the Cypress interceptor patching `window`. The Playwright
 *   interceptor works at the network level (`page.route`) and never patches `window`.
 */

import * as fs from "fs";
import { CallStack, expect, FileNameMaxLength, test } from "playwright-interceptor";
import { getFilePath } from "playwright-interceptor/src/utils.node";
import { getDynamicUrl } from "playwright-interceptor-server/src/utils";

import { getWorkerOutputDir } from "../src/constants";
import { testCaseIt } from "../src/utils";

// Worker-scoped so the `beforeAll` cleanup below never races another parallel worker.
const outputDir = getWorkerOutputDir("custom.spec.ts");
const testPath_Fetch_1 = "stats/fetch-1";

/**
 * Reproduce the exact file path `writeStatsToLog` produces for the current test. It uses the same
 * `getFilePath` helper and the same `titlePath` the interceptor fixture is initialised with.
 */
const createOutputFileName = (
    titlePath: string[],
    fileName?: string,
    maxLength?: FileNameMaxLength
) => getFilePath({ fileName, maxLength, outputDir, titlePath, type: "stats" });

test.beforeAll(() => {
    fs.rmSync(outputDir, { force: true, recursive: true });
});

test.describe("Custom", () => {
    test("Interceptor options", ({ interceptor }) => {
        expect(interceptor.setOptions()).toEqual({
            ignoreCrossDomain: false
        });
    });

    test("Stats to file - name auto generated", async ({ page, interceptor }) => {
        await page.goto(
            getDynamicUrl([
                {
                    delay: 100,
                    method: "POST",
                    path: testPath_Fetch_1,
                    type: "fetch"
                }
            ])
        );

        await interceptor.waitUntilRequestIsDone();

        interceptor.writeStatsToLog(outputDir);

        const stats = JSON.parse(
            fs.readFileSync(createOutputFileName(test.info().titlePath), "utf8")
        ) as CallStack[];

        expect(stats.length > 0).toBe(true);
        expect(stats.every((entry) => new URL(entry.url).pathname.endsWith(testPath_Fetch_1))).toBe(
            true
        );
    });

    test("Stats to file - strict name", async ({ page, interceptor }) => {
        const fileName = "FILE_NAME_STATS";

        await page.goto(
            getDynamicUrl([
                {
                    delay: 100,
                    method: "POST",
                    path: testPath_Fetch_1,
                    type: "fetch"
                }
            ])
        );

        await interceptor.waitUntilRequestIsDone();

        interceptor.writeStatsToLog(outputDir, { fileName });

        const stats = JSON.parse(
            fs.readFileSync(createOutputFileName(test.info().titlePath, fileName), "utf8")
        ) as CallStack[];

        expect(stats.length > 0).toBe(true);
        expect(stats.every((entry) => new URL(entry.url).pathname.endsWith(testPath_Fetch_1))).toBe(
            true
        );
    });

    test.describe("Stats to file - max length of the generated name", () => {
        const maxLengthNumber = 30;
        const maxLengthObject = { describe: 10, testName: 15 };

        test.beforeEach(async ({ page, interceptor }) => {
            await page.goto(
                getDynamicUrl([
                    {
                        delay: 100,
                        method: "POST",
                        path: testPath_Fetch_1,
                        type: "fetch"
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone();
        });

        test("Should cut the generated name when maxLength is a number", ({ interceptor }) => {
            const titlePath = test.info().titlePath;
            const outputFileName = createOutputFileName(titlePath, undefined, maxLengthNumber);

            // the cut name must be shorter than the full generated name
            expect(outputFileName.length).toBeLessThan(createOutputFileName(titlePath).length);

            interceptor.writeStatsToLog(outputDir, { maxLength: maxLengthNumber });

            expect(fs.existsSync(outputFileName)).toBe(true);

            const stats = JSON.parse(fs.readFileSync(outputFileName, "utf8")) as CallStack[];

            expect(stats.length > 0).toBe(true);
            expect(
                stats.every((entry) => new URL(entry.url).pathname.endsWith(testPath_Fetch_1))
            ).toBe(true);
        });

        test("Should cut the describe and the test name when maxLength is an object", ({
            interceptor
        }) => {
            const titlePath = test.info().titlePath;
            const outputFileName = createOutputFileName(titlePath, undefined, maxLengthObject);

            expect(outputFileName.length).toBeLessThan(createOutputFileName(titlePath).length);

            interceptor.writeStatsToLog(outputDir, { maxLength: maxLengthObject });

            expect(fs.existsSync(outputFileName)).toBe(true);

            const stats = JSON.parse(fs.readFileSync(outputFileName, "utf8")) as CallStack[];

            expect(stats.length > 0).toBe(true);
            expect(
                stats.every((entry) => new URL(entry.url).pathname.endsWith(testPath_Fetch_1))
            ).toBe(true);
        });
    });

    testCaseIt(
        "Stats to file - matcher, filter, mapper",
        async (resourceType, bodyFormat, responseCatchType, { page, interceptor }) => {
            const testPath_Fetch1 = "stats/fetch-1";
            const testPath_Fetch2 = "stats/fetch-2";
            const fileName = "FILE_NAME_FILTER";

            const customHeader = (source: string) => ({
                "custom-header": source
            });

            const requestBody = (source: string) => ({
                requestSource: source,
                someValue: "any",
                num: 123,
                bool: true
            });

            const requestQuery = (source: string) => ({
                requestSource: source,
                someValue: "any",
                num: "123",
                bool: "true"
            });

            const responseBody = (source: string) => ({
                responseSource: source,
                someValue: "value",
                num: 987,
                bool: false
            });

            const testPath_Fetch1_Headers = customHeader(testPath_Fetch1);
            const testPath_Fetch2_Headers = customHeader(testPath_Fetch2);

            await page.goto(
                getDynamicUrl([
                    {
                        body: requestBody(testPath_Fetch1),
                        bodyFormat,
                        delay: 100,
                        headers: testPath_Fetch1_Headers,
                        method: "POST",
                        path: testPath_Fetch1,
                        responseBody: responseBody(testPath_Fetch1),
                        responseCatchType,
                        type: resourceType
                    },
                    {
                        delay: 200,
                        headers: testPath_Fetch2_Headers,
                        method: "GET",
                        path: testPath_Fetch2,
                        query: requestQuery(testPath_Fetch2),
                        responseBody: responseBody(testPath_Fetch2),
                        responseCatchType,
                        type: resourceType
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone();

            const outputFileName = createOutputFileName(test.info().titlePath, fileName);

            const readStats = () =>
                JSON.parse(fs.readFileSync(outputFileName, "utf8")) as CallStack[];

            interceptor.writeStatsToLog(outputDir, {
                fileName,
                prettyOutput: true
            });

            expect(readStats().length).toEqual(2);

            interceptor.writeStatsToLog(outputDir, {
                fileName,
                prettyOutput: true,
                routeMatcher: { resourceType }
            });

            const statsByResourceType = readStats();

            expect(statsByResourceType.length).toEqual(2);
            expect(statsByResourceType.every((entry) => entry.resourceType === resourceType)).toBe(
                true
            );
            Object.entries(testPath_Fetch1_Headers).every(([key, value]) => {
                expect(statsByResourceType[0].request.headers[key]).toEqual(value);
            });
            Object.entries(testPath_Fetch2_Headers).every(([key, value]) => {
                expect(statsByResourceType[1].request.headers[key]).toEqual(value);
            });

            // Playwright captures the already-serialized network body, so only assert the exact JSON
            // body for `bodyFormat === "json"`; other formats only guarantee a string.
            if (bodyFormat === "json") {
                expect(statsByResourceType[0].request.body).toEqual(
                    JSON.stringify(requestBody(testPath_Fetch1))
                );
            } else {
                expect(typeof statsByResourceType[0].request.body).toEqual("string");
            }

            expect(statsByResourceType[1].request.body).toEqual("");
            expect(statsByResourceType[1].request.query).toEqual({
                ...requestQuery(testPath_Fetch2),
                path: testPath_Fetch2,
                responseBody: JSON.stringify(responseBody(testPath_Fetch2))
            });
            expect(statsByResourceType[0].response!.body).toEqual(
                JSON.stringify(responseBody(testPath_Fetch1))
            );
            expect(statsByResourceType[1].response!.body).toEqual(
                JSON.stringify(responseBody(testPath_Fetch2))
            );
            expect(
                Object.entries(statsByResourceType[0].response?.headers ?? {}).length
            ).toBeGreaterThan(0);
            expect(
                Object.entries(statsByResourceType[1].response?.headers ?? {}).length
            ).toBeGreaterThan(2);

            interceptor.writeStatsToLog(outputDir, {
                fileName,
                routeMatcher: { method: "GET", resourceType: [resourceType] }
            });

            const statsByMethod = readStats();

            expect(statsByMethod.length).toEqual(1);
            expect(statsByMethod.every((entry) => entry.request.method === "GET")).toBe(true);

            interceptor.writeStatsToLog(outputDir, {
                fileName,
                filter: (callStack) => callStack.url.pathname.endsWith(testPath_Fetch1)
            });

            const statsByFilter = readStats();

            expect(statsByFilter.length).toEqual(1);
            expect(new URL(statsByFilter[0].url).pathname.endsWith(testPath_Fetch1)).toBe(true);

            interceptor.writeStatsToLog(outputDir, {
                fileName,
                mapper: (callStack) => ({ isPending: callStack.isPending, url: callStack.url })
            });

            const statsByMapper = readStats();

            expect(statsByMapper.length).toEqual(2);
            expect(
                statsByMapper.every(
                    (entry) =>
                        entry.isPending === false &&
                        entry.url !== undefined &&
                        Object.keys(entry).length === 2
                )
            ).toBe(true);
        }
    );

    test("This is a very long test name that is designed to have a length of exactly three hundred characters. It is important to ensure that the length of this string is exactly three hundred characters so that it can be used in tests that require such a long string. This string should be long enough to meet the requirement.", async ({
        page,
        interceptor
    }) => {
        await page.goto(
            getDynamicUrl([
                {
                    delay: 100,
                    method: "POST",
                    path: testPath_Fetch_1,
                    type: "fetch"
                }
            ])
        );

        await interceptor.waitUntilRequestIsDone();

        interceptor.writeStatsToLog(outputDir);

        const fileName = createOutputFileName(test.info().titlePath);

        expect(fileName.length).toBeLessThanOrEqual(255);

        const stats = JSON.parse(fs.readFileSync(fileName, "utf8")) as CallStack[];

        expect(stats.length > 0).toBe(true);
        expect(stats.every((entry) => new URL(entry.url).pathname.endsWith(testPath_Fetch_1))).toBe(
            true
        );
    });

    test("Catch error in mock 1 - fetch", async ({ page, interceptor }) => {
        interceptor.mockResponse("**", {
            headers: 123 as unknown as Record<string, string>,
            statusCode: "ea" as unknown as number
        });

        await page.goto(
            getDynamicUrl([
                {
                    delay: 100,
                    method: "POST",
                    path: testPath_Fetch_1,
                    type: "fetch"
                }
            ])
        );

        await interceptor.waitUntilRequestIsDone();

        const stats = interceptor.getLastRequest();

        expect(stats).not.toBeUndefined();
        expect(stats!.requestError).not.toBeUndefined();
    });

    test("Catch error in mock 2 - fetch", async ({ page, interceptor }) => {
        interceptor.mockResponse("**", {
            generateBody: () => {
                throw "Error";
            }
        });

        await page.goto(
            getDynamicUrl([
                {
                    delay: 100,
                    method: "POST",
                    path: testPath_Fetch_1,
                    type: "fetch"
                }
            ])
        );

        await interceptor.waitUntilRequestIsDone();

        const stats = interceptor.getLastRequest();

        expect(stats).not.toBeUndefined();
        expect(stats!.requestError).not.toBeUndefined();
    });

    test("Should return null when log is empty", ({ interceptor }) => {
        // The Cypress command resolved with `null` for an empty log. The Playwright `writeStatsToLog`
        // returns nothing and writes no file when the call stack is empty, so assert no file exists.
        const emptyLogDir = "_logs";
        const emptyLogFileName = getFilePath({
            outputDir: emptyLogDir,
            titlePath: test.info().titlePath,
            type: "stats"
        });

        fs.rmSync(emptyLogFileName, { force: true });

        interceptor.writeStatsToLog(emptyLogDir);

        expect(fs.existsSync(emptyLogFileName)).toBe(false);
    });
});
