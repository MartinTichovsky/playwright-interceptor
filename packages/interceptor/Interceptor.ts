import type {
    Page,
    Request as PlaywrightRequest,
    Response as PlaywrightResponse,
    Route
} from "@playwright/test";

import {
    CallStack,
    IDelayRequestOptions,
    IHeaders,
    IMockResponse,
    IMockResponseOptions,
    InterceptorOptions,
    IRequest,
    IRequestInit,
    IResourceType,
    IRouteMatcher,
    IThrottleRequestOptions,
    OnRequestError,
    StringMatcher,
    WaitUntilRequestOptions,
    WriteStatsOptions
} from "./Interceptor.types";
import {
    deepCopy,
    getRuntimeString,
    removeUndefinedFromObject,
    sleep,
    testUrlMatch
} from "./src/utils";
import { getFilePath, writeFile } from "./src/utils.node";
import { waitTill } from "./src/wait";

const DEFAULT_INTERVAL = 100;
const DEFAULT_TIMEOUT = 10000;
const DEFAULT_WAIT_FOR_NEXT_REQUEST = 750;
const BODY_READ_TIMEOUT = 10000;

const defaultOptions: Required<InterceptorOptions> = {
    ignoreCrossDomain: false
};

export interface InterceptorConstructorOptions {
    /**
     * The default timeout (in ms) used by `waitUntilRequestIsDone`. Defaults to 10000.
     */
    requestTimeout?: number;
    /**
     * The test title path (describe blocks + the test name). Used to auto-generate log file names.
     */
    titlePath?: string[];
}

interface RequestMeta {
    durationStart: number;
    isMock: boolean;
    statusText?: string;
    throttleDelay?: number;
}

const RESOURCE_TYPE_MAP: Record<string, IResourceType | undefined> = {
    fetch: "fetch",
    xhr: "xhr"
};

const hasContentType = (headers: Record<string, string>) =>
    Object.keys(headers).some((key) => key.toLowerCase() === "content-type");

/**
 * Normalize the request body to a string.
 *
 * Playwright intercepts at the network level, so the body is already serialized. For url-encoded
 * bodies we return a normalized JSON string (so the value matches the request object), which mirrors
 * how the Cypress interceptor stores the body. Other formats are returned as the raw post data.
 */
const normalizeRequestBody = (request: PlaywrightRequest): string => {
    const raw = request.postData();

    if (raw === null) {
        return "";
    }

    const contentType = (request.headers()["content-type"] ?? "").toLowerCase();

    if (contentType.includes("application/x-www-form-urlencoded")) {
        try {
            const params = new URLSearchParams(raw);
            const object: Record<string, unknown> = {};

            for (const [key, value] of params.entries()) {
                object[key] = value;
            }

            return JSON.stringify(object);
        } catch {
            return raw;
        }
    }

    return raw;
};

/**
 * Headers that must be removed when fulfilling with an already-decoded body, otherwise the browser
 * would try to decode/measure the body again and corrupt it.
 */
const sanitizeResponseHeaders = (headers: Record<string, string>) => {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
        const lowerKey = key.toLowerCase();

        if (lowerKey === "content-encoding" || lowerKey === "content-length") {
            continue;
        }

        result[key] = value;
    }

    return result;
};

export class Interceptor {
    private _callStack: CallStack[] = [];
    private _delay: {
        delay: number;
        id: number;
        options?: IDelayRequestOptions;
        routeMatcher: IRouteMatcher;
    }[] = [];
    private _delayId = 0;
    private _mock: {
        id: number;
        mock: IMockResponse;
        options?: IMockResponseOptions;
        routeMatcher: IRouteMatcher;
    }[] = [];
    private _mockId = 0;
    private _onRequestError: OnRequestError | undefined;
    private _options: Required<InterceptorOptions> = {
        ...defaultOptions
    };
    private _sequenceId = 0;
    private _skip = 0;
    private _throttle: {
        delay: number;
        id: number;
        options?: IThrottleRequestOptions;
        routeMatcher: IRouteMatcher;
    }[] = [];
    private _throttleId = 0;
    private _active = false;

