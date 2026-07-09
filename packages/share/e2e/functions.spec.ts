/**
 * Ported from `packages/share/e2e/functions.cy.ts`.
 *
 * This suite exercises the conversion utilities exported from `cypress-interceptor/convert/*`
 * (`formData`, `replacer`, `xmlDocument`). Those functions require a real browser `window` - the
 * XML helpers rely on `window.document.implementation` and every helper touches `win.File`,
 * `win.Blob`, `win.FormData`, `win.Map`, ... . On top of that the test data contains values that
 * cannot cross the `page.evaluate` serialization boundary (`File`, `Blob`, `Map`, `Set`, `BigInt`,
 * `Symbol`, functions).
 *
 * To keep the behaviour identical to the Cypress suite we inject the *built* convert module into
 * the page (`window.__convert`) together with the data builders (`window.__fnData`) and run each
 * test body inside `page.evaluate`, returning only serializable values (strings, numbers, booleans
 * and plain objects) that are then asserted with Playwright's `expect` in Node.
 */

import * as fs from "fs";
import * as path from "path";
import { expect, test } from "playwright-interceptor";

/**
 * The subset of the convert API that is exposed on `window.__convert` inside the page.
 */
interface ConvertApi {
    createReplacer: (win: Window) => (key: string, value: unknown) => unknown;
    formDataToJsonString: (formData: FormData, win: Window) => string;
    formDataToObject: <T>(formData: FormData, win: Window) => T;
    objectToFormData: (data: unknown, win: Window) => FormData;
    objectToURLSearchParams: (data: unknown, win: Window) => URLSearchParams;
    objectToXMLDocument: (data: unknown, win: Window) => XMLDocument;
    urlSearchParamsToJsonString: (urlSearchParams: URLSearchParams, win: Window) => string;
    urlSearchParamsToObject: <T>(urlSearchParams: URLSearchParams, win: Window) => T;
    xmlDocumentToJSONString: (xmlDocument: XMLDocument, win: Window) => string;
    xmlDocumentToObject: <T>(xmlDocument: XMLDocument, win: Window) => T;
}

interface FnData {
    buildData1: (win: Window) => Record<string, unknown>;
    buildData2: () => { user: { active: boolean; age: number; name: string; nested: unknown } };
}

interface ConvertWindow extends Window {
    __convert: ConvertApi;
    __fnData: FnData;
}

/**
 * Build a browser-injectable script from the built convert module. The compiled files are CommonJS,
 * so we wrap them in a tiny module loader. The file contents are concatenated as runtime strings
 * (never embedded in a template literal) because they contain their own backtick template literals.
 */
const buildConvertBundle = () => {
    const convertDir = path.dirname(require.resolve("playwright-interceptor/convert/common.js"));
    const read = (file: string) => fs.readFileSync(path.join(convertDir, file), "utf-8");

    const factory = (source: string) => "function (module, exports, require) {\n" + source + "\n}";

    const dataBuilders =
        "win.__fnData = {\n" +
        "    buildData1: function (win) {\n" +
        "        function abc() {}\n" +
        "        class CustomClass {}\n" +
        "        return {\n" +
        "            a: 1, a1: -1, a2: 0, a3: 1, a4: -1.5, a5: 1.5, b: 'two', c: true, d: null,\n" +
        "            e: undefined, f: 3.14,\n" +
        "            g: [1, 'two', false, null, undefined,\n" +
        "                new win.File(['content'], 'file-1.txt', { type: 'text/plain' }),\n" +
        "                [1, 2, 3, 'something', false, { obj: 5 }]],\n" +
        "            h: { nested: 'object' }, i: 1000, j: -1000, k: 1000.5, l: -1000.5,\n" +
        "            m: NaN, n: Infinity, o: -Infinity,\n" +
        "            p: BigInt('12345678901234567890'), q: new Date('2024-01-01'),\n" +
        "            r: Symbol('symbol'), s: abc,\n" +
        "            t: new win.File(['content'], 'file-2.txt', { type: 'text/plain' }),\n" +
        "            u: new Map([['key1', 'value1'], ['key2', 'value2']]),\n" +
        "            v: new Set([1, 2, 3]), w: /regex/, x: new CustomClass(), y: {}, z: [],\n" +
        "            _: new win.Blob(['Hello, world!'], { type: 'text/plain' })\n" +
        "        };\n" +
        "    },\n" +
        "    buildData2: function () {\n" +
        "        return { user: { name: 'Alice', age: 42, active: true,\n" +
        "            nested: { list: [10, 20, 'str', false] } } };\n" +
        "    }\n" +
        "};\n";

    return (
        "(function () {\n" +
        "var win = window;\n" +
        "var modules = {};\n" +
        "var cache = {};\n" +
        "function req(name) {\n" +
        "    if (cache[name]) { return cache[name].exports; }\n" +
        "    var module = { exports: {} };\n" +
        "    cache[name] = module;\n" +
        "    modules[name](module, module.exports, req);\n" +
        "    return module.exports;\n" +
        "}\n" +
        'modules["./common"] = ' +
        factory(read("common.js")) +
        ";\n" +
        'modules["./replacer"] = ' +
        factory(read("replacer.js")) +
        ";\n" +
        'modules["./formData"] = ' +
        factory(read("formData.js")) +
        ";\n" +
        'modules["./xmlDocument"] = ' +
        factory(read("xmlDocument.js")) +
        ";\n" +
        'var fd = req("./formData");\n' +
        'var xml = req("./xmlDocument");\n' +
        'var rep = req("./replacer");\n' +
        "win.__convert = {\n" +
        "    createReplacer: rep.createReplacer,\n" +
        "    formDataToJsonString: fd.formDataToJsonString,\n" +
        "    formDataToObject: fd.formDataToObject,\n" +
        "    objectToFormData: fd.objectToFormData,\n" +
        "    objectToURLSearchParams: fd.objectToURLSearchParams,\n" +
        "    objectToXMLDocument: xml.objectToXMLDocument,\n" +
        "    urlSearchParamsToJsonString: fd.urlSearchParamsToJsonString,\n" +
        "    urlSearchParamsToObject: fd.urlSearchParamsToObject,\n" +
        "    xmlDocumentToJSONString: xml.xmlDocumentToJSONString,\n" +
        "    xmlDocumentToObject: xml.xmlDocumentToObject\n" +
        "};\n" +
        dataBuilders +
        "})();"
    );
};

