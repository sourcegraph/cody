# 1.0.0


## Added

- Allows identifying as Eclipse (or other previously unrecognized IDEs) in telemetry events[#5276](https://github.com/sourcegraph/cody/pull/5276)
- Added ability to import historical chats through the agent[#5304](https://github.com/sourcegraph/cody/pull/5304)

## Reverts

- Revert: rehype-highlight bump [#0](https://github.com/sourcegraph/cody/pull/5313)

## Uncategorized

- Embeddings index is periodically rebuilt if it is stale[#5141](https://github.com/sourcegraph/cody/pull/5141)
- Updated model selection for Pro/Free users to only have two groups: "Most powerful models" and "Faster models". The "Balanced" group has been removed, Removed Mixtral 8x22B for Pro/Free users, use Mixtral 8x7B or Sonnet 3.5 instead.
[#5292](https://github.com/sourcegraph/cody/pull/5292)
- Fix bug where continuously triggering alt+l (option+l for macOS) would add duplicate context items to the chat input. Use the alt+/ shortcut to explicitly add the selection to the chat input.
[#5310](https://github.com/sourcegraph/cody/pull/5310)
- Fixed a bug when smart apply would not work with empty files[#5345](https://github.com/sourcegraph/cody/pull/5345)
- Fixed a bug where the guardrails icon was spinning on every editor selection event
[#5346](https://github.com/sourcegraph/cody/pull/5346)
- Chat: the order of the initial repo and file/selection context items has been flipped making it easier to remove repo context while keeping file/selection context.
[#5359](https://github.com/sourcegraph/cody/pull/5359)
- make sure workspace uri is file schemed[#5391](https://github.com/sourcegraph/cody/pull/5391)

## Untracked

The following PRs were merged onto the previous release branch but could not be automatically mapped to a corresponding commit in this release:
- [#5333](https://github.com/sourcegraph/cody/pull/5333)
- [#5352](https://github.com/sourcegraph/cody/pull/5352)
- [#5387](https://github.com/sourcegraph/cody/pull/5387)