    private readonly _itemByRequest = new Map<PlaywrightRequest, CallStack>();
    private readonly _metaByRequest = new Map<PlaywrightRequest, RequestMeta>();

    private readonly _routeHandler: (route: Route, request: PlaywrightRequest) => Promise<void>;
    private readonly _responseHandler: (response: PlaywrightResponse) => Promise<void>;
    private readonly _requestFailedHandler: (request: PlaywrightRequest) => void;

    private readonly page: Page;
    private readonly startTime: number;
    private readonly requestTimeout: number;
    private titlePath: string[];

    constructor(page: Page, options: InterceptorConstructorOptions = {}) {
        this.page = page;
        this.startTime = new Date().getTime();
        this.requestTimeout = options.requestTimeout ?? DEFAULT_TIMEOUT;
        this.titlePath = options.titlePath ?? [];
        this._routeHandler = (route, request) => this.handleRoute(route, request);
        this._responseHandler = (response) => this.handleResponse(response);
        this._requestFailedHandler = (request) => this.handleRequestFailed(request);
    }

    /**
     * Start intercepting requests. This is called automatically by the fixture.
     */
    public async start() {
        if (this._active) {
            return;
        }

        this._active = true;

        this.page.on("response", this._responseHandler);
        this.page.on("requestfailed", this._requestFailedHandler);

        await this.page.route("**/*", this._routeHandler);
    }

    /**
     * Destroy the interceptor by removing the route handler. After this call, requests are no
     * longer intercepted or logged.
     */
    public async destroy() {
        if (!this._active) {
            return;
        }

        this._active = false;

        this.page.off("response", this._responseHandler);
        this.page.off("requestfailed", this._requestFailedHandler);

        try {
            await this.page.unroute("**/*", this._routeHandler);
        } catch {
            // the page/context may already be closed during teardown
        }
    }

    /**
     * Recreate the interceptor. It clears the logged requests and all registered mocks, delays and
     * throttles, and starts intercepting again.
     */
    public async recreate() {
        this._callStack = [];
        this._delay = [];
        this._mock = [];
        this._throttle = [];
        this._delayId = 0;
        this._mockId = 0;
        this._throttleId = 0;
        this._sequenceId = 0;
        this._skip = 0;
        this._itemByRequest.clear();
        this._metaByRequest.clear();

        await this.start();
    }

    /**
     * Return a copy of all logged requests since the Interceptor was created.
     */
    public get callStack() {
        return deepCopy(this._callStack);
    }

    private isCrossDomain(url: URL) {
        try {
            const pageUrl = new URL(this.page.url());

            return url.host !== pageUrl.host;
        } catch {
            return false;
        }
    }