const convertBundle = buildConvertBundle();

test.describe("Convert", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/");
        await page.addScriptTag({ content: convertBundle });
    });

    test.describe("FormData", () => {
        test("should match with JSON.stringify", async ({ page }) => {
            const results = await page.evaluate(() => {
                const { __convert: c, __fnData: f } = window as unknown as ConvertWindow;
                const data1 = f.buildData1(window);
                const pairs: [string, string][] = [];

                pairs.push([
                    c.formDataToJsonString(c.objectToFormData(data1, window), window),
                    JSON.stringify(data1, c.createReplacer(window))
                ]);

                const data2 = { object: data1, array: [...Object.values(data1)] };

                pairs.push([
                    c.formDataToJsonString(c.objectToFormData(data2, window), window),
                    JSON.stringify(data2, c.createReplacer(window))
                ]);

                const data3 = { nestedObject: { nestedObject: {} }, nestedArray: [0, 1, 2.3] };

                pairs.push([
                    c.formDataToJsonString(c.objectToFormData(data3, window), window),
                    JSON.stringify(data3)
                ]);

                pairs.push([
                    c.formDataToJsonString(c.objectToFormData("data", window), window),
                    JSON.stringify({})
                ]);

                return pairs;
            });

            for (const [actual, expected] of results) {
                expect(actual).toEqual(expected);
            }
        });

        test("should handle nested objects and arrays with numbers/booleans", async ({ page }) => {
            const convertedData = await page.evaluate(() => {
                const { __convert: c, __fnData: f } = window as unknown as ConvertWindow;
                const data2 = f.buildData2();
                const formData = c.objectToFormData(data2, window);

                return c.formDataToObject<typeof data2>(formData, window);
            });

            expect(convertedData.user.name).toEqual("Alice");
            expect(convertedData.user.age).toEqual(42);
            expect(convertedData.user.active).toEqual(true);
            expect(convertedData.user.nested).toEqual({ list: [10, 20, "str", false] });
        });

        test("should handle Files by storing minimal metadata", async ({ page }) => {
            const convertedData = await page.evaluate(() => {
                const { __convert: c } = window as unknown as ConvertWindow;
                const file = new window.File(["abc"], "test.txt", { type: "text/plain" });
                const data = { docs: [file], single: file };
                const formData = c.objectToFormData(data, window);

                return c.formDataToObject<{
                    docs: { name: string; size: number; type: string }[];
                    single: { name: string; size: number; type: string };
                }>(formData, window);
            });

            expect(convertedData.docs).toHaveLength(1);
            expect(convertedData.docs[0].name).toEqual("test.txt");
            expect(convertedData.docs[0].type).toEqual("text/plain");
            expect(convertedData.docs[0].size).toEqual(3);

            expect(convertedData.single.name).toEqual("test.txt");
            expect(convertedData.single.type).toEqual("text/plain");
            expect(convertedData.single.size).toEqual(3);
        });

        test("should handle Dates by storing them as ISO strings", async ({ page }) => {
            const created = await page.evaluate(() => {
                const { __convert: c } = window as unknown as ConvertWindow;
                const date = new Date("2025-01-01T00:00:00Z");
                const data = { created: date };
                const formData = c.objectToFormData(data, window);

                return c.formDataToObject<{ created: string }>(formData, window).created;
            });

            expect(created).toEqual(new Date("2025-01-01T00:00:00Z").toISOString());
        });
    });

    test.describe("URLSearchParams", () => {
        test("should match with JSON.stringify", async ({ page }) => {
            const results = await page.evaluate(() => {
                const { __convert: c, __fnData: f } = window as unknown as ConvertWindow;
                const data1 = f.buildData1(window);
                const pairs: [string, string][] = [];

                pairs.push([
                    c.urlSearchParamsToJsonString(c.objectToURLSearchParams(data1, window), window),
                    JSON.stringify(data1, c.createReplacer(window))
                ]);

                const data2 = { object: data1, array: [...Object.values(data1)] };

                pairs.push([
                    c.urlSearchParamsToJsonString(c.objectToURLSearchParams(data2, window), window),
                    JSON.stringify(data2, c.createReplacer(window))
                ]);

                const data3 = { nestedObject: { nestedObject: {} }, nestedArray: [0, 1, 2.3] };

                pairs.push([
                    c.urlSearchParamsToJsonString(c.objectToURLSearchParams(data3, window), window),
                    JSON.stringify(data3)
                ]);

                pairs.push([
                    c.urlSearchParamsToJsonString(
                        c.objectToURLSearchParams("data", window),
                        window
                    ),
                    JSON.stringify({})
                ]);

                return pairs;
            });

            for (const [actual, expected] of results) {
                expect(actual).toEqual(expected);
            }
        });

        test("should handle nested objects and arrays with numbers/booleans", async ({ page }) => {
            const convertedData = await page.evaluate(() => {
                const { __convert: c, __fnData: f } = window as unknown as ConvertWindow;
                const data2 = f.buildData2();
                const urlSearchParams = c.objectToURLSearchParams(data2, window);

                return c.urlSearchParamsToObject<typeof data2>(urlSearchParams, window);
            });

            expect(convertedData.user.name).toEqual("Alice");
            expect(convertedData.user.age).toEqual(42);
            expect(convertedData.user.active).toEqual(true);
            expect(convertedData.user.nested).toEqual({ list: [10, 20, "str", false] });
        });

        test("should handle Files by storing minimal metadata", async ({ page }) => {
            const convertedData = await page.evaluate(() => {
                const { __convert: c } = window as unknown as ConvertWindow;
                const file = new window.File(["abc"], "test.txt", { type: "text/plain" });
                const data = { docs: [file], single: file };
                const urlSearchParams = c.objectToURLSearchParams(data, window);

                return c.urlSearchParamsToObject<{
                    docs: { name: string; size: number; type: string }[];
                    single: { name: string; size: number; type: string };
                }>(urlSearchParams, window);
            });

            expect(convertedData.docs).toHaveLength(1);
            expect(convertedData.docs[0].name).toEqual("test.txt");
            expect(convertedData.docs[0].type).toEqual("text/plain");
            expect(convertedData.docs[0].size).toEqual(3);

            expect(convertedData.single.name).toEqual("test.txt");
            expect(convertedData.single.type).toEqual("text/plain");
            expect(convertedData.single.size).toEqual(3);
        });

        test("should handle Dates by storing them as ISO strings", async ({ page }) => {
            const created = await page.evaluate(() => {
                const { __convert: c } = window as unknown as ConvertWindow;
                const date = new Date("2025-01-01T00:00:00Z");
                const data = { created: date };
                const urlSearchParams = c.objectToURLSearchParams(data, window);

                return c.urlSearchParamsToObject<{ created: string }>(urlSearchParams, window)
                    .created;
            });

            expect(created).toEqual(new Date("2025-01-01T00:00:00Z").toISOString());
        });
    });

    test.describe("XMLDocument", () => {
        test("should match with the object", async ({ page }) => {
            const [actual, expected] = await page.evaluate(() => {
                const { __convert: c, __fnData: f } = window as unknown as ConvertWindow;
                const data1 = f.buildData1(window);

                const expectedObject = {
                    a: 1,
                    a1: -1,
                    a2: 0,
                    a3: 1,
                    a4: -1.5,
                    a5: 1.5,
                    b: "two",
                    c: true,
                    d: null,
                    e: undefined,
                    f: 3.14,
                    g: [
                        1,
                        "two",
                        false,
                        null,
                        undefined,
                        { name: "file-1.txt", type: "text/plain", size: 7 },
                        [1, 2, 3, "something", false, { obj: 5 }]
                    ],
                    h: { nested: "object" },
                    i: 1000,
                    j: -1000,
                    k: 1000.5,
                    l: -1000.5,
                    m: NaN,
                    n: Infinity,
                    o: -Infinity,
                    p: BigInt("12345678901234567890"),
                    q: new Date("2024-01-01"),
                    r: "Symbol(symbol)",
                    s: (data1.s as () => void).toString(),
                    t: { name: "file-2.txt", type: "text/plain", size: 7 },
                    u: { key1: "value1", key2: "value2" },
                    v: [1, 2, 3],
                    w: /regex/,
                    x: {},
                    y: {},
                    z: [],
                    _: { name: "blob", type: "text/plain", size: 13 }
                };

                const converted = c.xmlDocumentToObject(
                    c.objectToXMLDocument(data1, window),
                    window
                );

                return [
                    JSON.stringify(converted, c.createReplacer(window)),
                    JSON.stringify(expectedObject, c.createReplacer(window))
                ];
            });

            expect(actual).toEqual(expected);
        });

        test("should match with JSON.stringify", async ({ page }) => {
            const results = await page.evaluate(() => {
                const { __convert: c, __fnData: f } = window as unknown as ConvertWindow;
                const data1 = f.buildData1(window);
                const pairs: [string, string][] = [];

                pairs.push([
                    c.xmlDocumentToJSONString(c.objectToXMLDocument(data1, window), window),
                    JSON.stringify(data1, c.createReplacer(window))
                ]);

                const data2 = { object: data1, array: [...Object.values(data1)] };

                pairs.push([
                    c.xmlDocumentToJSONString(c.objectToXMLDocument(data2, window), window),
                    JSON.stringify(data2, c.createReplacer(window))
                ]);

                const data3 = { nestedObject: { nestedObject: {} }, nestedArray: [0, 1, 2.3] };

                pairs.push([
                    c.xmlDocumentToJSONString(c.objectToXMLDocument(data3, window), window),
                    JSON.stringify(data3)
                ]);

                return pairs;
            });

            for (const [actual, expected] of results) {
                expect(actual).toEqual(expected);
            }
        });

        test("should handle nested objects and arrays with numbers/booleans", async ({ page }) => {
            // Note: mirrors the Cypress suite, which (as-is) uses the FormData helpers here.
            const convertedData = await page.evaluate(() => {
                const { __convert: c, __fnData: f } = window as unknown as ConvertWindow;
                const data2 = f.buildData2();
                const formData = c.objectToFormData(data2, window);

                return c.formDataToObject<typeof data2>(formData, window);
            });

            expect(convertedData.user.name).toEqual("Alice");
            expect(convertedData.user.age).toEqual(42);
            expect(convertedData.user.active).toEqual(true);
            expect(convertedData.user.nested).toEqual({ list: [10, 20, "str", false] });
        });

        test("should handle Files by storing minimal metadata", async ({ page }) => {
            const convertedData = await page.evaluate(() => {
                const { __convert: c } = window as unknown as ConvertWindow;
                const file = new window.File(["abc"], "test.txt", { type: "text/plain" });
                const data = { docs: [file], single: file };
                const xmlDocument = c.objectToXMLDocument(data, window);

                return c.xmlDocumentToObject<{
                    docs: { name: string; size: number; type: string }[];
                    single: { name: string; size: number; type: string };
                }>(xmlDocument, window);
            });

            expect(convertedData.docs).toHaveLength(1);
            expect(convertedData.docs[0].name).toEqual("test.txt");
            expect(convertedData.docs[0].type).toEqual("text/plain");
            expect(convertedData.docs[0].size).toEqual(3);

            expect(convertedData.single.name).toEqual("test.txt");
            expect(convertedData.single.type).toEqual("text/plain");
            expect(convertedData.single.size).toEqual(3);
        });

        test("should handle Dates", async ({ page }) => {
            const { actual, expected } = await page.evaluate(() => {
                const { __convert: c } = window as unknown as ConvertWindow;
                const date = new Date("2025-01-01T00:00:00Z");
                const data = { created: date };
                const xmlDocument = c.objectToXMLDocument(data, window);
                const converted = c.xmlDocumentToObject<{ created: Date }>(xmlDocument, window);

                return { actual: converted.created.getTime(), expected: date.getTime() };
            });

            expect(actual).toEqual(expected);
        });

        test("should non object values", async ({ page }) => {
            const convertedData = await page.evaluate(() => {
                const { __convert: c } = window as unknown as ConvertWindow;
                const xmlDocument = c.objectToXMLDocument("data", window);

                return c.xmlDocumentToObject(xmlDocument, window);
            });

            expect(convertedData).toEqual({});
        });
    });
});
