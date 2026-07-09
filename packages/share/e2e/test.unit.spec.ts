import type { Page } from "@playwright/test";
import * as fs from "fs";
import { CallLine, CallLineStack, expect, FileNameMaxLength, test } from "playwright-interceptor";
import { getFilePath } from "playwright-interceptor/src/utils.node";
import { generateUrl } from "playwright-interceptor-server/src/utils";

import { getWorkerOutputDir } from "../src/constants";

/**
 * Ported from `packages/share/e2e/test.unit.cy.ts`.
 *
 * The Cypress suite exercised the call-line instrumentation two ways: by calling the browser-side
 * store helpers directly inside the test process (Cypress tests run in the browser), and through the
 * `cy.callLine*` commands. `playwright-interceptor` splits the feature into a browser part and a
 * Node part, and the `cy.callLine*` command layer (`test.unit.commands.ts`) is replaced by the Node
 * `CallLine` controller (`test.unit.node.ts`). The command -> controller mapping is 1:1:
 *
 *   cy.callLine()        -> the CallLine instance (its `array` / `current` / `length` / `next` getters)
 *   cy.callLineClean()   -> callLine.clean()
 *   cy.callLineCurrent() -> callLine.current()
 *   cy.callLineDisable() -> callLine.disable()
 *   cy.callLineEnable()  -> callLine.enable()
 *   cy.callLineLength()  -> callLine.length()
 *   cy.callLineNext()    -> callLine.next()
 *   cy.callLineReset()   -> callLine.reset()
 *   cy.callLineToFile()  -> callLine.writeToFile()
 *
 * The browser-side `lineCalled` / `lineCalledWithClone` are exposed on `window.testUnit` by the test
 * server (see `server/src/resources/callLine.ts`) and invoked here through `page.evaluate`.
 *
 * Adaptations from the Cypress suite:
 * - Controller reads are `async` (they read the browser `window` from Node), so the long
 *   synchronous `getCallLine().next` / `.current` chains become awaited calls.
 * - Reference-identity assertions for `lineCalledWithClone` (`.not.eq(original)`) have no meaning
 *   across the Node<->browser boundary (every value is serialized), so the clone behaviour is
 *   verified inside the browser instead (an object is mutated after being recorded and the stored
 *   value is checked).
 * - Cypress's `before`-hook scenario (enable in `before`, only the first test is enabled) is a
 *   Cypress lifecycle artifact. In Playwright every test is isolated with a fresh page and its own
 *   controller, so the equivalent is expressed as "enable per test" (see the last describe).
 */

// Worker-scoped so the `beforeAll` cleanup below never races another parallel worker.
const outputDir = getWorkerOutputDir("test.unit.spec.ts");
const publicUrl = generateUrl("/public/index.html");

/** `window.testUnit` is injected on the served page by `server/src/resources/callLine.ts`. */
type WindowWithTestUnit = Window & {
    testUnit: {
        lineCalled: (...args: unknown[]) => void;
        lineCalledWithClone: (...args: unknown[]) => void;
    };
};

const createOutputFileName = (
    titlePath: string[],
    fileName?: string,
    maxLength?: FileNameMaxLength
) => getFilePath({ fileName, maxLength, outputDir, titlePath, type: "callLine" });

/** Navigate to the static page and wait until the browser-side `testUnit` module is available. */
const gotoPublic = async (page: Page) => {
    await page.goto(publicUrl);
    await page.waitForFunction(
        () => typeof (window as unknown as WindowWithTestUnit).testUnit?.lineCalled === "function"
    );
};

/** Invoke the browser-side `lineCalled` with the given arguments. */
const lineCalled = (page: Page, ...args: unknown[]) =>
    page.evaluate((a) => (window as unknown as WindowWithTestUnit).testUnit.lineCalled(...a), args);

/** Invoke the browser-side `lineCalledWithClone` with the given arguments. */
const lineCalledWithClone = (page: Page, ...args: unknown[]) =>
    page.evaluate(
        (a) => (window as unknown as WindowWithTestUnit).testUnit.lineCalledWithClone(...a),
        args
    );

const argsOf = (stack: CallLineStack[]) => stack.map((entry) => entry.args);

