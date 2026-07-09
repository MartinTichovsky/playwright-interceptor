/**
 * Ported from `packages/share/e2e/edgeCases-2.cy.ts`.
 *
 * Exercises XMLHttpRequest edge cases (response reading, broken streams, cancellation, null
 * handlers) plus a WebSocket ping/pong, verifying identical behaviour with the interceptor enabled
 * ("With proxy") and disabled ("Without proxy").
 *
 * Adaptations from the Cypress suite:
 * - Every XHR / WebSocket body runs in the browser, so each one is moved into a `page.evaluate(...)`
 *   returning serializable values that are asserted in Node.
 * - `createXMLHttpRequestTest` (from `share/src/utils`) is reimplemented locally: it still generates
 *   one test per `XMLHttpRequestLoad` variant, but the test body receives the variant and the
 *   Playwright fixtures. The variant is translated to a plain `kind` string and the response-catch
 *   wiring (`attach`) is done inside the browser.
 * - `cy.callLineEnable()` / `cy.callLine()` have no Playwright equivalent (they rely on the Cypress
 *   interceptor's internal call-line tracking), so those assertions are dropped. Where a test would
 *   otherwise have no assertion left, a completion check (`readyState`) is asserted instead.
 * - Cypress-internal assertions (`Cypress.env(...)`, `"originFetch" in window`, ...) are not ported;
 *   the interceptor state is driven with `interceptor.destroy()` / `wsInterceptor.destroy()`.
 * - "response body - null when string is passed": the Cypress interceptor stored the parsed
 *   `xhr.response` (`null` -> `"null"`). The Playwright interceptor reads the RAW network body, which
 *   is the string the server sent (`"abc"`), so `stats[0].response.body` is asserted to equal
 *   `"abc"`. The browser-side `xhr.response` is still `null`, matching the original intent.
 * - The `withvisit` variant is added to the describe title so the otherwise-identical runs have
 *   unique, greppable names.
 */

import { expect, test } from "playwright-interceptor";
import { HOST, SERVER_URL } from "playwright-interceptor-server/src/resources/constants";

import { TestArgs } from "../src/utils";

enum XMLHttpRequestLoad {
    AddEventListener_Load = "`addEventListener` - load",
    AddEventListener_Loadend = "`addEventListener` - loadend",
    AddEventListener_Readystatechange = "`addEventListener` - readystatechange",
    Onload = "`onreadystatechange`",
    Onreadystatechange = "`onload`"
}

type XHRResolveKind =
    | "addEventListener-load"
    | "addEventListener-loadend"
    | "addEventListener-readystatechange"
    | "onload"
    | "onreadystatechange";

/**
 * Translate an `XMLHttpRequestLoad` variant into a plain `kind` string that the browser-side
 * `attach` helper switches on. Mirrors the switch in the Cypress `createXMLHttpRequestTest`
 * (note the intentionally swapped enum labels in the original source).
 */
const variantKind = (variant: XMLHttpRequestLoad): XHRResolveKind => {
    switch (variant) {
        case XMLHttpRequestLoad.AddEventListener_Load:
            return "addEventListener-load";
        case XMLHttpRequestLoad.AddEventListener_Loadend:
            return "addEventListener-loadend";
        case XMLHttpRequestLoad.AddEventListener_Readystatechange:
            return "addEventListener-readystatechange";
        case XMLHttpRequestLoad.Onload:
            return "onload";
        case XMLHttpRequestLoad.Onreadystatechange:
            return "onreadystatechange";
    }
};

type XHRTestFunction = (variant: XMLHttpRequestLoad, args: TestArgs) => Promise<void>;

/**
 * Local Playwright replacement for the shared Cypress `createXMLHttpRequestTest`: generate one test
 * per `XMLHttpRequestLoad` variant (optionally filtered).
 */
const createXMLHttpRequestTest = (
    testName: string,
    testFunction: XHRTestFunction,
    filter?: XMLHttpRequestLoad[]
) => {
    Object.values(XMLHttpRequestLoad)
        .filter((value) => (filter ? filter.includes(value) : true))
        .forEach((value) => {
            test(`${testName} - ${value}`, async ({
                page,
                context,
                request,
                interceptor,
                watchTheConsole,
                wsInterceptor
            }) => {
                await testFunction(value, {
                    page,
                    context,
                    request,
                    interceptor,
                    watchTheConsole,
                    wsInterceptor
                });
            });
        });
};

