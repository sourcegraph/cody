## Checklist

- Commands
    - [ ] [Explain](#explain)
    - [ ] [Edit](#edit)
    - [ ] [Test](#test)
    - [ ] [Document](#document)
    - [ ] [Smell](#smell)
    - [ ] [Code Actions](#code-actions)
    - [ ] [Custom Commands](#custom-commands)
- Chat
    - [ ] [Chat UX](#chat-ux)
    - [ ] [Chats lefthand panel](#chats-lefthand-panel)
    - [ ] [Enhanced Context](#enhanced-context)
    - [ ] [LLM Selection](#llm-selection)
- [Search](#search)
- Autocomplete
    - [ ] [Manual trigger key binding](#manual-trigger-key-binding)
    - [ ] [Language ignore list](#language-ignore-list)
    - [ ] [LLM selection](#llm-selection)
    - [ ] [Multi-line completions](#multi-line-completions)
    - [ ] [Telemetry and analytics](#telemetry-and-analytics)

## Commands

### Explain
- [ ] Verify that the option to run the `Explain` command is available from the sidebar, right-click menu, or from the command palette (option+c, /explain). 
- [ ] Highlight a section of code. 
- [ ] Run the `Explain` command and verify that Cody provides an explanation of the selected code in a new chat window.
- [ ] Do not select any code (just place your cursor in an open file), run the `Explain` command, and verify that Cody explains the code that's visible in the file. 
- [ ] Verify that the chat executed by running the command appears in the chat list in the lefthand panel. 

### Edit

#### Editing code
- [ ] Verify that the option to run the `Edit` command is available from the sidebar, right-click menu, the command palette (option+c, /edit), or Option+K keyboard shortcut.
- [ ] Highlight a section of code.
- [ ] Run the `Edit` command with instructions for how Cody should edit the selected code. 
- [ ] Verify that Cody automatically applies edits to the selected code, per the user’s instructions.
- [ ] Verify that there is a notification that "Cody is working..." while edits are being applied. 
- [ ] Verify that you can see a list of code lenses with a Cody icon above the generated code: `Show diff`, `Accept`, `Retry`, and `Undo`.
- [ ] Verify that you can see a diff view of the edit in a new tab by clicking `Show diff`.
- [ ] Verify that you can prompt Cody to retry the command by clicking `Retry` and entering new instructions.
- [ ] Verify that you can undo the edit by clicking `Undo`.
- [ ] Verify that the ghost text disappears by clicking `Accept`.

#### Editing code (Additional Configuration)
- [ ] Highlight a section of code.
- [ ] Trigger the Edit shortcut with Option+K
- [ ] Try to add a file to the Edit instruction, by using "@" and searching for a file
- [ ] Try to add a symbol to the Edit instruction, by using "@#" and searching for a symbol
- [ ] Try to change the range of the Edit, by selecting "Range". Check that navigating through the options correctly updates the range shown in the editor.
- [ ] Try to change the model of the Edit, by selecting "Model".
- [ ] Submit edits after changing the above values, and check that the Edit performs correctly (e.g. uses correct range, uses correct context)
- [ ] Verify that the selected configuration is shown in the input after clicking "Retry" on a completed edit.
- [ ] Verify that you can still change the configuration shown in the input after clicking "Retry" on a completed edit.

#### Generating code
- [ ] Move the cursor to an empty line, do not highlight any selection.
- [ ] Verify that the option to run the `Edit` command is available from the sidebar, right-click menu, the command palette (option+c, /edit), or Option+K keyboard shortcut.
- [ ] Run the `Edit` command with instructions for what Cody should generate.
- [ ] Verify that there is a notification that "Cody is working..." while code is being generated.
- [ ] Verify that, per the user’s instructions, Cody automatically streams the generated code into the document, line-by-line.
- [ ] Verify that you can see a diff view of the edit in a new tab by clicking `Show diff`.
- [ ] Verify that you can prompt Cody to retry the command by clicking `Retry` and entering new instructions.
- [ ] Verify that you can undo the edit by clicking `Undo`.
- [ ] Verify that the ghost text disappears by clicking `Accept`.

### Test
- [ ] Verify that the option to run the `Test` command is available from the sidebar, right-click menu, or from the command palette (option+c, /test).
- [ ] Highlight a section of code.
- [ ] Run the `Test` command. 
- [ ] Verify that in a new chat window, Cody generates code for a unit test for the selected code.
- [ ] Verify that the chat executed by running the command appears in the chat list in the left hand panel. 

### Document
- [ ] Verify that the option to run the `Document` command is available from the sidebar, right-click menu, or from the command palette (option+c, /doc).
- [ ] Highlight a section of code.
- [ ] Verify that there is a notification that "Cody is working..." while Cody generates documentation.
- [ ] Verify that you can see a diff view of the generated documentation in a new tab by clicking `Show diff`.
- [ ] Verify that you can prompt Cody to retry the command by clicking `Retry` and entering new instructions.
- [ ] Verify that you can undo the documentation by clicking `Undo`.
- [ ] Verify that the ghost text disappears by clicking `Accept`.
- [ ] Do not select any code (just place your cursor in an open file), run the doc command, and verify that Cody provides documentation for the code that’s within the correct range of your cursor. 

### Smell
- [ ] Verify that the option to run the `Smell` command on the selected code is available from the sidebar, right-click menu, or from the command palette (option+c, /smell).
- [ ] Highlight a section of code.
- [ ] Run the `Smell` command and verify that Cody provides suggestion for how to improve the selected code in a new chat window.
- [ ] Verify that the chat executed by running the command appears in the chat list in the left hand panel. 

### Code Actions

#### Fixing code
- [ ] Deliberately break a line or section of code to trigger the IDE’s red squiggly error warning.
- [ ] Click the Code Action (in VSC) lightbulb icon in the project file
- [ ] Select `Ask Cody to fix`.
- [ ] Verify that there is a notification that "Cody is working..." while edits are being applied.
- [ ] Verify that Cody automatically applies a code fix to the selected code.
- [ ] Verify that you can see a diff view of the fix in a new tab by clicking `Show diff`.
- [ ] Verify that you can prompt Cody to retry the command by clicking `Retry` and entering new instructions.
- [ ] Verify that you can undo the fix by clicking `Undo`.
- [ ] Verify that the ghost text disappears by clicking `Accept`.


#### Explaining code
- [ ] Deliberately break a line or section of code to trigger the IDE’s red squiggly error warning.
- [ ] Click the Code Action lightbulb icon in the project file
- [ ] Select `Ask Cody to explain`.
- [ ] Verify that Cody provides an explanation of the error in a new chat window.
- [ ] Verify that the chat executed by running the command appears in the chat list in the left hand panel.

#### Editing 
- [ ] Highlight a section of code.
- [ ] Click the Code Action lightbulb icon in the project file
- [ ] Select `Ask Cody to Edit`.
- [ ] Provide instructions for how Cody should edit the selected code.
- [ ] Verify that there is a notification that "Cody is working..." while edits are being applied.
- [ ] Verify that Cody automatically applies edits to the selected code, per the user’s instructions
- [ ] Verify that you can see a diff view of the edit in a new tab by clicking `Show diff`.
- [ ] Verify that you can prompt Cody to retry the command by clicking `Retry` and entering new instructions.
- [ ] Verify that you can undo the edit by clicking `Undo`.
- [ ] Verify that the ghost text disappears by clicking `Accept`.

#### Generating code
- [ ] Move the cursor to an empty line, do not highlight any selection.
- [ ] Click the Code Action lightbulb icon in the project file.
- [ ] Select `Ask Cody to Generate`.
- [ ] Provide instructions for what Cody should generate.
- [ ] Verify that there is a notification that "Cody is working..." while code is being generated.
- [ ] Verify that, per the user’s instructions, Cody automatically streams the generated code into the document, line-by-line.
- [ ] Verify that you can see a diff view of the edit in a new tab by clicking `Show diff`.
- [ ] Verify that you can prompt Cody to retry the command by clicking `Retry` and entering new instructions.
- [ ] Verify that you can undo the edit by clicking `Undo`.
- [ ] Verify that the ghost text disappears by clicking `Accept`.

### Custom Commands

#### Create a custom command using the command builder
- [ ] Click the `Custom` command in the left hand panel or from the command palette (option+c, Configure Custom Commands) and select `New Custom Command`.
- [ ] Enter the title of a new custom command (e.g., `recent-git-changes`) and press enter.
- [ ] Verify that you cannot use a title that already exists.
- [ ] Enter a description for the command (e.g., `Summarize recent changes`) and press enter.
- [ ] Enter the instructions that Cody should follow (e.g., `Summarize the given git changes in 3-5 sentences`). 
- [ ] Choose where to save the command (User Settings or Workspace Settings).

#### Create a custom command by editing the configuration JSON file
- [ ] Click the “Custom” command in the left hand panel or from the command palette (option+c, Configure Custom Commands) and select “Configure Custom Commands”
- [ ] Select “Open User Settings (JSON)”
- [ ] Add a new custom command, eg: 

```
{
    "commands": {
        "recent-git-changes": {
            "prompt": "Summarize the recent git changes in 3-5 sentences",
            "context": {
                "codebase": false
            },
            "description": "Summarize recent git changes",
        }       
    }
}
```
- [ ] Open “Configure Custom Commands” again and select “Open Workspace Settings (JSON)” and add a different custom command.

#### Verify cusom command
- [ ] Select the `Custom` command from the left hand panel and verify that the newly created custom command is available in the command palette. 
- [ ] Run the newly created command and verify its behavior. (Eg, for `/recent-git-changes`, you should see Cody summarize the recent git changes in the chat window).
- [ ] Click the `Custom` command in the left hand panel or from the command palette (option+c) and select “Configure Custom Commands”.
- [ ] Select “Open User Settings (JSON)” and verify that the command saved to User Settings is in the JSON file.
- [ ] Select “Open Workspace Settings (JSON)” and verify that the command saved to Workspace Settings in the JSON file.

## Chat

### Chat UX
- [ ] Verify that you can open a new chat window by selecting `Chat` in the `Commands` left hand panel, hovering over the header in the `Chats` left hand panel, or with the option+/ keyboard shortcut.
- [ ] Ask Cody a question in the chat window. The question should include a request for Cody to generate code.
- [ ] Verify that Cody has a loading state when generating a response.
- [ ] Verify that you can stop Cody from continuing to generate a response.
- [ ] Verify that you can select options to insert the code at the cursor in the file, copy the code to your clipboard, or create a new file containing the generated code.
- [ ] Verify that you can ask Cody a follow-up question within the same chat window and that Cody will generate a response. 
- [ ] Verify that you can edit a previous chat prompt and get a new answer from Cody. 

### Chats lefthand panel
- [ ] Verify that you can delete all chats by hovering over the header in the “Chats” panel and selecting the trashcan icon.
- [ ] Verify that you can delete an individual chat by hovering over an individual chat in the “Chats” panel and selecting the trashcan icon.
- [ ] Verify that you can start a new chat by hovering over the header in the “Chats” panel and selecting the speech bubble icon.
- [ ] Verify that all new chats appear as a list in the “Chats” panel and that they persist across sessions.
- [ ] Verify that selecting an individual chat within the “Chats” panel opens up the chat in a new window and that the conversation has persisted.

### Enhanced Context
- [ ] Open a chat window and select the "Enhanced Context" icon next to the chat input. 
- [ ] Verify that "Enhanced Context" is enabled by default. 
- [ ] Sign in as a Free or Pro user, open a project, and verify that you have the ability to generate embeddings for your project by clicking `Enable embeddings`.
- [ ] Click `Enable embeddings` and verify that embeddings begin to index. 
- [ ] In a new chat window, select the "Enhanced Context" icon, disable enhanced context, submit a question in the chat input, and verify that Cody did not use any code context to generate an answer. 
- [ ] Enable "Enhanced Context" and verify that Cody used code files as context. 
- [ ] At the top of the chat transcript, use the arrow dropdown to display the code that Cody used as context. 
- [ ] From the list of files that Cody used as context, select one of the `@` files that *exists locally* and verify that the correct file opens in a new tab at the correct line number. 
- [ ] From the list of files that Cody used as context, select one of the `@` files that *does not exist locally* and verify that Cody opens in the browser instead. 
- [ ] In the chat input, verify that typing `@` suggests files to add as context, and typing `@#` suggests symbols to add as context. 
- [ ] Verify that you can use a relative file path to choose a file to add as context (e.g., `src/util/my-file`).

### LLM Selection
- [ ] Sign in as a Free user, open a new chat, and verify that the default LLM is Claude 2, and there is no option to switch LLMs (without upgrading to Pro).
- [ ] Sign in as a Pro user and verify that there is a list of LLM options and you can switch between them. 
- [ ] Sign in as an enterprise user and verify that you cannot change the LLM. 

## Search

- [ ] In the `Search` lefthand panel, enter a natural language query (e.g., "enhanced context logic") and verify that search results are displayed. 
- [ ] Select one of the search results and verify that the correct file opens in a new tab. 

## Autocomplete
Primary languages to test: Javascript, Typescript, TypescriptReact, Python, Go

### Manual trigger key binding
- [ ] Log in to the VS Code extension as a Free user.
- [ ] Generate a completion using the manual-trigger key binding.
- [ ] Verify that the completion is generated at the current cursor position.

### Language ignore list
- [ ] Log in to the VS Code extension as a Free user.
- [ ] Generate completion for file in the X programming language.
- [ ] Open VS Code settings, find the language ignore list, and add this language to the list
- [ ] Verify that completions are no longer generated for this language.

### LLM selection
- [ ] Log in to the VS Code extension as a Free user.
- [ ] Generate completion using the LLM selected by default.
- [ ] Open VS Code settings and find Cody autocomplete mode settings.
    - Combinations to test:
        - [ ] Provider: fireworks; Model: starcoder-16 and starcoder-7b
        - [ ] Provider: anthropic; Model: null
- [ ] Verify that autocomplete works as expected after the settings change.

### Multi-line completions
- [ ] Open a TypeScript file. Paste in something like this: `function bubbleSort(`.
- [ ] Expect more than one line of code being completed for you.

### Telemetry and analytics:
- [ ] Open the Autocomplete Trace View (cmd+shift+p “trace view”)
- [ ] In another editor tab, trigger an autocomplete request.
- [ ] Expect the number of shown/accepted completions to update accordingly.

