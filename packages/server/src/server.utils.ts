import express from "express";
import { WebSocket } from "ws";

import { I_TEST_ID_HEADER } from "./resources/constants";
import { TestingEndpointRequest } from "./server.types";
import { WSMessage } from "./types";

export const XHRContentType = "application/json";

export const getITestNameHeader = (req: express.Request) => {
    const iTestNameHeaderKey = I_TEST_ID_HEADER.toLowerCase();

    for (const headerKey of Object.keys(req.headers)) {
        if (headerKey.toLowerCase() === iTestNameHeaderKey) {
            const value = req.headers[headerKey];

            return typeof value === "string" ? value : undefined;
        }
    }

    return undefined;
};

export const getResponseBody = (
    req: express.Request<unknown, unknown, unknown, TestingEndpointRequest>
) => {
    try {
        return {
            ...(req.query.responseBody ? JSON.parse(req.query.responseBody) : {})
        };
    } catch (ex) {
        console.warn(ex);

        return {};
    }
};

export const getNumberFomString = (num: string | undefined, defaultNumber = 0) => {
    const result = parseInt(num ?? defaultNumber.toString());

    return !isNaN(result) ? result : defaultNumber;
};

export const executeAutoResponse = async (ws: WebSocket, autoResponse: WSMessage[]) => {
    if (!autoResponse.length) {
        return;
    }

    if (autoResponse[0].delay) {
        await wait(autoResponse[0].delay);
    }

    ws.send(autoResponse[0].data);

    autoResponse.shift();

    void executeAutoResponse(ws, autoResponse);
};

export const wait = async (timeout: number) =>
    new Promise((executor) => setTimeout(executor, timeout));
