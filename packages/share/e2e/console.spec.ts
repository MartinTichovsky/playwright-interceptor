/**
 * Ported from `packages/share/e2e/console.cy.ts`.
 *
 * Verifies WatchTheConsole: recording console output + uncaught JavaScript errors, writing the
 * captured log to a file (auto-generated name, strict name, max-length cutting, type/filter
 * selection) and the various JavaScript-object serialization cases.
 *
 * Adaptations from the Cypress suite:
 * - `cy.watchTheConsole()` -> the `watchTheConsole` fixture (created per test from
 *   `testInfo.titlePath`, started before the test, destroyed after).
 * - `cy.watchTheConsoleOptions(o)` -> `watchTheConsole.setOptions(o)`.
 * - `cy.writeConsoleLogToFile(dir, o)` -> `watchTheConsole.writeLogToFile(dir, o)` (writes the JSON
 *   synchronously via Node `fs`, so there is no `.then(...)`).
 * - `cy.readFile(path)` -> `JSON.parse(fs.readFileSync(path, "utf8"))`;
 *   `cy.task("doesFileExist", p)` -> `fs.existsSync(p)`; `cy.task("clearLogs", ...)` -> `fs.rmSync`.
 * - Console output is produced with `page.evaluate(() => { console.log(...); ... })` instead of
 *   `cy.window().then(win => win.console.log(...))`.
 * - Because Playwright resolves console arguments asynchronously (`page.on("console")` +
 *   `JSHandle.jsonValue()`), `waitForRecords` polls `watchTheConsole.records.length` and then
 *   flushes the internal queue before assertions run.
 * - The Cypress suite installs `Cypress.on("uncaught:exception", () => false)` because the static
 *   `public/index.html` throws an intentional error. Playwright does not fail a test on uncaught
 *   page errors, so that handler has no equivalent; the error is captured as `ConsoleLogType.Error`.
 *
 * `cloneConsoleArguments` no-op:
 * - In Cypress the console arguments are live browser references, so `cloneConsoleArguments` deep
 *   clones them (and strips circular refs). In Playwright the arguments arrive as already-serialized
 *   JSON values (Playwright serializes them in the browser before they reach Node), so the option is
 *   a no-op. The "with clone" / "without clone" tests therefore assert the *same* serialized values
 *   in Playwright; only the entry counts differ (the "with clone" case additionally logs `window`).
 *
 * Values that don't survive Playwright's `jsonValue()` serialization differ from Cypress and are
 * adapted (documented inline where they occur):
 * - functions and `undefined` object values are dropped from the serialized object.
 * - `Symbol`, `WeakMap`, `WeakSet` are dropped / become `{}`.
 * - DOM nodes and `window` become an opaque string (e.g. `"ref: <Node>"` / `"ref: <Window>"`).
 * - `Date` becomes `{}` (an empty object), so the round-trip `new Date(value)` assertion is dropped.
 * - Circular references are collapsed to the string `"[Circular]"` (matches the Cypress output).
 */

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

type LogQueue = [ConsoleLogType, unknown[]][];

const invalidDate = new Date("").toString();
const staticUrl = generateUrl("/public/index.html");
// Worker-scoped so the `beforeAll` cleanups below never race another parallel worker. The
// `outputDir1/2/3` variants derived from this inherit the same worker isolation.
const outputDir = getWorkerOutputDir("console.spec.ts");

/**
 * Reproduce the exact file path `writeLogToFile` produces for the current test. It uses the same
 * `getFilePath` helper and the same `titlePath` the `watchTheConsole` fixture is initialised with.
 */
const createOutputFileName = (
    titlePath: string[],
    fileName?: string,
    maxLength?: FileNameMaxLength
) => getFilePath({ fileName, maxLength, outputDir, titlePath, type: "console" });