test.beforeAll(() => {
    fs.rmSync(outputDir, { force: true, recursive: true });
});

test.describe("test.unit", () => {
    test("call line is disabled by default - lineCalled is a no-op", async ({ page }) => {
        const callLine = new CallLine(page, { titlePath: test.info().titlePath });

        await gotoPublic(page);

        await lineCalled(page, "this");
        await lineCalledWithClone(page, "this");

        expect(callLine.isEnabled).toBe(false);
        expect(await callLine.length()).toBe(0);
        expect(await callLine.current()).toBeUndefined();
        expect(await callLine.next()).toBeUndefined();
        expect(await callLine.next()).toBeUndefined();
    });

    test("enable, record and read entries", async ({ page }) => {
        const callLine = new CallLine(page, { titlePath: test.info().titlePath });

        await callLine.enable();
        await gotoPublic(page);

        const callLine1 = "this line has been called";

        await lineCalled(page, callLine1);

        expect(callLine.isEnabled).toBe(true);
        expect(await callLine.length()).toBe(1);

        expect(await callLine.current()).toBeUndefined();
        expect(await callLine.next()).toEqual(callLine1);
        expect(await callLine.current()).toEqual(callLine1);
        expect(await callLine.next()).toBeUndefined();
        expect(await callLine.current()).toEqual(callLine1);

        callLine.reset();

        expect(argsOf(await callLine.array())).toEqual([[callLine1]]);

        const callLine2 = "321";

        await lineCalled(page, callLine2);

        expect(argsOf(await callLine.array())).toEqual([[callLine1], [callLine2]]);
        expect(await callLine.length()).toBe(2);

        expect(await callLine.current()).toBeUndefined();
        expect(await callLine.next()).toEqual(callLine1);
        expect(await callLine.current()).toEqual(callLine1);
        expect(await callLine.next()).toEqual(callLine2);
        expect(await callLine.current()).toEqual(callLine2);
        expect(await callLine.next()).toBeUndefined();
        expect(await callLine.current()).toEqual(callLine2);
        expect(await callLine.next()).toBeUndefined();

        const callLine3 = "--";

        await lineCalled(page, callLine3);

        expect(argsOf(await callLine.array())).toEqual([[callLine1], [callLine2], [callLine3]]);
        expect(await callLine.length()).toBe(3);

        expect(await callLine.current()).toEqual(callLine2);
        expect(await callLine.next()).toEqual(callLine3);
        expect(await callLine.current()).toEqual(callLine3);
        expect(await callLine.next()).toBeUndefined();
        expect(await callLine.current()).toEqual(callLine3);

        callLine.reset();

        expect(argsOf(await callLine.array())).toEqual([[callLine1], [callLine2], [callLine3]]);
        expect(await callLine.length()).toBe(3);

        expect(await callLine.current()).toBeUndefined();
        expect(await callLine.next()).toEqual(callLine1);
        expect(await callLine.current()).toEqual(callLine1);
        expect(await callLine.next()).toEqual(callLine2);
        expect(await callLine.current()).toEqual(callLine2);
        expect(await callLine.next()).toEqual(callLine3);
        expect(await callLine.current()).toEqual(callLine3);
        expect(await callLine.next()).toBeUndefined();
        expect(await callLine.current()).toEqual(callLine3);

        await callLine.clean();

        expect(argsOf(await callLine.array())).toEqual([]);
        expect(await callLine.current()).toBeUndefined();
        expect(await callLine.length()).toBe(0);
        expect(await callLine.next()).toBeUndefined();
    });

    test("stores single vs. multiple arguments correctly", async ({ page }) => {
        const callLine = new CallLine(page, { titlePath: test.info().titlePath });

        await callLine.enable();
        await gotoPublic(page);

        // multiple arguments are stored as an array
        const arg1 = "arg1";
        const arg2 = { obj: 987, arr: [9, false, null, ""] };
        const arg3 = false;

        await lineCalled(page, arg1, arg2, arg3);

        expect(await callLine.next()).toEqual([arg1, arg2, arg3]);

        const current = (await callLine.current()) as unknown[];

        expect(current).toEqual([arg1, arg2, arg3]);
        expect(current[0]).toEqual(arg1);
        expect(current[1]).toEqual(arg2);
        expect(current[2]).toEqual(arg3);

        // multiple arguments through lineCalledWithClone
        const cloneArg1 = { l: "string", n: 999, b: true, a: [9, 8, [1, 2]] };
        const cloneArg2 = [9, 8, 7, { ea: ["y", 0, false, null] }];

        await lineCalledWithClone(page, cloneArg1, cloneArg2);

        expect(await callLine.next()).toEqual([cloneArg1, cloneArg2]);
        expect(await callLine.current()).toEqual([cloneArg1, cloneArg2]);

        // a single argument is stored as-is
        const single = "simple string";

        await lineCalledWithClone(page, single);

        expect(await callLine.next()).toEqual(single);
    });

    test("lineCalledWithClone clones the stored arguments", async ({ page }) => {
        const callLine = new CallLine(page, { titlePath: test.info().titlePath });

        await callLine.enable();
        await gotoPublic(page);

        await page.evaluate(() => {
            const win = window as unknown as WindowWithTestUnit;

            // recorded with a clone -> a later mutation must NOT affect the stored value
            const cloned = { value: 1 };

            win.testUnit.lineCalledWithClone(cloned);
            cloned.value = 2;

            // recorded without a clone -> a later mutation IS reflected in the stored value
            const notCloned = { value: 1 };

            win.testUnit.lineCalled(notCloned);
            notCloned.value = 2;
        });

        const array = await callLine.array();

        expect(array[0].args[0]).toEqual({ value: 1 });
        expect(array[1].args[0]).toEqual({ value: 2 });
    });

    test("next waits for a delayed entry", async ({ page }) => {
        const callLine = new CallLine(page, { titlePath: test.info().titlePath });

        await callLine.enable();
        await gotoPublic(page);

        const delayed = "111";

        await page.evaluate((value) => {
            setTimeout(() => {
                (window as unknown as WindowWithTestUnit).testUnit.lineCalled(value);
            }, 1000);
        }, delayed);

        // next() is a one-shot read; poll it until the delayed entry has been recorded
        await expect.poll(() => callLine.next()).toEqual(delayed);
    });
});

