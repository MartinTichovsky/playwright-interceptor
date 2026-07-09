export interface WSMessage {
    data: string;
    delay?: number;
}

export interface WSCommunication {
    responseData?: string;
    responseDelay?: number;
    sendData: string;
    sendDelay?: number;
}

export type BodyFormatFetch = "blob" | "formdata" | "json" | "urlencoded";
export type BodyFormatXHR = BodyFormatFetch | "arraybuffer" | "document" | "typedarray";

export type DynamicRequest = {
    /**
     * If true, a click will be required to fire the request
     */
    fireOnClick?: boolean;
} & (
    | ({
          /**
           * If true, the response will contain "Cache-Control": "public, max-age=3600",
           * and the request will be cached for all the tests
           */
          enableCache?: boolean;
          /**
           * Receive big response
           */
          bigData?: boolean;
          /**
           * Delay when start the request
           */
          delay?: number;
          /**
           * Duration of the request
           * (when mock body or generateBody is provided, the duration is not executed because the request never hits the back-end)
           */
          duration?: number;
          /**
           * A relative path, such as /script.js, /testing-endpoint, etc.
           */
          path: string;
          /**
           * A custom query
           */
          query?: Record<string, string>;
          /**
           * Possible following requests after this one
           */
          requests?: DynamicRequest[];
          /**
           * Custom response status
           */
          status?: number;
      } & {
          /**
           * Body sent by fetch
           */
          body?: Record<string, unknown>;
          /**
           *
           */
          bodyFormat?: BodyFormatFetch | BodyFormatXHR;
          /**
           * A time when the request is canceled. Must be lower then duration
           */
          cancelIn?: number;
          /**
           * Initialize fetch with an object
           */
          fetchObjectInit?: boolean;
          /**
           * Expect JSON response, true by default
           */
          jsonResponse?: boolean;
          /**
           * Headers sent by fetch
           */
          headers?: Record<string, string>;
          /**
           * The request method
           */
          method: "GET" | "POST";
          /**
           * The response object, will be parsed as JSON
           */
          responseBody?: Record<string, unknown>;
          /**
           * The response string, can be anything
           */
          responseString?: string;
          /**
           * The response headers
           */
          responseHeaders?: Record<string, string>;
          /**
           *
           */
          responseCatchType?: ResponseCatchType;
          type: "fetch" | "xhr";
      })
    | {
          /**
           * A data send to the server when create for getting custom responses
           */
          autoResponse?: WSMessage[];
          /**
           * Close after receiving a message
           */
          close?: {
              code?: number;
              reason?: string;
          };
          /**
           * Communication between the client and server
           */
          communication?: WSCommunication[];
          /**
           * Delay when start the request
           */
          delay?: number;
          /**
           * Throw an error
           */
          error?: boolean;
          /**
           * A relative path to ws://localhost:3000/{path}
           */
          path: string;
          /**
           * Protocols of the websocket
           */
          protocols?: string | string[];
          /**
           * A custom query
           */
          query?: Record<string, string>;
          /**
           * A queue of sending messages
           */
          sendQueue?: WSMessage[];
          /**
           * Websocket Type
           */
          type: "websocket";
      }
);

export interface RequestServerLog {
    pathname: string;
    query: Record<string, string | undefined>;
    timestamp: number;
    url: string;
}

export type ResponseCatchType = "addEventListener" | "onload" | "onreadystatechange";
