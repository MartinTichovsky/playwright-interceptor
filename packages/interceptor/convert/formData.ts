import { blobToObject, fileToObject, isObject, valueToString } from "./common";
import { createReplacer } from "./replacer";

const castString = (value: string) => {
    if (value === "Infinity") {
        return Infinity;
    }

    if (value === "-Infinity") {
        return -Infinity;
    }

    if (value === "false") {
        return false;
    }

    if (value === "true") {
        return true;
    }

    if (value === "NaN") {
        return NaN;
    }

    if (value === "null") {
        return null;
    }

    if (/^\d+n$/.test(value)) {
        return BigInt(value.slice(0, -1));
    }

    if (/^-?\d+(\.\d+)?$/.test(value)) {
        return Number(value);
    }

    if (value.startsWith("/") && value.endsWith("/")) {
        try {
            return new RegExp(value.slice(1, -1));
        } catch {
            //
        }
    }

    return value;
};

export const formDataToObject = <T extends Record<string | number, unknown>>(
    formData: FormData,
    win: typeof window
): T => {
    return instanceToObject(formData, win);
};

export const formDataToJsonString = (formData: FormData, win: typeof window) =>
    JSON.stringify(formDataToObject(formData, win), createReplacer(win));

export const instanceToObject = <T extends Record<string | number, unknown>>(
    instance: FormData | URLSearchParams,
    win: typeof window
): T => {
    const result: Record<string, unknown> = {};

    for (const [key, value] of instance.entries()) {
        const path = key
            .split("[")
            .map((s) => s.replace(/\]$/, ""))
            .map((s) => (/^\d+$/.test(s) ? parseInt(s, 10) : s));

        let current = result;

        for (let i = 0; i < path.length - 1; i++) {
            const segment = path[i];
            const nextSegment = path[i + 1];

            if (current[segment] == null) {
                current[segment] = typeof nextSegment === "number" || value === "[]" ? [] : {};
            }

            current = current[segment] as Record<string, unknown>;
        }

        const lastKey = path[path.length - 1];

        // a workaround for empty objects like {} or []
        if (lastKey === "" && (value === "{}" || value === "[]")) {
            continue;
        }

        const valueAsUnknown: unknown = value;

        if (valueAsUnknown instanceof win.File || valueAsUnknown instanceof File) {
            current[lastKey] = {
                name: valueAsUnknown.name,
                type: valueAsUnknown.type,
                size: valueAsUnknown.size
            };
        } else {
            current[lastKey] = castString(String(valueAsUnknown));
        }
    }

    return result as T;
};

export const isUnsupported = (value: unknown) => value === undefined;

export const objectToFormData = <T extends Record<string, unknown>>(
    data: T,
    win: typeof window
) => {
    const result = new win.FormData();

    if (isObject(data)) {
        objectToInstance_recursive(data, win, result);
    }

    return result;
};

const objectToInstance_recursive = <Result extends FormData | URLSearchParams>(
    data: Record<string, unknown> | Array<unknown>,
    win: typeof window,
    result: Result,
    parentKey?: string
) => {
    if (data instanceof win.Map || data instanceof Map) {
        data = Object.fromEntries(data);
    } else if (data instanceof win.Set || data instanceof Set) {
        data = Array.from(data);
    }

    const entries = Object.entries(data);

    if (parentKey && !entries.length) {
        result.append(`${parentKey}[]`, Array.isArray(data) ? "[]" : "{}");
    }

    for (const [key, value] of entries) {
        if (isUnsupported(value)) {
            continue;
        }

        const fieldKey = parentKey ? `${parentKey}[${key}]` : key;

        if (value instanceof win.Date || value instanceof Date) {
            result.append(fieldKey, valueToString(value.toISOString()));
            continue;
        }

        if (
            (result instanceof win.FormData || result instanceof FormData) &&
            (value instanceof win.File ||
                value instanceof File ||
                value instanceof win.Blob ||
                value instanceof Blob)
        ) {
            result.append(fieldKey, value);
            continue;
        } else if (
            (result instanceof win.URLSearchParams || result instanceof URLSearchParams) &&
            (value instanceof win.File || value instanceof File)
        ) {
            objectToInstance_recursive(fileToObject(value), win, result, fieldKey);
            continue;
        } else if (
            (result instanceof win.URLSearchParams || result instanceof URLSearchParams) &&
            (value instanceof win.Blob || value instanceof Blob)
        ) {
            objectToInstance_recursive(blobToObject(value), win, result, fieldKey);
            continue;
        }

        if (!isObject(value) || value instanceof win.RegExp || value instanceof RegExp) {
            result.append(fieldKey, valueToString(value));
            continue;
        }

        objectToInstance_recursive(value, win, result, fieldKey);
    }
};

export const objectToURLSearchParams = <T extends Record<string | number, unknown>>(
    data: T,
    win: typeof window
) => {
    const result = new URLSearchParams();

    if (isObject(data)) {
        objectToInstance_recursive(data, win, result);
    }

    return result;
};

export const urlSearchParamsToObject = <T extends Record<string | number, unknown>>(
    urlSearchParams: URLSearchParams,
    win: typeof window
): T => {
    return instanceToObject(urlSearchParams, win);
};

export const urlSearchParamsToJsonString = (urlSearchParams: URLSearchParams, win: typeof window) =>
    JSON.stringify(urlSearchParamsToObject(urlSearchParams, win), createReplacer(win));
