import { expect, test } from "playwright-interceptor";
import { deepCopy, removeUndefinedFromObject } from "playwright-interceptor/src/utils";
import {
    getFileNameFromTitlePath,
    getFilePath,
    normalizeFileName
} from "playwright-interceptor/src/utils.node";

/**
 * Ported from `packages/share/e2e/coverage.cy.ts`.
 *
 * The Cypress `coverage.cy.ts` is a unit-test suite whose main purpose is to reach coverage of the
 * interceptor's internal helpers. Most of it targets Cypress-only implementation details that have
 * no counterpart in `playwright-interceptor` (which intercepts at the network level with
 * `page.route` in Node instead of patching the browser `window`):
 *
 * - `ConsoleProxy`, `createConsoleProxy`, `RequestProxy`, `createRequestProxy`,
 *   `createWebsocketProxy`, `WebsocketListener` - the browser-side proxies that Cypress installs on
 *   `window.fetch` / `XMLHttpRequest` / `WebSocket` / `console`. The Playwright interceptor never
 *   patches `window`, so these classes/functions do not exist.
 * - `CallLineEnum` branch markers, `writeFileSync`, and the Node-environment mocking (`mockRequire`
 *   / `mockNodeEnvironment`) used to unit-test the report generator internals.
 *
 * What IS portable are the pure utility functions that `playwright-interceptor` ships with the same
 * behaviour. Those are ported below as active tests. The convert helpers (`xmlDocumentToObject`,
 * `objectToFormData`, ...) require the DOM and are covered in `functions.spec.ts`.
 */

