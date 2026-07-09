/**
 * Ported from `packages/share/e2e/path-test/inner-dir/path.cy.ts`.
 *
 * The Cypress suite verified that the auto-generated stats/log file name derived correctly
 * regardless of how deeply the spec was nested. In Cypress the name was prefixed with
 * `Cypress.spec.relative` (the spec's folder path, e.g. "path-test/inner-dir/path.cy.ts" with the
 * "/" separators kept).
 *
 * Adaptation: the Playwright interceptor derives the file name from `test.info().titlePath`
 * (the spec path relative to the e2e root + the describe titles + the test name). The first
 * element of `titlePath` is the spec path relative to the e2e root ("path-test/inner-dir/
 * path.spec.ts"); `getFilePath` runs every title segment through `normalizeFileName`, which strips
 * the path separators, collapsing the nested path into a single filename-safe segment
 * ("path-testinner-dirpath.spec.ts"). So the generated name contains no directory separators
 * regardless of folder depth. This spec is intentionally kept nested three levels deep to prove
 * that. All spec-relative-path assertions are rewritten against the titlePath-based name.
 */

import * as fs from "fs";
import { CallStack, expect, test } from "playwright-interceptor";
import { getFilePath, normalizeFileName } from "playwright-interceptor/src/utils.node";
import { getDynamicUrl } from "playwright-interceptor-server/src/utils";

import { getWorkerOutputDir } from "../../../src/constants";

const titleDescribe1 = "Path test 1";
const titleDescribe2 = "Path test 2";
const titleIt1 = "Inner test 1";
const titleIt2 = "Inner test 2";
const titleIt3 = "Inner test 3";

const extension = ".json";

// Worker-scoped so the `beforeAll` cleanup below never races another parallel worker.
const outputDir = getWorkerOutputDir("path.spec.ts");
const testPath_Fetch_1 = "stats/fetch-1";

/**
 * The file-name segment `getFilePath` derives from the spec location: `titlePath[0]` (the spec
 * path relative to the e2e root) with the path separators normalized away. In Cypress this was the
 * raw `Cypress.spec.relative` value keeping its "/" separators.
 */
const specSegment = (titlePath: string[]) => normalizeFileName(titlePath[0]);

test.beforeAll(() => {
    fs.rmSync(outputDir, { force: true, recursive: true });
});

test.describe(titleDescribe1, () => {
    test(titleIt1, async ({ page, interceptor }) => {
        const titlePath = test.info().titlePath;

        // In Playwright the describe section is `[<spec segment>] [<describe titles>]`, where the
        // spec segment is the flattened spec path. In Cypress this was
        // `path-test/inner-dir/path.cy.ts [Path test 1]`.
        const describeSection = `[${specSegment(titlePath)}] [${titleDescribe1}]`;
        const normalized = `${describeSection} ${titleIt1}`;

        expect(getFilePath({ outputDir: "", titlePath }).replace(/\\/g, "/")).toEqual(
            `${normalized}${extension}`
        );

        // the nested folder is flattened: the generated name has no directory separators
        expect(getFilePath({ outputDir: "", titlePath })).not.toContain("/");
        expect(getFilePath({ outputDir: "", titlePath })).not.toContain("\\");

        expect(getFilePath({ outputDir, titlePath }).replace(/\\/g, "/")).toEqual(
            `${outputDir}/${normalized}${extension}`
        );

        // maxLength as a number cuts the whole generated name (including the extension) to that
        // length; `.slice(0, maxLength - extension.length)` mirrors the library's `maxLengthFileName`
        expect(
            getFilePath({ outputDir: "", titlePath, maxLength: 20 }).replace(/\\/g, "/")
        ).toEqual(`${normalized.slice(0, 20 - extension.length)}${extension}`);

        // maxLength as an object cuts the describe section and the test name separately
        expect(
            getFilePath({
                outputDir: "",
                titlePath,
                maxLength: { describe: 6, testName: 5 }
            }).replace(/\\/g, "/")
        ).toEqual(`${describeSection.slice(0, 6)} ${titleIt1.slice(0, 5)}${extension}`);

        // only the describe is cut
        expect(
            getFilePath({ outputDir: "", titlePath, maxLength: { describe: 6 } }).replace(
                /\\/g,
                "/"
            )
        ).toEqual(`${describeSection.slice(0, 6)} ${titleIt1}${extension}`);

        // only the test name is cut
        expect(
            getFilePath({ outputDir: "", titlePath, maxLength: { testName: 5 } }).replace(
                /\\/g,
                "/"
            )
        ).toEqual(`${describeSection} ${titleIt1.slice(0, 5)}${extension}`);

        // Fire a request and write the captured stats, then read the file back to prove that the
        // stats file is written at the titlePath-based name regardless of the nested folder.
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

        const statsFile = getFilePath({ outputDir, titlePath, type: "stats" });
        const stats = JSON.parse(fs.readFileSync(statsFile, "utf8")) as CallStack[];

        expect(stats.length > 0).toBe(true);
        expect(stats.every((entry) => new URL(entry.url).pathname.endsWith(testPath_Fetch_1))).toBe(
            true
        );
    });

    test.describe(titleDescribe2, () => {
        test(titleIt2, () => {
            const titlePath = test.info().titlePath;

            // the describe section is the joined spec segment + describe titles
            const describeSection = `[${specSegment(titlePath)}] [${titleDescribe1}] [${titleDescribe2}]`;

            expect(getFilePath({ outputDir: "", titlePath }).replace(/\\/g, "/")).toEqual(
                `${describeSection} ${titleIt2}${extension}`
            );

            expect(
                getFilePath({
                    outputDir: "",
                    titlePath,
                    maxLength: { describe: 15, testName: 5 }
                }).replace(/\\/g, "/")
            ).toEqual(`${describeSection.slice(0, 15)} ${titleIt2.slice(0, 5)}${extension}`);
        });
    });
});

test(titleIt3, () => {
    const titlePath = test.info().titlePath;

    // With no describe block the spec segment becomes the sole describe section. In Cypress this
    // was `path-test/inner-dir/path.cy.ts Inner test 3` (spec-relative prefix, no brackets).
    expect(getFilePath({ outputDir: "", titlePath }).replace(/\\/g, "/")).toEqual(
        `[${specSegment(titlePath)}] ${titleIt3}${extension}`
    );
});
