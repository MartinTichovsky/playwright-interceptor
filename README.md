[![NPM](https://img.shields.io/npm/v/playwright-interceptor.svg)](https://www.npmjs.com/package/playwright-interceptor)
[![Build Status](https://github.com/MartinTichovsky/playwright-interceptor/workflows/CI/badge.svg)](https://github.com/MartinTichovsky/playwright-interceptor/actions?workflow=CI)
[![Coverage Status](https://coveralls.io/repos/github/MartinTichovsky/playwright-interceptor/badge.svg?branch=main)](https://coveralls.io/github/MartinTichovsky/playwright-interceptor?branch=main)

# Playwright Interceptor - Quick Start Guide

**For Playwright developers who want better request handling and debugging.**

## What is it?

Playwright Interceptor builds on Playwright's native network interception to log all network requests, provide detailed statistics, and make debugging test failures easier — with reliable waiting, mocking, throttling, delaying, WebSocket monitoring and console monitoring.

It runs entirely in Node and is exposed through Playwright **fixtures** — no custom commands, no browser patching.

## Why use it?

| Feature | Playwright Interceptor |
| --- | --- |
| Log all requests | ✅ Built-in |
| Request statistics | ✅ Built-in |
| Timing data | ✅ Built-in |
| Throttle requests (hold the response) | ✅ Built-in |
| Delay requests before send | ✅ Built-in |
| Wait for requests reliably | ✅ Stable |
| Mock responses | ✅ Built-in |
| Export logs on failure | ✅ Built-in |
| WebSocket support | ✅ Built-in |
| Console monitoring | ✅ Built-in |
| HTML network reports | ✅ Built-in |

## Installation

```bash
npm install --save-dev playwright-interceptor
```

`@playwright/test` is a peer dependency (supported range `>=1.30.0 <2.0.0`), so make sure it is installed in your project alongside the interceptor.

Import `test` and `expect` from `playwright-interceptor` instead of `@playwright/test`. The `interceptor`, `wsInterceptor` and `watchTheConsole` fixtures are then available and started automatically:

```ts
import { expect, test } from "playwright-interceptor";
```

For most projects that is all you need — the fixtures bind to the `@playwright/test` you already have installed.

## Registering Playwright (monorepos & pinned versions)

The `test` object exported by `playwright-interceptor` must belong to the **same** `@playwright/test` instance that the runner uses to execute your specs. In a single-version project this happens automatically. But when more than one copy of `@playwright/test` is present — for example in a monorepo where a version is hoisted to the root while a package pins its own, or when you run the same specs against several Playwright versions — Playwright rejects the shared `test.describe(...)` calls with:

> Playwright Test did not expect test.describe() to be called here

To fix this, register your pinned `@playwright/test` from your `playwright.config.ts` **before any spec is loaded**. Import from `playwright-interceptor/register`, which pulls in only the fixtures (it does not touch `@playwright/test` at load time), so the ordering is guaranteed:

```ts
// playwright.config.ts
import { expect, test } from "@playwright/test";
import { registerPlaywright } from "playwright-interceptor/register";

registerPlaywright({ expect, test });

// ...the rest of your config
```

After this, the `test` and `expect` imported from `playwright-interceptor` in your specs will use the exact Playwright instance you registered.

### Extending an existing `test`

If your project already has its own extended `test` fixture, build the interceptor fixtures on top of it with `extendTest` instead:

```ts
import { test as base } from "@playwright/test";
import { extendTest } from "playwright-interceptor";

export const test = extendTest(base);
```

### Configuring the default request timeout

The default timeout used by `waitUntilRequestIsDone` is `10000` ms. Set the `INTERCEPTOR_REQUEST_TIMEOUT` environment variable to change it globally, or override it per call with the `timeout` option.

## Common Use Cases

### 1. Wait for a request reliably

```ts
// run an action and wait for the request it triggers
await interceptor.waitUntilRequestIsDone(
    () => page.locator("button").click(),
    "**/api/users"
);
```

### 2. Get request statistics

```ts
const stats = interceptor.getStats("**/api/users");

expect(stats[0].response?.statusCode).toBe(200);
expect(stats[0].duration).toBeLessThan(1000); // took less than 1 second
```

### 3. Mock a response

```ts
// mock the first matching request
interceptor.mockResponse("**/api/users", { body: { name: "John" }, statusCode: 200 });

// mock indefinitely
interceptor.mockResponse({ method: "POST" }, { statusCode: 400 }, { times: Number.POSITIVE_INFINITY });
```

### 4. Throttle a request

```ts
// hold the response for 5s AFTER the back-end is hit
interceptor.throttleRequest("**/api/users", 5000);
```

### 5. Delay a request before it is sent

```ts
// hold the request for 5s BEFORE it reaches the back-end
interceptor.delayRequest("**/api/users", 5000);
```

#### Delay vs. Throttle

```text
  1. request starts          2. request hits               3. request done
     (your code)               the back-end              (back to your code)
         │                          │                             │
         │ <----- delayRequest ---> │ <----- throttleRequest ---> │
```

### 6. Log all requests on test failure

```ts
test.afterEach(async ({ interceptor }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
        interceptor.writeStatsToLog("./logs");
    }
});
```

This creates a JSON file with all requests, responses, timing and headers — perfect for debugging why tests fail.

### 7. Count requests

```ts
expect(interceptor.requestCalls("**/api/users")).toBe(1);
```

### 8. Get the last request

```ts
const request = interceptor.getLastRequest("**/api/users");

expect(request?.response?.statusCode).toBe(200);
```

### 9. Mock dynamic responses based on request

```ts
interceptor.mockResponse("**/api/users", {
    generateBody: (request, getJsonRequestBody) => {
        const body = getJsonRequestBody<{ id: number }>();

        return { id: body.id, name: `User ${body.id}` };
    },
    statusCode: 200
});
```

### 10. Monitor WebSocket connections

```ts
// wait for a WebSocket action
await wsInterceptor.waitUntilWebsocketAction({ url: "**/socket" });

// get WebSocket stats
expect(wsInterceptor.getStats({ url: "**/socket" }).length).toBeGreaterThan(0);
```

### 11. Monitor console errors

```ts
test("no console errors", async ({ page, watchTheConsole }) => {
    await page.goto("/");
    await watchTheConsole.flush();

    expect(watchTheConsole.error).toHaveLength(0);
    expect(watchTheConsole.jsError).toHaveLength(0);
});

// export console logs on failure
test.afterEach(async ({ watchTheConsole }) => {
    watchTheConsole.writeLogToFile("./logs");
});
```

## Advanced: Filter requests

```ts
// only GET requests
interceptor.getStats({ method: "GET" });

// only fetch (not XHR)
interceptor.getStats({ resourceType: "fetch" });

// custom query matcher
interceptor.getStats({ queryMatcher: (query) => query?.page === 5 });

// body matcher
interceptor.getStats({ bodyMatcher: (body) => body.includes("userId") });
```

## Real-world example

```ts
import { expect, test } from "playwright-interceptor";

test.describe("User Dashboard", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/dashboard");
    });

    test("should load user data and display it", async ({ page, interceptor }) => {
        // click a button and wait for the specific request it triggers
        await interceptor.waitUntilRequestIsDone(
            () => page.locator("button#refresh").click(),
            "**/api/user/profile"
        );

        const stats = interceptor.getStats("**/api/user/profile");

        expect(stats[0].request.method).toBe("GET");
        expect(stats[0].duration).toBeLessThan(2000);
        expect(stats[0].response?.statusCode).toBe(200);

        await expect(page.getByText("Welcome, John")).toBeVisible();
    });

    test("should handle API errors gracefully", async ({ page, interceptor }) => {
        interceptor.mockResponse("**/api/user/profile", {
            statusCode: 500,
            body: { error: "Server error" }
        });

        await page.locator("button#refresh").click();

        await expect(page.getByText("Error loading profile")).toBeVisible();
    });
});
```

## Key Benefits

✅ **Reliable waits** - `waitUntilRequestIsDone` waits for completion, not just interception  
✅ **Complete visibility** - see every request, response and timing  
✅ **Easy debugging** - export logs on failure to analyze what went wrong  
✅ **Better mocking** - mock responses with full control  
✅ **Performance insights** - track request duration and identify slow endpoints  
✅ **WebSocket & console monitoring** - full application visibility  
✅ **Big-data safe** - non-mocked requests pass through untouched  

## Documentation

- [Full API Reference](./README.full.md)
- [Network Report Generation](./README.report.md)

## Need help?

Check the [full README](./README.full.md) for advanced features like WebSocket interception, console monitoring, the `test.unit` store and HTML report generation.
