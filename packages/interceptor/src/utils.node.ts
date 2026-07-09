import * as fs from "fs";
import * as path from "path";

import { FileNameMaxLength, FileNameMaxLengthObject } from "../Interceptor.types";

export interface GetFilePathOptions {
    extension?: string;
    fileName?: string;
    maxLength?: FileNameMaxLength;
    outputDir: string;
    /**
     * The current test title path (from the outermost describe to the test name).
     * Provide `["describe", "it"]` to generate `[describe] it`.
     */
    titlePath: string[];
    type?: string;
}

/**
 * Get the file name from the current test title path
 *
 * @param titlePath The test title path (describe blocks + the test name)
 * @param maxLength Cut the describe (title) section and/or the test name to a maximal length
 * @returns The file name from the current test, the result will be:
 *    `[description] it`
 * or if no description, just:
 *    `it`
 */
export const getFileNameFromTitlePath = (
    titlePath: string[],
    maxLength?: FileNameMaxLengthObject
) => {
    if (titlePath.length > 1) {
        let describe = titlePath
            .slice(0, -1)
            .map((title) => `[${normalizeFileName(title)}]`)
            .join(" ");

        if (maxLength?.describe !== undefined) {
            describe = describe.slice(0, maxLength.describe);
        }

        let testName = normalizeFileName(titlePath[titlePath.length - 1]);

        if (maxLength?.testName !== undefined) {
            testName = testName.slice(0, maxLength.testName);
        }

        return `${describe} ${testName}`;
    }

    return normalizeFileName(titlePath[0] ?? "");
};

export const getFilePath = ({
    extension = "json",
    fileName,
    maxLength,
    outputDir,
    titlePath,
    type
}: GetFilePathOptions) => {
    let normalizedOutputDir = outputDir;

    if (normalizedOutputDir && !normalizedOutputDir.endsWith("/")) {
        normalizedOutputDir += "/";
    }

    return maxLengthFileName(
        `${normalizedOutputDir}${
            fileName
                ? fileName
                : getFileNameFromTitlePath(
                      titlePath,
                      typeof maxLength === "object" ? maxLength : undefined
                  )
        }`,
        `.${type ? `${type}.` : ""}${extension}`,
        typeof maxLength === "number" ? maxLength : undefined
    );
};

export const maxLengthFileName = (fileName: string, extension: string, maxLength = 255) => {
    return `${fileName.slice(0, maxLength - extension.length)}${extension}`;
};

export const normalizeFileName = (fileName: string) =>
    fileName
        .replace(/[^a-zA-Z0-9_\-.() ]/gi, "")
        .replace(/(-)+/g, "-")
        .replace(/( )+/g, " ")
        .replace(/[- ]{4}/g, "");

export const writeFile = (filePath: string, data: string) => {
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, data, "utf8");
};
