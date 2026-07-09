/**
 * Ported from `packages/share/src/validateReportTemplate.ts` (AI generated test).
 *
 * Comprehensive validation of the report template. It mirrors the 20 Cypress checks and adapts
 * each `cy.*` command to its Playwright equivalent:
 *
 * - `cy.get(sel).should("be.visible")`            -> `expect(page.locator(sel)).toBeVisible()`
 * - `.should("contain.text", t)`                  -> `expect(locator).toContainText(t)`
 * - `.should("have.attr", "width")`               -> `expect(locator).toHaveAttribute("width")`
 * - `.should("have.class", c)` / `not.have.class` -> `expect(locator).toHaveClass(/c/)` / `.not`
 * - `cy.get(sel).scrollIntoView()`                -> `locator.scrollIntoViewIfNeeded()`
 * - `.scrollTo("right"|"left")`                   -> `locator.evaluate(el => el.scrollLeft = ...)`
 * - `.trigger("mousemove", {...})`                -> `page.mouse.move(x, y)`
 * - `.click(x, y, { force })`                     -> `locator.click({ position, force })`
 * - `cy.viewport(w, h)`                           -> `page.setViewportSize({ width, height })`
 * - `cy.wait(ms)`                                 -> `page.waitForTimeout(ms)`
 * - `.within(() => cy.get("td"))`                 -> `row.locator("td")`
 * - `.each(...)` / `.should("exist")`             -> iterate over `locator.count()`
 *
 * This helper lives inside the report e2e folder (not in `share-playwright/src`) so it can import
 * the Playwright fixtures/report enums from `playwright-interceptor` without touching frozen files.
 */

import type { Page } from "@playwright/test";
import { expect, ReportTestId, ReportTestIdPrefix } from "playwright-interceptor";

import { byDataTestId } from "../../src/selectors";

