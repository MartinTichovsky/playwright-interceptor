# Playwright Interceptor

## About

Playwright Interceptor is a helper built on top of Playwright's native network interception (`page.route` + the `response` / `requestfailed` / `websocket` events). Its main purpose is to log all `fetch` or `XHR` requests, which can be analyzed in case of failure. It provides extended ways to log these statistics, including the ability to mock, throttle or delay requests easily.

Everything runs in Node and is exposed through Playwright **fixtures** (`interceptor`, `wsInterceptor`, `watchTheConsole`) and `async` methods — there are no custom commands. Non-mocked requests are passed through untouched (`route.continue()`), so large responses stream normally and are captured without being re-buffered.

For detailed information about generating beautiful HTML reports with network analysis, see the [Network Report Generation documentation](./README.report.md).

## Motivation

This diagnostic tool is born out of extensive firsthand experience tracking down elusive, seemingly random end-to-end test failures. These issues often weren't tied to the test runner itself, but rather to the behavior of the underlying web application — especially in headless runs on build servers where no manual interaction is possible. By offering robust logging for both API requests and the web console, the tool provides greater transparency and insight into the root causes of failures.

Beyond logging, Playwright Interceptor includes [**Network Report Generation**](./README.report.md) that transforms raw network data into beautiful, interactive HTML reports with performance charts, detailed request/response tables and comprehensive statistics.

## How it works

- Everything runs in Node and is exposed through Playwright **fixtures** (`interceptor`, `wsInterceptor`, `watchTheConsole`) and `async` methods.
- HTTP interception uses `page.route("**/*")` and the `response` / `requestfailed` events. Only `fetch` and `XHR` requests are logged; everything else is passed through.
- Non-mocked, non-throttled requests use `route.continue()` (passthrough), which is safe for large responses. Only mocked / throttled requests are re-fulfilled.
- Requests fired from inside iframes are captured automatically (Playwright routes apply to every frame).

## Table of contents

