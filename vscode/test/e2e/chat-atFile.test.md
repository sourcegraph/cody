# Expected behaviors for the @-mention feature

Currently covered by the e2e test in `chat-atFile.test.ts`:

- Typing '@' in the chat input shows a search box for files. Typing '#' shows one for symbols instead.
- Searching for a non-existent file or symbol shows a "No matching files/symbols found" message.
- Search only matches files in the relative visible path, not full absolute paths.
- Search includes dotfiles after ".".
- Searches match with either forward or backslashes.
- Can click a file result fom the box to insert it into the chat input.
- Inserted file context persists when resending a message from history.
- Can use the Up and Down arrow keys navigate through suggested file results.
- Can use the Left and Right arrow keys to close the file selector without modifying the input text.
- Can use the ESC key to close the file selector without modifying the input text.
- Pressing tab after a full filename inserts the @-mention with a trailing space.
- Pressing tab after a partial filename completes to an existing @-mention.
- Can @-mention files mid-sentence.
- Don't show the file selector on @-queries that ends with non-alphanumeric char (e.g. @foo/bar?) without results.
- Input box is cleared on submit, with @-mentions removed and selector closed.
- Explicitly @-mentioned files show up in the file context list below the message.