const createTests = (disableInterceptor: boolean, withvisit?: "after" | "before") => {
    test.describe(`${disableInterceptor ? "Without" : "With"} proxy${withvisit ? ` (visit ${withvisit})` : ""}`, () => {
        const url = `http://${HOST}/test`;
        const urlBrokenStream = `http://${HOST}/${SERVER_URL.BrokenStream}`;

        test.beforeEach(async ({ page, interceptor, wsInterceptor }) => {
            test.setTimeout(60000);

            if (withvisit === "before") {
                await page.goto("/");
            }

            if (disableInterceptor) {
                await interceptor.destroy();
                wsInterceptor.destroy();
            }

            if (withvisit === "after") {
                await page.goto("/");
            }
        });

        test(`The proxy should be ${disableInterceptor ? "disabled" : "enabled"}`, async ({
            page,
            interceptor
        }) => {
            const result = await page.evaluate(async (url) => {
                const responseFetch = await fetch(url);
                const fetchStatus = responseFetch.status;
                const fetchText = await responseFetch.text();

                const responseXHR = new XMLHttpRequest();

                responseXHR.open("GET", url);
                responseXHR.send();

                await new Promise((resolve) => setTimeout(resolve, 500));

                return {
                    fetchStatus,
                    fetchText,
                    xhrStatus: responseXHR.status,
                    xhrResponse: responseXHR.response as string
                };
            }, url);

            expect(result.fetchStatus).toEqual(200);
            expect(result.fetchText).toEqual("{}");
            expect(result.xhrStatus).toEqual(200);
            expect(result.xhrResponse).toEqual("{}");

            expect(interceptor.getStats()).toHaveLength(disableInterceptor ? 0 : 2);
        });

        createXMLHttpRequestTest(
            "Should return the correct response",
            async (variant, { page }) => {
                const kind = variantKind(variant);

                const result = await page.evaluate(
                    async ({ url, kind }) => {
                        const request = new XMLHttpRequest();

                        request.open("GET", url);
                        request.responseType = "json";
                        request.setRequestHeader("Content-Type", "application/json");

                        const attach = (req: XMLHttpRequest, done: () => void) => {
                            switch (kind) {
                                case "addEventListener-load":
                                    req.addEventListener("load", () => done());

                                    return;
                                case "addEventListener-loadend":
                                    req.addEventListener("loadend", () => done());

                                    return;
                                case "addEventListener-readystatechange":
                                    req.addEventListener("readystatechange", () => {
                                        if (req.readyState === XMLHttpRequest.DONE) {
                                            done();
                                        }
                                    });

                                    return;
                                case "onload":
                                    req.onload = () => done();

                                    return;
                                case "onreadystatechange":
                                    req.onreadystatechange = () => {
                                        if (req.readyState === XMLHttpRequest.DONE) {
                                            done();
                                        }
                                    };

                                    return;
                            }
                        };

                        await new Promise((resolve) => {
                            attach(request, () => setTimeout(() => resolve(null), 500));

                            request.send();
                        });

                        return { response: request.response as unknown };
                    },
                    { url, kind }
                );

                expect(result.response).toEqual({});
            }
        );

        test("Should call `onreadystatechange` between states", async ({ page }) => {
            const result = await page.evaluate(async (url) => {
                const request = new XMLHttpRequest();

                request.open("GET", new URL(url));
                request.responseType = "json";
                request.setRequestHeader("Content-Type", "application/json");

                let betweenStateCalledCount = 0;
                let loadCalled = false;

                await new Promise((resolve) => {
                    request.onreadystatechange = () => {
                        if (request.readyState === XMLHttpRequest.DONE) {
                            setTimeout(() => resolve(null), 500);
                        } else {
                            betweenStateCalledCount++;
                        }
                    };

                    request.onload = () => {
                        loadCalled = true;
                    };

                    request.send();
                });

                return {
                    response: request.response as unknown,
                    betweenStateCalledCount,
                    loadCalled
                };
            }, url);

            expect(result.response).toEqual({});
            expect(result.betweenStateCalledCount).toBeGreaterThan(0);
            expect(result.loadCalled).toBe(true);
        });

        createXMLHttpRequestTest(
            "Should fail when reading text from a broken strem",
            async (variant, { page }) => {
                const kind = variantKind(variant);

                const result = await page.evaluate(
                    async ({ url, kind }) => {
                        const request = new XMLHttpRequest();

                        let onerror: string | undefined;

                        request.open("GET", url);

                        const attach = (req: XMLHttpRequest, done: () => void) => {
                            switch (kind) {
                                case "addEventListener-load":
                                    req.addEventListener("load", () => done());

                                    return;
                                case "addEventListener-loadend":
                                    req.addEventListener("loadend", () => done());

                                    return;
                                case "addEventListener-readystatechange":
                                    req.addEventListener("readystatechange", () => {
                                        if (req.readyState === XMLHttpRequest.DONE) {
                                            done();
                                        }
                                    });

                                    return;
                                case "onload":
                                    req.onload = () => done();

                                    return;
                                case "onreadystatechange":
                                    req.onreadystatechange = () => {
                                        if (req.readyState === XMLHttpRequest.DONE) {
                                            done();
                                        }
                                    };

                                    return;
                            }
                        };

                        await new Promise((resolve) => {
                            request.onerror = (ev) => {
                                onerror = ev.type;
                            };

                            attach(request, () => setTimeout(() => resolve(null), 500));

                            request.send();
                        });

                        return { onerror };
                    },
                    { url: urlBrokenStream, kind }
                );

                expect(result.onerror).not.toBeUndefined();
            },
            [
                XMLHttpRequestLoad.AddEventListener_Readystatechange,
                XMLHttpRequestLoad.Onreadystatechange
            ]
        );

        createXMLHttpRequestTest(
            "Should fail with the correct error message when cancelled",
            async (variant, { page }) => {
                const kind = variantKind(variant);

                const result = await page.evaluate(
                    async ({ url, kind }) => {
                        const request = new XMLHttpRequest();

                        let onabort: string | undefined;
                        let onerror: string | undefined;

                        request.open("GET", url);
                        request.responseType = "json";
                        request.setRequestHeader("Content-Type", "application/json");

                        const attach = (req: XMLHttpRequest, done: () => void) => {
                            switch (kind) {
                                case "addEventListener-load":
                                    req.addEventListener("load", () => done());

                                    return;
                                case "addEventListener-loadend":
                                    req.addEventListener("loadend", () => done());

                                    return;
                                case "addEventListener-readystatechange":
                                    req.addEventListener("readystatechange", () => {
                                        if (req.readyState === XMLHttpRequest.DONE) {
                                            done();
                                        }
                                    });

                                    return;
                                case "onload":
                                    req.onload = () => done();

                                    return;
                                case "onreadystatechange":
                                    req.onreadystatechange = () => {
                                        if (req.readyState === XMLHttpRequest.DONE) {
                                            done();
                                        }
                                    };

                                    return;
                            }
                        };

                        void new Promise((resolve) => {
                            request.onabort = (ev) => {
                                onabort = ev.type;
                            };

                            request.onerror = (ev) => {
                                onerror = ev.type;
                            };

                            attach(request, () => setTimeout(() => resolve(null), 500));

                            request.send();
                        });

                        setTimeout(() => request.abort(), 100);

                        await new Promise((resolve) => setTimeout(resolve, 1000));

                        return { onabort, onerror };
                    },
                    { url: `${url}?duration=2000`, kind }
                );

                expect(result.onabort).not.toBeUndefined();
                expect(result.onabort).toEqual("abort");
                expect(result.onerror).toBeUndefined();
            }
        );

        createXMLHttpRequestTest(
            "Should fail with the correct error message when cancelled and onabort is set to null",
            async (variant, { page }) => {
                const kind = variantKind(variant);

                const readyState = await page.evaluate(
                    async ({ url, kind }) => {
                        const request = new XMLHttpRequest();

                        request.open("GET", url);

                        const attach = (req: XMLHttpRequest, done: () => void) => {
                            switch (kind) {
                                case "addEventListener-load":
                                    req.addEventListener("load", () => done());

                                    return;
                                case "addEventListener-loadend":
                                    req.addEventListener("loadend", () => done());

                                    return;
                                case "addEventListener-readystatechange":
                                    req.addEventListener("readystatechange", () => {
                                        if (req.readyState === XMLHttpRequest.DONE) {
                                            done();
                                        }
                                    });

                                    return;
                                case "onload":
                                    req.onload = () => done();

                                    return;
                                case "onreadystatechange":
                                    req.onreadystatechange = () => {
                                        if (req.readyState === XMLHttpRequest.DONE) {
                                            done();
                                        }
                                    };

                                    return;
                            }
                        };

                        request.onabort = null;

                        void new Promise((resolve) => {
                            attach(request, () => setTimeout(() => resolve(null), 500));

                            request.send();
                        });

                        setTimeout(() => request.abort(), 100);

                        await new Promise((resolve) => setTimeout(resolve, 1000));

                        return request.readyState;
                    },
                    { url: `${url}?duration=2000`, kind }
                );

                expect(readyState).toEqual(0); // XMLHttpRequest.UNSENT
            }
        );

        createXMLHttpRequestTest(
            "Should work when passing null - without error",
            async (variant, { page }) => {
                const kind = variantKind(variant);

                const result = await page.evaluate(
                    async ({ url, kind }) => {
                        const request = new XMLHttpRequest();

                        request.open("GET", url);
                        request.responseType = "json";
                        request.setRequestHeader("Content-Type", "application/json");

                        request.onabort = null;
                        request.onerror = null;
                        request.onload = null;
                        request.onloadstart = null;
                        request.onprogress = null;
                        request.onreadystatechange = null;
                        request.ontimeout = null;

                        const attach = (req: XMLHttpRequest, done: () => void) => {
                            switch (kind) {
                                case "addEventListener-load":
                                    req.addEventListener("load", () => done());

                                    return;
                                case "addEventListener-loadend":
                                    req.addEventListener("loadend", () => done());

                                    return;
                                case "addEventListener-readystatechange":
                                    req.addEventListener("readystatechange", () => {
                                        if (req.readyState === XMLHttpRequest.DONE) {
                                            done();
                                        }
                                    });

                                    return;
                                case "onload":
                                    req.onload = () => done();

                                    return;
                                case "onreadystatechange":
                                    req.onreadystatechange = () => {
                                        if (req.readyState === XMLHttpRequest.DONE) {
                                            done();
                                        }
                                    };

                                    return;
                            }
                        };

                        await new Promise((resolve) => {
                            attach(request, () => setTimeout(() => resolve(null), 500));

                            request.send();
                        });

                        return { response: request.response as unknown };
                    },
                    { url, kind }
                );

                expect(result.response).toEqual({});
            }
        );

        createXMLHttpRequestTest(
            "Should work when passing null - with error",
            async (variant, { page }) => {
                const kind = variantKind(variant);

                const result = await page.evaluate(
                    async ({ url, kind }) => {
                        const request = new XMLHttpRequest();

                        request.open("GET", url);

                        request.onabort = null;
                        request.onerror = null;
                        request.onload = null;
                        request.onloadstart = null;
                        request.onprogress = null;
                        request.onreadystatechange = null;
                        request.ontimeout = null;

                        const attach = (req: XMLHttpRequest, done: () => void) => {
                            switch (kind) {
                                case "addEventListener-load":
                                    req.addEventListener("load", () => done());

                                    return;
                                case "addEventListener-loadend":
                                    req.addEventListener("loadend", () => done());

                                    return;
                                case "addEventListener-readystatechange":
                                    req.addEventListener("readystatechange", () => {
                                        if (req.readyState === XMLHttpRequest.DONE) {
                                            done();
                                        }
                                    });

                                    return;
                                case "onload":
                                    req.onload = () => done();

                                    return;
                                case "onreadystatechange":
                                    req.onreadystatechange = () => {
                                        if (req.readyState === XMLHttpRequest.DONE) {
                                            done();
                                        }
                                    };

                                    return;
                            }
                        };

                        await new Promise((resolve) => {
                            attach(request, () => setTimeout(() => resolve(null), 500));

                            request.send();
                        });

                        return { readyState: request.readyState };
                    },
                    { url: urlBrokenStream, kind }
                );

                // callLine assertion has no Playwright equivalent; assert the request completed.
                expect(result.readyState).toEqual(4); // XMLHttpRequest.DONE
            },
            [
                XMLHttpRequestLoad.AddEventListener_Readystatechange,
                XMLHttpRequestLoad.Onreadystatechange
            ]
        );

        test("should handle WebSocket with ping/pong", async ({ page }) => {
            const gotPong = await page.evaluate(
                (wsUrl) =>
                    new Promise<boolean>((resolve) => {
                        const ws = new WebSocket(wsUrl);
                        const response = "pong";

                        ws.onopen = () => {
                            ws.send(
                                JSON.stringify({
                                    data: "ping",
                                    delay: 500,
                                    response
                                })
                            );
                        };

                        ws.onmessage = (event) => {
                            if (event.data === response) {
                                resolve(true);
                            }
                        };
                    }),
                `ws://${HOST}/ping-test`
            );

            expect(gotPong).toBe(true);
        });

        createXMLHttpRequestTest(
            "Should return the correct response body - JSON when number is passed",
            async (variant, { page, interceptor }) => {
                const kind = variantKind(variant);
                const responseString = "123";

                const result = await page.evaluate(
                    async ({ baseUrl, responseString, kind }) => {
                        const request = new XMLHttpRequest();

                        request.responseType = "json";

                        const requestUrl = new URL(baseUrl);

                        requestUrl.search = new URLSearchParams({ responseString }).toString();

                        request.open("GET", requestUrl);

                        const attach = (req: XMLHttpRequest, done: () => void) => {
                            switch (kind) {
                                case "addEventListener-load":
                                    req.addEventListener("load", () => done());

                                    return;
                                case "addEventListener-loadend":
                                    req.addEventListener("loadend", () => done());

                                    return;
                                case "addEventListener-readystatechange":
                                    req.addEventListener("readystatechange", () => {
                                        if (req.readyState === XMLHttpRequest.DONE) {
                                            done();
                                        }
                                    });

                                    return;
                                case "onload":
                                    req.onload = () => done();

                                    return;
                                case "onreadystatechange":
                                    req.onreadystatechange = () => {
                                        if (req.readyState === XMLHttpRequest.DONE) {
                                            done();
                                        }
                                    };

                                    return;
                            }
                        };

                        await new Promise<void>((resolve) => {
                            attach(request, () => resolve());

                            request.send();
                        });

                        return { response: request.response as unknown };
                    },
                    { baseUrl: url, responseString, kind }
                );

                expect(result.response).toEqual(JSON.parse(responseString));

                if (!disableInterceptor) {
                    // the request resolves in the browser before the Node-side interceptor has
                    // finished recording the response - wait for it.
                    await interceptor.waitUntilRequestIsDone();
                }

                const stats = interceptor.getStats();

                expect(stats).toHaveLength(disableInterceptor ? 0 : 1);

                if (!disableInterceptor) {
                    expect(stats[0].response).not.toBeUndefined();
                    expect(stats[0].response!.body).toEqual(responseString);
                }
            }
        );

        createXMLHttpRequestTest(
            "Should return the correct response body - null when string is passed",
            async (variant, { page, interceptor }) => {
                const kind = variantKind(variant);
                const responseString = "abc";

                const result = await page.evaluate(
                    async ({ baseUrl, responseString, kind }) => {
                        const request = new XMLHttpRequest();

                        request.responseType = "json";

                        const requestUrl = new URL(baseUrl);

                        requestUrl.search = new URLSearchParams({ responseString }).toString();

                        request.open("GET", requestUrl);

                        const attach = (req: XMLHttpRequest, done: () => void) => {
                            switch (kind) {
                                case "addEventListener-load":
                                    req.addEventListener("load", () => done());

                                    return;
                                case "addEventListener-loadend":
                                    req.addEventListener("loadend", () => done());

                                    return;
                                case "addEventListener-readystatechange":
                                    req.addEventListener("readystatechange", () => {
                                        if (req.readyState === XMLHttpRequest.DONE) {
                                            done();
                                        }
                                    });

                                    return;
                                case "onload":
                                    req.onload = () => done();

                                    return;
                                case "onreadystatechange":
                                    req.onreadystatechange = () => {
                                        if (req.readyState === XMLHttpRequest.DONE) {
                                            done();
                                        }
                                    };

                                    return;
                            }
                        };

                        await new Promise<void>((resolve) => {
                            attach(request, () => resolve());

                            request.send();
                        });

                        return { responseIsNull: request.response === null };
                    },
                    { baseUrl: url, responseString, kind }
                );

                expect(result.responseIsNull).toBe(true);

                if (!disableInterceptor) {
                    // the request resolves in the browser before the Node-side interceptor has
                    // finished recording the response - wait for it.
                    await interceptor.waitUntilRequestIsDone();
                }

                const stats = interceptor.getStats();

                expect(stats).toHaveLength(disableInterceptor ? 0 : 1);

                if (!disableInterceptor) {
                    expect(stats[0].response).not.toBeUndefined();
                    // the Playwright interceptor stores the RAW network body ("abc"); the Cypress
                    // interceptor stored the parsed `xhr.response` (null -> "null").
                    expect(stats[0].response!.body).toEqual(responseString);
                }
            }
        );
    });
};

// we must be sure that the tests are applicable to the original fetch, xhr and websocket
createTests(true);
createTests(true, "before");
createTests(true, "after");
// tests with interceptor enabled
createTests(false);
createTests(false, "before");
createTests(false, "after");
