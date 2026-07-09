export const crossDomainFetch = "https://www.gstatic.com/charts/loader.js";
export const I_TEST_ID_HEADER = "X-Test-Id";
export const HOST = "localhost:3000";
export const WS_HOST = "ws://localhost:3000";

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
