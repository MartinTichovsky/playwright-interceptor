import type { Locator, Page } from "@playwright/test";

export const byDataTestId = (testId: string, suffix?: string) =>
    `[data-testid="${testId}${suffix ? `-${suffix}` : ""}"]`;

/**
 * Get the `<section id="{path}_loaded">` element the dynamic page renders once a request finishes.
 */
export const getLoadedSector = (page: Page, id: string): Locator =>
    page.locator(`section[id="${id}_loaded"]`);

const getResponsePart = (page: Page, id: string, type: string) =>
    getLoadedSector(page, id).locator(`[data-response-type=${type}]`);

export const getResponseBody = async <T = unknown>(
    page: Page,
    id: string,
    plain = false
): Promise<T | string> => {
    const el = getResponsePart(page, id, "body");

    await el.waitFor();

    const content = plain ? await el.innerText() : await el.innerHTML();

    return plain ? content : (JSON.parse(content) as T);
};

export const getResponseHeaders = async (page: Page, id: string): Promise<[string, string][]> => {
    const el = getResponsePart(page, id, "headers");

    await el.waitFor();

    return JSON.parse(await el.innerHTML()) as [string, string][];
};

export const getResponseStatus = async (page: Page, id: string) => {
    const el = getResponsePart(page, id, "status-code");

    await el.waitFor();

    return parseInt(await el.innerText());
};

export const getResponseDuration = async (page: Page, id: string) => {
    const el = getResponsePart(page, id, "duration");

    await el.waitFor();

    return parseInt(await el.innerText());
};
