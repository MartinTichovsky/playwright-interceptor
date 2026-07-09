/**
 * Ported from `packages/share/src/report.ts` (AI generated, updated).
 *
 * Samples the colour of a chart bar by reading a pixel from the `<canvas>` and asserting it is
 * close to the expected fast/slow RGB colour.
 *
 * Adaptation for Playwright:
 * - `cy.window()` + `$canvas[0].getContext("2d").getImageData(...)` becomes a single
 *   `page.evaluate` that runs in the browser: it resolves the canvas, uses the report's own
 *   `window.getBarCoordinates(index)` (exposed by the template) to find the bar centre and reads
 *   the pixel with `getImageData`. The RGB triple is returned to Node where the closeness assertion
 *   runs with Playwright `expect` (`closeTo(value, 20)` -> `|pixel - value| <= 20`).
 */

import type { Page } from "@playwright/test";
import { expect, ReportTestId } from "playwright-interceptor";

import { byDataTestId } from "../../src/selectors";

const colorMap: Record<string, [number, number, number]> = {
    green: [72, 187, 120],
    red: [245, 101, 101]
};

export const checkBarColor = async (
    page: Page,
    columnIndex: number,
    expectedColor: "red" | "green"
) => {
    // Allow the chart to finish drawing (mirrors the Cypress `cy.wait(500)`).
    await page.waitForTimeout(500);

    const selector = byDataTestId(ReportTestId.DURATION_CHART_CANVAS);

    const pixel = await page.evaluate(
        ({ sel, index }) => {
            const win = window as unknown as {
                getBarCoordinates: (i: number) => {
                    x: number;
                    y: number;
                    width: number;
                    height: number;
                };
            };
            const canvas = document.querySelector(sel) as HTMLCanvasElement | null;

            if (!canvas) {
                return null;
            }

            const ctx = canvas.getContext("2d");

            if (!ctx) {
                return null;
            }

            const { x, y, width, height } = win.getBarCoordinates(index);
            const sampleX = Math.round(x + width / 2);
            const sampleY = Math.round(y + height / 2);
            const data = ctx.getImageData(sampleX, sampleY, 1, 1).data;

            return [data[0], data[1], data[2]] as [number, number, number];
        },
        { index: columnIndex, sel: selector }
    );

    expect(pixel, `The canvas / bar at index ${columnIndex} should be readable`).not.toBeNull();

    const expected = colorMap[expectedColor];

    expected.forEach((value, i) => {
        expect(
            Math.abs((pixel as [number, number, number])[i] - value),
            `The column at index ${columnIndex} should have ${expectedColor} color`
        ).toBeLessThanOrEqual(20);
    });
};