/**
 * Produce the given console output inside the browser. The queue only carries JSON-serializable
 * arguments (strings / plain objects), so it can cross the `page.evaluate` boundary. Non-serializable
 * values (functions, DOM nodes, ...) are constructed inside dedicated `page.evaluate` blocks.
 */
const createConsoleLog = async (page: import("@playwright/test").Page, logQueue: LogQueue) => {
    await page.evaluate((queue) => {
        for (const [type, args] of queue) {
            switch (type) {
                case "console.log":
                    console.log(...args);
                    break;
                case "console.info":
                    console.info(...args);
                    break;
                case "console.warn":
                    console.warn(...args);
                    break;
                case "console.error":
                    console.error(...args);
                    break;
            }
        }
    }, logQueue);
};

/**
 * Wait until all expected console entries have been recorded, then settle the async queue.
 */
const waitForRecords = async (watchTheConsole: WatchTheConsole, expected: number) => {
    await expect.poll(() => watchTheConsole.records.length, { timeout: 15000 }).toBe(expected);
    await watchTheConsole.flush();
};

test.beforeEach(() => {
    test.setTimeout(60000);
});

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

        // logQueue + 1 uncaught error thrown by the static page
        await waitForRecords(watchTheConsole, logQueue.length + 1);

        watchTheConsole.writeLogToFile(outputDir);

        const outputFileName = createOutputFileName(test.info().titlePath);

        expect(fs.existsSync(outputFileName)).toBe(true);

        const checkTheLog = (log: ConsoleLog[]) => {
            expect(log.length).toEqual(logQueue.length + 1);
            expect(log[0].type).toEqual(ConsoleLogType.Error);
            expect(new Date(log[0].dateTime).toString()).not.toEqual(invalidDate);
            expect(typeof log[0].currentTime).toBe("string");
            expect(log[0].currentTime.length).toBeGreaterThan(0);
            expect(typeof log[0].args[0]).toBe("string");
            expect(log[1].type).toEqual(ConsoleLogType.ConsoleLog);
            expect(new Date(log[1].dateTime).toString()).not.toEqual(invalidDate);
            expect(log[1].args).toEqual(logQueue[0][1]);
            expect(log[2].type).toEqual(ConsoleLogType.ConsoleInfo);
            expect(new Date(log[2].dateTime).toString()).not.toEqual(invalidDate);
            expect(log[2].args).toEqual(logQueue[1][1]);
        };

        checkTheLog(JSON.parse(fs.readFileSync(outputFileName, "utf8")) as ConsoleLog[]);

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

        const outputFileName = createOutputFileName(test.info().titlePath);

        expect(fs.existsSync(outputFileName)).toBe(true);

        const log = JSON.parse(fs.readFileSync(outputFileName, "utf8")) as ConsoleLog[];

        expect(log.length).toEqual(logQueue.length + 1);
        expect(log[0].type).toEqual(ConsoleLogType.Error);
        expect(typeof log[0].args[0]).toBe("string");
        expect(log[1].type).toEqual(ConsoleLogType.ConsoleWarn);
        expect(log[1].args).toEqual(logQueue[0][1]);
        expect(log[2].type).toEqual(ConsoleLogType.ConsoleError);
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

        const outputFileName = createOutputFileName(test.info().titlePath, fileName);

        expect(fs.existsSync(outputFileName)).toBe(true);

        const log = JSON.parse(fs.readFileSync(outputFileName, "utf8")) as ConsoleLog[];

        expect(log.length).toEqual(logQueue.length + 1);
        expect(log[0].type).toEqual(ConsoleLogType.Error);
        expect(typeof log[0].args[0]).toBe("string");
        expect(log[1].type).toEqual(ConsoleLogType.ConsoleError);
        expect(log[1].args).toEqual(logQueue[0][1]);
        expect(log[2].type).toEqual(ConsoleLogType.ConsoleInfo);
        expect(log[2].args).toEqual(logQueue[1][1]);
        expect(log[3].type).toEqual(ConsoleLogType.ConsoleLog);
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

        test("Should cut the generated name when maxLength is a number", ({ watchTheConsole }) => {
            const titlePath = test.info().titlePath;
            const outputFileName = createOutputFileName(titlePath, undefined, maxLengthNumber);

            expect(outputFileName.length).toBeLessThan(createOutputFileName(titlePath).length);

            watchTheConsole.writeLogToFile(outputDir, { maxLength: maxLengthNumber });

            expect(fs.existsSync(outputFileName)).toBe(true);

            const log = JSON.parse(fs.readFileSync(outputFileName, "utf8")) as ConsoleLog[];

            expect(log.length).toEqual(logQueue.length + 1);
        });

        test("Should cut the describe and the test name when maxLength is an object", ({
            watchTheConsole
        }) => {
            const titlePath = test.info().titlePath;
            const outputFileName = createOutputFileName(titlePath, undefined, maxLengthObject);

            expect(outputFileName.length).toBeLessThan(createOutputFileName(titlePath).length);

            watchTheConsole.writeLogToFile(outputDir, { maxLength: maxLengthObject });

            expect(fs.existsSync(outputFileName)).toBe(true);

            const log = JSON.parse(fs.readFileSync(outputFileName, "utf8")) as ConsoleLog[];

            expect(log.length).toEqual(logQueue.length + 1);
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

    test("Should create a file with console error types", ({ watchTheConsole }) => {
        watchTheConsole.writeLogToFile(outputDir, { types: [ConsoleLogType.ConsoleError] });

        const outputFileName = createOutputFileName(test.info().titlePath);

        const log = JSON.parse(fs.readFileSync(outputFileName, "utf8")) as ConsoleLog[];

        expect(log.length).toEqual(2);
        expect(log[0].type).toEqual(ConsoleLogType.ConsoleError);
        expect(log[0].args).toEqual(logQueue[1][1]);
        expect(log[1].type).toEqual(ConsoleLogType.ConsoleError);
        expect(log[1].args).toEqual(logQueue[3][1]);
    });

    test("Should create a file with console info and log types", ({ watchTheConsole }) => {
        watchTheConsole.writeLogToFile(outputDir, {
            types: [ConsoleLogType.ConsoleInfo, ConsoleLogType.ConsoleLog]
        });

        const outputFileName = createOutputFileName(test.info().titlePath);

        const log = JSON.parse(fs.readFileSync(outputFileName, "utf8")) as ConsoleLog[];

        expect(log.length).toEqual(2);
        expect(log[0].type).toEqual(ConsoleLogType.ConsoleLog);
        expect(log[0].args).toEqual(logQueue[0][1]);
        expect(log[1].type).toEqual(ConsoleLogType.ConsoleInfo);
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

        const outputFileName1 = createOutputFileName(test.info().titlePath).replace(
            outputDir,
            outputDir1
        );
        const outputFileName2 = createOutputFileName(test.info().titlePath).replace(
            outputDir,
            outputDir2
        );
        const outputFileName3 = createOutputFileName(test.info().titlePath).replace(
            outputDir,
            outputDir3
        );

        const log1 = JSON.parse(fs.readFileSync(outputFileName1, "utf8")) as ConsoleLog[];

        expect(log1.length).toEqual(2);
        expect(log1[0].type).toEqual(ConsoleLogType.ConsoleError);
        expect(log1[0].args).toEqual(logQueue[1][1]);
        expect(log1[1].type).toEqual(ConsoleLogType.ConsoleError);
        expect(log1[1].args).toEqual(logQueue[3][1]);

        const log2 = JSON.parse(fs.readFileSync(outputFileName2, "utf8")) as ConsoleLog[];

        expect(log2.length).toEqual(2);
        expect(log2[0].type).toEqual(ConsoleLogType.ConsoleInfo);
        expect(log2[0].args).toEqual(logQueue[2][1]);
        expect(log2[1].type).toEqual(ConsoleLogType.ConsoleInfo);
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

        const outputFileName1 = createOutputFileName(test.info().titlePath).replace(
            outputDir,
            outputDir1
        );
        const outputFileName2 = createOutputFileName(test.info().titlePath).replace(
            outputDir,
            outputDir2
        );
        const outputFileName3 = createOutputFileName(test.info().titlePath).replace(
            outputDir,
            outputDir3
        );

        const log1 = JSON.parse(fs.readFileSync(outputFileName1, "utf8")) as ConsoleLog[];

        expect(log1.length).toEqual(3);
        expect(log1[0].type).toEqual(ConsoleLogType.ConsoleInfo);
        expect(log1[0].args).toEqual(logQueue[0][1]);
        expect(log1[1].type).toEqual(ConsoleLogType.ConsoleError);
        expect(log1[1].args).toEqual(logQueue[1][1]);
        expect(log1[2].type).toEqual(ConsoleLogType.ConsoleLog);
        expect(log1[2].args).toEqual(logQueue[2][1]);

        const log2 = JSON.parse(fs.readFileSync(outputFileName2, "utf8")) as ConsoleLog[];

        expect(log2.length).toEqual(2);
        expect(log2[0].type).toEqual(ConsoleLogType.ConsoleInfo);
        expect(log2[0].args).toEqual(logQueue[0][1]);
        expect(log2[1].type).toEqual(ConsoleLogType.ConsoleError);
        expect(log2[1].args).toEqual(logQueue[3][1]);

        const log3 = JSON.parse(fs.readFileSync(outputFileName3, "utf8")) as ConsoleLog[];

        expect(log3.length).toEqual(2);
        expect(log3[0].type).toEqual(ConsoleLogType.Error);
        expect(typeof log3[0].args[0]).toBe("string");
        expect(log3[1].type).toEqual(ConsoleLogType.ConsoleWarn);
        expect(log3[1].args).toEqual(logQueue[5][1]);
    });
});

