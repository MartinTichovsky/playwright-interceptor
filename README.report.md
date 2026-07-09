# Network Report Generation

The **Network Report** feature generates detailed HTML reports with visualizations and statistics about all network requests captured by Playwright Interceptor.

## Features

- 📊 **Visual Charts**: interactive charts showing request duration over time
- 📈 **Performance Metrics**: min, max and average request durations
- 🎯 **Performance Threshold**: highlight requests exceeding a configurable duration threshold
- 📋 **Detailed Tables**: complete request/response data including headers, bodies and status codes
- 🧩 **Flexible Generation**: create reports during test execution or from existing statistics files
- 📁 **Batch Processing**: generate multiple reports from folders containing statistics files

## Table of Contents

- [Quick Start](#quick-start)
  - [Basic Usage in a Playwright Test](#basic-usage-in-a-playwright-test)
  - [Generate Reports for All Tests](#generate-reports-for-all-tests)
  - [Generate Reports Only for Failed Tests](#generate-reports-only-for-failed-tests)
  - [Custom File Names](#custom-file-names)
  - [Performance Threshold Configuration](#performance-threshold-configuration)
  - [Per-Request Thresholds](#per-request-thresholds)
- [API Reference](#api-reference)
  - [`createNetworkReport(interceptor, options)`](#createnetworkreportinterceptor-options)
  - [`createNetworkReportFromFile(filePath, options)`](#createnetworkreportfromfilefilepath-options)
  - [`createNetworkReportFromFolder(folderPath, options)`](#createnetworkreportfromfolderfolderpath-options)
  - [`generateReport(source, outputFile, options)`](#generatereportsource-outputfile-options)
  - [Options interfaces](#options-interfaces)
- [Advanced Usage Examples](#advanced-usage-examples)
  - [Conditional Report Generation](#conditional-report-generation)
  - [Integration with CI/CD](#integration-with-cicd)
- [Report Contents](#report-contents)
  - [Performance Overview](#performance-overview)
  - [Interactive Chart](#interactive-chart)
  - [Detailed Data Table](#detailed-data-table)
- [Best Practices](#best-practices)
  - [1. Organize Reports by Test Type](#1-organize-reports-by-test-type)
  - [2. Clean Up Old Reports](#2-clean-up-old-reports)
  - [3. Generate Reports Only for Long-Running Tests](#3-generate-reports-only-for-long-running-tests)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Basic Usage in a Playwright Test

Import the report function. Unlike the Cypress version (which read from `cy.interceptor()`), the Playwright `createNetworkReport` takes the `interceptor` fixture instance directly:

```ts
import { createNetworkReport } from "playwright-interceptor/report";
// (also re-exported from "playwright-interceptor")
```

```ts
import { expect, test } from "playwright-interceptor";
import { createNetworkReport } from "playwright-interceptor/report";

test("dashboard loads", async ({ page, interceptor }) => {
    await page.goto("/dashboard");
    await interceptor.waitUntilRequestIsDone();

    createNetworkReport(interceptor, {
        outputDir: "network-reports",
        titlePath: test.info().titlePath
    });
});
```

### Generate Reports for All Tests

Add an `afterEach` hook to create a report after every test:

```ts
test.afterEach(async ({ interceptor }) => {
    createNetworkReport(interceptor, {
        outputDir: "network-reports",
        titlePath: test.info().titlePath
    });
});
```

### Generate Reports Only for Failed Tests

Recommended for CI/CD — only report when a test fails:

```ts
test.afterEach(async ({ interceptor }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
        createNetworkReport(interceptor, {
            outputDir: "failed-test-reports",
            titlePath: testInfo.titlePath
        });
    }
});
```

### Custom File Names

```ts
createNetworkReport(interceptor, {
    fileName: "my-custom-report-name",
    outputDir: "reports"
});
```

### Performance Threshold Configuration

Set a threshold for highlighting slow requests:

```ts
createNetworkReport(interceptor, {
    highDuration: 2000, // highlight requests taking longer than 2 seconds
    outputDir: "reports",
    titlePath: test.info().titlePath
});
```

### Per-Request Thresholds

Use a function for `highDuration` to set different thresholds per request:

```ts
createNetworkReport(interceptor, {
    highDuration: (url) => (url.pathname.startsWith("/api/") ? 1000 : 3000),
    outputDir: "reports",
    titlePath: test.info().titlePath
});
```

## API Reference

### `createNetworkReport(interceptor, options)`

Creates an HTML report from an `Interceptor` instance and its captured requests. Returns the path to the generated file.

**Parameters:**
- `interceptor` (`Interceptor`, required): the interceptor fixture instance to read the stats from.
- `options` (`CreateNetworkReportOptions`, required): the report configuration.

```ts
const outputFile = createNetworkReport(interceptor, {
    fileName: "api-performance-report",
    highDuration: 2500,
    outputDir: "./test-reports",
    titlePath: test.info().titlePath
});
```

### `createNetworkReportFromFile(filePath, options)`

Creates an HTML report from an existing `.stats.json` file (produced by [`writeStatsToLog`](./README.full.md#writestatstolog)). It runs purely in Node, so it can be called from a test, a global setup/teardown, or a standalone script. Returns the path to the generated file.

**Parameters:**
- `filePath` (string, required): path to the `.stats.json` file.
- `options` (`ReportHtmlOptions`, required): the report configuration.

```ts
import { createNetworkReportFromFile } from "playwright-interceptor/report";

createNetworkReportFromFile("./logs/test-results.stats.json", {
    fileName: "custom-report-name",
    highDuration: 5000,
    outputDir: "./reports"
});
```

### `createNetworkReportFromFolder(folderPath, options)`

Creates HTML reports for all `.stats.json` files found in a folder. It runs purely in Node. The file name is auto-generated from each input file's name, so `fileName` is not accepted.

**Parameters:**
- `folderPath` (string, required): path to the folder containing `.stats.json` files.
- `options` (`Omit<ReportHtmlOptions, "fileName">`, required): the report configuration.

```ts
import { createNetworkReportFromFolder } from "playwright-interceptor/report";

createNetworkReportFromFolder("./logs", {
    highDuration: 2000,
    outputDir: "./batch-reports"
});
```

### `generateReport(source, outputFile, options)`

The low-level generator used by all of the above. It accepts either a `CallStack[]` array or a path to a `.stats.json` file, and writes the HTML to `outputFile`.

```ts
import { generateReport } from "playwright-interceptor";

generateReport(interceptor.getStats(), "./reports/report.html", { highDuration: 2000 });
```

### Options interfaces

```ts
interface ReportHtmlOptions {
    /** The report file name (without extension). If not provided, derived from the test. */
    fileName?: string;
    /** The duration (ms) considered "high" and highlighted. A function receives each request URL. */
    highDuration?: number | ((url: URL) => number);
    /** The maximal length of the generated file name. No effect when `fileName` is provided. */
    maxLength?: number | { describe?: number; testName?: number };
    /** The directory to save the report to. */
    outputDir: string;
}

interface CreateNetworkReportOptions extends ReportHtmlOptions {
    /** The test title path. In a Playwright test this is `test.info().titlePath`. */
    titlePath?: string[];
    /** The report title. Defaults to the file name derived from `titlePath`. */
    title?: string;
}
```

The `maxLength` option is useful on systems with file name / path length limits (for example Windows). It only affects the auto-generated name (when `fileName` is not provided):

- Provide a `number` to cut the whole generated name to that length.
- Provide an object `{ describe?: number; testName?: number }` to cut the describe (title) section and the test name separately.

```ts
// cut the whole generated file name to a maximum of 30 characters
createNetworkReport(interceptor, { maxLength: 30, outputDir: "./test-reports" });

// cut the describe section to 20 and the test name to 30 characters
createNetworkReport(interceptor, {
    maxLength: { describe: 20, testName: 30 },
    outputDir: "./test-reports"
});
```

## Advanced Usage Examples

### Conditional Report Generation

```ts
test.afterEach(async ({ interceptor }, testInfo) => {
    const isApiTest = testInfo.title.includes("API");

    if (isApiTest || testInfo.status !== testInfo.expectedStatus) {
        createNetworkReport(interceptor, {
            highDuration: 1500, // stricter threshold for API tests
            outputDir: "conditional-reports",
            titlePath: testInfo.titlePath
        });
    }
});
```

### Integration with CI/CD

Because `createNetworkReportFromFile` / `createNetworkReportFromFolder` run purely in Node, you can turn a folder of stats logs into reports from a [global teardown](https://playwright.dev/docs/test-global-setup-teardown) file:

```ts
// global-teardown.ts
import { createNetworkReportFromFolder } from "playwright-interceptor/report";

export default function globalTeardown() {
    if (process.env.CI) {
        createNetworkReportFromFolder("./logs", {
            highDuration: 5000, // more lenient in CI
            outputDir: "./ci-reports"
        });
    }
}
```

```ts
// playwright.config.ts
export default defineConfig({
    globalTeardown: "./global-teardown.ts"
});
```

Pair it with a `writeStatsToLog` call in an `afterEach` so the `./logs` folder is populated during the run:

```ts
test.afterEach(async ({ interceptor }) => {
    interceptor.writeStatsToLog("./logs");
});
```

## Report Contents

Each generated HTML report includes:

### Performance Overview
- **Total Requests**: number of network requests captured
- **Average Duration**: mean response time across all requests
- **Min/Max Duration**: fastest and slowest request times
- **Generation Date**: when the report was created
- **Performance Threshold**: the configured threshold for highlighting slow requests

### Interactive Chart
- visual timeline of request durations
- hover for detailed information
- color-coded performance indicators (requests exceeding the `highDuration` threshold are highlighted)

### Detailed Data Table
For each request:
- **Timestamp**: when the request was made
- **URL**: request endpoint
- **Method**: HTTP method (GET, POST, ...)
- **Duration**: response time in milliseconds
- **Status Code**: HTTP response status
- **Headers**: request and response headers
- **Body**: request and response bodies
- **Query Parameters**: URL query parameters

## Best Practices

### 1. Organize Reports by Test Type

```ts
const getReportConfig = (title: string) => {
    if (title.includes("API")) {
        return { highDuration: 1000, outputDir: "reports/api-tests" };
    }

    if (title.includes("UI")) {
        return { highDuration: 5000, outputDir: "reports/ui-tests" };
    }

    return { highDuration: 3000, outputDir: "reports/general" };
};

test.afterEach(async ({ interceptor }, testInfo) => {
    createNetworkReport(interceptor, {
        ...getReportConfig(testInfo.title),
        titlePath: testInfo.titlePath
    });
});
```

### 2. Clean Up Old Reports

Remove old reports before the run in a [global setup](https://playwright.dev/docs/test-global-setup-teardown) file:

```ts
// global-setup.ts
import * as fs from "fs";

export default function globalSetup() {
    fs.rmSync("./reports", { force: true, recursive: true });
}
```

### 3. Generate Reports Only for Long-Running Tests

```ts
import { startTiming, stopTiming } from "playwright-interceptor";

let start = 0;

test.beforeEach(() => {
    start = startTiming();
});

test.afterEach(async ({ interceptor }, testInfo) => {
    const duration = stopTiming(start);

    // report only for tests that took longer than 5 seconds
    if (duration > 5000) {
        createNetworkReport(interceptor, {
            highDuration: Math.floor(duration * 0.1), // 10% of total test duration
            outputDir: "slow-test-reports",
            titlePath: testInfo.titlePath
        });
    }
});
```

## Troubleshooting

**Report not generated:**
- ensure `outputDir` exists or can be created and you have write permissions.
- make sure `playwright-interceptor` is imported and the `interceptor` fixture is used.

**Empty reports:**
- verify that network requests actually occurred during the test and that you awaited them (e.g. with `waitUntilRequestIsDone`) before generating the report.

**Wrong file name:**
- when `fileName` is not provided, the name is derived from `titlePath`. Pass `titlePath: test.info().titlePath` to `createNetworkReport`.