test.describe("writeToFile", () => {
    test("writes recorded entries to a file", async ({ page }) => {
        const callLine = new CallLine(page, { titlePath: test.info().titlePath });

        await callLine.enable();
        await gotoPublic(page);

        const callLine1 = "123";
        const callLine2 = "456";

        await lineCalled(page, callLine1);
        await lineCalled(page, callLine2);

        await callLine.writeToFile(outputDir);

        const file = JSON.parse(
            fs.readFileSync(createOutputFileName(test.info().titlePath), "utf8")
        ) as CallLineStack[];

        expect(argsOf(file)).toEqual([[callLine1], [callLine2]]);
    });

    test("writes only the filtered entries", async ({ page }) => {
        const callLine = new CallLine(page, { titlePath: test.info().titlePath });

        await callLine.enable();
        await gotoPublic(page);

        const callLine1 = ["abc", { o: false, n: { p: 1 } }];
        const callLine2 = "def";

        await lineCalled(page, ...callLine1);
        await lineCalled(page, callLine2);

        expect(argsOf(await callLine.array())).toEqual([[...callLine1], [callLine2]]);

        await callLine.writeToFile(outputDir, {
            filter: (entry) => entry.args.includes(callLine1[0]),
            prettyOutput: true
        });

        const file = JSON.parse(
            fs.readFileSync(createOutputFileName(test.info().titlePath), "utf8")
        ) as CallLineStack[];

        expect(argsOf(file)).toEqual([[...callLine1]]);
    });

    test("does not create a file when there is no data", async ({ page }) => {
        const callLine = new CallLine(page, { titlePath: test.info().titlePath });

        await callLine.enable();
        await gotoPublic(page);

        await callLine.writeToFile(outputDir);

        expect(fs.existsSync(createOutputFileName(test.info().titlePath))).toBe(false);
    });

    test("respects the max length as a number", async ({ page }) => {
        const callLine = new CallLine(page, { titlePath: test.info().titlePath });
        const maxLength = 30;
        const outputFileName = createOutputFileName(test.info().titlePath, undefined, maxLength);

        expect(outputFileName.length).toBeLessThan(
            createOutputFileName(test.info().titlePath).length
        );

        await callLine.enable();
        await gotoPublic(page);

        const callLine1 = "123";
        const callLine2 = "456";

        await lineCalled(page, callLine1);
        await lineCalled(page, callLine2);

        await callLine.writeToFile(outputDir, { maxLength });

        expect(fs.existsSync(outputFileName)).toBe(true);

        const file = JSON.parse(fs.readFileSync(outputFileName, "utf8")) as CallLineStack[];

        expect(argsOf(file)).toEqual([[callLine1], [callLine2]]);
    });

    test("respects the max length as an object", async ({ page }) => {
        const callLine = new CallLine(page, { titlePath: test.info().titlePath });
        const maxLength = { describe: 10, testName: 15 };
        const outputFileName = createOutputFileName(test.info().titlePath, undefined, maxLength);

        expect(outputFileName.length).toBeLessThan(
            createOutputFileName(test.info().titlePath).length
        );

        await callLine.enable();
        await gotoPublic(page);

        const callLine1 = "123";
        const callLine2 = "456";

        await lineCalled(page, callLine1);
        await lineCalled(page, callLine2);

        await callLine.writeToFile(outputDir, { maxLength });

        expect(fs.existsSync(outputFileName)).toBe(true);

        const file = JSON.parse(fs.readFileSync(outputFileName, "utf8")) as CallLineStack[];

        expect(argsOf(file)).toEqual([[callLine1], [callLine2]]);
    });
});

