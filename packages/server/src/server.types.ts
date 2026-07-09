export interface CookiesRequest {
    cookieName: string;
    cookieValue: string;
}

export interface TestingEndpointRequest {
    enableCache?: boolean;
    bigData?: boolean;
    duration?: string;
    /**
     * Should be unique for every request
     */
    path: string;
    /**
     * The response object, will be parsed as JSON
     */
    responseBody?: string;
    /**
     * The response string, can be anything
     */
    responseString?: string;
    /**
     * The additional response headers
     */
    responseHeaders?: string;
    status?: string;
}

export interface WsEndpointRequest {
    autoResponse?: string;
}
