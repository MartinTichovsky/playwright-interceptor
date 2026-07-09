function exampleJsCode(path) {
    const id = `${path}_loaded`;
    const div = document.createElement("div");
    div.innerHTML = id;
    wrapInSection(id, div);
}
