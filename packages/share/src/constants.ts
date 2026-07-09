export const OUTPUT_DIR = "_output";

/**
 * Build an output directory that is unique per Playwright worker.
 *
 * Several specs clean their output directory in `beforeAll`/`beforeEach`. Under `fullyParallel`,
 * multiple workers would otherwise clean and write the same shared directory concurrently, causing
 * random `ENOTEMPTY` / `ENOENT` errors during the recursive delete. Scoping the directory to the
 * worker (each worker process runs its tests serially) makes the cleanup race-free, while the
 * per-test file names (derived from the test title path) keep individual files unique within it.
 *
 * @param specName A stable name for the spec, typically its file name.
 * @returns The worker-scoped output directory path.
 */
export const getWorkerOutputDir = (specName: string) =>
    `${OUTPUT_DIR}/${specName}/worker-${process.env.TEST_PARALLEL_INDEX ?? "0"}`;
