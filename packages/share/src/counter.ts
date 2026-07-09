import type { APIRequestContext } from "@playwright/test";
import {
    COUNTER_SERVER_URL,
    I_TEST_ID_HEADER
} from "playwright-interceptor-server/src/resources/constants";
import { RequestServerLog } from "playwright-interceptor-server/src/types";

/**
 * Get the requests logged by the test server for the given test id.
 *
 * The `request` fixture (an `APIRequestContext`) issues requests from Node, so these calls are not
 * intercepted by the page interceptor - exactly like `cy.request` in the Cypress suite.
 */
export const getCounter = async (request: APIRequestContext, iTestId: string) => {
    const response = await request.get(COUNTER_SERVER_URL.GetCounter, {
        headers: { [I_TEST_ID_HEADER]: iTestId }
    });

    return (await response.json()) as RequestServerLog[];
};

/**
 * Reset the requests logged by the test server for the given test id.
 */
export const resetCounter = async (request: APIRequestContext, iTestId: string) => {
    const response = await request.post(COUNTER_SERVER_URL.ResetCounter, {
        headers: { [I_TEST_ID_HEADER]: iTestId }
    });

    return (await response.json()) as { timestamp: number };
};
