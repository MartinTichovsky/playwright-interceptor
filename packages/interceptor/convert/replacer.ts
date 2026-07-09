import { blobToObject, fileToObject } from "./common";

export const createReplacer = (win: typeof window) => (_: string, value: unknown) => {
    if (typeof value === "bigint") {
        return `${String(value)}n`;
    }

    if (value === Infinity) {
        return "Infinity";
    }

    if (value === -Infinity) {
        return "-Infinity";
    }

    if (
        typeof value === "function" ||
        typeof value === "symbol" ||
        value instanceof win.RegExp ||
        value instanceof RegExp
    ) {
        return String(value);
    }

    if (value instanceof win.File || value instanceof File) {
        return fileToObject(value);
    }

    if (value instanceof win.Blob || value instanceof Blob) {
        return blobToObject(value);
    }

    if (value instanceof win.Map || value instanceof Map) {
        return Object.fromEntries(value);
    }

    if (value instanceof win.Set || value instanceof Set) {
        return Array.from(value);
    }

    return value;
};