    private async handleRoute(route: Route, request: PlaywrightRequest) {
        const resourceType = RESOURCE_TYPE_MAP[request.resourceType()];

        // ignore everything that is not fetch or xhr
        if (resourceType === undefined) {
            try {
                await route.continue();
            } catch {
                // the page/context may be closing
            }

            return;
        }

        const _headerProcessStart = performance.now();

        const url = new URL(request.url());
        const method = request.method();
        const headers = request.headers() as IHeaders;
        const body = normalizeRequestBody(request);
        const crossDomain = this.isCrossDomain(url);
        const ignoreItem = this._options.ignoreCrossDomain && crossDomain;
        const query = Object.fromEntries(url.searchParams);
        const runtime = new Date().getTime() - this.startTime;

        const requestData: IRequest = {
            body,
            headers: deepCopy(headers),
            method,
            query: deepCopy(query)
        };

        const item: CallStack = {
            crossDomain,
            isPending: !ignoreItem,
            request: requestData,
            resourceType,
            sequenceId: ++this._sequenceId,
            timeStart: new Date(),
            url,
            runtime,
            runtimeString: getRuntimeString(runtime)
        };

        this._callStack.push(item);
        this._itemByRequest.set(request, item);

        /**
         * When mocking the response, the priority is:
         * - mock
         * - throttle
         */
        const throttle = this.getThrottle(item);
        const mock = this.getMock(item) ?? throttle.mockResponse;
        const requestDelay = this.getDelay(item);

        item.delay = throttle.delay;
        item.requestDelay = requestDelay;
        item._headerProcessDuration = performance.now() - _headerProcessStart;

        const hasResponseBodyMock = !(!mock?.body && !mock?.generateBody);

        const meta: RequestMeta = {
            durationStart: performance.now(),
            isMock: Boolean(mock),
            statusText: mock?.statusText,
            throttleDelay: throttle.delay
        };

        this._metaByRequest.set(request, meta);

        const requestInit: IRequestInit = { body, headers, method, url };

        try {
            // delay the request before it is sent
            if (requestDelay) {
                await sleep(requestDelay);
            }

            meta.durationStart = performance.now();

            // full mock - do not hit the network
            if (mock && hasResponseBodyMock && !mock.allowHitTheNetwork) {
                const built = this.buildMockResponse(mock, requestData);

                if (throttle.delay) {
                    await sleep(throttle.delay);
                }

                await route.fulfill({
                    status: mock.statusCode ?? 200,
                    headers: built.headers,
                    body: built.body
                });

                return;
            }

            // mock (override) or throttle - hit the network but buffer and rebuild the response
            if (mock || throttle.delay) {
                const response = await route.fetch();
                const originalBody = await response.text();

                let responseBody = originalBody;
                let responseHeaders = response.headers();
                let status = response.status();

                if (mock) {
                    if (hasResponseBodyMock) {
                        const built = this.buildMockResponse(mock, requestData, originalBody);

                        responseBody = built.body;
                        responseHeaders = { ...responseHeaders, ...built.headers };
                    } else if (mock.headers) {
                        responseHeaders = { ...responseHeaders, ...mock.headers };
                    }

                    status = mock.statusCode ?? status;
                }

                if (throttle.delay) {
                    await sleep(throttle.delay);
                }

                await route.fulfill({
                    status,
                    headers: sanitizeResponseHeaders(responseHeaders),
                    body: responseBody
                });

                await response.dispose().catch(() => undefined);

                return;
            }

            // passthrough - the browser receives the response directly (no re-buffering), which is
            // essential for large responses. The response is captured via the `response` event.
            await route.continue();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const isClosedError =
                message.includes("closed") || message.includes("Target page, context or browser");

            if (!isClosedError) {
                item.isPending = false;
                item.requestError = error;

                if (this._onRequestError) {
                    this._onRequestError(requestInit, error as Error);
                }
            }

            try {
                await route.abort();
            } catch {
                // the page/context may be closing
            }
        }
    }

    private async handleResponse(response: PlaywrightResponse) {
        const request = response.request();
        const item = this._itemByRequest.get(request);

        if (!item || item.response) {
            return;
        }

        const meta = this._metaByRequest.get(request);
        const _responseProcessStart = performance.now();

        let body: string;

        try {
            // Read the body, but never block indefinitely: when the page does not consume a large
            // response body (e.g. the "big data" case), reading it from Node can deadlock on HTTP
            // flow control. In that case we give up on the body but still mark the request as done.
            body = await Promise.race([response.text(), sleep(BODY_READ_TIMEOUT).then(() => "")]);
        } catch {
            body = "";
        }

        const now = performance.now();

        if (meta) {
            item.duration = now - meta.durationStart - (meta.throttleDelay ?? 0);
        }

        item.response = {
            body,
            headers: response.headers(),
            isMock: meta?.isMock ?? false,
            statusCode: response.status(),
            statusText: meta?.statusText ?? response.statusText(),
            timeEnd: new Date()
        };

        item._responseProcessDuration = performance.now() - _responseProcessStart;
        item.isPending = false;

        this._itemByRequest.delete(request);
        this._metaByRequest.delete(request);
    }

