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

Import `test` and `expect` from `playwright-interceptor` instead of `@playwright/test`. The `interceptor`, `wsInterceptor` and `watchTheConsole` fixtures are then available and started automatically:

```ts
import { expect, test } from "playwright-interceptor";
```

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
