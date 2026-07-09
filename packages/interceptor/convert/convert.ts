import { formDataToJsonString, urlSearchParamsToJsonString } from "./formData";
import { xmlDocumentToJSONString } from "./xmlDocument";

export const convertInputBodyToString = async (
    input: Document | BodyInit | null | undefined,
    win: typeof window
) => {
    if (input instanceof win.Document || input instanceof Document) {
        return xmlDocumentToJSONString(input, window);
    } else if (typeof input === "string") {
        return input;
    } else if (input instanceof win.Blob || input instanceof Blob) {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(input);
        });
    } else if (input instanceof win.FormData || input instanceof FormData) {
        return formDataToJsonString(input, win);
    } else if (input instanceof win.URLSearchParams || input instanceof URLSearchParams) {
        return urlSearchParamsToJsonString(input, window);
    } else if (
        input instanceof win.ArrayBuffer ||
        input instanceof ArrayBuffer ||
        win.ArrayBuffer.isView(input)
    ) {
        return new TextDecoder().decode(input);
    } else if (typeof input === "object" && input !== null) {
        return JSON.stringify(input);
    } else {
        return "";
    }
};