    private handleRequestFailed(request: PlaywrightRequest) {
        const item = this._itemByRequest.get(request);

        if (!item || item.response) {
            return;
        }

        const failure = request.failure();
        const error = new Error(failure?.errorText ?? "Request failed");

        item.isPending = false;
        item.requestError = error;

        if (this._onRequestError) {
            const requestInit: IRequestInit = {
                body: item.request.body,
                headers: item.request.headers,
                method: item.request.method,
                url: item.url
            };

            this._onRequestError(requestInit, error);
        }

        this._itemByRequest.delete(request);
        this._metaByRequest.delete(request);
    }

    private buildMockResponse(mock: IMockResponse, request: IRequest, responseText = "") {
        const generatedBody =
            mock.generateBody?.(request, () => {
                try {
                    return JSON.parse(request.body);
                } catch {
                    return request.body;
                }
            }) ??
            mock.body ??
            responseText;

        const isObject = typeof generatedBody === "object" && generatedBody !== null;

        const headers: Record<string, string> = { ...(mock.headers ?? {}) };

        if (isObject && !hasContentType(headers)) {
            headers["Content-Type"] = "application/json";
        }

        return {
            body: isObject ? JSON.stringify(generatedBody) : String(generatedBody),
            headers
        };
    }

    private filterItemsByMatcher(routeMatcher?: IRouteMatcher) {
        return (item: CallStack) => {
            if (!routeMatcher) {
                return true;
            }

            if (routeMatcher instanceof RegExp || typeof routeMatcher === "string") {
                return testUrlMatch(routeMatcher, item.url.origin + item.url.pathname);
            }

            let matches = 0;
            let mustMatch = 0;

            if (routeMatcher.headersMatcher) {
                mustMatch++;

                matches += routeMatcher.headersMatcher(item.request.headers) ? 1 : 0;
            }

            if (routeMatcher.bodyMatcher !== undefined) {
                mustMatch++;

                matches += routeMatcher.bodyMatcher(item.request.body) ? 1 : 0;
            }

            if (routeMatcher.crossDomain !== undefined) {
                mustMatch++;

                matches +=
                    (routeMatcher.crossDomain && item.crossDomain) ||
                    (!routeMatcher.crossDomain && !item.crossDomain)
                        ? 1
                        : 0;
            }

            if (routeMatcher.https !== undefined) {
                mustMatch++;

                matches +=
                    (routeMatcher.https && item.url.protocol === "https:") ||
                    (!routeMatcher.https && item.url.protocol === "http:")
                        ? 1
                        : 0;
            }

            if (routeMatcher.method) {
                mustMatch++;

                matches += item.request.method === routeMatcher.method ? 1 : 0;
            }

            if (routeMatcher.queryMatcher !== undefined) {
                mustMatch++;

                matches += routeMatcher.queryMatcher(item.request.query) ? 1 : 0;
            }

            if (routeMatcher.resourceType && routeMatcher.resourceType !== "all") {
                mustMatch++;

                matches += (
                    Array.isArray(routeMatcher.resourceType)
                        ? routeMatcher.resourceType.includes(item.resourceType)
                        : item.resourceType === routeMatcher.resourceType
                )
                    ? 1
                    : 0;
            }

            if (routeMatcher.url) {
                mustMatch++;

                matches += testUrlMatch(routeMatcher.url, item.url.origin + item.url.pathname)
                    ? 1
                    : 0;
            }

            return matches === mustMatch;
        };
    }