test.describe("Recursive objects and non-serializable values", () => {
    test.beforeAll(() => {
        fs.rmSync(outputDir, { force: true, recursive: true });
    });

    // In Cypress this describe distinguishes clone vs. no-clone. In Playwright `cloneConsoleArguments`
    // is a no-op (args are already serialized), so all four permutations produce the same output.
    // The circular-reference collapsing to "[Circular]" is done by the library and matches Cypress.
    const runTestCase = async (
        page: import("@playwright/test").Page,
        watchTheConsole: WatchTheConsole,
        prettyOutput: boolean
    ) => {
        await page.goto("/");

        await page.evaluate(() => {
            const recursiveObject: Record<string, unknown> = {};

            recursiveObject.something = 123;
            recursiveObject.a = true;
            recursiveObject.arr = [recursiveObject];

            const recursiveArray: unknown[] = [];

            recursiveArray[0] = [recursiveArray];

            function abc() {
                return true;
            }

            console.info({ recursiveObject }, { recursiveArray });

            console.error({
                fnc: abc,
                symbol: Symbol("My"),
                weakMap: new WeakMap([[{}, ""]]),
                weakSet: new WeakSet([{}, {}])
            });
        });

        // 2 console entries, visiting "/" does not throw an uncaught error
        await waitForRecords(watchTheConsole, 2);

        watchTheConsole.writeLogToFile(outputDir, { prettyOutput });

        const outputFileName = createOutputFileName(test.info().titlePath);

        const log = JSON.parse(fs.readFileSync(outputFileName, "utf8")) as ConsoleLog[];

        expect(log.length).toEqual(2);
        expect(log[0].type).toEqual(ConsoleLogType.ConsoleInfo);
        // Circular references are collapsed to "[Circular]" - identical to the Cypress output.
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
        // Adaptation: Playwright's `jsonValue()` drops functions and symbols, and serializes
        // WeakMap/WeakSet as empty objects (Cypress recorded them as "WeakMap"/"WeakSet"/String(fn)).
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

        await runTestCase(page, watchTheConsole, true);
    });

    test("Should create a file with cloned entries - without pretty output", async ({
        page,
        watchTheConsole
    }) => {
        watchTheConsole.setOptions({ cloneConsoleArguments: true });

        await runTestCase(page, watchTheConsole, false);
    });

    test("Should create a file with cloned log - with pretty output", async ({
        page,
        watchTheConsole
    }) => {
        watchTheConsole.setOptions({ cloneConsoleArguments: false });

        await runTestCase(page, watchTheConsole, true);
    });

    test("Should create a file with cloned log - without pretty output", async ({
        page,
        watchTheConsole
    }) => {
        watchTheConsole.setOptions({ cloneConsoleArguments: false });

        await runTestCase(page, watchTheConsole, false);
    });
});

