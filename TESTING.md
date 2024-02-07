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
    - [ ] [Generate Test](#generate-test)
    - [ ] [Smell Code](#smell-code)
- Chat
    - [ ] [Autoscroll to latest message](#autoscroll-to-latest-message)
    - [ ] [Read chat history without interruptions](#read-chat-history-without-interruptions)
    - [ ] [Organize multiple chats](#organize-multiple-chats)
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

Prerequisite: You have to be **signed in**. This is important because we expect certain components to be refreshed automatically.

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
3. Trigger autocompletion with <kbd>Alt</kbd> + <kbd>/</kbd>.

#### Expected behaviour

![single_line_autocomplete.png](docs/single_line_autocomplete.png)

### Multi-line autocomplete

1. Paste the following Java code:
    ```java
    public void bubbleSort(int[] array) {
    ```
2. Place the cursor at the end of the line.
3. Trigger autocompletion with <kbd>Alt</kbd> + <kbd>/</kbd>.

#### Expected behaviour

![multiline_autocomplete.png](docs/multiline_autocomplete.png)

### Infilling autocomplete

1. Paste the following Java code:
    ```java
    // print 
    System.out.println("Hello World!");
    ```
2. Place cursor at the end of the `// print ` line.
3. Trigger autocompletion with <kbd>Alt</kbd> + <kbd>/</kbd>.

#### Expected behaviour

![multiline_autocomplete.png](docs/infilling_autocomplete.png)

### Cycle through autocomplete

1. Paste the following Java code:
    ```java
    public void bubbleSort(int[] array) {
    ```
2. Place the cursor at the end of the line.
3. Cycle forward with <kbd>Alt</kbd> + <kbd>]</kbd> or backward with <kbd>Alt</kbd> + <kbd>[</kbd>.

#### Expected behaviour

![cycle_through_autocomplete.gif](docs/cycle_through_autocomplete.gif)

## Commands

### General commands availability in Cody tool window

1. Navigate to `Cody` tool window and open `Commands`.

#### Expected behaviour

* List of commands is immediately available after the tool window is displayed. **No refresh is required.**

### General commands availability from keyboard shortcuts

| Command       | Windows / Linux                                      | MacOs                                                |
|---------------|------------------------------------------------------|------------------------------------------------------|
| Explain Code  | <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>1</kbd>     | <kbd>control</kbd> + <kbd>Shift</kbd> + <kbd>E</kbd> |
| Smell Code    | <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>2</kbd> | <kbd>control</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> |
| Generate Test | <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>3</kbd> | <kbd>control</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd> |

#### Expected behaviour

* Commands work as executed from any other place (the tool window opens if needed).

### General commands availability in context menu

1. Open file with source code and select some fragment.
2. Show context menu with right mouse button, navigate to `Cody`, and choose one of the commands.

#### Expected behaviour

* All commands are visible in context menu and can be selected.
* All commands works after selection.

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

### Generate Test

1. Paste following Java function:
    ```java
    public static String greet(String name) {
        return "Hello, " + name + "!";
    }
    ```
2. Select function and use `Cody | Commands | Generate Test`.

#### Expected behaviour

* User is automatically switched to `Chat` tab.
* Chat responds with generated documentation similar to this:
    ```java
    @Test
    public void testGreet() {
      String result = greet("Alice");
      assertEquals("Hello, Alice!", result);
    }
    ```

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

* Transcripts in `runIde` mode are located in `build/idea-sandbox/config/options/cody_history.xml`.
* You can force-save transcript by using the `Ctrl` + `S`.

Test ideas:

1. Delete "active" chat. You should be able to delete the currently opened chat. Messages should be removed from Chat tab.
2. Restore historical chat, focus on chat input field and use UP/DOWN keys to cycle between previous questions.
3. Press "new chat" as fast as you can. Especially during the IDE startup.
4. Switch between chats as fast as you can.
5. Press "new chat" while being inside `My Account` tab or something other than Chat tab. Tabs should switch automatically.
6. Use commands/recipes inside empty, new chat. Verify serialization/deserialization.
7. Ask about codebase to force response with listed context files and verify if everything is correctly serialized/deserialized. Links to context files should be clickable.
8. Remove all chats using history UI. Tree presentation is empty and branches like "Today" are removed from panel. File with transcripts should also disappear.
9. Use only the keyboard. For example, navigate transcripts with arrows, delete, enter.
10. Start typing while being focused on Chat History to perform search-by-title.
11. Open multiple chats and ask few simultaneous questions in several sessions at once.
12. Open new chat with <kbd>Alt</kbd> + <kbd>=</kbd> shortcut (or <kbd>Option</kbd> + <kbd>=</kbd> on Mac).
13. Open existing chat with shortcut <kbd>Alt</kbd> + <kbd>-</kbd> (or <kbd>Option</kbd> + <kbd>-</kbd> on Mac) and start typing question. Tab should be switched automatically on Chat.
14. Second click <kbd>Alt</kbd> + <kbd-</kbd> should hide tool window if focused (similar behavior as other tool windows).
15. Click <kbd>Esc</kbd> while being focused inside Cody tool window. You should be automatically focused on code.  

## Code Search

All `Code Search` actions are available under the same `Sourcegraph` right-click context menu, so for simplicity, we describe only the **Expected behaviours**.

To open the context menu:

1. Open a file in the repository that is indexed by Sourcegraph.
2. Select the fragment of code you want to search for (for example: `System.out.println` or `println` may be the simplest candidate).
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
2. The result is a list of fragments that are found **within the same repository** from which the searched fragment originates.

### Open Selection on Sourcegraph Web

#### Expected behaviour:

1. The browser is launched.
2. The result is a **single indexed file** from which the searched fragment originates.
3. The line with fragment is visible and there is no need to manually scroll to it.

### Copy Sourcegraph File Link

#### Expected behaviour:

1. A link is copied to the clipboard.
2. Notification pops up with successful message.
3. After pasting the link into the browser, the Code Search page opens with the file and the exact line from which the searched fragment originates.

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

## Other

### Automatic repository recognition

1. Open project with enabled Git VCS. This repository must be publicly available on GitHub.
2. Open to `Cody` tool window.
3. Click on repository button to open `Context Selection` dialog. Button is placed inside `Cody` tool window on left, bottom
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