- Playwright Interceptor
    - [Getting started](#getting-started)
    - [Registering Playwright (monorepos & pinned versions)](#registering-playwright-monorepos--pinned-versions)
    - [Would you just log all requests to a file on fail?](#would-you-just-log-all-requests-to-a-file-on-fail)
    - [Would you like to wait until a request or requests are done?](#would-you-like-to-wait-until-a-request-or-requests-are-done)
    - [Fixtures](#fixtures)
    - [Configuration](#configuration)
    - [The Interceptor API](#the-interceptor-api)
        - [callStack](#callstack)
        - [getStats](#getstats)
        - [getLastRequest](#getlastrequest)
        - [requestCalls](#requestcalls)
        - [setOptions](#setoptions)
        - [delayRequest](#delayrequest)
        - [throttleRequest](#throttlerequest)
        - [mockResponse](#mockresponse)
        - [onRequestError](#onrequesterror)
        - [removeDelay](#removedelay)
        - [removeMock](#removemock)
        - [removeThrottle](#removethrottle)
        - [resetWatch](#resetwatch)
        - [waitUntilRequestIsDone](#waituntilrequestisdone)
        - [writeStatsToLog](#writestatstolog)
        - [destroy](#destroy)
        - [recreate](#recreate)
    - [Interfaces](#interfaces)
        - [CallStack](#callstack-1)
        - [IRequest](#irequest)
        - [IResponse](#iresponse)
        - [IHeaders](#iheaders)
        - [IDelayRequestOptions](#idelayrequestoptions)
        - [IMockResponse](#imockresponse)
        - [IMockResponseOptions](#imockresponseoptions)
        - [IThrottleRequestOptions](#ithrottlerequestoptions)
        - [IResourceType](#iresourcetype)
        - [IRouteMatcher](#iroutematcher)
        - [IRouteMatcherObject](#iroutematcherobject)
        - [OnRequestError](#onrequesterror-1)
        - [RequestMethod](#requestmethod)
        - [StringMatcher](#stringmatcher)
        - [WaitUntilRequestOptions](#waituntilrequestoptions)
        - [WriteStatsOptions](#writestatsoptions)
        - [FileNameMaxLength](#filenamemaxlength)
    - [Useful tips](#useful-tips)
        - [Log on fail](#log-on-fail)
        - [Keep traces/videos only for failed tests](#keep-tracesvideos-only-for-failed-tests)
- [Watch The Console](#watch-the-console)
    - [Getting started](#getting-started-1)
    - [The WatchTheConsole API](#the-watchtheconsole-api)
        - [error](#error)
        - [info](#info)
        - [jsError](#jserror)
        - [log](#log)
        - [records](#records)
        - [warn](#warn)
        - [flush](#flush)
        - [setOptions](#setoptions-1)
        - [writeLogToFile](#writelogtofile)
        - [start / destroy](#start--destroy)
    - [Interfaces](#interfaces-1)
        - [ConsoleLog](#consolelog)
        - [ConsoleLogType](#consolelogtype)
        - [WatchTheConsoleOptions](#watchtheconsoleoptions)
        - [WriteLogOptions](#writelogoptions)
- [WebSocket Interceptor](#websocket-interceptor)
    - [Getting started](#getting-started-2)
    - [The WebSocket Interceptor API](#the-websocket-interceptor-api)
        - [callStack](#callstack-2)
        - [getLastRequest](#getlastrequest-1)
        - [getStats](#getstats-1)
        - [resetWatch](#resetwatch-1)
        - [waitUntilWebsocketAction](#waituntilwebsocketaction)
        - [writeStatsToLog](#writestatstolog-1)
        - [start / destroy](#start--destroy-1)
    - [Interfaces](#interfaces-2)
        - [CallStackWebsocket](#callstackwebsocket)
        - [WebSocketAction](#websocketaction)
        - [IWSMatcher](#iwsmatcher)
        - [WaitUntilActionOptions](#waituntilactionoptions)
        - [WriteStatsOptions (WebSocket)](#writestatsoptions-websocket)
- [test.unit](#testunit)
    - [How it works](#how-it-works-1)
    - [The CallLine controller](#the-callline-controller)
        - [enable](#enable)
        - [disable](#disable)
        - [array](#array)
        - [length](#length)
        - [current](#current)
        - [next](#next)
        - [reset](#reset)
        - [clean](#clean)
        - [writeToFile](#writetofile)
        - [isEnabled](#isenabled)
    - [The front-end functions](#the-front-end-functions)
        - [lineCalled](#linecalled)
        - [lineCalledWithClone](#linecalledwithclone)
    - [Interfaces](#interfaces-3)
        - [CallLineStack](#calllinestack)
        - [CallLineToFileOptions](#calllinetofileoptions)
- [Validator](#validator)
- [Network Report Generation](./README.report.md)
- [Other helpers](#other-helpers)
    - [startTiming](#starttiming)
    - [stopTiming](#stoptiming)

## Getting started

Install the package using `yarn` or `npm`:

```bash
npm install --save-dev playwright-interceptor
```

`@playwright/test` is a peer dependency (supported range `>=1.30.0 <2.0.0`); make sure it is installed in your project alongside the interceptor.

Import `test` and `expect` from `playwright-interceptor` instead of `@playwright/test`. The `interceptor`, `wsInterceptor` and `watchTheConsole` fixtures are then available in every test and are started automatically:

```ts
import { expect, test } from "playwright-interceptor";

test("captures requests", async ({ page, interceptor }) => {
    await page.goto("/");

    await interceptor.waitUntilRequestIsDone();

    expect(interceptor.callStack.length).toBeGreaterThan(0);
});
```

For a single-version project that is all you need — the fixtures bind to the `@playwright/test` you already have installed.

## Registering Playwright (monorepos & pinned versions)

The `test` object exported by `playwright-interceptor` must belong to the **same** `@playwright/test` instance that the runner uses to execute your specs. When more than one copy of `@playwright/test` is present — for example in a monorepo where a version is hoisted to the root while a package pins its own, or when the same specs are run against several Playwright versions at once — Playwright rejects the shared `test.describe(...)` calls with:

> Playwright Test did not expect test.describe() to be called here

To resolve this, register your pinned `@playwright/test` from your `playwright.config.ts` **before any spec is loaded**. Import from `playwright-interceptor/register`, which only pulls in the fixtures module (it does not touch `@playwright/test` at load time), so it can run before the specs import the package index:

```ts
// playwright.config.ts
import { expect, test } from "@playwright/test";
import { registerPlaywright } from "playwright-interceptor/register";

registerPlaywright({ expect, test });

// ...the rest of your config
```

After registration, the `test` and `expect` imported from `playwright-interceptor` in your specs use the exact Playwright instance you registered.

### Extending an existing `test`

If your project already has its own extended `test` fixture, build the interceptor fixtures on top of it with `extendTest`:

```ts
import { test as base } from "@playwright/test";
import { extendTest } from "playwright-interceptor";

export const test = extendTest(base);
```

## Would you just log all requests to a file on fail?

[Take a look at this example](#log-on-fail).

## Would you like to wait until a request or requests are done?

[Refer to this section](#waituntilrequestisdone).

## Fixtures

| Fixture | Type | Description |
| --- | --- | --- |
| `interceptor` | [`Interceptor`](#the-interceptor-api) | Logs all `fetch` / `XHR` requests. Started automatically. |
| `wsInterceptor` | [`WebsocketInterceptor`](#websocket-interceptor) | Logs all WebSocket actions. Started automatically. |
| `watchTheConsole` | [`WatchTheConsole`](#watch-the-console) | Records console output and uncaught JavaScript errors. Started automatically. |

In almost all methods there is a route matcher ([`IRouteMatcher`](#iroutematcher)) that can be a string glob, a `RegExp` ([`StringMatcher`](#stringmatcher)), or an object with multiple matching options ([`IRouteMatcherObject`](#iroutematcherobject)).

## Configuration

The default timeout used by [`waitUntilRequestIsDone`](#waituntilrequestisdone) is `10000` ms. You can:

- set it globally with the `INTERCEPTOR_REQUEST_TIMEOUT` environment variable (read by the fixture),
- pass it to the constructor as `requestTimeout` when creating an `Interceptor` manually,
- or override it per call with the `timeout` option.

The `Interceptor` (and `WebsocketInterceptor`) constructor accepts:

```ts
interface InterceptorConstructorOptions {
    /** The default timeout (in ms) used by `waitUntilRequestIsDone`. Defaults to 10000. */
    requestTimeout?: number;
    /** The test title path (describe blocks + the test name). Used to auto-generate log file names. */
    titlePath?: string[];
}
```

The fixtures set `requestTimeout` (from `INTERCEPTOR_REQUEST_TIMEOUT`) and `titlePath` (from `testInfo.titlePath`) for you.

# The Interceptor API

The `interceptor` fixture is an instance of the `Interceptor` class. All methods that wait are `async`; the rest are synchronous (they read the in-memory call stack).

## callStack

```ts
get callStack(): CallStack[];
```

Return a copy of all logged requests since the Interceptor was created.

## getStats

```ts
getStats(routeMatcher?: IRouteMatcher): CallStack[];
```

Get the statistics for all requests matching the provided route matcher since the beginning of the current test. Returns an empty array when none match.

### Example

```ts
test("stats", async ({ page, interceptor }) => {
    await page.goto("/");
    await interceptor.waitUntilRequestIsDone();

    const stats = interceptor.getStats("**/api/users");

    expect(stats[0].response?.statusCode).toBe(200);
    expect(stats[0].duration).toBeLessThan(1000);
});
```

## getLastRequest

```ts
getLastRequest(routeMatcher?: IRouteMatcher): CallStack | undefined;
```

Get the last call matching the provided route matcher, or `undefined` if none matches.

### Example

```ts
const last = interceptor.getLastRequest("**/api/users");

expect(last?.response?.statusCode).toBe(200);
```

## requestCalls

```ts
requestCalls(routeMatcher?: IRouteMatcher): number;
```

Get the number of requests matching the provided route matcher.

### Example

```ts
expect(interceptor.requestCalls("**/api/users")).toBe(1);
```

## setOptions

```ts
setOptions(options?: InterceptorOptions): InterceptorOptions;
```

Set the Interceptor options (and return the resulting options). Called with no argument, it just reads the current options.

```ts
interface InterceptorOptions {
    /** Ignore requests outside the domain (default: `false`) */
    ignoreCrossDomain?: boolean;
}
```

### Example

```ts
interceptor.setOptions({ ignoreCrossDomain: true });
```

## delayRequest

```ts
delayRequest(
    routeMatcher: IRouteMatcher,
    delay: number,
    options?: IDelayRequestOptions
): number;
```

Delay requests matching the provided route matcher by waiting **before** the request is sent. By default, it delays the first matching request, then the delay is removed. Set `times` in the options to change how many matching requests should be delayed. Returns the delay id (needed for [`removeDelay`](#removedelay)).

### Delay vs. Throttle

A request has three phases. `delayRequest` waits before the back-end is hit, [`throttleRequest`](#throttlerequest) waits after:

```text
  1. request starts          2. request hits               3. request done
     (your code)               the back-end              (back to your code)
         │                          │                             │
         │ <----- delayRequest ---> │ <----- throttleRequest ---> │
```

Because the request has not been sent yet, the route matcher only works with request data (not response data).

### Example

```ts
test("delay", async ({ page, interceptor }) => {
    interceptor.delayRequest("**/api/users", 2000);

    await page.goto("/");
    await interceptor.waitUntilRequestIsDone();
});
```

## throttleRequest

```ts
throttleRequest(
    routeMatcher: IRouteMatcher,
    delay: number,
    options?: IThrottleRequestOptions
): number;
```

Throttle requests matching the provided route matcher by holding the response for `delay` ms **after** the back-end has been hit. By default it throttles the first matching request, then the throttle is removed. Set `times` in the options to change how many matching requests should be throttled. Returns the throttle id (needed for [`removeThrottle`](#removethrottle)).

In the options, the `mockResponse` property can accept the same mocking object as shown in [`mockResponse`](#mockresponse).

### Example

```ts
test("throttle", async ({ page, interceptor }) => {
    interceptor.throttleRequest("**/api/users", 5000);

    await page.goto("/");
    await interceptor.waitUntilRequestIsDone();
});
```

## mockResponse

```ts
mockResponse(
    routeMatcher: IRouteMatcher,
    mock: IMockResponse,
    options?: IMockResponseOptions
): number;
```

Mock the response of requests matching the provided route matcher. By default it mocks the first matching request, then the mock is removed. Set `times` in the options to change how many matching requests should be mocked. Returns the mock id (needed for [`removeMock`](#removemock)).

By default, the mocked request does not reach the network layer. Set `allowHitTheNetwork` to `true` if you want the request to reach the network layer (useful together with `generateBody`).

### Examples

```ts
// mock the first matching request
interceptor.mockResponse("**/api/users", {
    body: { name: "John" },
    statusCode: 200
});
```

```ts
// mock indefinitely
interceptor.mockResponse(
    { method: "POST" },
    { statusCode: 400 },
    { times: Number.POSITIVE_INFINITY }
);
```

```ts
// generate the response body from the request
interceptor.mockResponse("**/api/users", {
    generateBody: (request, getJsonRequestBody) => {
        const body = getJsonRequestBody<{ id: number }>();

        return { id: body.id, name: `User ${body.id}` };
    },
    statusCode: 200
});
```

## onRequestError

```ts
onRequestError(func: OnRequestError): void;
```

Register a callback invoked when a request is cancelled, aborted or fails.

### Example

```ts
interceptor.onRequestError((request, error) => {
    console.log(`${request.method} ${request.url} failed: ${error.message}`);
});
```

## removeDelay

```ts
removeDelay(id: number): boolean;
```

Remove the delay entry by the id returned from [`delayRequest`](#delayrequest). Returns `true` when an entry was removed.

## removeMock

```ts
removeMock(id: number): boolean;
```

Remove the mock entry by the id returned from [`mockResponse`](#mockresponse).

## removeThrottle

```ts
removeThrottle(id: number): boolean;
```

Remove the throttle entry by the id returned from [`throttleRequest`](#throttlerequest).

## resetWatch

```ts
resetWatch(): void;
```

Reset the Interceptor's watch. It sets the pointer to the last call. Resetting the pointer is necessary when you want to wait for certain requests. Passing an `action` to [`waitUntilRequestIsDone`](#waituntilrequestisdone) calls `resetWatch` for you.

### Example

On a site there are multiple requests to `api/getUser`, but we want to wait for the specific one that occurs after clicking a button. Calling this method sets the exact point from which we want to check the next requests.

```ts
interceptor.resetWatch();

await page.locator("button").click();

await interceptor.waitUntilRequestIsDone("**/api/getUser");
```

## waitUntilRequestIsDone

```ts
// with an action (the action is run after resetWatch() and its result is returned)
waitUntilRequestIsDone<T>(
    action: () => Promise<T> | T,
    stringMatcherOrOptions?: StringMatcher | WaitUntilRequestOptions,
    errorMessage?: string
): Promise<T>;

// without an action (returns the Interceptor instance)
waitUntilRequestIsDone(
    stringMatcherOrOptions?: StringMatcher | WaitUntilRequestOptions,
    errorMessage?: string
): Promise<this>;
```

The method will wait until all requests matching the provided route matcher are finished, or until the maximum waiting time (`timeout` in options) is reached.

It is crucial to call [`resetWatch()`](#resetwatch) before an action that should trigger a request you want to wait for, or pass an `action` as the first argument (which calls `resetWatch()` for you). The reason is that there may be a chain of requests preventing the one you want to wait for from being processed.

### Examples

```ts
// wait for all currently pending requests
await interceptor.waitUntilRequestIsDone();
```

```ts
// wait for a specific url
await interceptor.waitUntilRequestIsDone("**/api/users");
```

```ts
// run an action and wait for the request it triggers
await interceptor.waitUntilRequestIsDone(
    () => page.locator("button#refresh").click(),
    "**/api/user/profile"
);
```

```ts
// with options and a custom error message
await interceptor.waitUntilRequestIsDone(
    { url: "**/api/users", timeout: 20000, waitForNextRequest: false },
    "The users request never finished"
);
```

## writeStatsToLog

```ts
writeStatsToLog(outputDir: string, options?: WriteStatsOptions): void;
```

Write the logged requests' information (or those filtered by the provided route matcher / filter / mapper) to a JSON file on disk (synchronous Node `fs`). When `fileName` is omitted, the name is derived from the current test's title path.

### Example

```ts
test.afterEach(async ({ interceptor }) => {
    // the file name is generated from the running test -> "./logs/<name>.stats.json"
    interceptor.writeStatsToLog("./logs");
    // only a specific url
    interceptor.writeStatsToLog("./logs", { routeMatcher: "**/api/users" });
    // filtered / mapped
    interceptor.writeStatsToLog("./logs", { filter: (entry) => entry.crossDomain });
    interceptor.writeStatsToLog("./logs", { mapper: (entry) => ({ url: entry.url }) });
});
```

## destroy

```ts
destroy(): Promise<void>;
```

Destroy the interceptor by removing the route handler and the network listeners. After this call, requests are no longer intercepted or logged (they still reach the network normally).

### Example

```ts
await interceptor.destroy();
```

## recreate

```ts
recreate(): Promise<void>;
```

Recreate the interceptor: clear the logged requests and all registered mocks, delays and throttles, and start intercepting again.

### Example

```ts
await interceptor.recreate();
```

# Interfaces

### CallStack

```ts
interface CallStack {
    /** Cross-domain requests will have this property set to `true`. */
    crossDomain: boolean;
    /** The throttle delay set by `throttleRequest`, or `undefined` when not throttled. */
    delay?: number;
    /** The actual total duration of the request in ms (excluding any delay). */
    duration?: number;
    /** Is `true` while the request is still in progress. */
    isPending: boolean;
    /** The resource type (`"fetch"` | `"xhr"`). */
    resourceType: IResourceType;
    /** The request info. */
    request: IRequest;
    /** The delay applied before the request is sent (set by `delayRequest`), or `undefined`. */
    requestDelay?: number;
    /** An error that occurs when the request fails. */
    requestError?: unknown;
    /** The response info (absent while pending or on failure). */
    response?: IResponse;
    /** The runtime of the test in ms when the request started. */
    runtime: number;
    /** The runtime formatted as `H m s ms`. */
    runtimeString: string;
    /** The sequence id of the request (starts at 1, increments per request). */
    sequenceId: number;
    /** The time when the request started. */
    timeStart: Date;
    /** The URL of the request. */
    url: URL;
}
```

### IRequest

```ts
interface IRequest {
    /** The request body as a string (`JSON.stringify` is used). */
    body: string;
    /** The request headers. */
    headers: IHeaders;
    /** The request method (GET, POST, ...). */
    method: string;
    /** The URL search params as an object. */
    query: Record<string, string | number>;
}
```

### IResponse

```ts
interface IResponse {
    /** The response body as a string. */
    body: string;
    /** The response headers. */
    headers: IHeaders;
    /** Is `true` when the response was mocked. */
    isMock: boolean;
    /** The response status code. */
    statusCode: number;
    /** The response status text. */
    statusText: string;
    /** The time when the request ended (excludes any throttle delay). */
    timeEnd: Date;
}
```

### IHeaders

```ts
type IHeaders = { [key: string]: string | string[] };
```

### IDelayRequestOptions

```ts
interface IDelayRequestOptions {
    /** How many times to delay. Default 1. Use Number.POSITIVE_INFINITY for always. */
    times?: number;
}
```

### IMockResponse

```ts
interface IMockResponse {
    /** Allow the request to reach the network. By default a full mock does not. */
    allowHitTheNetwork?: boolean;
    /** The response body, it can be anything. */
    body?: unknown;
    /**
     * Generate a body (has priority over `body`).
     * @param request The request data (body, query, method, ...)
     * @param getJsonRequestBody Tries to return the parsed request body
     */
    generateBody?: (request: IRequest, getJsonRequestBody: <T = unknown>() => T) => unknown;
    /** Added to the original response headers. */
    headers?: IHeadersNormalized;
    /** The response status code. */
    statusCode?: number;
    /** The response status text. */
    statusText?: string;
}
```

### IMockResponseOptions

```ts
interface IMockResponseOptions {
    /** How many times to mock. Default 1. Use Number.POSITIVE_INFINITY for always. */
    times?: number;
}
```

### IThrottleRequestOptions

```ts
interface IThrottleRequestOptions {
    /** Mock a response for the matched route (lower priority than `mockResponse`). */
    mockResponse?: IMockResponse;
    /** How many times to throttle. Default 1. Use Number.POSITIVE_INFINITY for always. */
    times?: number;
}
```

### IResourceType

```ts
type IResourceType = "fetch" | "xhr";
```

### IRouteMatcher

```ts
type IRouteMatcher = StringMatcher | IRouteMatcherObject;
```

### IRouteMatcherObject

```ts
type IRouteMatcherObject = {
    /** A matcher for the request body. */
    bodyMatcher?: (requestBody: string) => boolean;
    /** If `true`, only cross-domain requests match. */
    crossDomain?: boolean;
    /** A matcher for the request headers. */
    headersMatcher?: (requestHeaders: IHeaders) => boolean;
    /** If `true`, only HTTPS requests match. */
    https?: boolean;
    /** The request method (GET, POST, ...). */
    method?: RequestMethod;
    /** A matcher for the query string (URL search params as an object). */
    queryMatcher?: (query: Record<string, string | number>) => boolean;
    /** The resource type. */
    resourceType?: IResourceType | IResourceType[] | "all";
    /** A URL matcher, use `*` or `**` to match any part of the string. */
    url?: StringMatcher;
};
```

### OnRequestError

```ts
type OnRequestError = (request: IRequestInit, error: Error) => void;
```

### RequestMethod

```ts
type RequestMethod =
    | "CONNECT" | "DELETE" | "GET" | "HEAD"
    | "OPTIONS" | "PATCH" | "POST" | "PUT" | "TRACE";
```

### StringMatcher

```ts
type StringMatcher = string | RegExp;
```

### WaitUntilRequestOptions

```ts
interface WaitUntilRequestOptions extends IRouteMatcherObject {
    /**
     * `true` by default. When `true`, a request matching the matcher must be logged, otherwise it
     * waits until it is logged and finished (or fails on timeout). When `false`, it only waits if a
     * matching request already exists; if none does, it ends successfully.
     */
    enforceCheck?: boolean;
    /** The duration to wait for pending requests. Defaults to 10000. */
    timeout?: number;
    /**
     * Time (ms) to wait for a possible following request after the last one. Default 750.
     * Set to `false` or `0` to skip the repeated check.
     */
    waitForNextRequest?: false | number;
}
```

### WriteStatsOptions

```ts
interface WriteStatsOptions {
    /** The file name. If `undefined`, it is generated from the running test. */
    fileName?: string;
    /** Filter the logged items. */
    filter?: (callStack: CallStack) => boolean;
    /** Map the logged items to any object you want to log. */
    mapper?: (callStack: CallStack) => unknown;
    /** The maximal length of the generated file name. No effect when `fileName` is provided. */
    maxLength?: FileNameMaxLength;
    /** When `true`, the output JSON is formatted with tabs. */
    prettyOutput?: boolean;
    /** A route matcher. */
    routeMatcher?: IRouteMatcher;
}
```

### FileNameMaxLength

```ts
type FileNameMaxLength = number | { describe?: number; testName?: number };
```

# Useful tips

## Log on fail

Write all requests to a file when a test fails:

```ts
import { expect, test } from "playwright-interceptor";

test.afterEach(async ({ interceptor }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
        interceptor.writeStatsToLog("./logs");
    }
});
```

## Keep traces/videos only for failed tests

Playwright can be configured to retain traces and videos only for failing tests, which pairs well with the logs above:

```ts
// playwright.config.ts
export default defineConfig({
    use: {
        trace: "retain-on-failure",
        video: "retain-on-failure"
    }
});
```

# Watch The Console

Watch The Console is a helper that observes the browser's console output and uncaught JavaScript errors. This output can be asserted or written to a file. It uses Playwright's `page.on("console")` and `page.on("pageerror")` events.

## Getting started

Use the `watchTheConsole` fixture (available on the `test` imported from `playwright-interceptor`):

```ts
import { expect, test } from "playwright-interceptor";

test("no console errors", async ({ page, watchTheConsole }) => {
    await page.goto("/");

    // console arguments resolve asynchronously - flush before asserting
    await watchTheConsole.flush();

    expect(watchTheConsole.error).toHaveLength(0);
    expect(watchTheConsole.jsError).toHaveLength(0);
});
```

# The WatchTheConsole API

## error

```ts
get error(): ConsoleLog[];
```

Return all logged `console.error` records.

## info

```ts
get info(): ConsoleLog[];
```

Return all logged `console.info` records.

## jsError

```ts
get jsError(): ConsoleLog[];
```

Return all logged uncaught JavaScript errors.

## log

```ts
get log(): ConsoleLog[];
```

Return all logged `console.log` records.

## records

```ts
get records(): ConsoleLog[];
```

Return a copy of all recorded console outputs.

## warn

```ts
get warn(): ConsoleLog[];
```

Return all logged `console.warn` records.

## flush

```ts
flush(): Promise<void>;
```

Wait until all pending (asynchronously resolved) console entries have been recorded. Await this before asserting on the getters.

## setOptions

```ts
setOptions(options?: WatchTheConsoleOptions): WatchTheConsoleOptions;
```

Set the WatchTheConsole options. Note: `cloneConsoleArguments` is a **no-op** in Playwright (see the interface note below); it is accepted for API parity.

## writeLogToFile

```ts
writeLogToFile(outputDir: string, options?: WriteLogOptions): void;
```

Write the logged console output to a JSON file. When `fileName` is omitted, the name is derived from the current test's title path.

### Examples

```ts
// generated name -> "./logs/<name>.console.json"
watchTheConsole.writeLogToFile("./logs");
// only console errors and unhandled JS errors
watchTheConsole.writeLogToFile("./logs", {
    types: [ConsoleLogType.ConsoleError, ConsoleLogType.Error]
});
// custom filter
watchTheConsole.writeLogToFile("./logs", {
    filter: (type, ...args) => typeof args[0] === "string" && args[0].startsWith("Custom log:")
});
```

## start / destroy

```ts
start(): void;
destroy(): void;
```

Start / stop watching the console. The fixture calls these for you.

## Interfaces

### ConsoleLog

```ts
interface ConsoleLog {
    /** The console output or the JS error message and stack trace. */
    args: unknown[];
    /** The formatted date/time `dd/MM/yyyy, hh:mm:ss.ms`. */
    currentTime: string;
    /** The `getTime()` of the Date when the console was logged. */
    dateTime: number;
    /** The console type. */
    type: ConsoleLogType;
}
```

### ConsoleLogType

```ts
enum ConsoleLogType {
    ConsoleInfo = "console.info",
    ConsoleError = "console.error",
    ConsoleLog = "console.log",
    ConsoleWarn = "console.warn",
    // an unhandled JavaScript error
    Error = "error"
}
```

### WatchTheConsoleOptions

```ts
interface WatchTheConsoleOptions {
    /**
     * A **no-op** in Playwright. Console arguments arrive from the browser already serialized as
     * JSON values (via `JSHandle.jsonValue()`), so there are no live references to snapshot and
     * circular references are already collapsed. Kept for API parity with `cypress-interceptor`.
     */
    cloneConsoleArguments?: boolean;
}
```

### WriteLogOptions

```ts
interface WriteLogOptions {
    /** The file name. If `undefined`, it is generated from the running test. */
    fileName?: string;
    /** Filter the logged items. */
    filter?: (type: ConsoleLogType, ...args: unknown[]) => boolean;
    /** The maximal length of the generated file name. No effect when `fileName` is provided. */
    maxLength?: FileNameMaxLength;
    /** When `true`, the output JSON is formatted with tabs. */
    prettyOutput?: boolean;
    /** If not provided, all console entries are logged. */
    types?: ConsoleLogType[];
}
```

# WebSocket Interceptor

The WebSocket Interceptor logs all WebSocket actions (create, send, receive, close, error) using Playwright's `page.on("websocket")` event.

## Getting started

Use the `wsInterceptor` fixture:

```ts
import { expect, test } from "playwright-interceptor";

test("websocket", async ({ page, wsInterceptor }) => {
    await page.goto("/");

    await wsInterceptor.waitUntilWebsocketAction({ type: "onmessage", url: "**/socket" });

    expect(wsInterceptor.getStats({ type: "onmessage" }).length).toBeGreaterThan(0);
});
```

# The WebSocket Interceptor API

## callStack

```ts
get callStack(): CallStackWebsocket[];
```

Return a copy of all logged actions since the WebSocket Interceptor was created.

## getLastRequest

```ts
getLastRequest(matcher?: IWSMatcher): CallStackWebsocket | undefined;
```

Get the last action matching the provided matcher.

## getStats

```ts
getStats(matcher?: IWSMatcher): CallStackWebsocket[];
```

Get the statistics for all actions matching the provided matcher.

### Example

```ts
const sent = wsInterceptor.getStats({ type: "send" });

expect(sent).toHaveLength(2);

const messages = wsInterceptor.getStats({ type: "onmessage" });

expect(messages[0].data).toMatchObject({ data: "some response 1" });
```

## resetWatch

```ts
resetWatch(): void;
```

Reset the WebSocket Interceptor's watch.

## waitUntilWebsocketAction

```ts
waitUntilWebsocketAction(
    matcherOrOptions?: IWSMatcher | IWSMatcher[] | WaitUntilActionOptions,
    errorMessageOrOptions?: string | WaitUntilActionOptions,
    errorMessage?: string
): Promise<this>;
```

Wait until a WebSocket action occurs.

### Examples

```ts
// a received message
await wsInterceptor.waitUntilWebsocketAction({ data: "some response", type: "onmessage" });
```

```ts
// a sent message
await wsInterceptor.waitUntilWebsocketAction({ data: "some data", type: "send" });
```

```ts
// two sends
await wsInterceptor.waitUntilWebsocketAction({ type: "send" }, { countMatch: 2 });
```

```ts
// multiple actions at once
await wsInterceptor.waitUntilWebsocketAction([
    { data: "onmessage data", type: "onmessage", url: "**/path-1" },
    { data: "send data", type: "send", url: "**/path-2" }
]);
```

## writeStatsToLog

```ts
writeStatsToLog(outputDir: string, options?: WriteStatsOptions): void;
```

Write the logged actions' information (or those filtered by the provided matcher / filter / mapper) to a JSON file (`<outputDir>/<name>.ws.stats.json`).

### Example

```ts
test.afterEach(async ({ wsInterceptor }) => {
    wsInterceptor.writeStatsToLog("./logs");
    wsInterceptor.writeStatsToLog("./logs", { matcher: { url: "**/some-url" } });
    wsInterceptor.writeStatsToLog("./logs", { filter: (entry) => entry.type === "onmessage" });
});
```

## start / destroy

```ts
start(): void;
destroy(): void;
```

Start / stop listening for WebSocket connections. The fixture calls these for you.

## Interfaces

### CallStackWebsocket

```ts
type CallStackWebsocket = WebSocketAction & {
    /** The time when the action occurred. */
    timeStart: Date;
};
```

### WebSocketAction

```ts
interface WebSocketActionCommon {
    protocols?: string | string[];
    query: Record<string, string | number>;
    url: string;
    urlQuery: string;
}

type WebSocketAction =
    | (WebSocketActionCommon & { type: "create"; data?: undefined })
    | (WebSocketActionCommon & { type: "close" | "onclose"; data: { code?: number; reason?: string } })
    | (WebSocketActionCommon & { type: "onmessage"; data: { data: string } })
    | (WebSocketActionCommon & { type: "onerror" | "onopen"; data?: undefined })
    | (WebSocketActionCommon & { type: "send"; data: string });

type WebSocketActionType = WebSocketAction["type"];
```

### IWSMatcher

```ts
type IWSMatcher = {
    /** A matcher for the query string (URL search params as an object). */
    queryMatcher?: (query: Record<string, string | number>) => boolean;
    /** The WebSocket protocols. */
    protocols?: string | string[];
    /** A URL matcher, use `*` or `**` to match any part of the string. */
    url?: StringMatcher;
} & (
    | { type?: "create" | "onerror" | "onopen" }
    | { type?: "close" | "onclose"; code?: number; reason?: string }
    | { type?: "onmessage"; data?: string }
    | { type?: "send"; data?: string }
    | { types?: WebSocketActionType[] }
);
```

### WaitUntilActionOptions

```ts
interface WaitUntilActionOptions {
    /** The minimum number of matches. Default 1. */
    countMatch?: number;
    /** `true` by default. */
    enforceCheck?: boolean;
    /** The duration to wait for actions. Default 10000. */
    timeout?: number;
}
```

### WriteStatsOptions (WebSocket)

```ts
interface WriteStatsOptions {
    fileName?: string;
    filter?: (callStack: CallStackWebsocket) => boolean;
    mapper?: (callStack: CallStackWebsocket) => unknown;
    maxLength?: FileNameMaxLength;
    prettyOutput?: boolean;
    /** A matcher. */
    matcher?: IWSMatcher;
}
```

# test.unit

`test.unit` lets you store arbitrary values from inside the application under test and read them back in your Playwright tests. It is useful for asserting on data that is only available in the browser (values passed to a callback, computed state, etc.).

## How it works

There are two parts:

- **Browser side** — `lineCalled` / `lineCalledWithClone`, imported from `playwright-interceptor/test.unit` and called from your application code. They are no-ops unless the call line has been enabled.
- **Node side** — the `CallLine` controller, created in your test to enable the store and read the entries.

## The CallLine controller

Create the controller in your test and enable it before the page loads so entries logged during the initial load are captured:

```ts
import { CallLine, expect, test } from "playwright-interceptor";

test("reads stored values", async ({ page }) => {
    const callLine = new CallLine(page, { titlePath: test.info().titlePath });

    await callLine.enable();
    await page.goto("/");

    // the application called lineCalled("user loaded", 42)
    expect(await callLine.next()).toEqual(["user loaded", 42]);
});
```

The controller is created with `new CallLine(page: Page, options?: { titlePath?: string[] })`. The `titlePath` is used to auto-generate the file name in [`writeToFile`](#writetofile). Its methods replace the Cypress `cy.callLine*` commands.

### enable

```ts
enable(): Promise<void>;
```

Install the store (before every navigation and on the current page) so `lineCalled` starts recording. Replaces `cy.callLineEnable`. The store is re-installed on each navigation, so entries do not survive a page reload.

### disable

```ts
disable(): Promise<void>;
```

Remove the store from the current page. Replaces `cy.callLineDisable`.

### array

```ts
array(): Promise<CallLineStack[]>;
```

A copy of all entries (each has `args` and a `date`). Equivalent to reading `cy.callLine().array`.

### length

```ts
length(): Promise<number>;
```

The number of entries. Replaces `cy.callLineLength`.

### current

```ts
current(): Promise<unknown | unknown[] | undefined>;
```

The last entry returned by `next`. Replaces `cy.callLineCurrent`.

### next

```ts
next(): Promise<unknown | unknown[] | undefined>;
```

The next entry (a single value when logged with one argument, an array when logged with multiple). Returns `undefined` when there is no next entry. Replaces `cy.callLineNext`.

### reset

```ts
reset(): void;
```

Reset the pointer so the next `next()` starts from the first entry. Replaces `cy.callLineReset`.

### clean

```ts
clean(): Promise<void>;
```

Clear all entries and reset the pointer. Replaces `cy.callLineClean`.

### writeToFile

```ts
writeToFile(outputDir: string, options?: CallLineToFileOptions): Promise<void>;
```

Save the entries to a JSON file (`<outputDir>/<name>.callLine.json`). Replaces `cy.callLineToFile`.

### isEnabled

```ts
get isEnabled(): boolean;
```

`true` if the controller has enabled the call line.

## The front-end functions

Import these in your application code. They do nothing unless the call line has been enabled, so they are safe to leave in production builds:

```ts
import { lineCalled, lineCalledWithClone } from "playwright-interceptor/test.unit";

// store a single value
lineCalled("user loaded", userId);

// store a deep clone of the arguments (protects against later mutation)
lineCalledWithClone("state", state);
```

### lineCalled

```ts
lineCalled(...args: unknown[]): void;
```

Stores the arguments. Called with a single argument, that value is stored as-is; with multiple arguments, they are stored as an array.

### lineCalledWithClone

```ts
lineCalledWithClone(...args: unknown[]): void;
```

The same as `lineCalled`, but deep-clones the arguments before storing them.

## Interfaces

### CallLineStack

```ts
interface CallLineStack {
    /** The stored arguments. */
    args: unknown[];
    /** The date the entry was stored. */
    date: Date;
}
```

### CallLineToFileOptions

```ts
interface CallLineToFileOptions {
    /** The file name. If `undefined`, it is generated from the running test. */
    fileName?: string;
    /** Filter the entries to save. */
    filter?: (callLine: CallLineStack) => boolean;
    /** The maximal length of the generated file name. No effect when `fileName` is provided. */
    maxLength?: FileNameMaxLength;
    /** When `true`, the output JSON is formatted with tabs. */
    prettyOutput?: boolean;
}
```

# Validator

The library exports a small validator used to load and validate saved stats files (the same format produced by [`writeStatsToLog`](#writestatstolog) and consumed by the [report generator](./README.report.md)).

```ts
import { convertCallStackJsonToCallStack, validateStats, ValidationErrorMessages } from "playwright-interceptor";
import * as fs from "fs";

const json = JSON.parse(fs.readFileSync("./logs/users.stats.json", "utf8"));

// throws a descriptive Error if the shape is invalid
validateStats(json);

// convert the JSON (string dates/urls) back into CallStack[] (Date / URL objects)
const callStack = convertCallStackJsonToCallStack(json);
```

- `validateStats(stats: CallStackJson[]): void` — throws when the array is not a valid list of `CallStack` entries.
- `convertCallStackJsonToCallStack(json: CallStackJson[]): CallStack[]` — revives `timeStart`/`timeEnd` to `Date` and `url` to `URL`.
- `createValidationError(index, path, message): Error` and the `ValidationErrorMessages` enum expose the individual validation messages.

# Network Report Generation

See the dedicated [Network Report Generation documentation](./README.report.md) for `createNetworkReport`, `createNetworkReportFromFile`, `createNetworkReportFromFolder` and `generateReport`.

# Other helpers

## startTiming

```ts
import { startTiming } from "playwright-interceptor";

const start = startTiming(); // performance.now()
```

Start a time measurement. Returns `performance.now()` when the code is executed.

## stopTiming

```ts
import { startTiming, stopTiming } from "playwright-interceptor";

const start = startTiming();
// ... do work ...
const elapsed = stopTiming(start); // ms since startTiming

expect(elapsed).toBeGreaterThanOrEqual(1000);
```

Stop a time measurement. Returns the time difference since `startTiming` was called (in ms).
