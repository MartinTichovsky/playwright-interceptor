import type { Page, WebSocket as PlaywrightWebSocket } from "@playwright/test";

import { deepCopy, isNonNullableObject, testUrlMatch } from "./src/utils";
import { getFilePath, writeFile } from "./src/utils.node";
import { waitTill } from "./src/wait";
import {
    CallStackWebsocket,
    IWSMatcher,
    WaitUntilActionOptions,
    WebSocketAction,
    WriteStatsOptions
} from "./WebsocketInterceptor.types";

const DEFAULT_INTERVAL = 100;
const DEFAULT_TIMEOUT = 10000;

export interface WebsocketInterceptorConstructorOptions {
    requestTimeout?: number;
    titlePath?: string[];
}

const parseUrl = (url: string) => {
    try {
        const parsed = new URL(url);

        return {
            query: Object.fromEntries(parsed.searchParams) as Record<string, string | number>,
            urlQuery: parsed.search
        };
    } catch {
        return { query: {}, urlQuery: "" };
    }
};

export class WebsocketInterceptor {
    private _callStack: CallStackWebsocket[] = [];
    private _skip = 0;

    private readonly page: Page;
    private readonly requestTimeout: number;
    private titlePath: string[];
    private _listener: (ws: PlaywrightWebSocket) => void;

    constructor(page: Page, options: WebsocketInterceptorConstructorOptions = {}) {
        this.page = page;
        this.requestTimeout = options.requestTimeout ?? DEFAULT_TIMEOUT;
        this.titlePath = options.titlePath ?? [];
        this._listener = (ws) => this.registerWebSocket(ws);
    }

    /**
     * Start listening for WebSocket connections. Called automatically by the fixture.
     */
    public start() {
        this.page.on("websocket", this._listener);
    }

    /**
     * Stop listening for WebSocket connections.
     */
    public destroy() {
        this.page.off("websocket", this._listener);
    }

    private fireAction(action: WebSocketAction) {
        this._callStack.push({
            ...action,
            timeStart: new Date()
        });
    }

    private registerWebSocket(ws: PlaywrightWebSocket) {
        const url = ws.url();
        const { query, urlQuery } = parseUrl(url);

        this.fireAction({ query, type: "create", url, urlQuery });

        ws.on("framesent", (frame) => {
            this.fireAction({
                data: typeof frame.payload === "string" ? frame.payload : frame.payload.toString(),
                query,
                type: "send",
                url,
                urlQuery
            });
        });

        ws.on("framereceived", (frame) => {
            this.fireAction({
                data: {
                    data:
                        typeof frame.payload === "string" ? frame.payload : frame.payload.toString()
                },
                query,
                type: "onmessage",
                url,
                urlQuery
            });
        });

        ws.on("close", () => {
            this.fireAction({ data: {}, query, type: "onclose", url, urlQuery });
        });

        ws.on("socketerror", () => {
            this.fireAction({ query, type: "onerror", url, urlQuery });
        });
    }

    /**
     * Returns a copy of all logged actions since the WebSocket Interceptor was created.
     */
    public get callStack() {
        return deepCopy(this._callStack);
    }

    private filterItemsByMatcher(matcher?: IWSMatcher) {
        return (item: CallStackWebsocket) => {
            if (!matcher) {
                return true;
            }

            let matches = 0;
            let mustMatch = 0;

            if ("type" in matcher) {
                switch (matcher.type) {
                    case "close":
                    case "onclose": {
                        if (matcher.reason !== undefined) {
                            mustMatch++;

                            matches +=
                                isNonNullableObject(item.data) &&
                                "reason" in item.data &&
                                matcher.reason === item.data.reason
                                    ? 1
                                    : 0;
                        }

                        if (matcher.code !== undefined) {
                            mustMatch++;

                            matches +=
                                isNonNullableObject(item.data) &&
                                "code" in item.data &&
                                matcher.code === item.data.code
                                    ? 1
                                    : 0;
                        }

                        break;
                    }
                    case "onmessage": {
                        if (matcher.data) {
                            mustMatch++;

                            matches +=
                                isNonNullableObject(item.data) &&
                                "data" in item.data &&
                                matcher.data === item.data.data
                                    ? 1
                                    : 0;
                        }

                        break;
                    }
                    case "send": {
                        if (matcher.data) {
                            mustMatch++;

                            matches += matcher.data === item.data ? 1 : 0;
                        }

                        break;
                    }
                }
            }

            if (matcher.protocols) {
                mustMatch++;

                const matcherProtocols = Array.isArray(matcher.protocols)
                    ? matcher.protocols
                    : [matcher.protocols];
                const itemProtocols = Array.isArray(item.protocols)
                    ? item.protocols
                    : [item.protocols];

                matches += matcherProtocols.every((entry) => itemProtocols.includes(entry)) ? 1 : 0;
            }

            if (matcher.queryMatcher !== undefined) {
                mustMatch++;

                matches += matcher.queryMatcher(item.query) ? 1 : 0;
            }

            if ("type" in matcher && matcher.type) {
                mustMatch++;

                matches += matcher.type === item.type ? 1 : 0;
            }

            if ("types" in matcher && matcher.types) {
                mustMatch++;

                matches += matcher.types.includes(item.type) ? 1 : 0;
            }

            if (matcher.url) {
                mustMatch++;

                matches += testUrlMatch(matcher.url, item.url.toString()) ? 1 : 0;
            }

            return matches === mustMatch;
        };
    }

