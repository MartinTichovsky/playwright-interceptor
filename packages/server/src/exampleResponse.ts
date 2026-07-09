import * as fs from "fs";
import * as path from "path";

let id = 0;

export const getExampleResponse = (type: string, queryPath: string) => {
    switch (type) {
        case ".htm":
        case ".html":
        case ".xhtml":
        case "text/html":
        case "application/xhtml+xml":
        case "application/xml":
            return fs.readFileSync(path.resolve(__dirname, "./exampleResponse/html.html"));
        case ".css":
        case "text/css":
            return fs.readFileSync(path.resolve(__dirname, "./exampleResponse/css.css"));
        case ".js":
        case "text/javascript": {
            let script = fs
                .readFileSync(path.resolve(__dirname, "./exampleResponse/js.js"))
                .toString();

            if (queryPath) {
                const scriptFunctionName = `scriptFunction${++id}`;

                script = script.replace("exampleJsCode", scriptFunctionName);
                script += `\n${scriptFunctionName}("${queryPath}")`;
            }

            return script;
        }
        case ".svg":
        case "image/svg+xml":
            return fs.readFileSync(path.resolve(__dirname, "./exampleResponse/svg.svg"));
        case ".png":
        case "image/png":
            return fs.readFileSync(path.resolve(__dirname, "./exampleResponse/png.png"));
        default:
            return "";
    }
};