    private getMock(item: CallStack) {
        const mockItem = [...this._mock]
            .reverse()
            .find((entry) => this.filterItemsByMatcher(entry.routeMatcher)(item));

        if (mockItem && (mockItem.options?.times === undefined || mockItem.options.times === 1)) {
            this._mock.splice(this._mock.indexOf(mockItem), 1);
        } else if (
            mockItem &&
            mockItem.options &&
            mockItem.options.times !== undefined &&
            mockItem.options.times > 1
        ) {
            mockItem.options.times--;
        }

        return mockItem?.mock;
    }

    private getDelay(item: CallStack) {
        const delayItem = [...this._delay]
            .reverse()
            .find((entry) => this.filterItemsByMatcher(entry.routeMatcher)(item));

        if (
            delayItem &&
            (delayItem.options?.times === undefined || delayItem.options.times === 1)
        ) {
            this._delay.splice(this._delay.indexOf(delayItem), 1);
        } else if (
            delayItem &&
            delayItem.options &&
            delayItem.options.times !== undefined &&
            delayItem.options.times > 1
        ) {
            delayItem.options.times--;
        }

        return delayItem?.delay;
    }

    private getThrottle(item: CallStack) {
        const throttleItem = [...this._throttle]
            .reverse()
            .find((entry) => this.filterItemsByMatcher(entry.routeMatcher)(item));
        const delay = throttleItem?.delay;
        const mockResponse = throttleItem?.options?.mockResponse;

        if (
            throttleItem &&
            (throttleItem.options?.times === undefined || throttleItem.options.times === 1)
        ) {
            this._throttle.splice(this._throttle.indexOf(throttleItem), 1);
        } else if (
            throttleItem &&
            throttleItem.options &&
            throttleItem.options.times !== undefined &&
            throttleItem.options.times > 1
        ) {
            throttleItem.options.times--;
        }

        return { delay, mockResponse };
    }

    /**
     * Get the last call that matches the provided route matcher.
     *
     * @param routeMatcher A route matcher
     * @returns The last call information or `undefined` if none match
     */
    public getLastRequest(routeMatcher?: IRouteMatcher) {
        const items = this._callStack.filter(this.filterItemsByMatcher(routeMatcher));

        return items.length ? deepCopy(items[items.length - 1]) : undefined;
    }

    /**
     * Get statistics for all requests matching the provided route matcher since the beginning of the
     * current test.
     *
     * @param routeMatcher A route matcher
     * @returns All requests matching the provided route matcher with detailed information, if none
     *          match, returns an empty array
     */
    public getStats(routeMatcher?: IRouteMatcher) {
        return deepCopy(this._callStack.filter(this.filterItemsByMatcher(routeMatcher)));
    }

    /**
     * Get the number of requests matching the provided route matcher.
     *
     * @param routeMatcher A route matcher
     * @returns The number of requests matching the provided route matcher since the current test started
     */
    public requestCalls(routeMatcher?: IRouteMatcher) {
        return this._callStack.filter(this.filterItemsByMatcher(routeMatcher)).length;
    }

    private isThereRequestPending(routeMatcher?: IRouteMatcher, enforceCheck = true) {
        const items = this._callStack
            .slice(this._skip)
            .filter(this.filterItemsByMatcher(routeMatcher));

        // there must be at least one match, otherwise we need to wait for the request
        return enforceCheck
            ? !items.length || items.some((item) => item.isPending)
            : items.some((item) => item.isPending);
    }

    /**
     * Delay requests matching the provided route matcher by waiting before the request is sent. By
     * default, it delays the first matching request, and then the delay is removed. Set `times` in the
     * options to change how many times the matching requests should be delayed.
     *
     * @param routeMatcher A route matcher
     * @param delay The delay in ms
     * @param options The delay options
     * @returns The ID of the created delay. This is needed if you want to remove the delay manually.
     */
    public delayRequest(
        routeMatcher: IRouteMatcher,
        delay: number,
        options?: IDelayRequestOptions
    ) {
        const delayEntry = { delay, id: ++this._delayId, options, routeMatcher };

        this._delay.push(delayEntry);

        return delayEntry.id;
    }

