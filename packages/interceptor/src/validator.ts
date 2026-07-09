import { CallStack, CallStackJson } from "../Interceptor.types";

export enum ValidationErrorMessages {
    EXPECTED_ARRAY = "Expected an array of CallStack objects",
    RESOURCE_TYPE_REQUIRED = "resourceType is required",
    RESOURCE_TYPE_MUST_BE_STRING = "resourceType must be a string",
    TIME_START_REQUIRED = "timeStart is required",
    TIME_START_MUST_BE_DATE = "timeStart must be a Date object",
    URL_REQUIRED = "url is required",
    URL_MUST_BE_URL = "url must be a URL object",
    DELAY_MUST_BE_NUMBER = "delay must be a number when provided",
    DURATION_MUST_BE_NUMBER = "duration must be a number when provided",
    REQUEST_DELAY_MUST_BE_NUMBER = "requestDelay must be a number when provided",
    REQUEST_REQUIRED = "request is required",
    REQUEST_BODY_REQUIRED = "request.body is required",
    REQUEST_BODY_MUST_BE_STRING = "request.body must be a string",
    REQUEST_HEADERS_REQUIRED = "request.headers is required",
    REQUEST_HEADERS_MUST_BE_OBJECT = "request.headers must be an object",
    REQUEST_METHOD_REQUIRED = "request.method is required",
    REQUEST_METHOD_MUST_BE_STRING = "request.method must be a string",
    REQUEST_QUERY_REQUIRED = "request.query is required",
    REQUEST_QUERY_MUST_BE_OBJECT = "request.query must be an object",
    RESPONSE_BODY_REQUIRED = "response.body is required when response exists",
    RESPONSE_BODY_MUST_BE_STRING = "response.body must be a string",
    RESPONSE_HEADERS_REQUIRED = "response.headers is required when response exists",
    RESPONSE_HEADERS_MUST_BE_OBJECT = "response.headers must be an object",
    RESPONSE_STATUS_CODE_REQUIRED = "response.statusCode is required when response exists",
    RESPONSE_STATUS_CODE_MUST_BE_NUMBER = "response.statusCode must be a number",
    RESPONSE_STATUS_TEXT_REQUIRED = "response.statusText is required when response exists",
    RESPONSE_STATUS_TEXT_MUST_BE_STRING = "response.statusText must be a string"
}

export const createValidationError = (index: number, path: string, message: string): Error => {
    return new Error(`Validation failed at index ${index}, path "${path}": ${message}`);
};

export const convertCallStackJsonToCallStack = (callStackJson: CallStackJson[]): CallStack[] => {
    return callStackJson.map((item) => ({
        ...item,
        delay: item.delay === null ? undefined : item.delay,
        duration: item.duration === null ? undefined : item.duration,
        requestDelay: item.requestDelay === null ? undefined : item.requestDelay,
        timeStart: new Date(item.timeStart),
        url: new URL(item.url),
        response: item.response
            ? {
                  ...item.response,
                  timeEnd: new Date(item.response.timeEnd)
              }
            : undefined
    }));
};

export const validateStats = (stats: CallStackJson[]): void => {
    // Check if stats is an array
    if (!Array.isArray(stats)) {
        throw createValidationError(-1, "root", ValidationErrorMessages.EXPECTED_ARRAY);
    }

    stats.forEach((callStack, index) => {
        // Validate root properties
        validateRootProperties(callStack, index);

        // Validate request property (required)
        validateRequestProperties(callStack, index);

        // Validate response property (optional)
        validateResponseProperties(callStack, index);
    });
};

const validateRootProperties = (callStack: CallStackJson, index: number): void => {
    // Required properties
    if (callStack.resourceType === undefined || callStack.resourceType === null) {
        throw createValidationError(
            index,
            "resourceType",
            ValidationErrorMessages.RESOURCE_TYPE_REQUIRED
        );
    } else if (typeof callStack.resourceType !== "string") {
        throw createValidationError(
            index,
            "resourceType",
            ValidationErrorMessages.RESOURCE_TYPE_MUST_BE_STRING
        );
    }

    if (callStack.timeStart === undefined || callStack.timeStart === null) {
        throw createValidationError(
            index,
            "timeStart",
            ValidationErrorMessages.TIME_START_REQUIRED
        );
    } else if (typeof callStack.timeStart !== "string" || isNaN(Date.parse(callStack.timeStart))) {
        throw createValidationError(
            index,
            "timeStart",
            ValidationErrorMessages.TIME_START_MUST_BE_DATE
        );
    }

    if (callStack.url === undefined) {
        throw createValidationError(index, "url", ValidationErrorMessages.URL_REQUIRED);
    } else if (typeof callStack.url !== "string" || !isValidUrl(callStack.url)) {
        throw createValidationError(index, "url", ValidationErrorMessages.URL_MUST_BE_URL);
    }

    // Optional properties
    if (
        callStack.delay !== undefined &&
        callStack.delay !== null &&
        typeof callStack.delay !== "number"
    ) {
        throw createValidationError(index, "delay", ValidationErrorMessages.DELAY_MUST_BE_NUMBER);
    }

    if (
        callStack.duration !== undefined &&
        callStack.duration !== null &&
        typeof callStack.duration !== "number"
    ) {
        throw createValidationError(
            index,
            "duration",
            ValidationErrorMessages.DURATION_MUST_BE_NUMBER
        );
    }

    if (
        callStack.requestDelay !== undefined &&
        callStack.requestDelay !== null &&
        typeof callStack.requestDelay !== "number"
    ) {
        throw createValidationError(
            index,
            "requestDelay",
            ValidationErrorMessages.REQUEST_DELAY_MUST_BE_NUMBER
        );
    }
};