test.describe("Multiple types and deeply nested objects", () => {
    test.beforeAll(() => {
        fs.rmSync(outputDir, { force: true, recursive: true });
    });

    test("Should create a file with the serialized entries", async ({ page, watchTheConsole }) => {
        watchTheConsole.setOptions({ cloneConsoleArguments: true });

        await page.goto("/");

        await page.evaluate(() => {
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
            console.info({ recursiveObject }, [recursiveObject, recursiveObject, recursiveObject]);
            console.warn([recursiveObject, recursiveObject], { more: { recursiveObject } });
        });

        await waitForRecords(watchTheConsole, 2);

        watchTheConsole.writeLogToFile(outputDir, { prettyOutput: true });

        const outputFileName = createOutputFileName(test.info().titlePath);

        const log = JSON.parse(fs.readFileSync(outputFileName, "utf8")) as ConsoleLog[];

        // The serialized form of `recursiveObject` after Playwright's `jsonValue()`:
        // - `u: undefined` is dropped, `NaN` becomes `null`, the circular refs become "[Circular]",
        // - `p` (a function) is dropped (Cypress recorded it as String(abcd)).
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
            { recursiveObject: serialized },
            [serialized, serialized, serialized]
        ]);
        expect(log[1].args).toEqual([
            [serialized, serialized],
            { more: { recursiveObject: serialized } }
        ]);
    });
});