    /**
     * Mock the response of requests matching the provided route matcher. By default, it mocks the
     * first matching request, and then the mock is removed. Set `times` in the options to change how
     * many times the matching requests should be mocked.
     *
     * @param routeMatcher A route matcher
     * @param mock The response mock
     * @param options The mock options
     * @returns The ID of the created mock. This is needed if you want to remove the mock manually.
     */
    public mockResponse(
        routeMatcher: IRouteMatcher,
        mock: IMockResponse,
        options?: IMockResponseOptions
    ) {
        const mockEntry = { id: ++this._mockId, mock, options, routeMatcher };

        this._mock.push(mockEntry);

        return mockEntry.id;
    }

    /**
     * Function called when a request is cancelled or fails
     *
     * @param func A function called on error/cancel
     */
    public onRequestError(func: OnRequestError) {
        this._onRequestError = func;
    }

    /**
     * Remove the delay entry by ID
     *
     * @param id A unique id received from `delayRequest`
     */
    public removeDelay(id: number) {
        if (this._delay.find((entry) => entry.id === id)) {
            this._delay = this._delay.filter((entry) => entry.id !== id);

            return true;
        }

        return false;
    }

    /**
     * Remove the mock entry by ID
     *
     * @param id A unique id received from `mockResponse`
     */
    public removeMock(id: number) {
        if (this._mock.find((entry) => entry.id === id)) {
            this._mock = this._mock.filter((entry) => entry.id !== id);

            return true;
        }

        return false;
    }

    /**
     * Remove the throttle entry by ID
     *
     * @param id A unique id received from `throttleRequest`
     */
    public removeThrottle(id: number) {
        if (this._throttle.find((entry) => entry.id === id)) {
            this._throttle = this._throttle.filter((entry) => entry.id !== id);

            return true;
        }

        return false;
    }

    /**
     * Reset the Interceptor's watch. It sets the pointer to the last call. Resetting the pointer is
     * necessary when you want to wait for certain requests.
     */
    public resetWatch() {
        this._skip = this._callStack.length;
    }

    /**
     * Set the Interceptor options. This must be called before a request occurs.
     *
     * @param options Options
     * @returns The current Interceptor options
     */
    public setOptions(options: InterceptorOptions = this._options): InterceptorOptions {
        this._options = {
            ...this._options,
            ...removeUndefinedFromObject(options)
        };

        return deepCopy(this._options);
    }

    /**
     * Throttle requests matching the provided route matcher by setting a delay. By default, it
     * throttles the first matching request, and then the throttle is removed. Set times in the options
     * to change how many times the matching requests should be throttled.
     *
     * The delay is applied AFTER the request finishes - the request hits the back-end first, and then
     * the response is held for the given delay before it is returned to the code that called it. To
     * delay a request BEFORE it is sent, use `delayRequest` instead.
     *
     * @param routeMatcher A route matcher
     * @param delay The delay in ms
     * @param options The throttle options (which can include mocking the response).
     * @returns The ID of the created throttle. This is needed if you want to remove the throttle manually.
     */
    public throttleRequest(
        routeMatcher: IRouteMatcher,
        delay: number,
        options?: IThrottleRequestOptions
    ) {
        const throttleEntry = { delay, id: ++this._throttleId, options, routeMatcher };

        this._throttle.push(throttleEntry);

        return throttleEntry.id;
    }

