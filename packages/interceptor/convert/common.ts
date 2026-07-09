export const blobToObject = (blob: Blob) => ({
    name: "blob",
    type: blob.type,
    size: blob.size
});

export const fileToObject = (file: File) => ({
    name: file.name,
    type: file.type,
    size: file.size
});

export const isObject = (value: unknown): value is Record<string | number, unknown> =>
    typeof value === "object" && value !== null;

export const valueToString = (value: unknown) => {
    if (typeof value === "bigint") {
        return `${String(value)}n`;
    }

    return String(value);
};