test.describe("Logging various JavaScript objects", () => {
    test.beforeAll(() => {
        fs.rmSync(outputDir, { force: true, recursive: true });
    });

    /**
     * Log the 13 "various JavaScript objects" inside the browser. When `extraLog` is `true` an extra
     * `console.info(window)` entry is appended (matches the Cypress "with clone" case).
     */
    const visitAndLog = async (page: import("@playwright/test").Page, extraLog = false) => {
        await page.goto(staticUrl);

        await page.evaluate((withExtra) => {
            const customFunction = () => "Hello";

            const w = window as unknown as {
                React?: { createElement: (...args: unknown[]) => unknown };
            };

            console.log({ message: "String", value: "Hello, World!" });
            console.log({ message: "Number", value: 42 });
            console.log({ message: "Boolean", value: true });
            console.log({ message: "Null", value: null });
            console.log({ message: "Undefined", value: undefined });
            console.log({ message: "Array", value: [1, 2, 3] });
            console.log({ message: "Object", value: { key: "value" } });
            console.log({ message: "Function", value: customFunction });
            console.log({ message: "Date", value: new Date("01-18-2025") });
            console.log({ message: "RegExp", value: /abc/ });
            console.log({ message: "DOM Element", value: document.createElement("div") });
            console.log({ message: "Button Element", value: document.createElement("button") });
            console.log({
                message: "React Element",
                value: w.React?.createElement("div", null, "Hello, React!")
            });

            if (withExtra) {
                console.info(window);
            }
        }, extraLog);
    };

    /**
     * Assert the 13 common serialized entries (`log[1]` .. `log[13]`, after the leading uncaught
     * error at `log[0]`). Because `cloneConsoleArguments` is a no-op in Playwright these values are
     * identical for the "with clone" and "without clone" cases.
     */
    const assertCommonLogs = (log: ConsoleLog[]) => {
        expect(log[0].type).toEqual(ConsoleLogType.Error);
        expect(new Date(log[0].dateTime).toString()).not.toEqual(invalidDate);
        expect(typeof log[0].args[0]).toBe("string");
        expect(log[1].args).toEqual([{ message: "String", value: "Hello, World!" }]);
        expect(log[2].args).toEqual([{ message: "Number", value: 42 }]);
        expect(log[3].args).toEqual([{ message: "Boolean", value: true }]);
        expect(log[4].args).toEqual([{ message: "Null", value: null }]);
        // `undefined` values are dropped by serialization
        expect(log[5].args).toEqual([{ message: "Undefined" }]);
        expect(log[6].args).toEqual([{ message: "Array", value: [1, 2, 3] }]);
        expect(log[7].args).toEqual([{ message: "Object", value: { key: "value" } }]);
        // functions are dropped by serialization (Cypress "with clone" recorded String(fn))
        expect(log[8].args).toEqual([{ message: "Function" }]);

        // Date serializes to `{}` in Playwright, so the round-trip `new Date(value)` check is dropped
        const dateEntry = log[9].args[0] as { message: string };

        expect(dateEntry.message).toEqual("Date");
        expect(log[10].args).toEqual([{ message: "RegExp", value: {} }]);

        // DOM nodes serialize to an opaque string in Playwright (Cypress: "HTMLDivElement" / {})
        const domEntry = log[11].args[0] as { message: string; value: unknown };

        expect(domEntry.message).toEqual("DOM Element");
        expect(typeof domEntry.value).toBe("string");

        const buttonEntry = log[12].args[0] as { message: string; value: unknown };

        expect(buttonEntry.message).toEqual("Button Element");
        expect(typeof buttonEntry.value).toBe("string");
        // React elements serialize to the plain element object (matches Cypress "without clone")
        expect(log[13].args).toEqual([
            {
                message: "React Element",
                value: {
                    type: "div",
                    key: null,
                    ref: null,
                    props: {
                        children: "Hello, React!"
                    },
                    _owner: null
                }
            }
        ]);
    };

    test("Should log various JavaScript objects - with clone", async ({
        page,
        watchTheConsole
    }) => {
        watchTheConsole.setOptions({ cloneConsoleArguments: true });

        await visitAndLog(page, true);

        // 13 logs + 1 window info + 1 uncaught error
        await waitForRecords(watchTheConsole, 15);

        watchTheConsole.writeLogToFile(outputDir, { prettyOutput: true });

        const outputFileName = createOutputFileName(test.info().titlePath);

        expect(fs.existsSync(outputFileName)).toBe(true);

        const log = JSON.parse(fs.readFileSync(outputFileName, "utf8")) as ConsoleLog[];

        expect(log.length).toEqual(15);
        assertCommonLogs(log);
        // window serializes to an opaque string in Playwright (Cypress recorded "Window")
        expect(typeof log[14].args[0]).toBe("string");
    });

    test("Should log various JavaScript objects - without clone", async ({
        page,
        watchTheConsole
    }) => {
        await visitAndLog(page);

        // 13 logs + 1 uncaught error
        await waitForRecords(watchTheConsole, 14);

        watchTheConsole.writeLogToFile(outputDir, { prettyOutput: true });

        const outputFileName = createOutputFileName(test.info().titlePath);

        expect(fs.existsSync(outputFileName)).toBe(true);

        const log = JSON.parse(fs.readFileSync(outputFileName, "utf8")) as ConsoleLog[];

        expect(log.length).toEqual(14);
        assertCommonLogs(log);
    });
});