    /**
     * The method will wait until all requests matching the provided route matcher are finished or
     * until the maximum waiting time (`timeout` in options) is reached.
     *
     * @param action An action which should trigger a request
     * @param stringMatcherOrOptions A string matcher OR options with a route matcher
     * @param errorMessage An error message when the maximum waiting time is reached
     * @returns The result from the action
     */
    public async waitUntilRequestIsDone<T>(
        action: () => Promise<T> | T,
        stringMatcherOrOptions?: StringMatcher | WaitUntilRequestOptions,
        errorMessage?: string
    ): Promise<T>;
    /**
     * @param stringMatcherOrOptions A string matcher OR options with a route matcher
     * @param errorMessage An error message when the maximum waiting time is reached
     * @returns An instance of the Interceptor
     */
    public async waitUntilRequestIsDone(
        stringMatcherOrOptions?: StringMatcher | WaitUntilRequestOptions,
        errorMessage?: string
    ): Promise<this>;
    public async waitUntilRequestIsDone<T>(
        actionOrStringMatcherOrOptions?:
            | (() => Promise<T> | T)
            | StringMatcher
            | WaitUntilRequestOptions,
        stringMatcherOrOptionsOrErrorMessage?: StringMatcher | WaitUntilRequestOptions | string,
        errorMessage?: string
    ): Promise<T | this> {
        if (typeof actionOrStringMatcherOrOptions === "function") {
            this.resetWatch();

            const result = await actionOrStringMatcherOrOptions();

            await this.waitUntilRequestIsDone_withWait(
                stringMatcherOrOptionsOrErrorMessage as
                    | StringMatcher
                    | WaitUntilRequestOptions
                    | undefined,
                performance.now(),
                errorMessage
            );

            return result;
        }

        await this.waitUntilRequestIsDone_withWait(
            actionOrStringMatcherOrOptions,
            performance.now(),
            typeof stringMatcherOrOptionsOrErrorMessage === "string"
                ? stringMatcherOrOptionsOrErrorMessage
                : undefined
        );

        return this;
    }

    private async waitUntilRequestIsDone_withWait(
        stringMatcherOrOptions: StringMatcher | WaitUntilRequestOptions = {},
        startTime: number,
        errorMessage?: string
    ): Promise<this> {
        if (
            typeof stringMatcherOrOptions === "string" ||
            stringMatcherOrOptions instanceof RegExp ||
            typeof stringMatcherOrOptions !== "object"
        ) {
            stringMatcherOrOptions = { url: stringMatcherOrOptions };
        }

        const options = stringMatcherOrOptions;

        const totalTimeout = options.timeout ?? this.requestTimeout ?? DEFAULT_TIMEOUT;

        const timeout = totalTimeout - (performance.now() - startTime);

        await waitTill(() => this.isThereRequestPending(options, options.enforceCheck), {
            errorMessage,
            interval: DEFAULT_INTERVAL,
            timeout,
            totalTimeout
        });

        const waitForNextRequestTime =
            options.waitForNextRequest !== undefined
                ? options.waitForNextRequest === false
                    ? 0
                    : options.waitForNextRequest
                : DEFAULT_WAIT_FOR_NEXT_REQUEST;

        // check with a delay if there is another request after the last one
        if (waitForNextRequestTime > 0) {
            await sleep(waitForNextRequestTime);

            if (this.isThereRequestPending(options, options.enforceCheck)) {
                return this.waitUntilRequestIsDone_withWait(options, startTime, errorMessage);
            }
        }

        return this;
    }

    /**
     * Write the logged requests' information (or those filtered by the provided route matcher) to a file
     *
     * @param outputDir The path for the output folder
     * @param options Options
     */
    public writeStatsToLog(outputDir: string, options?: WriteStatsOptions) {
        let callStack = options?.routeMatcher
            ? this.callStack.filter(this.filterItemsByMatcher(options.routeMatcher))
            : this.callStack;

        if (options?.filter) {
            callStack = callStack.filter(options.filter);
        }

        if (!callStack.length) {
            return;
        }

        writeFile(
            getFilePath({
                fileName: options?.fileName,
                maxLength: options?.maxLength,
                outputDir,
                titlePath: this.titlePath,
                type: "stats"
            }),
            JSON.stringify(
                options?.mapper ? callStack.map(options.mapper) : callStack,
                undefined,
                options?.prettyOutput ? 4 : undefined
            )
        );
    }
}
