import { FileNameMaxLength, StringMatcher } from "./Interceptor.types";

export interface WebSocketActionCommon {
    protocols?: string | string[];
    query: Record<string, string | number>;
    url: string;
    urlQuery: string;
}

export interface WSCreate extends WebSocketActionCommon {
    data?: undefined;
    type: "create";
}

export interface WSClose extends WebSocketActionCommon {
    data: {
        code?: number;
        reason?: string;
    };
    type: "close" | "onclose";
}

export interface WSOnMessage extends WebSocketActionCommon {
    data: {
        data: string;
    };
    type: "onmessage";
}

export interface WSOnError extends WebSocketActionCommon {
    data?: undefined;
    type: "onerror" | "onopen";
}

export interface WSSend extends WebSocketActionCommon {
    data: string;
    type: "send";
}

export type WebSocketAction = WSCreate | WSClose | WSOnMessage | WSOnError | WSSend;

export type CallStackWebsocket = WebSocketAction & {
    /**
     * The time when the action occurred
     */
    timeStart: Date;
};

export type WebSocketActionType = WebSocketAction["type"];

interface IWSMatcherBase {
    /**
     * A matcher for the query string (URL search params)
     *
     * @param query The URL search params as an object
     * @returns `true` if matches
     */
    queryMatcher?: (query: Record<string, string | number>) => boolean;
    /**
     * The WebSocket protocols
     */
    protocols?: string | string[];
    /**
     * A URL matcher, use * or ** to match any word in string
     */
    url?: StringMatcher;
}

export type IWSMatcher = IWSMatcherBase &
    (
        | {
              type?: "create" | "onerror" | "onopen";
          }
        | {
              type?: "close" | "onclose";
              code?: number;
              reason?: string;
          }
        | {
              type?: "onmessage";
              data?: string;
          }
        | {
              type?: "send";
              data?: string;
          }
        | {
              types?: WebSocketActionType[];
          }
    );

export interface WaitUntilActionOptions {
    /**
     * The minimum number of matches. By default, it is set to 1.
     */
    countMatch?: number;
    /**
     * The value is `true` by default.
     */
    enforceCheck?: boolean;
    /**
     * The duration the Interceptor will wait for actions. The default is set to 10,000.
     */
    timeout?: number;
}

export interface WriteStatsOptions {
    /**
     * The name of the file. If `undefined`, it will be generated from the running test.
     */
    fileName?: string;
    /**
     * An option to filter the logged items
     */
    filter?: (callStack: CallStackWebsocket) => boolean;
    /**
     * An option to map the logged items
     */
    mapper?: (callStack: CallStackWebsocket) => unknown;
    /**
     * The maximal length of the generated file name. Has no effect when `fileName` is provided.
     */
    maxLength?: FileNameMaxLength;
    /**
     * When set to `true`, the output JSON will be formatted with tabs
     */
    prettyOutput?: boolean;
    /**
     * A matcher
     */
    matcher?: IWSMatcher;
}
