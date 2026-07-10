export const crossDomainFetch = "https://www.gstatic.com/charts/loader.js";
export const I_TEST_ID_HEADER = "X-Test-Id";

/**
 * The port of the main server. Change this value to update the port everywhere it is used
 * (server, host, websocket host, Playwright config, ...).
 */
export const PORT = 4000;
/**
 * The port of the second server (serves `navigation.html` for every route).
 */
export const SECOND_PORT = 4001;

export const HOST = `localhost:${PORT}`;
export const WS_HOST = `ws://localhost:${PORT}`;

export enum SERVER_URL {
    AutoResponseFormData = "auto-response-form-data",
    BlobResponse = "blob-response",
    BrokenStream = "broken-stream",
    Cookies = "cookies",
    InvalidJson = "invalid-json",
    ResponseWithProgress = "response-with-progress",
    WebSocketArrayBuffer = "array-buffer",
    WebSocketClose = "websocket-close"
}

export enum COUNTER_SERVER_URL {
    GetCounter = `/${I_TEST_ID_HEADER}/counter/get-counter`,
    ResetCounter = `/${I_TEST_ID_HEADER}/counter/reset-counter`
}
