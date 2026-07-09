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
