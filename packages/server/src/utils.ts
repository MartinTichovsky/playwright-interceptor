import { I_TEST_ID_HEADER } from "./resources/constants";
import { DynamicRequest } from "./types";

export const DEFAULT_WAITTIME = 500;

export const generateUrl = (path: string, options: Record<string, unknown> = {}) => {
    const searchParams = new URLSearchParams(optionsToURLSearch(options));
    const searchString = searchParams.toString();

    return `${path}${searchString ? "?" : ""}${searchString}`;
};

/**
 * Wait must be more then request delay because the processing time
 *
 * @param delay A delay
 * @returns Updated delay
 */
export const getDelayWait = (delay: number) => delay + DEFAULT_WAITTIME;

export const getDynamicUrl = (requests: DynamicRequest[]) =>
    generateUrl("/public/dynamic.html", { requests });

export const getIframeDynamicUrl = (data: { id: string; requests: DynamicRequest[] }[]) =>
    generateUrl("/public/iframe-dynamic.html", {
        data
    });

export const headerWithTestId = (
    headers: Record<string, string>,
    testId: string
): Record<string, string> => ({
    ...headers,
    [I_TEST_ID_HEADER]: testId
});

const optionsToURLSearch = <T>(object: T) => {
    const result: Record<string, string> = {};

    for (const key in object) {
        if (object[key] === undefined) {
            continue;
        }

        result[key] = JSON.stringify(object[key]);
    }

    return result;
};