const isValidUrl = (url: string): boolean => {
    try {
        new URL(url);

        return true;
    } catch {
        return false;
    }
};

const validateRequestProperties = (callStack: CallStackJson, index: number): void => {
    if (callStack.request === undefined) {
        throw createValidationError(index, "request", ValidationErrorMessages.REQUEST_REQUIRED);
    }

    const { request } = callStack;

    // All request properties are required according to the interface
    if (request.body === undefined || request.body === null) {
        throw createValidationError(
            index,
            "request.body",
            ValidationErrorMessages.REQUEST_BODY_REQUIRED
        );
    } else if (typeof request.body !== "string") {
        throw createValidationError(
            index,
            "request.body",
            ValidationErrorMessages.REQUEST_BODY_MUST_BE_STRING
        );
    }

    if (request.headers === undefined || request.headers === null) {
        throw createValidationError(
            index,
            "request.headers",
            ValidationErrorMessages.REQUEST_HEADERS_REQUIRED
        );
    } else if (
        typeof request.headers !== "object" ||
        request.headers === null ||
        Array.isArray(request.headers)
    ) {
        throw createValidationError(
            index,
            "request.headers",
            ValidationErrorMessages.REQUEST_HEADERS_MUST_BE_OBJECT
        );
    }

    if (request.method === undefined || request.method === null) {
        throw createValidationError(
            index,
            "request.method",
            ValidationErrorMessages.REQUEST_METHOD_REQUIRED
        );
    } else if (typeof request.method !== "string") {
        throw createValidationError(
            index,
            "request.method",
            ValidationErrorMessages.REQUEST_METHOD_MUST_BE_STRING
        );
    }

    if (request.query === undefined || request.query === null) {
        throw createValidationError(
            index,
            "request.query",
            ValidationErrorMessages.REQUEST_QUERY_REQUIRED
        );
    } else if (
        typeof request.query !== "object" ||
        request.query === null ||
        Array.isArray(request.query)
    ) {
        throw createValidationError(
            index,
            "request.query",
            ValidationErrorMessages.REQUEST_QUERY_MUST_BE_OBJECT
        );
    }
};

const validateResponseProperties = (callStack: CallStackJson, index: number): void => {
    // Response is optional
    if (callStack.response === undefined) {
        return;
    }

    const { response } = callStack;

    // All response properties are required according to the interface when response exists
    if (response.body === undefined) {
        throw createValidationError(
            index,
            "response.body",
            ValidationErrorMessages.RESPONSE_BODY_REQUIRED
        );
    } else if (typeof response.body !== "string") {
        throw createValidationError(
            index,
            "response.body",
            ValidationErrorMessages.RESPONSE_BODY_MUST_BE_STRING
        );
    }

    if (response.headers === undefined) {
        throw createValidationError(
            index,
            "response.headers",
            ValidationErrorMessages.RESPONSE_HEADERS_REQUIRED
        );
    } else if (
        typeof response.headers !== "object" ||
        response.headers === null ||
        Array.isArray(response.headers)
    ) {
        throw createValidationError(
            index,
            "response.headers",
            ValidationErrorMessages.RESPONSE_HEADERS_MUST_BE_OBJECT
        );
    }

    if (response.statusCode === undefined) {
        throw createValidationError(
            index,
            "response.statusCode",
            ValidationErrorMessages.RESPONSE_STATUS_CODE_REQUIRED
        );
    } else if (typeof response.statusCode !== "number") {
        throw createValidationError(
            index,
            "response.statusCode",
            ValidationErrorMessages.RESPONSE_STATUS_CODE_MUST_BE_NUMBER
        );
    }

    if (response.statusText === undefined) {
        throw createValidationError(
            index,
            "response.statusText",
            ValidationErrorMessages.RESPONSE_STATUS_TEXT_REQUIRED
        );
    } else if (typeof response.statusText !== "string") {
        throw createValidationError(
            index,
            "response.statusText",
            ValidationErrorMessages.RESPONSE_STATUS_TEXT_MUST_BE_STRING
        );
    }
};
