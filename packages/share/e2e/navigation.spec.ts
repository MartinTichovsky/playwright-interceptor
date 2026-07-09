/**
 * Ported from `packages/share/e2e/navigation.cy.ts`.
 *
 * Validates that the interceptor, while active, does not break relative-URL resolution during
 * client-side navigations. The page (`navigation.html`, served for every route by the second
 * server on :3001) fires an XHR/fetch to `./test` and then sets `window.location.href` to the
 * value stored in `window.__navigation_value__`. After each navigation the `#navigation-value`
 * element reflects `${origin}${pathname}` of the resolved URL.
 *
 * Adaptations from the Cypress suite:
 * - `cy.visit(url)` -> `await page.goto(url)`.
 * - `cy.window().then((win) => { win.__navigation_value__ = x })` ->
 *   `await page.evaluate((x) => { (window as any).__navigation_value__ = x; }, x)`.
 * - `cy.get(sel).click()` -> `await page.locator(sel).click()`.
 * - `cy.get("#navigation-value").should("have.text", url)` ->
 *   `await expect(page.locator("#navigation-value")).toHaveText(url)` (auto-retries until the
 *   navigation completes and the new document renders the value).
 * - `cy.wait(500)` -> `await wait(500)`.
 * - The `ref`/`navigate` helper structure is preserved but adapted to async/await.
 * - The interceptor is active via the fixture (started automatically). Each test also asserts the
 *   interceptor captured the `./test` requests fired during navigation.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "playwright-interceptor";

import { wait } from "../src/utils";

const BASE_URL = "http://localhost:3001";

interface NavigationRef {
    url: URL;
}

test.describe("Navigation bug", () => {
    const navigate = async (
        page: Page,
        navigateUrl: string,
        ref: NavigationRef,
        type: "xhr" | "fetch"
    ) => {
        await page.evaluate((value: string) => {
            (window as unknown as { __navigation_value__?: string }).__navigation_value__ = value;
        }, navigateUrl);

        await wait(500);

        await page.locator(`button[data-testid="navigate-${type}"]`).click();

        const newUrl = new URL(navigateUrl, ref.url);

        // expect the url should change correctly
        await expect(page.locator("#navigation-value")).toHaveText(newUrl.toString());

        ref.url = newUrl;
    };

    const navigationTest = async (page: Page, ref: NavigationRef, type: "xhr" | "fetch") => {
        await navigate(page, "./page.html", ref, type); // public/page.html
        await navigate(page, "./folder/test.html", ref, type); // /public/folder/test.html
        await navigate(page, "../prev.html", ref, type); // /public/prev.html
        await navigate(page, "./same.html", ref, type); // /public/same.html
        await navigate(page, "../pop.html", ref, type); // /pop.html
        await navigate(page, "./nav.html", ref, type); // /nav.html
        await navigate(page, "./dir/login.html", ref, type); // /dir/login.html
        await navigate(page, "./deep/nested/folder/index.html", ref, type); // /dir/deep/nested/folder/index.html
        await navigate(page, "../components/header.html", ref, type); // /dir/deep/nested/components/header.html
        await navigate(page, "./assets/images/gallery.html", ref, type); // /dir/deep/nested/components/assets/images/gallery.html
        await navigate(page, "../sidebar/menu.html", ref, type); // /dir/deep/nested/components/assets/sidebar/menu.html

        await navigate(page, "./utils/helpers/format.html", ref, type); // /dir/deep/sidebar/utils/helpers/format.html
        await navigate(page, "../config/settings.html", ref, type); // /dir/deep/config/settings.html
        await navigate(page, "./pages/about/team.html", ref, type); // /dir/deep/config/pages/about/team.html
        await navigate(page, "../../dashboard.html", ref, type); // /dir/dashboard.html
        await navigate(page, "./modules/auth/login/form.html", ref, type); // /dir/modules/auth/login/form.html
        await navigate(page, "../admin/panel.html", ref, type); // /dir/admin/panel.html
        await navigate(page, "./features/search/results.html", ref, type); // /dir/admin/features/search/results.html
        await navigate(page, "../layouts/main.html", ref, type); // /dir/layouts/main.html
        await navigate(page, "./api/users/profile.html", ref, type); // /dir/layouts/api/users/profile.html
        await navigate(page, "../../styles/theme.html", ref, type); // /dir/styles/theme.html
        await navigate(page, "./services/data/fetch.html", ref, type); // /dir/styles/services/data/fetch.html
    };

    const startUrl = `${BASE_URL}/public/navigation.html`;

    test("should navigate to the correct page with fetch", async ({ page, interceptor }) => {
        const ref = {
            url: new URL(startUrl)
        };

        await page.goto(ref.url.toString());

        await navigationTest(page, ref, "fetch");

        // the interceptor stayed active and captured the requests fired during navigation
        expect(interceptor.callStack.length).toBeGreaterThan(0);
    });

    test("should navigate to the correct page with xhr", async ({ page, interceptor }) => {
        const ref = {
            url: new URL(startUrl)
        };

        await page.goto(ref.url.toString());

        await navigationTest(page, ref, "xhr");

        // the interceptor stayed active and captured the requests fired during navigation
        expect(interceptor.callStack.length).toBeGreaterThan(0);
    });

    // there were issues with skipping tests so this test will be always skipped
    test.skip("should navigate to the correct page", async ({ page }) => {
        const ref = {
            // url: new URL(`${BASE_URL}/public/navigation.html`)
            url: new URL(`${BASE_URL}/dir/deep/nested/components/assets/images/gallery.html`)
        };

        await page.goto(ref.url.toString());

        await navigate(page, "./page.html", ref, "fetch"); // public/page.html
    });
});
