## Checklist

- Onboarding
    - [ ] [Sign in with GitHub, GitLab and Google](#sign-in-with-github-gitlab-and-google)
    - [ ] [Remove all accounts](#remove-all-accounts)
- Autocomplete
    - [ ] [Single-line autocomplete](#single-line-autocomplete)
    - [ ] [Multi-line autocomplete](#multi-line-autocomplete)
    - [ ] [Infilling autocomplete](#infilling-autocomplete)
    - [ ] [Cycle through autocomplete](#cycle-through-autocomplete)
- Commands
    - [ ] [General commands availability in Cody tool window](#general-commands-availability-in-cody-tool-window)
    - [ ] [General commands availability in context menu](#general-commands-availability-in-context-menu)
    - [ ] [Explain Selected Code](#explain-code)
    - [ ] [Smell Code](#smell-code)
- Chat
    - [ ] [Autoscroll to latest message](#autoscroll-to-latest-message)
    - [ ] [Read chat history without interruptions](#read-chat-history-without-interruptions)
    - [ ] [Organize multiple chats](#organize-multiple-chats)
    - [ ] [Isolate multiple chats](#isolate-multiple-chats)
    - [ ] [Up Down Arrow Keys](#up-down-arrow-keys)
- Inline Edit
    - [ ] [Instructions dialog](#instructions-dialog)
- Multi-repo context
    - [ ] [Free/pro accounts:](#freepro-accounts)
    - [ ] [Enterprise accounts:](#enterprise-accounts)
- Sourcegraph Code Search
    - [ ] [Find with Sourcegraph...](#find-with-sourcegraph)
    - [ ] [Search Selection on Sourcegraph Web](#search-selection-on-sourcegraph-web)
    - [ ] [Search Selection in Repository on Sourcegraph Web](#search-selection-in-repository-on-sourcegraph-web)
    - [ ] [Open Selection on Sourcegraph Web](#open-selection-on-sourcegraph-web)
    - [ ] [Copy Sourcegraph File Link](#copy-sourcegraph-file-link)
- Product-led growth
    - [ ] [My Account Tab](#my-account-tab)
    - [ ] [Cody Free/Pro rate limit errors](#cody-freepro-rate-limit-errors)
- Other
    - [ ] [Automatic repository recognition](#automatic-repository-recognition)
    - [ ] [Persistent custom repository](#persistent-custom-repository)
    - [ ] [Colour scheme changes](#colour-scheme-changes)
- Context
    - [ ] [PLG / SYMF / Local Keyword search](#local-keyword-search)
- Model dropdown
    - [ ] [Pro Account](#pro-account)
    - [ ] [Free Account](#free-account)
    - [ ] [Pro Account after trial](#pro-account-after-trial)
    - [ ] [Enterprise account](#enterprise-account)
- Inline Edit
    - [ ] [Show Diff](#show-diff)

## Onboarding

### Sign in with GitHub, GitLab and Google

Prerequisite: You have to **sign out** from all existing accounts.

1. Navigate to `Cody` tool window and use `Sign in with GitHub`.
2. Browser is launched automatically and IDE freezes with spinning `Login to Sourcegraph` dialog.
3. Authorize with a valid account.

#### Expected behaviour

* IDE should receive a valid token automatically.
* `Commands` and `Chat` tabs are ready to use.

Verify the remaining SSO methods by performing the same steps for `Sign in with GitLab` and `Sign in with Google`.

### Remove all accounts

Prerequisite: You have to be **signed in**. This is important because we expect certain components to be refreshed
automatically.

1. Navigate to `Settings` > `Sourcegraph & Cody`.
2. Remove all accounts and apply settings.

#### Expected behaviour

* `Cody` tool window is automatically refreshed and the user is greeted with the `Welcome to Cody` panel.
* Status bar widget has a `No account signed-in` status. Status bar is located in the bottom right corner of the IDE.

## Autocomplete

### Single-line autocomplete

1. Paste the following Java code:
    ```java
    // print Hello World!
    System.out.
    ```
2. Place a cursor at the end of the `System.out.` line.
3. Trigger autocompletion with <kbd>Alt</kbd> + `\` (or <kbd>option</kbd> + `\` on Mac).

#### Expected behaviour

![single_line_autocomplete.png](docs/single_line_autocomplete.png)

### Multi-line autocomplete

1. Paste the following Java code:
    ```java
    public void bubbleSort(int[] array) {
    ```
2. Place the cursor at the end of the line.
3. Trigger autocompletion with <kbd>Alt</kbd> + `\` (or <kbd>option</kbd> + `\` on Mac).

#### Expected behaviour

![multiline_autocomplete.png](docs/multiline_autocomplete.png)

### Infilling autocomplete

1. Paste the following Java code:
    ```java
    // print
    System.out.println("Hello World!");
    ```
2. Place cursor at the end of the `// print ` line.
3. Trigger autocompletion with <kbd>Alt</kbd> + `\` (or <kbd>option</kbd> + `\` on Mac).

#### Expected behaviour

![multiline_autocomplete.png](docs/infilling_autocomplete.png)

### Cycle through autocomplete

1. Paste the following Java code:
    ```java
    public void bubbleSort(int[] array) {
    ```
2. Place the cursor at the end of the line.
3. Cycle forward with <kbd>Alt</kbd> + <kbd>]</kbd> or backward with <kbd>Alt</kbd> + <kbd>[</kbd>. (<kbd>option</kbd> + <kbd>[</kbd> or <kbd>]</kbd> for Mac)

#### Expected behaviour

![cycle_through_autocomplete.gif](docs/cycle_through_autocomplete.gif)

## Commands

### General commands availability in Cody tool window

1. Navigate to `Cody` tool window and open `Commands`.

#### Expected behaviour

* List of commands is immediately available after the tool window is displayed. **No refresh is required.**

### General commands availability from keyboard shortcuts

| Command            | Windows / Linux                                  | MacOs                                                    |
|--------------------|--------------------------------------------------|----------------------------------------------------------|
| Explain Code       | <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>1</kbd> | <kbd>control</kbd> + <kbd>Shift</kbd> + <kbd>E</kbd>     |
| Smell Code         | <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>2</kbd> | <kbd>control</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd>     |
| Edit Code          |                                                  | <kbd>control</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd> |
| Document Code      |                                                  | <kbd>control</kbd> + <kbd>Shift</kbd> + <kbd>H</kbd>     |
| Generate Unit Test |                                                  | <kbd>control</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd>     |

#### Expected behaviour

* Commands work as executed from any other place (the tool window opens if needed).

### General commands availability in context menu

1. Open file with source code and select some fragment.
2. Show context menu with right mouse button, navigate to `Cody`, and choose one of the commands.

#### Expected behaviour

* All commands are visible in Cody context menu and can be selected.
* All commands are visible in the Commands panel and can be selected.
* All commands works after selection.

### General commands availability when selection is active

1. Open file with source code and select some fragment.
2. Visually confirm that the hotkeys for Edit and Chat are displayed at the end of the selection.

#### Expected behaviour

It should show something like this: `Ctrl + Shift + ⏎ to Edit`
(Note: that text above is not intended to be accurate. The actual hotkeys displayed
should match whatever we have most recently set them to; they change now and then.)

* There should only be one hint visible at a time, and should update as the selection changes.
* The hint should disappear as soon as the selection disappears.
* The hotkeys displayed in the hint should be correct.
* The colors chosen should be clearly visible on all themes.
* It is OK if the hint is not visible in some places because it's offscreen.
* The hint should not appear in any views/panes in the IDE other than code editor tabs.
* The hint should not appear if there is an active edit session.

### Explain Code

1. Paste the following Java code:
    ```java
    System.out.println("Hello, Cody!");
    ```
2. Select line and use `Cody | Commands | Explain Code`.

#### Expected behaviour

* User is automatically switched to `Chat` tab.
* Chat responds with a description of the selected code and will elaborate on the fields, classes, and
  methods, going into technical details, often structuring the text in bullet points.

### Smell Code

1. Paste the following Java code:
    ```java
    public static String greet(String name) {
        return "Hello, " + name + "!";
    }
    ```
2. Select line and use `Cody | Commands | Smell Code`

#### Expected behaviour

* User is automatically switched to `Chat` tab.
* Chat responds with **potential issues** and **suggestions** like missing nullability checks or input sanitization (
  response may vary).

### Edit Code

#### Instructions Dialog

Unless otherwise specified, all tests for the dialog begin with:
1. Open any source file.
2. Right-click in the file to bring up the code context menu.
    - alternatively, position your caret in the editor and type ctrl+shift+enter or select Edit Code from the Commands panel.
3. Choose Cody, then Edit Code. Confirm that the dialog appears.

All tests involving prompt history should end with:
1. Close and reopen the current Project to clear prompt history.

#### Appearance and behavior

1. Open the dialog and check its position.
    - Dialog should always appear beneath the line you chose/clicked on.
    - The horizontal position of the dialog is always the same, indented a bit from the left edge.
    - Dialog always remains floating on top of the IDE and is not obsured by other IDE windows.
2. Observe the dialog's appearance.
    - Dialog has rounded corners.
3. Switch IDE themes by going to Settings and choosing a new theme.
    - Dialog's colors should change to match the new theme.
4. Check the dialog's mouse interaction and modality:
    - Dialog can be dragged by clicking and dragging in the "title bar" area.
    - Dialog can be resized by carefully positioning the cursor at the corners and dragging.
5. Close the dialog, and press Ctrl+Shift+Enter (Mac)
    - Dialog should appear, just as if it had been opened with the context menu

#### Layout

1. Open the dialog and check the layout.
    - The file path suffix is displayed, truncated with ellipsis if needed.
    - The instructions field is empty and is displaying the "ghost text" help.
    - The history widget is not shown in the bottom center.
    - The Edit Code button is initially disabled.
2. Type some non-whitespace text into the text field.
    - The Edit Code button is enabled.
3. Delete all the text in the text field.
    - The Edit Code button is disabled.
4. Click the expansion icon at the right of the text field.
    - The text field expands to allow more of your instructions to be visible.
    - You can collapse it to return to the regular view.
5. Change the IDE font size to 22 and try the dialog. It should lay out correctly.
    - then try at font size 6 to ensure it works there too.


#### File Path

1. Open a project file with a pathname of 80+ characters, then the Instructions dialog.
    - The tail end of the path should be displayed, with the first part replaced with "…".
2. Hover over the truncated file path.
    - It should pop up a tooltip with the full/absolute file path.

#### Closing

1. Press the ESC key while the dialog has the focus.
    - Dialog should always close, no matter which component in the dialog has the focus.
2. Mouse-click the "[esc] to cancel" label in the lower left.
    - Dialog should close.
3. Close the editor tab from which the dialog was opened.
    - Dialog should close along with the tab.
4. With text in the instructions field, press the OS-specific hotkey shown next to Edit Code.
    - The dialog should close and initiate an Edit request.

#### History

1. Type "one" into the text field (or anything you like as the first history item).
2. Click Edit Code to submit the edit command, which closes the dialog.
    - Then cancel the running command with the Cancel code lens.
3. Reopen the instructions dialog anywhere in the document (or even another tab).
    - The text field should now contain the text "one".
    - The `↑↓ for history` label should now appear at the bottom of the dialog.
    - Typing the up/down the arrows at this point only moves the cursor.
4. Replace the text with "two", then oncce again Edit Code, cancel op, and reopen dialog.
    - Text field contents should now be "two".
    - Up/down arrows should cycle between "one" and "two".
5. Type "my long instruction" into the text field. (Anything longer than 10 characters.)
    - Up-arrow should take you to the most recent history item.
    - Cycling the arrows, you should now also find "my long instruction" in the history.

#### Model dropdown

1. When signed in to an Enterprise account, verify that the model dropdown is not present in the dialog.
2. When signed in to a Cody Free or Cody Pro account, verify that the model dropdown is available in the dialog.
3. When signed in to a Cody Free or Cody Pro user, click the model dropdown and ensure that it shows the same models as the dropdown in the Chat window.

#### Applying an edit

1. Open the dialog, enter a valid instruction, such as "add comment", and press Edit Code.
2. Verify that Cody has applied the edits inline according to your instructions.

### Document Code

1. Open any project file and highlight a selection of code.
2. Use the keyboard shortcut, Cody context menu, or option in the Commands panel to execute the Document Code command.
    - Cody should apply documentation above the selected code.
4. Move your cursor inside of a different function in the file without highlighting any code.
5. Execute the Document command.
    - Cody should apply documentation above the function that contains your cursor.

### Generate Unit Test

1. Open a project file that does not have any associated test files.
2. Highlight a selection of code.
3. Use the keyboard shortcut, Cody context menu, or option in the Commands panel to execute the Document Code command.
    - Cody should create a new, unsaved test file, adds the suggested unit tests to the file, and recommends a name/location for the file to be saved to.
5. Open a project file that *does* have an associated test file.
6. Execute the Document Code command.
   - Cody should add the suggested unit tests to the bottom of the existing test file.
8. Instead of highlighting code, leave your cursor in a line on the file and execute the Document Code command.
    - Cody should treat the function containing your cursor as "highlighted code" and perform the same behaviors as above.

### Code Lenses

1. Execute any inline edit command (Edit Code, Document Code, or Generate Unit Test)
2. While an inline edit command is in progress, there should be a code lens indicating that the command is in progress and an option to Cancel.
    - Hitting Cancel aborts the command
3. Once a command has been executed, there should be a code lens with options to Accept, Undo, Edit & Retry, or Show Diff and their associated keyboard shortcuts.
    - Clicking or using the shortcut to Accept applies the inline edit and removes the code lens
    - Clicking or using the shortcut to Undo removes the inline edit as well as the code lens
    - Clicking or using the shortcut to Edit & Retry opens the Edit Code dialog, undoes the initial edit, and applies new edits according to your new instructions.
    - Clicking or using the shortcut to Show Diff opens a new tab with a diff view of the edits.

#### Lens group indentation

1. Execute any inline edit command.
2. Observe where the first "Cody is working" code lens group is positioned.
   - if there is a nonblank line below the lens group, then the first widget
     (the Cody logo, a spinner, etc.) should be indented to the same indentation
     level as the first non-blank line in the code beneath the lens group.
   - if there is no next non-blank line, the lens group should indent 20 pixels
   - It is not a bug is the first widget is positioned only "close" to the first
     character of the next line, within a character's width on either side of
     the leftmost widget. But if it is indented much more or less, it is a bug.
3. Wait until the Accept (or Error) lens group appears.
   - Follow the steps above to verify that the first widget is indented the same way.

#### Lens layout and and appearance

1. Initiate an inline edit and wait for the Accept lens group to appear.
2. Switch IDE themes while the lenses are visible.
   - Verify that the lenses switch to match the new theme.
     - Note that the "buttons" remain dark on light themes.
3. Keeping the code lenses visible, test it with different font sizes.
   - In Settings/Preferences, change the Editor font size to 6
     - Scroll until the code lenses are visible again, if necessary.
     - Verify that they are drawing correctly for the new size.
     - The widgets should not be taller than the inlay, padding should look right, etc.
     - Try it all over again at font size 26 or higher. Everything in the lenses should still look good.
4. While you have it set to a large font size, test the Working lens group.
   - Undo the current inline edit
   - Initiate a new inline edit, ideally one that will take a while
     - For instance, you could make a large selection of 50+ lines and ask the LLM to add thorough inline comments.
   - While Cody is "thinking", you should see the Working lens group.
     - Check that the spinner is spinning, and is sized and positioned correctly when the font is large.
     - Check that no other widgets are drawing out of bounds or oddly in some other way.
5. Ensure that the Cody Logo, present in all lens groups, is scaling with the font size.

### Important additional notes for testing inline edit commands (Edit, Document, and Test)

It is critical to test sequential commands and insure that each command continues to behave as expected: 
- Run multiple Edit commands and try each of the code lenses
- Run multiple Document commands and try each of the code lenses
- Run multiple Test commands and try each of the code lenses
- Run various combinations of commands (e.g. Run a Document command, then a Test command, and then an Edit) 

## Chat

### Autoscroll to latest message

1. Fill the `Chat` with messages until the scrollbar appears.
2. Scroll all the way down.
3. Add new message.

#### Expected behaviour

* Scrollbar is **automatically** scrolled to the bottom. New message tokens are visible.

### Read chat history without interruptions

1. Fill the `Chat` with messages until the scrollbar appears.
2. Scroll up. Latest message should be not visible or partially visible.
3. Add new message.

#### Expected behaviour

* Scrollbar is **not moving automatically** while new message tokens are generated. You can easily read older messages
  without interruptions and scrolling is smooth.

### Organize multiple chats

You should be able to organize multiple chats and follow up previous conversations.
Cody should "remember" your questions and chat responses, even after closing IDE.

#### Happy path

1. Start a new chat
2. Send message similar to `my favorite color is blue`
3. Close IDE
4. Run IDE and open previous conversation
5. Ask `what's my favorite color?`
6. Response should be similar to `your favorite color is blue`

#### (optional) Test ideas

Useful tips:

* Transcript data is located in `PROJECT_DIR/.idea/cody_history.xml`.
* You can force-save transcript by using the `Ctrl` + `S`.

Test ideas:

1. Delete "active" chat. You should be able to delete the currently opened chat. Messages should be removed from Chat
   tab.
2. Restore historical chat, focus on chat input field and use UP/DOWN keys to cycle between previous questions.
3. Press "new chat" as fast as you can. Especially during the IDE startup.
4. Switch between chats as fast as you can.
5. Press "new chat" while being inside `My Account` tab or something other than Chat tab. Tabs should switch
   automatically.
6. Use commands/recipes inside empty, new chat. Verify serialization/deserialization.
7. Ask about codebase to force response with listed context files and verify if everything is correctly
   serialized/deserialized. Links to context files should be clickable.
8. Remove all chats using history UI. Tree presentation is empty and branches like "Today" are removed from panel. File
   with transcripts should also disappear.
9. Use only the keyboard. For example, navigate transcripts with arrows, delete, enter.
10. Start typing while being focused on Chat History to perform search-by-title.
11. Open multiple chats and ask few simultaneous questions in several sessions at once.
12. Open new chat with <kbd>Alt</kbd> + <kbd>=</kbd> shortcut (or <kbd>Option</kbd> + <kbd>=</kbd> on Mac).
13. Open existing chat with shortcut <kbd>Alt</kbd> + <kbd>-</kbd> (or <kbd>Option</kbd> + <kbd>-</kbd> on Mac) and
    start typing question. Tab should be switched automatically on Chat.
14. Second click <kbd>Alt</kbd> + <kbd-</kbd> should hide tool window if focused (similar behavior as other tool
    windows).
15. Click <kbd>Esc</kbd> while being focused inside Cody tool window. You should be automatically focused on code.

#### Isolate multiple chats

Prerequisite: You need two working accounts. Preferably one Free, and one Enterprise.

1. Switch to first account.
2. Send a message.
3. Switch to second account.
4. Send a message.

These two chats should be isolated between different accounts. Both accounts should have one conversation each.

You should also be able to switch between accounts while tokens are still being generated.

### `@-file` tagging

1. Open Cody chat
2. Type `@` in the chat input and verify that a list of available local files appears.
3. Select one of the files from the list for Cody to use as chat context.
4. Ask Cody a question about that file and verify that the answer is correct.

Note: It's important to test performance on large repos here.

#### Up Down arrow keys

1. Start new chat
2. Submit message "Hello". Confirm you get a reply and that the chat input is empty.
3. Press `Up` arrow. Confirm that the chat input is populated with the message "Hello".
4. Empty chat input and type multiline message "A\n\nB"
5. Press `Up` arrow. Confirm that the caret is positioned in the empty line between A and B.

### Cody Ignore

When testing Cody Ignore, please reload the editor after each policy change. Outside of the required testing steps, please also make sure general product usability is not affected when Cody Ignore policies are turned on.

Please use the SG02 endpoint to test and change Cody Ignore configuration.

| Policy | Workspace Repository| Test Steps |
| --- | --- | --- |
| ```"cody.contextFilters": {"exclude": [{"repoNamePattern": "^github\\.com\\/sourcegraph\\/cody"}],                        "include": [{"repoNamePattern": "^github\\.com\\/sourcegraph\\/.+"}]}``` |  github.com/sourcegraph/sourcegraph | Chat: <ol><li>Verify chat works as normal by asking Cody any question and receiving a response back.</li><li>Add github.com/sourcegraph/cody to the repo context selector and verify that there is a striked out symbol in the Repositories dropdown</li><li>Ask Cody "How do you contribute to Cody?" and confirm that no files from the Cody repository was used for context </li></ol>Autocomplete: <ol><li>Verify that autocomplete works as normal in any file in the github.com/sourcegraph/sourcegraph repository</ol>Commands: <ol><li>Verify that commands (Edit, Document, Test, Smell) are possible on any file in github.com/sourcegraph/sourcegraph.</li></ol> |
| ```"cody.contextFilters": {"exclude": [{"repoNamePattern": "^github\\.com\\/sourcegraph\\/cody"}],                          "include": [{"repoNamePattern": "^github\\.com\\/sourcegraph\\/.+"}]}``` |  github.com/sourcegraph/cody | Chat:<ol><li>Verify chat works as normal by asking Cody any question and receiving a response back.</li><li>Open the Enhanced Context menu and verify that it shows the github.com/sourcegraph/cody repo is ignored, on hover explaining this is due to an admin policy.</li><li>@-mention any files in the github.com/sourcegraph/cody repo and verify that the user sees a disclaimer that the file is ignored upon selection.</li><li>Submit a chat with an @-file and verify that the file is crossed out and excluded in the context dropdown</li><li>Verify that the user can add the github.com/sourcegraph/sourcegraph and github.com/sourcegraph/jetbrains repos through the context popup menu for Enhanced context.</li></ol>Autocomplete:<ol><li>Verify that no autocomplete suggestions are possible on any files in the github.com/sourcegraph/cody repo.</li><li>Verify that the status bar reflects that autocomplete is disabled due to an Ignore policy.</li><li>Manually trigger autocompletes in any files in the github.com/sourcegraph/cody repo and verify that a notification is always triggered.</li></ol>Commands:<ol><li>While in any files in the github.com/sourcegraph/cody repo, verify that the sidebar shows commands are disabled, with a "Learn more" link directing to the Cody Ignore docs.</li><li>Attempt to use the right-click menu to run commands in any files in the github.com/sourcegraph/cody repo and verify that they don't run and a notification is triggered.</li><li>Attempt to use a keyboard shortcut to run commands in any files in the github.com/sourcegraph/cody repo and verify that they don't run and a notification is triggered.</li><ol> |
| ```"cody.contextFilters": {"exclude": [{"repoNamePattern": "^github\\.com\\/sourcegraph\\/sourcegraph"}]}``` |  github.com/sourcegraph/sourcegraph    | Chat: <ol><li>Verify chat works as normal by asking Cody any question and receiving a response back.</li><li>Open the Enhanced Context menu and verify that it shows the github.com/sourcegraph/sourcegraph repo is ignored, on hover explaining this is due to an admin policy.</li><li>@-mention any files in the github.com/sourcegraph/sourcegraph repo and verify that the user sees a disclaimer that the file is ignored upon selection.</li><li>Submit a chat with an @-file and verify that the file is crossed out and excluded in the context dropdown</li><li>Verify that the user can add the github.com/sourcegraph/cody repo through the context popup menu for Enhanced context.</li></ol>Autocomplete: <ol><li>Verify that no autocomplete suggestions are possible on any files in the github.com/sourcegraph/sourcegraph.</li><li>Verify that the status bar reflects that autocomplete is disabled due to an Ignore policy.</li><li>Attempt automatic autocompletes and verify that they are not possible.</li><li>Provide multiple automatic autocomplete attempts and verify that only one notification per session is provided when autocomplete is blocked.</li><li>Manually trigger autocompletes in any files in the github.com/sourcegraph/sourcegraph repo and verify that a notification is always triggered.</li></ol>Commands: <ol><li>While in any files in the github.com/sourcegraph/sourcegraph repo, verify that the sidebar shows commands are disabled, with a "Learn more" link directing to the Cody Ignore docs.</li><li>Attempt to use the right-click menu to run commands in any files in the github.com/sourcegraph/sourcegraph repo and verify that they don't run and a notification is triggered.</li><li>Attempt to use a keyboard shortcut to run commands in any files in the github.com/sourcegraph/sourcegraph repo and verify that they don't run and a notification is triggered.</li></ol> |
| ```"cody.contextFilters": {"exclude": [{"repoNamePattern": "^github\\.com\\/sourcegraph\\/sourcegraph"}]}``` |  github.com/sourcegraph/cody | Chat: <ol><li>Verify chat works as normal by asking Cody any question and receiving a response back.</li><li>Add github.com/sourcegraph/sourcegraph to the repo context selector and verify that there is a striked out symbol in the Repositories dropdown</li><li>Ask Cody "How do you contribute to Sourcegraph?" and confirm that no files from the Cody repository was used for context </li></ol>Autocomplete: <ol><li>Verify that autocomplete works as normal in any file in the github.com/sourcegraph/sourcegraph repository</ol>Commands: <ol><li>Verify that commands (Edit, Document, Test, Smell) are possible on any file in github.com/sourcegraph/sourcegraph.</li></ol> |
| ```"cody.contextFilters": {"include": [{"repoNamePattern": "^github\\.com\\/sourcegraph\\/sourcegraph"}]}``` |  github.com/sourcegraph/sourcegraph | Chat: <ol><li>Verify chat works as normal by asking Cody any question and receiving a response back.</li><li>Add github.com/sourcegraph/cody to the repo context selector and verify that there is a striked out symbol in the Repositories dropdown</li><li>Ask Cody "How do you contribute to Cody?" and confirm that no files from the Cody repository was used for context </li></ol>Autocomplete: <ol><li>Verify that autocomplete works as normal in any file in the github.com/sourcegraph/sourcegraph repository</ol>Commands: <ol><li>Verify that commands (Edit, Document, Test, Smell) are possible on any file in github.com/sourcegraph/sourcegraph.</li></ol> |
| ```"cody.contextFilters": {"include": [{"repoNamePattern": "^github\\.com\\/sourcegraph\\/sourcegraph"}]}``` |  github.com/sourcegraph/cody | Chat: <ol><li>Verify chat works as normal by asking Cody any question and receiving a response back.</li><li>Open the Enhanced Context menu and verify that it shows the github.com/sourcegraph/cody repo is ignored, on hover explaining this is due to an admin policy.</li><li>@-mention any files in the github.com/sourcegraph/cody repo and verify that the user sees a disclaimer that the file is ignored upon selection.</li><li>Submit a chat with an @-file and verify that the file is crossed out and excluded in the context dropdown</li><li>Verify that the user can add the github.com/sourcegraph/sourcegraph repo through the context popup menu for Enhanced context.</li></ol>Autocomplete: <ol><li>Verify that no autocomplete suggestions are possible on any files in the github.com/sourcegraph/cody repository.</li><li>Verify that the status bar reflects that autocomplete is disabled due to an Ignore policy.</li><li>Attempt automatic autocompletes and verify that they are not possible.</li><li>Provide multiple automatic autocomplete attempts and verify that only one notification per session is provided when autocomplete is blocked.</li><li>Manually trigger autocompletes in any files in the github.com/sourcegraph/sourcegraph repo and verify that a notification is always triggered.</li></ol>Commands: <ol><li>While in any files in the github.com/sourcegraph/cody repo, verify that the sidebar shows commands are disabled, with a "Learn more" link directing to the Cody Ignore docs.</li><li>Attempt to use the right-click menu to run commands in any files in the github.com/sourcegraph/cody repo and verify that they don't run and a notification is triggered.</li><li>Attempt to use a keyboard shortcut to run commands in any files in the github.com/sourcegraph/cody repo and verify that they don't run and a notification is triggered.</li></ol> |
| ```"cody.contextFilters" field not set``` |  any | All functionality should be working as normal |

#### Expected behavior

No matter what combination of include/exclude policies you use,
all of the following should be true for each test:

1. Whenever the current repo/file is ignored, inline edits and commands should stop working.
2. Chat should still work, but files from the ignored repositories should not be used as context.
3. When the current file's policy changes back to non-ignored, inline edits, commands, and context fetching
   should start working normally again.

## Windows and WSL

Cody should work correctly on Microsoft Windows setups that are configured with Windows Subsystem for Linux ("WSL").

The main thing to check is that a project or repo cloned onto a WSL volume should work. WSL volumes/drives have
paths that begin with either `\\wsl.localhost\` or `\\wsl$\` for short. Both are correct.

For these tests, make sure you have a WSL-enabled Windows setup, and clone a repo onto the WSL drive.
As an example, I cloned `github.com/redisson/redisson` (a medium-sized Java project) into my WSL home
directory: `\\wsl.localhost\Ubuntu\home\stevey\redisson`

1. Open the WSL project in IDEA.
  - The project should open correctly.
  - You should be able to browse and navigate to source files.
2. Check that Cody started up and has no errors.
3. Verify that Cody can explain some code from the project.
4. Verify that autocompletions work in the source code.
5. Verify that Inline Edits work in the source code. (Just checking one edit should be enough.)
6. Verify that Cody can explain open files inside jar files:
   - From the `Navigate` IDEA menu, `Symbol...` and verify that the Navigation dialog opens
     (with tabs for All, Class, Files, Symbols, ...)
   - Choose "Projects and Libraries" from the menu in the upper-right corner
   - Choose the Symbols tab
   - Type `Project` and from the dropdown, choose `Project of com.intellij.openapi.Project`
   - Verify that this opens the Project interface class in an editor tab
   - Locate the method in the interface, `getBaseDir()`:

```
     @Deprecated
     VirtualFile getBaseDir();
```
   - Select the whole second line (`VirtualFile getBaseDir()`)
   - Ask Cody to explain it. Cody should give a sensible explanation involving virtual files.

## Multi-repo context

### Free/pro accounts:

1. Open `sourcegraph/cody` project with non-enterprise account.
2. Open new chat and ask question about current repo (e.g. some class) - assistant should know the answer.
3. Open new chat and ask question about squirrel - assistant should describe you an animal.
4. Open new chat and disable local context. Ask about current repo (e.g. some class) - assistant should not have a
   context.
5. Close the IDE. Reopen the IDE.
    - Go to Chat History tab and open previous chats one by one. Both history and context settings are properly
      preserved.
    - Open new chat and check if it properly inherits all setting from previously opened historical chat

### Enterprise accounts:

1. Open `sourcegraph/cody` project with enterprise account.
2. Re-do all check from `Testing free/pro accounts` section but now with enterprise account.
3. Click [✏️] button in the context panel and type sourcegraph repo url (`github.com/sourcegraph/sourcegraph`)
    - Validator should block accepting incomplete or invalid URL.
    - Validator should highlight any repos added past a list of 10.
    - Add the `sourcegraph/sourcegraph` repo by hitting [CMD + Enter] (mac) [CTRL + ENTER] (windows) .
4. Open new chat and ask question about squirrel - assistant should describe you an HTTP server, **NOT** animal.
5. Open new chat and disable `sourcegraph/sourcegraph` remote repo context.
7. Ask question about squirrel. It should again describe you an animal or have no context.
8. Close the IDE. Reopen the IDE.
    - Go to Chat History tab and open previous chats one by one. Check if both history and context settings are properly
      preserved.
    - Open new chat and check if it properly inherits all setting from previously opened historical chat
    - If `sourcegraph/sourcegraph` repo was previously added please remove it clicking the [✏️] (pencil) icon and
      removing the 'sourcegraph/sourcegraph' line
    - Ask question about squirrel. It should again describe you an animal or have no context.

## Code Search

All `Code Search` actions are available under the same `Sourcegraph` right-click context menu, so for simplicity, we
describe only the **Expected behaviours**.

To open the context menu:

1. Open a file in the repository that is indexed by Sourcegraph.
2. Select the fragment of code you want to search for (for example: `System.out.println` or `println` may be the
   simplest candidate).
3. Right-click on selected fragment, navigate to the `Sourcegraph` sub-menu and choose one of the actions.

### Find with Sourcegraph...

// todo, it's not working for me

### Search Selection on Sourcegraph Web

#### Expected behaviour:

1. The browser is launched.
2. The result is a list of fragments that are found in **all indexed repositories**.

### Search Selection in Repository on Sourcegraph Web

#### Expected behaviour:

1. The browser is launched.
2. The result is a list of fragments that are found **within the same repository** from which the searched fragment
   originates.

### Open Selection on Sourcegraph Web

#### Expected behaviour:

1. The browser is launched.
2. The result is a **single indexed file** from which the searched fragment originates.
3. The line with fragment is visible and there is no need to manually scroll to it.

### Copy Sourcegraph File Link

#### Expected behaviour:

1. A link is copied to the clipboard.
2. Notification pops up with successful message.
3. After pasting the link into the browser, the Code Search page opens with the file and the exact line from which the
   searched fragment originates.

## [Product-led growth](https://handbook.sourcegraph.com/departments/data-analytics/product-led-growth/)

### My Account Tab

1. Log in to Sourcegraph.com with a **Free** account and `cody-pro-jetbrains` feature flag enabled.
2. Go to `Cody` tool window and open `My Account` tab.
3. Verify:
    * The current tier should be `Cody Free`.
    * The `Upgrade` button is visible and it points to `https://sourcegraph.com/cody/subscription`.
    * The `Check Usage` button is visible and it points to `https://sourcegraph.com/cody/manage`.
4. Go to accounts settings and switch to **Pro** account.
5. Go to `My Account` tab.
6. Verify:
    * The current tier should be `Cody Pro`.
    * The `Upgrade` is **not visible**.
7. Go to account settings and switch to an Enterprise account (AKA *non-dotcom*).
8. Verify: `My Account` tab is not visible in `Cody` tool window.
9. Go to accounts settings and switch back to the **Free** account.
10. Verify: `My Account` tab is visible.

### Cody Free/Pro rate limit errors

1. Log in to a Sourcegraph.com with a **Free account with rate limits exceeded**.
2. Go to the `Chat` and type a message.
3. Verify: A notification about the exceeded rate limit is shown. It should suggest upgrading to Cody Pro.
4. Trigger autocomplete in the editor.
5. Verify: A similar notification is shown to the user.

## Context

### Local Keyword search

1. Open the [sourcegraph/sourcegraph](https://github.com/sourcegraph/sourcegraph) repo locally in the IDE to be tested
2. Go to the `Chat`
3. **Verify**: Local context is enabled:

![Local Context Enabled](https://github.com/sourcegraph/jetbrains/assets/7814431/11a68b1a-53a4-474e-97c7-74c18374beda)

5. Type: "what is squirrel?"
6. **Verify**: You get an answer similar to:
   > "Squirrel is a code intelligence service developed by Sourcegraph that uses tree-sitter for syntactic analysis of
   code. Some key things about Squirrel"
8. Disable Local context

   ![Local Context Disabled](https://github.com/sourcegraph/jetbrains/assets/7814431/3c755039-e19e-4e58-a9d7-72ac1a381e16)

10. Create (or refresh) a new Chat thread
11. **Type**: "what is squirrel?"
12. **Verify**: You get an answer similar to:
    > Squirrels are small, bushy-tailed rodents that are found all over the world. Here are some key facts about
    squirrels...

## Model dropdown

### Pro account

#### Chat

1. Login to Cody Pro account
2. Create new chat
3. Default model for new Pro users is Claude 3 Sonnet
    - Default model for existing Pro users is their previously selected model
4. User is able to change default LLM
5. Change model to ChatGPT 4
6. Send message
   > What model are you?
7. User should get the response that model is ChatGPT
8. Change account to different one and then back to your pro account
9. Open `What model are you?` chat from the history
10. Send again message

> What model are you?

11. User should again get the response that model is ChatGPT

#### Commands

1. Login to Cody Pro account
2. Go to commands panel
3. Trigger command
4. Command should be executed with default model

### Free account

1. Login to Cody Free account
2. Create new chat
3. User sees model dropdown, but non-default LLM is disabled
4. Default model is Claude 3 Sonnet

### Pro account after trial

1. Login to Cody Pro account that has trial expired
2. Create new chat
3. User doesn't see model dropdown

### Enterprise account

#### Chat

1. Login to Cody Enterprise account
2. Create new chat
3. User should see the default model in the dropdown but is unable to change it

#### Commands

1. Login to Cody Enterprise account
2. Go to commands panel
3. Trigger command
4. Command should be executed with default model

## Other

### Automatic repository recognition

1. Open project with enabled Git VCS. This repository must be publicly available on GitHub.
2. Open to `Cody` tool window.
3. Click on repository button to open `Context Selection` dialog. Button is placed inside `Cody` tool window on left,
   bottom
   corner.

#### Expected behaviour

* Repository `Git URL` has been successfully inferred from VCS history. Value is similar
  to `github.com/sourcegraph/jetbrains`.

### Persistent custom repository

1. Open project with enabled Git VCS. This repository must be publicly available on GitHub.
2. Open to `Cody` tool window.
3. Click on repository button to open `Context Selection` dialog.
4. Change `Git URL` to a different, valid Git URL repository.
5. Click `OK` button and restart IDE.
6. Navigate again to `Context Selection`.

#### Expected behaviour

* Repository `Git URL` is same as before restart.

### Colour scheme changes

1. Ask Cody Chat question to which it will reply with various layout elements (list, code snippets, etc)
2. Change theme in settings or using Themes action.
3. Verify that chat text is readable, as well as that there is clear colour distinction between user and assistant
   sections. Both sections colors should also correspond to the chosen theme.

Repeat the above starting from different themes.

#### Expected behaviour

Changing theme should lead to full repaint of the colours according to the current theme.

### Guardrails

In chat ask Cody a question to generate over 10 lines of text, for instance: `Please implement DFS in at least 10 lines of Haskell`

#### Expected behavior

When hovering over a code snippet printed by Cody, a set of buttons will appear.
The disabled one on the right-hand side is expected to say _Guardrails Check Passed_.
The tooltip for the button should say _Snippet not found on Sourcegraph.com._

The button is expected for a short time period (less than 10s) to indicate search is running rather than a positive check result. The button label at that point will just be _Attribution search_.

## Inline Edit

Select some code and right-click on it. Got to `Cody > Edit Code`.
Write a prompt and click "OK".

### Show Diff

The "Show Diff" feature should present two sides:

- Right-Hand Side: This should display the current state of the editor, including all changes made by Cody and any user
  edits.
- Left-Hand Side: This should display the state of the editor including all user changes made at various stages:
    - Before triggering Cody's inline edit.
    - After triggering Cody's inline edit but before Cody started writing.
    - While Cody is writing (before Cody finished).
    - After Cody has finished writing.

In other words, the left-hand side should show the right hand side WITHOUT Cody Inline Edit changes.

#### Scenario 1: User Adds/Removes a Line Above the Selected Area Before Triggering the Inline Edit

**Steps**:

1. Above the area that you want to apply the inline edit, add or remove one or more lines.
2. Trigger the `Cody Inline Edit`.
3. Trigger the `Show Diff`.

#### Scenario 2: User Adds/Removes a Line Above the Selected Area After Triggering the Inline Edit But Before Cody Starts Writing

**Steps**:

1. Trigger the `Cody Inline Edit`.
2. Before Cody starts writing, add or remove lines above the selected area.
3. Allow Cody to complete its edits.
4. Activate the `Show Diff`.

#### Scenario 3: User Adds/Removes a Line Above the Selected Area After Cody Starts Writing But Before It Finishes

**Steps**:

1. Trigger the `Cody Inline Edit`.
2. While Cody is writing, add or remove lines above the targeted edit area.
3. Allow Cody to complete its edits.
4. Trigger the `Show Diff`.

#### Scenario 4: User Adds/Removes a Line Above the Selected Area After Cody Finishes Writing

**Steps**:

1. Trigger the `Cody Inline Edit`.
2. After Cody's edits are done, add or remove lines above the edited area.
3. Trigger the `Show Diff`.

#### Scenario 5: Scenarios 1, 2, 3, 4 But With Lines Addition/Removal Between the Inline Edit Changed lines

`Inline Edit` can modify some particular line in the selected "target" area but leave the other lines unchanged (in that
area).
The changes to the lines unmodified by Cody should not be reflected in the `Show Diff`.

#### Scenario 6: Scenarios 1, 2, 3, 4 But With Lines Addition/Removal After the Inline Edit Changed lines

Similarly, the changes after the selected "target" area should not be reflected in the `Show Diff`.
