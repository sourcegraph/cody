# VS Code theme CSS files

We want to use the default VS Code theme colors here for accuracy and consistency. To regenerate this theme CSS from VS Code, go to https://vscode.dev and run the following JavaScript in the devtools console:

```js
copy(
  ':root {\n' +
    Array.from(document.querySelector('.monaco-workbench').computedStyleMap(), ([key, value]) => `    ${key}: ${value};`)
    .filter(s =>
      /--vscode-/.test(s) &&
        // we don't need all the codicon lines
        !/--vscode-icon-.*-content/.test(s) &&
        !/--vscode-icon-.*-family/.test(s)
    )
    .join('\n') +
  '\n}'
)
```

The stylesheet will now be on your pasteboard to paste into the relevant themes file.
