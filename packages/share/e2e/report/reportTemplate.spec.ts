/**
 * Ported from `packages/share/e2e/report/reportTemplate.cy.ts`.
 *
 * Renders the report HTML produced by the library from the mock stats file and runs the full
 * template validation against it.
 *
 * Adaptations from the Cypress suite:
 * - The Cypress `cy.task("createReportFromFile" | "createReportFromFolder")` tasks (defined in
 *   `packages/share/cypress.config.ts`) called `createNetworkReportFromFile` /
 *   `createNetworkReportFromFolder` in Node. Here we call those library functions directly in the
 *   test process and write the HTML straight into the server's statically-served `fixtures` folder,
 *   then open it with `page.goto("/fixtures/<name>.html")` (baseURL is the server `HOST`).
 * - `cy.task("clearFixtures")` (which wiped the whole shared fixtures folder) is dropped: each test
 *   writes its own uniquely-named report so there is no need to remove other specs' fixtures.
 * - `validateReportTemplate()` (Cypress command chain) -> `await validateReportTemplate(page)`.
 */

import * as path from "path";
import {
    createNetworkReportFromFile,
    createNetworkReportFromFolder,
    test
} from "playwright-interceptor";

import { validateReportTemplate } from "./validateReportTemplate";

const mockFolderPath = path.resolve(__dirname, "../../../share/mock");
const mockStatsPath = path.join(mockFolderPath, "sources.stats.json");
const fixturesFolder = path.resolve(__dirname, "../../../server/fixtures");

const fixtureUrl = (filePath: string) =>
    `/fixtures/${filePath.replaceAll("\\", "/").split("/").pop()}`;

test.describe("Report Template", () => {
    /**
     * The generated report is used as an example in `report-example\report.html`
     */
    test("Should render single report template", async ({ page }) => {
        test.setTimeout(60000);

        // Use a unique file name so this test never shares `sources.html` (the name derived from the
        // mock stats file) with the "render report from folder" test, which would otherwise let the
        // two tests overwrite/serve each other's file when running in parallel.
        const outputFilePath = createNetworkReportFromFile(mockStatsPath, {
            fileName: "single-report-template",
            outputDir: fixturesFolder
        });

        await page.goto(fixtureUrl(outputFilePath));

        await validateReportTemplate(page);
    });

    test("Should render single report with custom name", async ({ page }) => {
        test.setTimeout(60000);

        const customName = "custom-name";

        createNetworkReportFromFile(mockStatsPath, {
            fileName: customName,
            outputDir: fixturesFolder
        });

        await page.goto(`/fixtures/${customName}.html`);

        await validateReportTemplate(page);
    });

    test("Should render report from folder", async ({ page }) => {
        test.setTimeout(60000);

        createNetworkReportFromFolder(mockFolderPath, {
            outputDir: fixturesFolder
        });

        // The mock folder contains a single `*.stats.json`, generating `sources.html`.
        await page.goto("/fixtures/sources.html");

        await validateReportTemplate(page);
    });
});
