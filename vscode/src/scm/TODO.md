## TODO

- [ ] Build the diff context as PromptString individual messages, so we can filter out individual files. Check if this is already handled elsewhere.
- [ ] Handle large diffs better, so sorting/sampling with some heuristic to select the most valuable diffs first. Add telemetry to see how often we're hitting this limit.
- [ ] Add experimental feature for this, so we can merge without needing Cody Ignore stuff
- [ ] UI Changes. Ask Tim. Is Cody logo the correct approach?
- [ ] Add notification for visibility when panel is first opened (only fires one time). What else can we do for discoverability? Use VS Code walkthrough, show programatically? (Make dedicated page for this, and feature discoverability.)
- [ ] Check constructed URI for diffs, we need to construct this correctly for Cody Ignore!!!.
  - Ensure we always pick up on high level Cody Ignore (e.g. if ignore file is in higher workspace). Check with Philipp
  - Ensure we fully resolve the correct URI relative to the Git root. This is required so we don't incorrectly identify an ignored file as not ignored.
- Discoverability: Can we adjust the placeholder text of the scm input?
- Output length: Copilot does it short, we currently have quite long. Default to short. Update prompt.
- Consider adding co-author for Cody to commit messages. Cody Pro removes the co-author from the commit message?
