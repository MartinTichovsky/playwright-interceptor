import * as testUnit from "playwright-interceptor/test.unit";

(window as unknown as { testUnit: typeof testUnit })["testUnit"] = testUnit;
