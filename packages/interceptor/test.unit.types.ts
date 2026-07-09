/* eslint-disable @typescript-eslint/no-explicit-any */

import { FileNameMaxLength } from "./Interceptor.types";

export interface CallLineStack {
    /**
     * The arguments to store
     */
    args: any[];

    /**
     * The date of the entry
     */
    date: Date;
}

export interface CallLineToFileOptions {
    /**
     * The name of the file. If `undefined`, it will be generated from the running test.
     */
    fileName?: string;

    /**
     * Filter the entries to save
     */
    filter?: (callLine: CallLineStack) => boolean;

    /**
     * The maximal length of the generated file name. Has no effect when `fileName` is provided.
     */
    maxLength?: FileNameMaxLength;

    /**
     * When set to `true`, the output JSON will be formatted with tabs
     */
    prettyOutput?: boolean;
}
