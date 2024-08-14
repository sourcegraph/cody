# Shared prompt editor UI component

The `@sourcegraph/prompt-editor` package contains the code for the prompt editor UI component.

## Development notes

- Put [UI component storybooks](https://storybook.js.org/) in `vscode/webviews/promptEditor`, not here, so that these components' storybooks can use the VS Code theme switching that we have for those storybooks.
