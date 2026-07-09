import { expect, test } from "playwright-interceptor";
import { HOST, I_TEST_ID_HEADER } from "playwright-interceptor-server/src/resources/constants";

import { getCounter, resetCounter } from "../src/counter";
import { getTestId, resourceTypeIt, wait } from "../src/utils";

/**
 * Ported from `packages/share/e2e/delayRequest.cy.ts`.
 */
test.describe("Delay Request", () => {
    const testPath = "/api/delay-request";
    const delay = 2000;

    resourceTypeIt(
        "does not hit the back-end during the delay",
        async (resourceType, { page, request, interceptor }) => {
            const iTestId = getTestId(test.info());

            interceptor.delayRequest({ resourceType }, delay);

            await page.goto("/");

            const reset = await resetCounter(request, iTestId);

            await page.evaluate(
                ({ resourceType, testPath, iTestId, headerName }) => {
                    const url = `${window.location.origin}${testPath}`;

                    if (resourceType === "fetch") {
                        void fetch(url, {
                            headers: { [headerName]: iTestId },
                            method: "GET"
                        });
                    } else {
                        const xhr = new XMLHttpRequest();

                        xhr.open("GET", url);
                        xhr.setRequestHeader(headerName, iTestId);
                        xhr.send();
                    }
                },
                { resourceType, testPath, iTestId, headerName: I_TEST_ID_HEADER }
            );

            // while the request is being delayed, the back-end must not be hit yet
            await wait(delay / 2);

            expect(await getCounter(request, iTestId)).toHaveLength(0);

            // wait until the delayed request is finally sent and finished
            await interceptor.waitUntilRequestIsDone();

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toEqual(`http://${HOST}${testPath}`);
            // the back-end was hit only after the delay elapsed
            expect(counter[0].timestamp - reset.timestamp).toBeGreaterThanOrEqual(delay);

            const stats = interceptor.getLastRequest(`**${testPath}`);

            expect(stats).not.toBeUndefined();
            expect(stats!.requestDelay).toEqual(delay);
        }
    );
});

test.describe("Delay Request - manage delays", () => {
    // the static page fires two fetch requests on load
    const staticUrl = "/public/index.html";

    test("removeDelay removes a registered delay by id", ({ interceptor }) => {
        const id = interceptor.delayRequest({ resourceType: "fetch" }, 1000);

        // removing an existing id returns true; removing it again or an unknown id returns false
        expect(interceptor.removeDelay(id)).toBe(true);
        expect(interceptor.removeDelay(id)).toBe(false);
        expect(interceptor.removeDelay(9999)).toBe(false);
    });

    test("delays the matching requests the configured number of times", async ({
        page,
        interceptor
    }) => {
        const delay = 200;

        // `times: 2` -> the first matching request decrements the counter, the second removes the
        // entry. Both requests are therefore delayed.
        interceptor.delayRequest({ resourceType: "fetch" }, delay, { times: 2 });

        await page.goto(staticUrl);

        await interceptor.waitUntilRequestIsDone();

        const delayed = interceptor.getStats().filter((entry) => entry.requestDelay === delay);

        expect(delayed.length).toBeGreaterThanOrEqual(2);
    });
});