    /**
     * Get the last action matching the provided matcher.
     *
     * @param matcher A matcher
     * @returns The last action information or `undefined` if none matches.
     */
    public getLastRequest(matcher?: IWSMatcher) {
        const items = this._callStack.filter(this.filterItemsByMatcher(matcher));

        return items.length ? deepCopy(items[items.length - 1]) : undefined;
    }

    /**
     * Get the statistics for all actions matching the provided matcher since the beginning
     * of the current test.
     *
     * @param matcher A matcher
     * @returns All actions matching the provided matcher with detailed information.
     */
    public getStats(matcher?: IWSMatcher) {
        return deepCopy(this._callStack.filter(this.filterItemsByMatcher(matcher)));
    }

    private isThereActionMatch(matcher: IWSMatcher | IWSMatcher[], countMatch = 1) {
        const matcherArray = Array.isArray(matcher) ? matcher : [matcher];
        const callStack = this._callStack.slice(this._skip);

        const itemsArray = matcherArray.map(
            (entry) => callStack.filter(this.filterItemsByMatcher(entry)).length >= countMatch
        );

        return matcherArray.length > 0
            ? itemsArray.length > 0 && itemsArray.every((hasItems) => hasItems)
            : callStack.length > 0;
    }

    /**
     * Reset the WebSocket Interceptor's watch.
     */
    public resetWatch() {
        this._skip = this._callStack.length;
    }

    /**
     * Wait until a WebSocket action occurs
     *
     * @param matcherOrOptions A matcher OR options
     * @param errorMessageOrOptions An error message OR options
     * @param errorMessage An error message when the maximum waiting time is reached
     */
    public async waitUntilWebsocketAction(
        matcherOrOptions?: IWSMatcher | IWSMatcher[] | WaitUntilActionOptions,
        errorMessageOrOptions?: string | WaitUntilActionOptions,
        errorMessage?: string
    ): Promise<this> {
        const matcher = this.isMatcher(matcherOrOptions) ? matcherOrOptions : undefined;

        const options = this.isOption(matcherOrOptions)
            ? matcherOrOptions
            : this.isOption(errorMessageOrOptions)
              ? errorMessageOrOptions
              : undefined;

        return this.waitUntilWebsocketAction_withWait(
            matcher,
            options,
            performance.now(),
            typeof errorMessageOrOptions === "string" ? errorMessageOrOptions : errorMessage
        );
    }

    private isMatcher(
        matcher?: IWSMatcher | IWSMatcher[] | string | WaitUntilActionOptions
    ): matcher is IWSMatcher | IWSMatcher[] {
        return isNonNullableObject(matcher) && (Array.isArray(matcher) || !this.isOption(matcher));
    }

    private isOption(
        options?: IWSMatcher | IWSMatcher[] | string | WaitUntilActionOptions
    ): options is WaitUntilActionOptions {
        return (
            isNonNullableObject(options) &&
            !Array.isArray(options) &&
            ("countMatch" in options || "enforceCheck" in options || "timeout" in options)
        );
    }

    private async waitUntilWebsocketAction_withWait(
        matcher: IWSMatcher | IWSMatcher[] = [],
        options: WaitUntilActionOptions = {},
        startTime: number,
        errorMessage?: string
    ): Promise<this> {
        const totalTimeout = options.timeout ?? this.requestTimeout ?? DEFAULT_TIMEOUT;

        const timeout = totalTimeout - (performance.now() - startTime);

        await waitTill(() => !this.isThereActionMatch(matcher, options.countMatch), {
            errorMessage,
            interval: DEFAULT_INTERVAL,
            timeout,
            totalTimeout
        });

        return this;
    }

    /**
     * Write the logged actions' information (or those filtered by the provided matcher) to a file
     *
     * @param outputDir A path for the output directory
     * @param options Options
     */
    public writeStatsToLog(outputDir: string, options?: WriteStatsOptions) {
        let callStack = options?.matcher
            ? this.callStack.filter(this.filterItemsByMatcher(options.matcher))
            : this.callStack;

        if (options?.filter) {
            callStack = callStack.filter(options.filter);
        }

        if (!callStack.length) {
            return;
        }

        writeFile(
            getFilePath({
                fileName: options?.fileName,
                maxLength: options?.maxLength,
                outputDir,
                titlePath: this.titlePath,
                type: "ws.stats"
            }),
            JSON.stringify(
                options?.mapper ? callStack.map(options.mapper) : callStack,
                undefined,
                options?.prettyOutput ? 4 : undefined
            )
        );
    }
}
