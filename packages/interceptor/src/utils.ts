type CommonObject<T> = {
    [K in keyof T]?: T[K];
};

export const deepCopy = <T>(value: T): T => {
    if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        !(value instanceof Date) &&
        !(value instanceof URL) &&
        Object.keys(value).length
    ) {
        const copy = {} as typeof value;

        for (const key in value) {
            copy[key] = deepCopy(value[key]);
        }

        return copy;
    } else if (Array.isArray(value)) {
        const copy = [] as typeof value;

        for (const key in value) {
            copy[key] = deepCopy(value[key]);
        }

        return copy;
    } else {
        return value;
    }
};

/**
 * Deep-clone a value while replacing any circular reference with the string `"[Circular]"`.
 *
 * Playwright resolves console arguments via `JSHandle.jsonValue()`, which reconstructs the browser
 * object graph in Node - including any circular references. A plain `deepCopy`/`JSON.stringify`
 * would recurse infinitely on those, so console arguments are passed through this helper before they
 * are stored. The `"[Circular]"` marker matches the output produced by `cypress-interceptor`.
 */
export const removeCircular = (value: unknown, recursiveStack: unknown[] = []): unknown => {
    if (
        typeof value === "bigint" ||
        typeof value === "boolean" ||
        typeof value === "number" ||
        typeof value === "string" ||
        value === null ||
        value === undefined
    ) {
        return value;
    }

    if (isObject(value) && recursiveStack.includes(value)) {
        return "[Circular]";
    } else if (isObject(value)) {
        const index = recursiveStack.push(value);
        const result: Record<string, unknown> = {};

        for (const key of Object.keys(value)) {
            result[key] = removeCircular(value[key], recursiveStack);
        }

        recursiveStack.splice(index - 1, 1);

        return result;
    } else if (Array.isArray(value) && recursiveStack.includes(value)) {
        return "[Circular]";
    } else if (Array.isArray(value)) {
        const index = recursiveStack.push(value);
        const result: unknown[] = [];

        for (const entry of value) {
            result.push(removeCircular(entry, recursiveStack));
        }

        recursiveStack.splice(index - 1, 1);

        return result;
    } else {
        return value;
    }
};

export const isNonNullableObject = (
    object: unknown
): object is Record<string | symbol | number, unknown> =>
    typeof object === "object" && object !== null;

export const isObject = (val: unknown): val is Record<string, unknown> =>
    typeof val === "object" && val !== null && !Array.isArray(val);

export const sleep = (timeout: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, timeout));

export const removeUndefinedFromObject = <T, K extends keyof T>(object: CommonObject<T>) => {
    const result = { ...object };

    Object.keys(result).forEach((key) => result[key as K] === undefined && delete result[key as K]);

    return result;
};

export const testUrlMatch = (urlMatcher: string | RegExp, url: string) => {
    if (typeof urlMatcher === "string") {
        urlMatcher = new RegExp(`^${urlMatcher.replace(/(\*)+/gi, "(.*)")}$`);
    }

    return urlMatcher.test(url);
};

export const getRuntimeString = (runtime: number) => {
    const hours = Math.floor(runtime / 3600000);
    const minutes = Math.floor((runtime % 3600000) / 60000);
    const seconds = Math.floor((runtime % 60000) / 1000);
    const milliseconds = runtime % 1000;

    return `${hours}h ${minutes}m ${seconds}s ${milliseconds}ms`;
};