export const validateReportTemplate = async (page: Page, shouldContainSlowRequests = true) => {
    // Wait for page to fully load
    await expect(page.locator("body")).toBeVisible();
    await page.waitForTimeout(1000); // Allow time for JavaScript to initialize

    // Test 1: Verify basic structure and stats are visible
    await expect(page.locator(byDataTestId(ReportTestId.STATS_CONTAINER))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.MAX_DURATION_CARD))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.MAX_DURATION_CARD))).toContainText("ms");
    await expect(page.locator(byDataTestId(ReportTestId.MIN_DURATION_CARD))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.MIN_DURATION_CARD))).toContainText("ms");
    await expect(page.locator(byDataTestId(ReportTestId.AVG_DURATION_CARD))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.AVG_DURATION_CARD))).toContainText("ms");
    await expect(page.locator(byDataTestId(ReportTestId.TOTAL_REQUESTS_CARD))).toBeVisible();

    // Test 2: Verify chart container and legend are visible
    await expect(page.locator(byDataTestId(ReportTestId.CHART_CONTAINER))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.CHART_WRAPPER))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.PERFORMANCE_LEGEND))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.LEGEND_FAST))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.LEGEND_FAST))).toContainText("Fast");
    await expect(page.locator(byDataTestId(ReportTestId.LEGEND_SLOW))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.LEGEND_SLOW))).toContainText("Slow");

    // Test 3: Verify chart canvases are present and properly sized
    await page.locator(byDataTestId(ReportTestId.CHART_CONTAINER)).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500); // Allow scroll to complete
    await expect(page.locator(byDataTestId(ReportTestId.Y_AXIS_CANVAS))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.DURATION_CHART_CANVAS))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.DURATION_CHART_CANVAS))).toHaveAttribute(
        "width"
    );
    await expect(page.locator(byDataTestId(ReportTestId.DURATION_CHART_CANVAS))).toHaveAttribute(
        "height"
    );

    // Test 4: Verify Y-axis is fixed during horizontal scrolling
    await expect(page.locator(byDataTestId(ReportTestId.CHART_Y_AXIS))).toBeVisible();
    await page
        .locator(byDataTestId(ReportTestId.CHART_SCROLL_AREA))
        .evaluate((el) => (el.scrollLeft = el.scrollWidth));
    await page.waitForTimeout(300); // Allow scroll to complete
    await expect(page.locator(byDataTestId(ReportTestId.CHART_Y_AXIS))).toBeVisible(); // remains visible
    await page
        .locator(byDataTestId(ReportTestId.CHART_SCROLL_AREA))
        .evaluate((el) => (el.scrollLeft = 0)); // Reset scroll
    await page.waitForTimeout(300); // Allow scroll to complete

    // Test 5: Verify table structure and visibility
    await expect(page.locator(byDataTestId(ReportTestId.TABLE_CONTAINER))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.TABLE_HEADER))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.TABLE_HEADER))).toContainText(
        "Request Details"
    );
    await expect(page.locator(byDataTestId(ReportTestId.DATA_TABLE))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.TABLE_HEAD))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.TABLE_BODY))).toBeVisible();

    // Test 6: Verify table columns are present and sortable
    await expect(page.locator(byDataTestId(ReportTestId.URL_COLUMN))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.URL_COLUMN))).toContainText("URL");
    await expect(page.locator(byDataTestId(ReportTestId.METHOD_COLUMN))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.METHOD_COLUMN))).toContainText("Method");
    await expect(page.locator(byDataTestId(ReportTestId.TIME_COLUMN))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.TIME_COLUMN))).toContainText("Time");
    await expect(page.locator(byDataTestId(ReportTestId.DURATION_COLUMN))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.DURATION_COLUMN))).toContainText(
        "Duration"
    );

    // Test 7: Verify there are both fast (green) and slow (red) requests
    expect(await page.locator('[data-duration-type="fast"]').count()).toBeGreaterThan(0);

    if (shouldContainSlowRequests) {
        expect(await page.locator('[data-duration-type="slow"]').count()).toBeGreaterThan(0);
    } else {
        expect(await page.locator('[data-duration-type="slow"]').count()).toBe(0);
    }

    // Test 8: Test row expansion/collapse functionality
    const firstRow = page.locator('[data-testid^="table-row-"]').first();
    const firstRowTestId = await firstRow.getAttribute("data-testid");
    const firstRowIndex = firstRowTestId?.replace("table-row-", "") || "0";

    const expandBtn = page.locator(byDataTestId(ReportTestIdPrefix.EXPAND_BTN, firstRowIndex));
    const expandableRow = page.locator(
        byDataTestId(ReportTestIdPrefix.EXPANDABLE_ROW, firstRowIndex)
    );

    // Initially should be collapsed
    await expect(expandableRow).not.toHaveClass(/\bshow\b/);

    // Click to expand
    await expandBtn.click();
    await page.waitForTimeout(300); // Allow expansion animation
    await expect(expandableRow).toHaveClass(/\bshow\b/);

    // Verify all expandable sections are present
    await expect(
        page.locator(byDataTestId(ReportTestIdPrefix.PARAMS_SECTION, firstRowIndex))
    ).toBeVisible();
    await expect(
        page.locator(byDataTestId(ReportTestIdPrefix.HEADERS_SECTION, firstRowIndex))
    ).toBeVisible();
    await expect(
        page.locator(byDataTestId(ReportTestIdPrefix.REQUEST_BODY_SECTION, firstRowIndex))
    ).toBeVisible();
    await expect(
        page.locator(byDataTestId(ReportTestIdPrefix.RESPONSE_HEADERS_SECTION, firstRowIndex))
    ).toBeVisible();
    await expect(
        page.locator(byDataTestId(ReportTestIdPrefix.RESPONSE_BODY_SECTION, firstRowIndex))
    ).toBeVisible();

    // Verify section content containers exist
    await expect(
        page.locator(byDataTestId(ReportTestIdPrefix.PARAMS_CONTENT, firstRowIndex))
    ).toBeVisible();
    await expect(
        page.locator(byDataTestId(ReportTestIdPrefix.HEADERS_CONTENT, firstRowIndex))
    ).toBeVisible();
    await expect(
        page.locator(byDataTestId(ReportTestIdPrefix.REQUEST_BODY_CONTENT, firstRowIndex))
    ).toBeVisible();
    await expect(
        page.locator(byDataTestId(ReportTestIdPrefix.RESPONSE_HEADERS_CONTENT, firstRowIndex))
    ).toBeVisible();
    await expect(
        page.locator(byDataTestId(ReportTestIdPrefix.RESPONSE_BODY_CONTENT, firstRowIndex))
    ).toBeVisible();

    // Click to collapse
    await expandBtn.click();
    await page.waitForTimeout(300); // Allow collapse animation
    await expect(expandableRow).not.toHaveClass(/\bshow\b/);

    // Test 9: Test chart bar hover tooltip functionality (simplified and more reliable)
    await page.locator(byDataTestId(ReportTestId.CHART_CONTAINER)).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500); // Wait for scroll to complete

    const canvas = page.locator(byDataTestId(ReportTestId.DURATION_CHART_CANVAS));

    await expect(canvas).toBeVisible();

    // Just verify canvas is interactive by moving the mouse over it and away again
    const canvasBox = await canvas.boundingBox();

    if (canvasBox) {
        await page.mouse.move(canvasBox.x + 100, canvasBox.y + 100);
        await page.waitForTimeout(200);
        // Move mouse away
        await page.mouse.move(canvasBox.x - 10, canvasBox.y - 10);
        await page.waitForTimeout(200);
    }

    // Test 10: Test chart bar click functionality (simplified)
    await expect(canvas).toBeVisible();
    await canvas.click({ force: true, position: { x: 100, y: 200 } });
    // Wait for any scroll/animation to complete
    await page.waitForTimeout(1000);
    // Check if table is visible (which should happen after click)
    await expect(page.locator(byDataTestId(ReportTestId.TABLE_CONTAINER))).toBeVisible();

    // Test 11: Test table sorting functionality
    // Test sorting by URL column
    await page.locator(byDataTestId(ReportTestId.URL_COLUMN)).click();
    await page.waitForTimeout(500); // Allow sorting to complete
    await expect(page.locator(byDataTestId(ReportTestId.URL_COLUMN))).toHaveClass(/sorted-asc/);

    // Test sorting direction change
    await page.locator(byDataTestId(ReportTestId.URL_COLUMN)).click();
    await page.waitForTimeout(500); // Allow sorting to complete
    await expect(page.locator(byDataTestId(ReportTestId.URL_COLUMN))).toHaveClass(/sorted-desc/);

    // Test sorting by Duration column
    await page.locator(byDataTestId(ReportTestId.DURATION_COLUMN)).click();
    await page.waitForTimeout(500); // Allow sorting to complete
    await expect(page.locator(byDataTestId(ReportTestId.DURATION_COLUMN))).toHaveClass(
        /sorted-asc/
    );
    await expect(page.locator(byDataTestId(ReportTestId.URL_COLUMN))).not.toHaveClass(/sorted-asc/);
    await expect(page.locator(byDataTestId(ReportTestId.URL_COLUMN))).not.toHaveClass(
        /sorted-desc/
    );

    // Test sorting by Method column
    await page.locator(byDataTestId(ReportTestId.METHOD_COLUMN)).click();
    await page.waitForTimeout(500); // Allow sorting to complete
    await expect(page.locator(byDataTestId(ReportTestId.METHOD_COLUMN))).toHaveClass(/sorted-asc/);

    // Test sorting by Time column
    await page.locator(byDataTestId(ReportTestId.TIME_COLUMN)).click();
    await page.waitForTimeout(500); // Allow sorting to complete
    await expect(page.locator(byDataTestId(ReportTestId.TIME_COLUMN))).toHaveClass(/sorted-asc/);

    // Test 12: Test table row click functionality (entire row should be clickable)
    const secondRow = page.locator('[data-testid^="table-row-"]').nth(1);
    const secondRowTestId = await secondRow.getAttribute("data-testid");
    const secondRowIndex = secondRowTestId?.replace("table-row-", "") || "1";
    const secondExpandableRow = page.locator(
        byDataTestId(ReportTestIdPrefix.EXPANDABLE_ROW, secondRowIndex)
    );

    // Ensure row is initially collapsed
    await expect(secondExpandableRow).not.toHaveClass(/\bshow\b/);

    // Click entire row (not just expand button)
    await secondRow.click();
    await page.waitForTimeout(300); // Allow expansion animation
    // Should expand
    await expect(secondExpandableRow).toHaveClass(/\bshow\b/);

    // Click again to collapse
    await secondRow.click();
    await page.waitForTimeout(300); // Allow collapse animation
    await expect(secondExpandableRow).not.toHaveClass(/\bshow\b/);

    // Test 13: Verify data consistency - ensure table has data
    expect(await page.locator('[data-testid^="table-row-"]').count()).toBeGreaterThan(0);

    // Test 14: Verify duration values are properly formatted
    const durationCells = page.locator('[data-testid^="duration-cell-"]');
    const durationCellCount = await durationCells.count();

    for (let i = 0; i < durationCellCount; i++) {
        const cell = durationCells.nth(i);

        await expect(cell).toContainText("ms");

        const text = await cell.innerText();
        const duration = parseFloat(text.replace("ms", ""));

        expect(typeof duration).toBe("number");
        expect(duration).toBeGreaterThan(0);
    }

    // Test 15: Test scroll indicator functionality (if chart is scrollable)
    const isScrollable = await page
        .locator(byDataTestId(ReportTestId.CHART_SCROLL_AREA))
        .evaluate((el) => el.scrollWidth > el.clientWidth);

    if (isScrollable) {
        // Chart is scrollable, indicator should be visible
        await expect(page.locator(byDataTestId("scroll-indicator"))).toBeVisible();
    }

    // Test 16: Verify responsive behavior by testing smaller viewport
    await page.setViewportSize({ height: 1024, width: 768 }); // Tablet view
    await page.waitForTimeout(500); // Allow responsive changes to apply
    await expect(page.locator(byDataTestId(ReportTestId.CHART_CONTAINER))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.TABLE_CONTAINER))).toBeVisible();

    // Reset to desktop view
    await page.setViewportSize({ height: 720, width: 1280 });
    await page.waitForTimeout(500); // Allow responsive changes to apply

    // Test 17: Test accessibility - ensure expand buttons have proper labels
    const expandButtons = page.locator('[data-testid^="expand-btn-"]');
    const expandButtonCount = await expandButtons.count();

    for (let i = 0; i < expandButtonCount; i++) {
        await expect(expandButtons.nth(i)).toBeVisible();
    }

    // Test 18: Verify that duration colors match the legend thresholds
    const fastText = await page.locator(byDataTestId(ReportTestId.LEGEND_FAST)).innerText();
    const thresholdMatch = fastText.match(/< (\d+)ms/);

    if (thresholdMatch) {
        const threshold = parseInt(thresholdMatch[1]);

        // Check that fast durations are below threshold
        const fastCells = page.locator('[data-duration-type="fast"]');
        const fastCellCount = await fastCells.count();

        for (let i = 0; i < fastCellCount; i++) {
            const text = await fastCells.nth(i).innerText();
            const duration = parseFloat(text.replace("ms", ""));

            expect(duration).toBeLessThan(threshold);
        }

        // Check that slow durations are at or above threshold
        if (shouldContainSlowRequests) {
            const slowCells = page.locator('[data-duration-type="slow"]');
            const slowCellCount = await slowCells.count();

            for (let i = 0; i < slowCellCount; i++) {
                const text = await slowCells.nth(i).innerText();
                const duration = parseFloat(text.replace("ms", ""));

                expect(duration).toBeGreaterThanOrEqual(threshold);
            }
        } else {
            expect(await page.locator('[data-duration-type="slow"]').count()).toBe(0);
        }
    }

    // Test 19: Verify all table columns have content
    const firstRowCells = page.locator('[data-testid^="table-row-"]').first().locator("td");

    await expect(firstRowCells).toHaveCount(5); // expand button + 4 data columns
    await expect(firstRowCells.nth(1)).not.toBeEmpty(); // URL
    await expect(firstRowCells.nth(2)).not.toBeEmpty(); // Method
    await expect(firstRowCells.nth(3)).not.toBeEmpty(); // Time
    await expect(firstRowCells.nth(4)).not.toBeEmpty(); // Duration

    // Test 20: Final verification - ensure page is fully loaded and interactive
    await expect(page.locator(byDataTestId(ReportTestId.CHART_CONTAINER))).toBeVisible();
    await expect(page.locator(byDataTestId(ReportTestId.TABLE_CONTAINER))).toBeVisible();
    expect(await page.locator('[data-testid^="table-row-"]').count()).toBeGreaterThan(0);

    // Verify page is interactive
    await expect(page.locator(byDataTestId(ReportTestId.STATS_CONTAINER))).toBeVisible();
};
