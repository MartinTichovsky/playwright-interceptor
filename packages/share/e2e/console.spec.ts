import type { Page } from "@playwright/test";
import * as fs from "fs";
import {
    ConsoleLog,
    ConsoleLogType,
    expect,
    FileNameMaxLength,
    test,
    WatchTheConsole
} from "playwright-interceptor";
import { getFilePath } from "playwright-interceptor/src/utils.node";
import { generateUrl } from "playwright-interceptor-server/src/utils";

import { getWorkerOutputDir } from "../src/constants";

/**
 * Ported from `packages/share/e2e/console.cy.ts`.
 *
 * Command / task mapping (Cypress -> Playwright):
 *   cy.visit(url)                         -> page.goto(url)
 *   cy.window().then(win => win.console.*)-> page.evaluate(() => window.console.*) (runs in-browser)
 *   cy.writeConsoleLogToFile(dir, opts)   -> watchTheConsole.writeLogToFile(dir, opts)
 *   cy.watchTheConsole()                  -> the `watchTheConsole` fixture (its getters)
 *   cy.watchTheConsoleOptions(opts)       -> watchTheConsole.setOptions(opts)
 *   cy.task("clearLogs", [dirs])          -> fs.rmSync(dir, { force: true, recursive: true })
 *   cy.task("doesFileExist", file)        -> fs.existsSync(file)
 *   cy.readFile(file)                     -> JSON.parse(fs.readFileSync(file, "utf8"))
 *   Cypress.spec.name output path         -> getWorkerOutputDir("console.spec.ts")
 *   Cypress.on("uncaught:exception")      -> not needed; watchTheConsole records `pageerror` and
 *                                            Playwright does not fail the test on page errors.
 *
 * Adaptations (behavioural differences between the two interceptors):
 * - In Cypress the spec runs in the browser, so the console arguments are the live JS objects. In
 *   Playwright the spec runs in Node, so the arguments are constructed and logged inside
 *   `page.evaluate` and then serialized back to Node via `JSHandle.jsonValue()`.
 * - `cloneConsoleArguments` is a **no-op** in Playwright (kept for API parity). Because
 *   `jsonValue()` serializes like `JSON.stringify`, non-serializable values behave the same
 *   regardless of the flag: functions and symbols are dropped from objects, `WeakMap`/`WeakSet`/DOM
 *   nodes serialize to `{}`, `Date` becomes an ISO string, `RegExp` becomes `{}`, and circular
 *   references are collapsed to `"[Circular]"`. The "with clone" expectations from the Cypress suite
 *   (`String(fn)`, `"Symbol"`, `"HTMLDivElement"`, `"ReactElement"`, `"Window"`, ...) therefore do
 *   not apply; the assertions below reflect Playwright's `jsonValue()` output.
 */

type LogQueue = [ConsoleLogType, unknown[]][];

const invalidDate = new Date("").toString();
const staticUrl = generateUrl("public/index.html");
// Worker-scoped so the per-describe cleanup below never races another parallel worker.
const outputDir = getWorkerOutputDir("console.spec.ts");

/** Run the console log queue inside the browser so `watchTheConsole` records real console output. */
const createConsoleLog = (page: Page, logQueue: LogQueue) =>
    page.evaluate(
        ({ queue, types }) => {
            for (const [type, args] of queue) {
                switch (type) {
                    case types.ConsoleLog:
                        window.console.log(...args);
                        break;
                    case types.ConsoleInfo:
                        window.console.info(...args);
                        break;
                    case types.ConsoleWarn:
                        window.console.warn(...args);
                        break;
                    case types.ConsoleError:
                        window.console.error(...args);
                        break;
                }
            }
        },
        { queue: logQueue, types: ConsoleLogType }
    );

const createOutputFileName = (
    dir: string,
    fileName: string | undefined = undefined,
    maxLength?: FileNameMaxLength
) =>
    getFilePath({
        fileName,
        maxLength,
        outputDir: dir,
        titlePath: test.info().titlePath,
        type: "console"
    });

const readLog = (outputFileName: string) =>
    JSON.parse(fs.readFileSync(outputFileName, "utf8")) as ConsoleLog[];

/**
 * The `page.on("console")` / `pageerror` events are asynchronous, so wait until the expected number
 * of records have been captured and then flush the internal processing queue before asserting.
 */
const waitForRecords = async (watchTheConsole: WatchTheConsole, length: number) => {
    await expect
        .poll(() => watchTheConsole.records.length, { timeout: 10000 })
        .toBeGreaterThanOrEqual(length);
    await watchTheConsole.flush();
};

