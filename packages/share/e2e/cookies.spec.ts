import type { BrowserContext } from "@playwright/test";
import { expect, test } from "playwright-interceptor";
import { SERVER_URL } from "playwright-interceptor-server/src/resources/constants";

/**
 * Ported from `packages/share/e2e/cookies.cy.ts`.
 */
test.describe("Cookies: XHR and fetch", () => {
    const endpoint = SERVER_URL.Cookies;

    test.beforeEach(async ({ context }) => {
        await context.clearCookies();
    });

    const getCookieValue = async (context: BrowserContext, cookieName: string) => {
        const cookies = await context.cookies();

        return cookies.find((cookie) => cookie.name === cookieName)?.value;
    };

    test("sets cookie via fetch", async ({ page, context }) => {
        const cookieName = "testCookie-pw-fetch";
        const cookieValue = "hello-pw-fetch";

        await page.goto("/");

        await page.evaluate(
            async ({ endpoint, cookieName, cookieValue }) => {
                const searchParams = new URLSearchParams({ cookieName, cookieValue });
                const url = new URL(endpoint, window.location.origin);

                url.search = searchParams.toString();

                await fetch(url.toString(), { method: "GET", credentials: "include" });
            },
            { endpoint: `/${endpoint}`, cookieName, cookieValue }
        );

        expect(await getCookieValue(context, cookieName)).toEqual(cookieValue);
    });

    test("sets cookie via XHR (XMLHttpRequest)", async ({ page, context }) => {
        const cookieName = "testCookie-pw-xhr";
        const cookieValue = "hello-pw-xhr";

        await page.goto("/");

        await page.evaluate(
            ({ endpoint, cookieName, cookieValue }) => {
                const searchParams = new URLSearchParams({ cookieName, cookieValue });
                const url = new URL(endpoint, window.location.origin);

                url.search = searchParams.toString();

                return new Promise<void>((resolve) => {
                    const xhr = new XMLHttpRequest();

                    xhr.open("GET", url.toString(), true);
                    xhr.withCredentials = true;
                    xhr.onload = () => resolve();
                    xhr.send();
                });
            },
            { endpoint: `/${endpoint}`, cookieName, cookieValue }
        );

        expect(await getCookieValue(context, cookieName)).toEqual(cookieValue);
    });
});
