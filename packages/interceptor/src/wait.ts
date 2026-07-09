import { sleep } from "./utils";

type Checker = () => boolean | Promise<boolean>;

interface Options {
    errorMessage?: string;
    interval: number;
    timeout: number;
    totalTimeout: number;
}

/**
 * Poll `checkFunction` until it returns `false` (meaning "done") or until the timeout is reached.
 *
 * `checkFunction` returns `true` while the wait should continue (there is still something pending).
 */
export const waitTill = async (checkFunction: Checker, options: Options): Promise<void> => {
    const endTime = Date.now() + options.timeout;

    let result = await checkFunction();

    while (result) {
        if (Date.now() >= endTime) {
            throw new Error(
                `${
                    options.errorMessage
                        ? options.errorMessage
                        : "A wait timed out when waiting for requests to be done"
                } (${options.totalTimeout}ms)`
            );
        }

        await sleep(options.interval);

        result = await checkFunction();
    }
};