test.describe("Custom log", () => {
    test.beforeAll(() => {
        fs.rmSync(outputDir, { force: true, recursive: true });
    });

    test("Should create a file", async ({ page, watchTheConsole }) => {
        await page.goto(staticUrl);

        const logQueue: LogQueue = [
            [ConsoleLogType.ConsoleLog, ["ConsoleLog"]],
            [ConsoleLogType.ConsoleInfo, ["ConsoleInfo"]]
        ];

        await createConsoleLog(page, logQueue);

        await waitForRecords(watchTheConsole, logQueue.length + 1);

        watchTheConsole.writeLogToFile(outputDir);

        const outputFileName = createOutputFileName(outputDir);

        expect(fs.existsSync(outputFileName)).toBe(true);

        const checkTheLog = (log: ConsoleLog[]) => {
            expect(log.length).toEqual(logQueue.length + 1);
            expect(log[0].type).toEqual(ConsoleLogType.Error);
            expect(new Date(log[0].dateTime).toString()).not.toEqual(invalidDate);
            expect(typeof log[0].currentTime).toBe("string");
            expect(log[0].currentTime).not.toEqual("");
            expect(typeof log[0].args[0]).toBe("string");
            expect(log[1].type).toEqual(ConsoleLogType.ConsoleLog);
            expect(new Date(log[1].dateTime).toString()).not.toEqual(invalidDate);
            expect(typeof log[1].currentTime).toBe("string");
            expect(log[1].currentTime).not.toEqual("");
            expect(log[1].args).toEqual(logQueue[0][1]);
            expect(log[2].type).toEqual(ConsoleLogType.ConsoleInfo);
            expect(new Date(log[2].dateTime).toString()).not.toEqual(invalidDate);
            expect(typeof log[2].currentTime).toBe("string");
            expect(log[2].currentTime).not.toEqual("");
            expect(log[2].args).toEqual(logQueue[1][1]);
        };

        checkTheLog(readLog(outputFileName));

        checkTheLog(watchTheConsole.records);
        expect(
            watchTheConsole.records.filter((entry) => entry.type === ConsoleLogType.ConsoleError)
                .length
        ).toEqual(0);
    });

    test("Should not keep records from the previous test run", async ({
        page,
        watchTheConsole
    }) => {
        await page.goto(staticUrl);

        const logQueue: LogQueue = [
            [ConsoleLogType.ConsoleWarn, ["ConsoleWarn"]],
            [ConsoleLogType.ConsoleError, ["ConsoleError"]]
        ];

        await createConsoleLog(page, logQueue);

        await waitForRecords(watchTheConsole, logQueue.length + 1);

        watchTheConsole.writeLogToFile(outputDir);

        const outputFileName = createOutputFileName(outputDir);

        expect(fs.existsSync(outputFileName)).toBe(true);

        const log = readLog(outputFileName);

        expect(log.length).toEqual(logQueue.length + 1);
        expect(log[0].type).toEqual(ConsoleLogType.Error);
        expect(new Date(log[0].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log[0].currentTime).toBe("string");
        expect(log[0].currentTime).not.toEqual("");
        expect(typeof log[0].args[0]).toBe("string");
        expect(log[1].type).toEqual(ConsoleLogType.ConsoleWarn);
        expect(new Date(log[1].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log[1].currentTime).toBe("string");
        expect(log[1].currentTime).not.toEqual("");
        expect(log[1].args).toEqual(logQueue[0][1]);
        expect(log[2].type).toEqual(ConsoleLogType.ConsoleError);
        expect(new Date(log[2].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log[2].currentTime).toBe("string");
        expect(log[2].currentTime).not.toEqual("");
        expect(log[2].args).toEqual(logQueue[1][1]);
    });

    test("Should create a file with a custom name", async ({ page, watchTheConsole }) => {
        await page.goto(staticUrl);

        const fileName = "CONSOLE_LOG_FILE";

        const logQueue: LogQueue = [
            [ConsoleLogType.ConsoleError, ["ConsoleError"]],
            [ConsoleLogType.ConsoleInfo, ["ConsoleInfo"]],
            [ConsoleLogType.ConsoleLog, ["ConsoleLog"]]
        ];

        await createConsoleLog(page, logQueue);

        await waitForRecords(watchTheConsole, logQueue.length + 1);

        watchTheConsole.writeLogToFile(outputDir, { fileName });

        const outputFileName = createOutputFileName(outputDir, fileName);

        expect(fs.existsSync(outputFileName)).toBe(true);

        const log = readLog(outputFileName);

        expect(log.length).toEqual(logQueue.length + 1);
        expect(log[0].type).toEqual(ConsoleLogType.Error);
        expect(new Date(log[0].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log[0].currentTime).toBe("string");
        expect(log[0].currentTime).not.toEqual("");
        expect(typeof log[0].args[0]).toBe("string");
        expect(log[1].type).toEqual(ConsoleLogType.ConsoleError);
        expect(new Date(log[1].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log[1].currentTime).toBe("string");
        expect(log[1].currentTime).not.toEqual("");
        expect(log[1].args).toEqual(logQueue[0][1]);
        expect(log[2].type).toEqual(ConsoleLogType.ConsoleInfo);
        expect(new Date(log[2].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log[2].currentTime).toBe("string");
        expect(log[2].currentTime).not.toEqual("");
        expect(log[2].args).toEqual(logQueue[1][1]);
        expect(log[3].type).toEqual(ConsoleLogType.ConsoleLog);
        expect(new Date(log[3].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log[3].currentTime).toBe("string");
        expect(log[3].currentTime).not.toEqual("");
        expect(log[3].args).toEqual(logQueue[2][1]);
    });

    test.describe("Max length of the generated name", () => {
        const maxLengthNumber = 30;
        const maxLengthObject = { describe: 10, testName: 15 };

        const logQueue: LogQueue = [
            [ConsoleLogType.ConsoleLog, ["ConsoleLog"]],
            [ConsoleLogType.ConsoleInfo, ["ConsoleInfo"]]
        ];

        test.beforeEach(async ({ page, watchTheConsole }) => {
            await page.goto(staticUrl);

            await createConsoleLog(page, logQueue);

            await waitForRecords(watchTheConsole, logQueue.length + 1);
        });

        test("Should cut the generated name when maxLength is a number", async ({
            watchTheConsole
        }) => {
            const outputFileName = createOutputFileName(outputDir, undefined, maxLengthNumber);

            expect(outputFileName.length).toBeLessThan(createOutputFileName(outputDir).length);

            watchTheConsole.writeLogToFile(outputDir, { maxLength: maxLengthNumber });

            expect(fs.existsSync(outputFileName)).toBe(true);

            expect(readLog(outputFileName).length).toEqual(logQueue.length + 1);
        });

        test("Should cut the describe and the test name when maxLength is an object", async ({
            watchTheConsole
        }) => {
            const outputFileName = createOutputFileName(outputDir, undefined, maxLengthObject);

            expect(outputFileName.length).toBeLessThan(createOutputFileName(outputDir).length);

            watchTheConsole.writeLogToFile(outputDir, { maxLength: maxLengthObject });

            expect(fs.existsSync(outputFileName)).toBe(true);

            expect(readLog(outputFileName).length).toEqual(logQueue.length + 1);
        });
    });
});

test.describe("Custom types", () => {
    const logQueue: LogQueue = [
        [ConsoleLogType.ConsoleLog, ["ConsoleLog"]],
        [ConsoleLogType.ConsoleError, ["ConsoleError 1"]],
        [ConsoleLogType.ConsoleInfo, ["ConsoleInfo"]],
        [ConsoleLogType.ConsoleError, ["ConsoleError 2"]],
        [ConsoleLogType.ConsoleWarn, ["ConsoleWarn"]]
    ];

    test.beforeAll(() => {
        fs.rmSync(outputDir, { force: true, recursive: true });
    });

    test.beforeEach(async ({ page, watchTheConsole }) => {
        await page.goto(staticUrl);

        await createConsoleLog(page, logQueue);

        await waitForRecords(watchTheConsole, logQueue.length + 1);
    });

    test("Should create a file with console error types", async ({ watchTheConsole }) => {
        watchTheConsole.writeLogToFile(outputDir, { types: [ConsoleLogType.ConsoleError] });

        const outputFileName = createOutputFileName(outputDir);

        const log = readLog(outputFileName);

        expect(log.length).toEqual(2);
        expect(log[0].type).toEqual(ConsoleLogType.ConsoleError);
        expect(new Date(log[0].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log[0].currentTime).toBe("string");
        expect(log[0].currentTime).not.toEqual("");
        expect(log[0].args).toEqual(logQueue[1][1]);
        expect(log[1].type).toEqual(ConsoleLogType.ConsoleError);
        expect(new Date(log[1].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log[1].currentTime).toBe("string");
        expect(log[1].currentTime).not.toEqual("");
        expect(log[1].args).toEqual(logQueue[3][1]);
    });

    test("Should create a file with console info and log types", async ({ watchTheConsole }) => {
        watchTheConsole.writeLogToFile(outputDir, {
            types: [ConsoleLogType.ConsoleInfo, ConsoleLogType.ConsoleLog]
        });

        const outputFileName = createOutputFileName(outputDir);

        const log = readLog(outputFileName);

        expect(log.length).toEqual(2);
        expect(log[0].type).toEqual(ConsoleLogType.ConsoleLog);
        expect(new Date(log[0].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log[0].currentTime).toBe("string");
        expect(log[0].currentTime).not.toEqual("");
        expect(log[0].args).toEqual(logQueue[0][1]);
        expect(log[1].type).toEqual(ConsoleLogType.ConsoleInfo);
        expect(new Date(log[1].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log[1].currentTime).toBe("string");
        expect(log[1].currentTime).not.toEqual("");
        expect(log[1].args).toEqual(logQueue[2][1]);
    });
});

test.describe("Filtering with a string", () => {
    const outputDir1 = `${outputDir}/console_1`;
    const outputDir2 = `${outputDir}/console_2`;
    const outputDir3 = `${outputDir}/console_3`;

    const logQueue: LogQueue = [
        [ConsoleLogType.ConsoleLog, ["ConsoleLog"]],
        [ConsoleLogType.ConsoleError, ["ConsoleError 1"]],
        [ConsoleLogType.ConsoleInfo, ["ConsoleInfo 1"]],
        [ConsoleLogType.ConsoleError, ["ConsoleError 2"]],
        [ConsoleLogType.ConsoleInfo, ["ConsoleInfo 2"]],
        [ConsoleLogType.ConsoleWarn, ["ConsoleWarn"]]
    ];

    test.beforeAll(() => {
        fs.rmSync(outputDir1, { force: true, recursive: true });
        fs.rmSync(outputDir2, { force: true, recursive: true });
        fs.rmSync(outputDir3, { force: true, recursive: true });
    });

    test("Should create a file with filtered entries", async ({ page, watchTheConsole }) => {
        await page.goto(staticUrl);

        await createConsoleLog(page, logQueue);

        await waitForRecords(watchTheConsole, logQueue.length + 1);

        watchTheConsole.writeLogToFile(outputDir1, {
            filter: (type) => type === ConsoleLogType.ConsoleError
        });
        watchTheConsole.writeLogToFile(outputDir2, {
            filter: (_type, message) => String(message).startsWith("ConsoleInfo")
        });
        watchTheConsole.writeLogToFile(outputDir3, { filter: () => false });

        const outputFileName1 = createOutputFileName(outputDir1);
        const outputFileName2 = createOutputFileName(outputDir2);
        const outputFileName3 = createOutputFileName(outputDir3);

        const log1 = readLog(outputFileName1);

        expect(log1.length).toEqual(2);
        expect(log1[0].type).toEqual(ConsoleLogType.ConsoleError);
        expect(new Date(log1[0].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log1[0].currentTime).toBe("string");
        expect(log1[0].currentTime).not.toEqual("");
        expect(log1[0].args).toEqual(logQueue[1][1]);
        expect(log1[1].type).toEqual(ConsoleLogType.ConsoleError);
        expect(new Date(log1[1].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log1[1].currentTime).toBe("string");
        expect(log1[1].currentTime).not.toEqual("");
        expect(log1[1].args).toEqual(logQueue[3][1]);

        const log2 = readLog(outputFileName2);

        expect(log2.length).toEqual(2);
        expect(log2[0].type).toEqual(ConsoleLogType.ConsoleInfo);
        expect(new Date(log2[0].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log2[0].currentTime).toBe("string");
        expect(log2[0].currentTime).not.toEqual("");
        expect(log2[0].args).toEqual(logQueue[2][1]);
        expect(log2[1].type).toEqual(ConsoleLogType.ConsoleInfo);
        expect(new Date(log2[1].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log2[1].currentTime).toBe("string");
        expect(log2[1].currentTime).not.toEqual("");
        expect(log2[1].args).toEqual(logQueue[4][1]);

        expect(fs.existsSync(outputFileName3)).toBe(false);
    });
});

test.describe("Filtering with an object", () => {
    const outputDir1 = `${outputDir}/console_1`;
    const outputDir2 = `${outputDir}/console_2`;
    const outputDir3 = `${outputDir}/console_3`;

    const logQueue: LogQueue = [
        [
            ConsoleLogType.ConsoleInfo,
            [{ message: "ConsoleInfo 1" }, { arr: [1, 2, 3, "e"], second: { object: 123 } }]
        ],
        [ConsoleLogType.ConsoleError, [{ message: "ConsoleError 1" }]],
        [ConsoleLogType.ConsoleLog, [{ message: "ConsoleLog" }]],
        [
            ConsoleLogType.ConsoleError,
            [{ error: { stack: "string" } }, { arr: [false, 0, null, ""] }]
        ],
        [ConsoleLogType.ConsoleInfo, [{ i: "ConsoleInfo 2" }, { arr: [] }]],
        [ConsoleLogType.ConsoleWarn, ["ConsoleWarn"]],
        [ConsoleLogType.ConsoleInfo, [null]],
        [ConsoleLogType.ConsoleLog, [[true, false, 0, null, ""]]]
    ];

    test.beforeAll(() => {
        fs.rmSync(outputDir1, { force: true, recursive: true });
        fs.rmSync(outputDir2, { force: true, recursive: true });
        fs.rmSync(outputDir3, { force: true, recursive: true });
    });

    test("Should create a file with filtered entries", async ({ page, watchTheConsole }) => {
        await page.goto(staticUrl);

        await createConsoleLog(page, logQueue);

        await waitForRecords(watchTheConsole, logQueue.length + 1);

        watchTheConsole.writeLogToFile(outputDir1, {
            filter: (_type, obj1) => typeof obj1 === "object" && obj1 !== null && "message" in obj1
        });
        watchTheConsole.writeLogToFile(outputDir2, {
            filter: (_type, _obj1, obj2) =>
                typeof obj2 === "object" &&
                obj2 !== null &&
                "arr" in obj2 &&
                Array.isArray(obj2.arr) &&
                obj2.arr.length > 0
        });
        watchTheConsole.writeLogToFile(outputDir3, {
            filter: (_type, obj1) => typeof obj1 === "string"
        });

        const outputFileName1 = createOutputFileName(outputDir1);
        const outputFileName2 = createOutputFileName(outputDir2);
        const outputFileName3 = createOutputFileName(outputDir3);

        const log1 = readLog(outputFileName1);

        expect(log1.length).toEqual(3);
        expect(log1[0].type).toEqual(ConsoleLogType.ConsoleInfo);
        expect(new Date(log1[0].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log1[0].currentTime).toBe("string");
        expect(log1[0].currentTime).not.toEqual("");
        expect(log1[0].args).toEqual(logQueue[0][1]);
        expect(log1[1].type).toEqual(ConsoleLogType.ConsoleError);
        expect(new Date(log1[1].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log1[1].currentTime).toBe("string");
        expect(log1[1].currentTime).not.toEqual("");
        expect(log1[1].args).toEqual(logQueue[1][1]);
        expect(log1[2].type).toEqual(ConsoleLogType.ConsoleLog);
        expect(new Date(log1[1].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log1[2].currentTime).toBe("string");
        expect(log1[2].currentTime).not.toEqual("");
        expect(log1[2].args).toEqual(logQueue[2][1]);

        const log2 = readLog(outputFileName2);

        expect(log2.length).toEqual(2);
        expect(log2[0].type).toEqual(ConsoleLogType.ConsoleInfo);
        expect(new Date(log2[0].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log2[0].currentTime).toBe("string");
        expect(log2[0].currentTime).not.toEqual("");
        expect(log2[0].args).toEqual(logQueue[0][1]);
        expect(log2[1].type).toEqual(ConsoleLogType.ConsoleError);
        expect(new Date(log2[1].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log2[1].currentTime).toBe("string");
        expect(log2[1].currentTime).not.toEqual("");
        expect(log2[1].args).toEqual(logQueue[3][1]);

        const log3 = readLog(outputFileName3);

        expect(log3.length).toEqual(2);
        expect(log3[0].type).toEqual(ConsoleLogType.Error);
        expect(new Date(log3[0].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log3[0].args[0]).toBe("string");
        expect(log3[0].args[0]).not.toEqual("");
        expect(typeof log3[0].currentTime).toBe("string");
        expect(log3[1].type).toEqual(ConsoleLogType.ConsoleWarn);
        expect(new Date(log3[1].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log3[1].currentTime).toBe("string");
        expect(log3[1].currentTime).not.toEqual("");
        expect(log3[1].args).toEqual(logQueue[5][1]);
    });
});

test.describe("JSON.stringify function or recursive object", () => {
    test.beforeAll(() => {
        fs.rmSync(outputDir, { force: true, recursive: true });
    });

    /**
     * Build the recursive / non-serializable arguments **inside the browser** and log them. The
     * Cypress suite created these objects in the (browser) test context; here they must exist in the
     * page so `watchTheConsole` can serialize them back to Node.
     */
    const logSpecialValues = (page: Page) =>
        page.evaluate(() => {
            const recursiveObject: Record<string, unknown> = {};

            recursiveObject.something = 123;
            recursiveObject.a = true;
            recursiveObject.arr = [recursiveObject];

            const recursiveArray: Array<unknown> = [];

            recursiveArray[0] = [recursiveArray];

            function abc() {
                return true;
            }

            window.console.info({ recursiveObject }, { recursiveArray });
            window.console.error({
                fnc: abc,
                symbol: Symbol("My"),
                weakMap: new WeakMap([[{}, ""]]),
                weakSet: new WeakSet([{}, {}])
            });
        });

    const testCase = async (page: Page, watchTheConsole: WatchTheConsole, prettyOutput = true) => {
        await page.goto("/");

        await logSpecialValues(page);

        await waitForRecords(watchTheConsole, 2);

        watchTheConsole.writeLogToFile(outputDir, { prettyOutput });

        const outputFileName = createOutputFileName(outputDir);

        const log = readLog(outputFileName);

        expect(log.length).toEqual(2);
        expect(log[0].type).toEqual(ConsoleLogType.ConsoleInfo);
        expect(new Date(log[0].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log[0].currentTime).toBe("string");
        expect(log[0].currentTime).not.toEqual("");
        // circular references are collapsed to "[Circular]" (same marker as cypress-interceptor)
        expect(log[0].args).toEqual([
            {
                recursiveObject: {
                    something: 123,
                    a: true,
                    arr: ["[Circular]"]
                }
            },
            {
                recursiveArray: [["[Circular]"]]
            }
        ]);
        expect(log[1].type).toEqual(ConsoleLogType.ConsoleError);
        expect(new Date(log[1].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log[1].currentTime).toBe("string");
        expect(log[1].currentTime).not.toEqual("");
        // Adaptation: `jsonValue()` drops functions and symbols and serializes WeakMap/WeakSet as
        // `{}` (Cypress' cloning serializer produced `String(fn)` / "Symbol" / "WeakMap" / "WeakSet").
        expect(log[1].args).toEqual([
            {
                weakMap: {},
                weakSet: {}
            }
        ]);
    };

    test("Should create a file with cloned entries - with pretty output", async ({
        page,
        watchTheConsole
    }) => {
        watchTheConsole.setOptions({ cloneConsoleArguments: true });

        await testCase(page, watchTheConsole);
    });

    test("Should create a file with cloned entries - without pretty output", async ({
        page,
        watchTheConsole
    }) => {
        watchTheConsole.setOptions({ cloneConsoleArguments: true });

        await testCase(page, watchTheConsole, false);
    });

    test("Should create a file with cloned log - with pretty output", async ({
        page,
        watchTheConsole
    }) => {
        watchTheConsole.setOptions({ cloneConsoleArguments: false });

        await testCase(page, watchTheConsole);
    });

    test("Should create a file with cloned log - without pretty output", async ({
        page,
        watchTheConsole
    }) => {
        watchTheConsole.setOptions({ cloneConsoleArguments: false });

        await testCase(page, watchTheConsole, false);
    });
});

test.describe("JSON.stringify multiple types and deeply nested objects", () => {
    test.beforeAll(() => {
        fs.rmSync(outputDir, { force: true, recursive: true });
    });

    test.beforeEach(({ watchTheConsole }) => {
        watchTheConsole.setOptions({ cloneConsoleArguments: true });
    });

    /** Deeply nested, self-referencing object serialization (built in the browser). */
    const logDeeplyNested = (page: Page) =>
        page.evaluate(() => {
            const recursiveObject: Record<string, unknown> = {};

            function abcd() {
                return false;
            }

            recursiveObject.abc = "abc";
            recursiveObject.bool = false;
            recursiveObject.n = null;
            recursiveObject.u = undefined;
            recursiveObject.rec = {
                arr: [9, false, true, NaN, recursiveObject],
                obj: {
                    ref: recursiveObject
                },
                p: abcd
            };

            window.console.info({ recursiveObject }, [
                recursiveObject,
                recursiveObject,
                recursiveObject
            ]);
            window.console.warn([recursiveObject, recursiveObject], { more: { recursiveObject } });
        });

    test("Should create a file with filtered entries", async ({ page, watchTheConsole }) => {
        await page.goto("/");

        await logDeeplyNested(page);

        await waitForRecords(watchTheConsole, 2);

        watchTheConsole.writeLogToFile(outputDir, { prettyOutput: true });

        const outputFileName = createOutputFileName(outputDir);

        const log = readLog(outputFileName);

        // Adaptation: `jsonValue()` drops `undefined` (`u`) and function (`p`) properties, `NaN`
        // becomes `null` once written to the file, and circular references collapse to "[Circular]".
        const serialized = {
            abc: "abc",
            bool: false,
            n: null,
            rec: {
                arr: [9, false, true, null, "[Circular]"],
                obj: {
                    ref: "[Circular]"
                }
            }
        };

        expect(log[0].args).toEqual([
            {
                recursiveObject: serialized
            },
            [serialized, serialized, serialized]
        ]);

        expect(log[1].args).toEqual([
            [serialized, serialized],
            {
                more: {
                    recursiveObject: serialized
                }
            }
        ]);
    });
});

test.describe("Logging various JavaScript objects", () => {
    /**
     * A `Token` marks a value that cannot be sent across the Node <-> browser boundary and must be
     * built inside the page instead (functions, `Date`, `RegExp`, DOM nodes, React elements).
     */
    type Token = "function" | "date" | "regexp" | "div" | "button" | "react";

    /**
     * Single source of truth for the logged cases - it drives both the logging and the checking, so
     * a value is never written twice:
     * - `message`: the label logged next to the value.
     * - `value`: a JSON-serializable value sent to the browser and logged as-is.
     * - `token`: for non-serializable values, the real object is built in the browser from this tag.
     * - `expected`: the value after `watchTheConsole` serializes it back to Node. When omitted it
     *   defaults to `value` (i.e. the value survives serialization unchanged).
     */
    interface LogCase {
        message: string;
        value?: unknown;
        token?: Token;
        expected?: unknown;
    }

    const cases: LogCase[] = [
        { message: "String", value: "Hello, World!" },
        { message: "Number", value: 42 },
        { message: "Boolean", value: true },
        { message: "Null", value: null },
        // `undefined` is dropped by `jsonValue()`; `toEqual` ignores the `undefined` property.
        { message: "Undefined", value: undefined },
        { message: "Array", value: [1, 2, 3] },
        { message: "Object", value: { key: "value" } },
        // functions are dropped (no `String(fn)` clone in Playwright) -> only `{ message }` remains.
        { message: "Function", token: "function" },
        // `Date` / `RegExp` are collapsed to `{}` by `removeCircular`.
        { message: "Date", token: "date", expected: {} },
        { message: "RegExp", token: "regexp", expected: {} },
        // DOM nodes serialize to the placeholder string "ref: <Node>".
        { message: "DOM Element", token: "div", expected: "ref: <Node>" },
        { message: "Button Element", token: "button", expected: "ref: <Node>" },
        // the React element serializes structurally (its `$$typeof` symbol is dropped).
        {
            message: "React Element",
            token: "react",
            expected: {
                type: "div",
                key: null,
                ref: null,
                props: { children: "Hello, React!" },
                _owner: null
            }
        }
    ];

    // the `window` object serializes to the placeholder string "ref: <Window>".
    const windowExpected = "ref: <Window>";

    test.beforeAll(() => {
        fs.rmSync(outputDir, { force: true, recursive: true });
    });

    /**
     * Log every case in the browser (building the token-based values there). `extraLog` appends the
     * `window` object as an extra `console.info` entry.
     */
    const visitAndLog = async (page: Page, extraLog = false) => {
        await page.goto(staticUrl);

        await page.evaluate(
            ({ logCases, extra }) => {
                const win = window as Window & {
                    React?: {
                        createElement: (...args: unknown[]) => unknown;
                    };
                };

                const build = ({ token, value }: { token?: Token; value?: unknown }) => {
                    switch (token) {
                        case "function":
                            return () => {
                                return "Hello";
                            };
                        case "date":
                            return new Date("01-18-2025");
                        case "regexp":
                            return /abc/;
                        case "div":
                            return win.document.createElement("div");
                        case "button":
                            return win.document.createElement("button");
                        case "react":
                            return win.React?.createElement("div", null, "Hello, React!");
                        default:
                            return value;
                    }
                };

                for (const logCase of logCases) {
                    window.console.log({ message: logCase.message, value: build(logCase) });
                }

                if (extra) {
                    window.console.info(win);
                }
            },
            { logCases: cases, extra: extraLog }
        );
    };

    /** Shared assertions - the expected values come from the `cases` source of truth. */
    const checkLog = (log: ConsoleLog[], withWindow: boolean) => {
        expect(log.length).toEqual(cases.length + 1 + (withWindow ? 1 : 0));
        expect(log[0].type).toEqual(ConsoleLogType.Error);
        expect(new Date(log[0].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log[0].currentTime).toBe("string");
        expect(log[0].currentTime).not.toEqual("");
        expect(typeof log[0].args[0]).toBe("string");

        cases.forEach((logCase, index) => {
            const value = "expected" in logCase ? logCase.expected : logCase.value;

            expect(log[index + 1].args).toEqual([{ message: logCase.message, value }]);
        });

        if (withWindow) {
            expect(log[cases.length + 1].args).toEqual([windowExpected]);
        }
    };

    test("Should log various JavaScript objects - with clone", async ({
        page,
        watchTheConsole
    }) => {
        watchTheConsole.setOptions({ cloneConsoleArguments: true });

        await visitAndLog(page, true);

        await waitForRecords(watchTheConsole, cases.length + 2);

        watchTheConsole.writeLogToFile(outputDir, { prettyOutput: true });

        const outputFileName = createOutputFileName(outputDir);

        expect(fs.existsSync(outputFileName)).toBe(true);

        checkLog(readLog(outputFileName), true);
    });

    test("Should log various JavaScript objects - without clone", async ({
        page,
        watchTheConsole
    }) => {
        await visitAndLog(page);

        await waitForRecords(watchTheConsole, cases.length + 1);

        watchTheConsole.writeLogToFile(outputDir, { prettyOutput: true });

        const outputFileName = createOutputFileName(outputDir);

        expect(fs.existsSync(outputFileName)).toBe(true);

        checkLog(readLog(outputFileName), false);
    });
});

test.describe("WatchTheConsole API coverage", () => {
    test.beforeAll(() => {
        fs.rmSync(outputDir, { force: true, recursive: true });
    });

    test("exposes the recorded output grouped by type", async ({ page, watchTheConsole }) => {
        // the static page throws an intentional error -> populates the `jsError` getter
        await page.goto(staticUrl);

        const logQueue: LogQueue = [
            [ConsoleLogType.ConsoleLog, ["a log"]],
            [ConsoleLogType.ConsoleInfo, ["an info"]],
            [ConsoleLogType.ConsoleWarn, ["a warn"]],
            [ConsoleLogType.ConsoleError, ["an error"]]
        ];

        await createConsoleLog(page, logQueue);

        await waitForRecords(watchTheConsole, logQueue.length + 1);

        // each getter returns only the records of its own type
        expect(watchTheConsole.log.map((record) => record.args)).toEqual([["a log"]]);
        expect(watchTheConsole.info.map((record) => record.args)).toEqual([["an info"]]);
        expect(watchTheConsole.warn.map((record) => record.args)).toEqual([["a warn"]]);
        expect(watchTheConsole.error.map((record) => record.args)).toEqual([["an error"]]);

        expect(watchTheConsole.jsError).toHaveLength(1);
        expect(watchTheConsole.jsError[0].type).toEqual(ConsoleLogType.Error);
        expect(typeof watchTheConsole.jsError[0].args[0]).toBe("string");
    });

    test("ignores console types that are not tracked", async ({ page, watchTheConsole }) => {
        await page.goto("/");

        // `console.debug` has no mapping in the interceptor, so it must be ignored while the
        // `console.log` right after it is still recorded.
        await page.evaluate(() => {
            window.console.debug("debug message");
            window.console.log("log message");
        });

        await waitForRecords(watchTheConsole, 1);

        expect(watchTheConsole.records).toHaveLength(1);
        expect(watchTheConsole.log.map((record) => record.args)).toEqual([["log message"]]);
    });

    test("start and destroy are idempotent", async ({ page, watchTheConsole }) => {
        await page.goto("/");

        // the fixture already started it; calling start again while active is a no-op
        watchTheConsole.start();

        await page.evaluate(() => window.console.log("still watching"));

        await waitForRecords(watchTheConsole, 1);

        expect(watchTheConsole.log.map((record) => record.args)).toEqual([["still watching"]]);

        // the first destroy stops watching; the second (and the fixture teardown) is a no-op
        watchTheConsole.destroy();
        watchTheConsole.destroy();
    });
});
