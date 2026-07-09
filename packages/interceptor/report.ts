/**
 * Ported from `packages/interceptor/report.ts`.
 *
 * Adaptations for Playwright:
 * - Uses Node `fs`/`path` directly instead of the Cypress-aware `envUtils.getFs`/`getPath`.
 * - The Cypress-only live `createNetworkReport` (which used `cy.interceptor()`) is reimplemented
 *   to take an `Interceptor` instance directly, so it can be called from a Playwright test.
 */

import * as fs from "fs";
import * as path from "path";

import type { Interceptor } from "./Interceptor";
import { FileNameMaxLength } from "./Interceptor.types";
import { generateReport } from "./src/generateReport";
import { getFilePath } from "./src/utils.node";

export interface ReportHtmlOptions {
    /**
     * The name of the file to save the report to.
     * If not provided, the report will be saved to the current test name.
     */
    fileName?: string;

    /**
     * The duration of the request to be considered as high and highlighted in the report.
     * If a function is provided, it will be called with the URL of each request.
     */
    highDuration?: number | ((url: URL) => number);

    /**
     * The maximal length of the generated file name. Has no effect when `fileName` is provided.
     */
    maxLength?: FileNameMaxLength;

    /**
     * The directory to save the report to.
     */
    outputDir: string;
}

export interface CreateNetworkReportOptions extends ReportHtmlOptions {
    /**
     * The test title path (from the outermost describe to the test name). It is used to generate
     * the file name and the report title when `fileName` / `title` are not provided.
     *
     * In a Playwright test this is `test.info().titlePath`.
     */
    titlePath?: string[];

    /**
     * The title of the report. Defaults to the file name derived from `titlePath`.
     */
    title?: string;
}

/**
 * Creates a network report HTML file from an `Interceptor` instance and its network requests.
 *
 * This is the Playwright equivalent of the Cypress `createNetworkReport` which used
 * `cy.interceptor()`. Pass the `interceptor` fixture directly.
 *
 * @param interceptor The interceptor instance to read the stats from.
 * @param options The options for the report.
 * @returns The path to the generated report file.
 */
export const createNetworkReport = (
    interceptor: Interceptor,
    options: CreateNetworkReportOptions
) => {
    const { fileName, highDuration, outputDir, maxLength, titlePath = [], title } = options;

    const outputFile = getFilePath({
        extension: "html",
        fileName,
        maxLength,
        outputDir,
        titlePath
    });
    const stats = interceptor.getStats();

    generateReport(stats, outputFile, {
        highDuration,
        title
    });

    return outputFile;
};

/**
 * Creates a network report HTML file from a stats file.
 *
 * @param filePath The path to the stats file.
 * @param options The options for the report.
 * @returns The path to the generated report file.
 */
export const createNetworkReportFromFile = (filePath: string, options: ReportHtmlOptions) => {
    const { fileName, outputDir, highDuration } = options;
    const outputFileName = `${fileName || path.basename(filePath).replace(".stats.json", "")}.html`;
    const outputFilePath = path.join(outputDir, outputFileName);

    generateReport(filePath, outputFilePath, {
        highDuration
    });

    return outputFilePath;
};

/**
 * Creates a network report HTML file from a folder of stats files.
 *
 * @param folderPath The path to the folder of stats files.
 * @param options The options for the report.
 */
export const createNetworkReportFromFolder = (
    folderPath: string,
    options: Omit<ReportHtmlOptions, "fileName">
) => {
    const { outputDir, highDuration } = options;

    const files = fs.readdirSync(folderPath);

    files.forEach((file) => {
        try {
            createNetworkReportFromFile(path.join(folderPath, file), {
                fileName: file.replace(".stats.json", ""),
                outputDir,
                highDuration
            });
        } catch {
            //
        }
    });
};