/**
 * A faithful port of the Cypress `testCallLine` helper. It records each entry on the served page and
 * verifies reading it back through the controller, resetting, filtering to a file, and cleaning.
 */
const testCallLine = async (
    page: Page,
    callLine: CallLine,
    titlePath: string[],
    logEntries: string[],
    isEnabled: boolean
) => {
    const fileName1 = `call-line-file-1-${Date.now()}`;
    const fileName2 = `call-line-file-2-${Date.now()}`;

    for (const entry of logEntries) {
        await lineCalled(page, entry);

        if (isEnabled) {
            expect(await callLine.next()).toEqual(entry);
        }

        expect(await callLine.next()).toBeUndefined();
    }

    callLine.reset();

    for (const entry of logEntries) {
        if (isEnabled) {
            expect(await callLine.next()).toEqual(entry);
        } else {
            expect(await callLine.next()).toBeUndefined();
        }
    }

    expect(await callLine.next()).toBeUndefined();

    const outputFileName1 = createOutputFileName(titlePath, fileName1);

    expect(fs.existsSync(outputFileName1)).toBe(false);

    if (isEnabled) {
        await callLine.writeToFile(outputDir, { fileName: fileName1 });

        const entries = JSON.parse(fs.readFileSync(outputFileName1, "utf8")) as CallLineStack[];

        expect(entries.length).toBe(logEntries.length);
        expect(entries.map((entry) => entry.args)).toEqual(logEntries.map((entry) => [entry]));
    } else {
        await callLine.writeToFile(outputDir, { fileName: fileName1 });
        expect(fs.existsSync(outputFileName1)).toBe(false);
    }

    await callLine.clean();

    expect(await callLine.next()).toBeUndefined();

    const outputFileName2 = createOutputFileName(titlePath, fileName2);

    expect(fs.existsSync(outputFileName2)).toBe(false);

    await callLine.writeToFile(outputDir, { fileName: fileName2 });

    expect(fs.existsSync(outputFileName2)).toBe(false);
};

/** The disabled sub-scenario: a `lineCalled` on a disabled call line records nothing. */
const expectDisabled = async (
    page: Page,
    callLine: CallLine,
    titlePath: string[],
    entry: string,
    fileName: string
) => {
    await lineCalled(page, entry);

    expect(await callLine.next()).toBeUndefined();
    expect((await callLine.array()).length).toBe(0);

    const outputFileName = createOutputFileName(titlePath, fileName);

    expect(fs.existsSync(outputFileName)).toBe(false);

    await callLine.writeToFile(outputDir, { fileName });

    expect(fs.existsSync(outputFileName)).toBe(false);
};