test.describe("Coverage", () => {
    test.describe("Utils", () => {
        test("deepCopy - returns an independent deep copy", () => {
            const arr = [
                1,
                [
                    1,
                    [1],
                    {
                        a: 1,
                        b: [1],
                        c: {
                            a: 1,
                            b: [1, { a: 1 }],
                            c: { a: 1 }
                        }
                    }
                ]
            ];
            const obj = {
                a: 1,
                b: [
                    1,
                    [
                        1,
                        [
                            1,
                            [
                                1,
                                [1],
                                {
                                    a: 1,
                                    b: [1],
                                    c: {
                                        a: 1,
                                        b: [1, { a: 1 }],
                                        c: { a: 1 }
                                    }
                                }
                            ]
                        ],
                        {
                            a: 1,
                            b: [1],
                            c: {
                                a: 1,
                                b: [1, { a: 1 }],
                                c: { a: 1 }
                            }
                        }
                    ],
                    { a: 1 }
                ],
                c: {
                    a: 1,
                    b: [1, { a: 1 }],
                    c: { a: 1 }
                }
            };

            const arrCopy = deepCopy(arr);
            const objCopy = deepCopy(obj);

            const changeValues = (subject: Record<string, unknown> | Array<unknown>) => {
                const entries = Object.entries(subject);

                for (const [key, value] of entries) {
                    if (typeof value === "object" && value !== null) {
                        changeValues(value as Record<string, unknown>);
                    } else {
                        (subject as Record<string, unknown>)[key] = 2;
                    }
                }
            };

            // mutating the originals must not affect the copies
            changeValues(arr);
            changeValues(obj);

            expect(arr).toEqual([
                2,
                [
                    2,
                    [2],
                    {
                        a: 2,
                        b: [2],
                        c: {
                            a: 2,
                            b: [2, { a: 2 }],
                            c: { a: 2 }
                        }
                    }
                ]
            ]);
            expect(arrCopy).toEqual([
                1,
                [
                    1,
                    [1],
                    {
                        a: 1,
                        b: [1],
                        c: {
                            a: 1,
                            b: [1, { a: 1 }],
                            c: { a: 1 }
                        }
                    }
                ]
            ]);
            expect(objCopy).toEqual({
                a: 1,
                b: [
                    1,
                    [
                        1,
                        [
                            1,
                            [
                                1,
                                [1],
                                {
                                    a: 1,
                                    b: [1],
                                    c: {
                                        a: 1,
                                        b: [1, { a: 1 }],
                                        c: { a: 1 }
                                    }
                                }
                            ]
                        ],
                        {
                            a: 1,
                            b: [1],
                            c: {
                                a: 1,
                                b: [1, { a: 1 }],
                                c: { a: 1 }
                            }
                        }
                    ],
                    { a: 1 }
                ],
                c: {
                    a: 1,
                    b: [1, { a: 1 }],
                    c: { a: 1 }
                }
            });
        });

        test("normalizeFileName - strips characters that are unsafe in file names", () => {
            expect(
                normalizeFileName(
                    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}\\|;:'\",.<>/?`~ ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ ØøÞþßŒœŠšŽžÐðΓΔΘΛΞΠΣΦΨΩαβγδθλξπσφψω АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя عـبـتـثـجـحـخـدـذـرـزـسـشـصـضـطـظـعـغـفـقـكـلـمـنـهـوـي ❤☯☆🐱‍👤"
                )
            ).toBe("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz()-_. ");
        });

        test("removeUndefinedFromObject - drops keys with an undefined value", () => {
            expect(
                removeUndefinedFromObject({
                    a: "a",
                    b: 123,
                    c: undefined
                })
            ).toEqual({
                a: "a",
                b: 123
            });
        });

        test("getFileNameFromTitlePath - builds a name from the test title path", () => {
            // a single-element path is used as-is
            expect(getFileNameFromTitlePath(["single"])).toBe("single");

            // every element except the last (the test name) is wrapped in brackets
            expect(getFileNameFromTitlePath(["describe", "it"])).toBe("[describe] it");
            expect(getFileNameFromTitlePath(["a", "b", "c"])).toBe("[a] [b] c");
        });

        test("getFileNameFromTitlePath - the object maxLength cuts the describe and the test name", () => {
            // "[Describe]" (10) sliced to 5 -> "[Desc"; "TestName" (8) sliced to 6 -> "TestNa"
            expect(
                getFileNameFromTitlePath(["Describe", "TestName"], { describe: 5, testName: 6 })
            ).toBe("[Desc TestNa");

            // only the describe section
            expect(getFileNameFromTitlePath(["Describe", "TestName"], { describe: 5 })).toBe(
                "[Desc TestName"
            );

            // only the test name
            expect(getFileNameFromTitlePath(["Describe", "TestName"], { testName: 6 })).toBe(
                "[Describe] TestNa"
            );
        });

        test("getFilePath - builds the output path from the title path", () => {
            const titlePath = ["describe", "it"];

            expect(getFilePath({ outputDir: "", type: "type", titlePath })).toBe(
                "[describe] it.type.json"
            );
            expect(getFilePath({ outputDir: "output", type: "type", titlePath })).toBe(
                "output/[describe] it.type.json"
            );
            // a trailing slash on the output dir is not duplicated
            expect(getFilePath({ outputDir: "output/", type: "type", titlePath })).toBe(
                "output/[describe] it.type.json"
            );
            // an explicit fileName overrides the generated name
            expect(
                getFilePath({ fileName: "file name", outputDir: "", type: "type", titlePath: [] })
            ).toBe("file name.type.json");
        });

        test("getFilePath - the number maxLength cuts the whole generated name", () => {
            const titlePath = ["describe", "it"];
            const full = getFilePath({ outputDir: "", type: "type", titlePath });

            // ".type.json" is 10 chars, so maxLength 15 keeps 5 chars of the name: "[desc"
            expect(getFilePath({ outputDir: "", type: "type", titlePath, maxLength: 15 })).toBe(
                "[desc.type.json"
            );
            expect(
                getFilePath({ outputDir: "", type: "type", titlePath, maxLength: 15 }).length
            ).toBeLessThan(full.length);
        });

        test("getFilePath - the object maxLength cuts the describe and the test name", () => {
            expect(
                getFilePath({
                    outputDir: "output",
                    type: "type",
                    titlePath: ["Describe", "TestName"],
                    maxLength: { describe: 5, testName: 6 }
                })
            ).toBe("output/[Desc TestNa.type.json");
        });
    });
});