test.describe("callLine", () => {
    test("By default call line should be disabled", async ({ page }) => {
        const callLine = new CallLine(page, { titlePath: test.info().titlePath });

        await gotoPublic(page);

        await testCallLine(
            page,
            callLine,
            test.info().titlePath,
            ["call-line-1-b", "call-line-2-b"],
            false
        );
    });

    test("Enable call line during the test after visit", async ({ page }) => {
        const callLine = new CallLine(page, { titlePath: test.info().titlePath });

        await gotoPublic(page);

        await callLine.enable();

        await testCallLine(
            page,
            callLine,
            test.info().titlePath,
            ["call-line-1", "call-line-2"],
            true
        );

        await callLine.disable();

        await expectDisabled(
            page,
            callLine,
            test.info().titlePath,
            "call-line-3",
            "call-line-file-3"
        );
    });

    test("Enable call line during the test before visit", async ({ page }) => {
        const callLine = new CallLine(page, { titlePath: test.info().titlePath });

        await callLine.enable();

        await gotoPublic(page);

        await testCallLine(
            page,
            callLine,
            test.info().titlePath,
            ["call-line-1-a", "call-line-2-a"],
            true
        );

        await callLine.disable();

        await expectDisabled(
            page,
            callLine,
            test.info().titlePath,
            "call-line-3-a",
            "call-line-file-3"
        );
    });

    test("Should work with multiple visits", async ({ page }) => {
        const callLine = new CallLine(page, { titlePath: test.info().titlePath });

        await callLine.enable();

        // first visit
        await gotoPublic(page);
        await testCallLine(page, callLine, test.info().titlePath, ["record-1", "record-2"], true);

        // second visit - the store is re-installed fresh
        await gotoPublic(page);
        await testCallLine(page, callLine, test.info().titlePath, ["record-3", "record-4"], true);
    });

    test.describe("Enable call line in beforeEach and before visit", () => {
        let callLine: CallLine;

        test.beforeEach(async ({ page }) => {
            callLine = new CallLine(page, { titlePath: test.info().titlePath });

            await callLine.enable();
        });

        test("Should work with multiple visits", async ({ page }) => {
            await gotoPublic(page);
            await testCallLine(
                page,
                callLine,
                test.info().titlePath,
                ["record-1-a", "record-2-a"],
                true
            );

            await gotoPublic(page);
            await testCallLine(
                page,
                callLine,
                test.info().titlePath,
                ["record-3-a", "record-4-a"],
                true
            );
        });
    });

    test.describe("Enable call line in beforeEach - multiple tests", () => {
        let callLine: CallLine;

        test.beforeEach(async ({ page }) => {
            callLine = new CallLine(page, { titlePath: test.info().titlePath });

            await callLine.enable();
        });

        test("call line should be enabled - first test", async ({ page }) => {
            await gotoPublic(page);
            await testCallLine(
                page,
                callLine,
                test.info().titlePath,
                ["call-line-a1", "call-line-b1"],
                true
            );
        });

        test("call line should be enabled - second test", async ({ page }) => {
            await gotoPublic(page);
            await testCallLine(
                page,
                callLine,
                test.info().titlePath,
                ["call-line-a2", "call-line-b2"],
                true
            );
        });
    });

    test.describe("Enabling in one test does not leak into another", () => {
        // The Playwright equivalent of the Cypress `before`-hook scenario where only the first test
        // had the call line enabled. Each test has an isolated page and its own controller, so
        // enabling in one test can never affect another.
        test("the first test has the call line enabled", async ({ page }) => {
            const callLine = new CallLine(page, { titlePath: test.info().titlePath });

            await callLine.enable();
            await gotoPublic(page);

            expect(callLine.isEnabled).toBe(true);

            await testCallLine(
                page,
                callLine,
                test.info().titlePath,
                ["call-line-c1", "call-line-d1"],
                true
            );
        });

        test("the second test has the call line disabled", async ({ page }) => {
            const callLine = new CallLine(page, { titlePath: test.info().titlePath });

            // intentionally not enabled
            await gotoPublic(page);

            expect(callLine.isEnabled).toBe(false);

            await testCallLine(
                page,
                callLine,
                test.info().titlePath,
                ["call-line-c2", "call-line-d2"],
                false
            );
        });
    });
});
