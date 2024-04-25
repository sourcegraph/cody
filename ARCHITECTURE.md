# Architecture

This documents practical principles we follow in the Cody
client. These principles help sustain Cody for long term success.

Please contribute! It's preferable to use abstractions and tools to
encode these principles, but this doc can help until the automation is
done.

## Contents

* [Telemetry](#telemetry)
* [Token Counting](#token-counting)

## Telemetry

To improve Cody, we record some events as people use Cody.

### Principles

- Add enough Telemetry events for us to understand how Cody is used.

- Name your events `cody.<feature>`. Do not include the client name in
  the event name.

- Design your events around numeric values, not arbitrary
  strings. Understand "sensitive" data and use `privateMetadata` to
  protect it. (See below.)

- In VSCode, write e2e tests with `.extend<ExpectedEvents>({ ...` to
  test your events are firing. Grep the codebase for examples.

- In VSCode, record Telemetry events in the old and new system,
  described below. In other clients, it is acceptable to record
  Telemetry events in the "new" system only.

### Rationale

Events will eventually be migrated to [Sourcegraph's new telemetry events framework](https://sourcegraph.com/docs/dev/background-information/telemetry). Events primarily comprise of:

1. `feature`, a string denoting the feature that the event is associated with.
   1. **All events must use a `feature` that starts with `cody.`**, for example `cody.myFeature`
   2. The feature name should not include the name of the extension, as that is already included in the event metadata.
2. `action`, a string denoting the action on the feature that the event is associated with.
3. `parameters`, which includes safe numeric `metadata` and [unsafe arbitrarily-shaped `privateMetadata`](https://sourcegraph.com/docs/dev/background-information/telemetry#sensitive-attributes).

Extensive additional context is added by the extension itself (e.g. extension name and version) and the Sourcegraph backend (e.g. feature flags and actor information), so the event should only provide metadata about the specific action. Learn more in [events lifecycle](https://sourcegraph.com/docs/dev/background-information/telemetry#event-lifecycle).

For now, all events in VSCode should be updated to use both the legacy event clients and the new clients, for example:

```ts
// Legacy events client
import { telemetryService } from "../services/telemetry";
// New events client
import { telemetryRecorder } from "@sourcegraph/cody-shared";

// Legacy instrumentation
telemetryService.log(
  "CodyVSCodeExtension:fixup:applied",
  { ...codeCount, source },
  // Indicate the legacy instrumentation has a coexisting v2 instrumentation
  { hasV2Event: true }
);
// New instrumentation, alonsgide the legacy instrumentation
telemetryRecorder.recordEvent("cody.fixup.apply", "succeeded", {
  metadata: {
    /**
     * metadata, exported by default, must be numeric.
     */
    lineCount: codeCount.lineCount,
    charCount: codeCount.charCount,
  },
  privateMetadata: {
    /**
     * privateMetadata is NOT exported by default, because it can accidentally
     * contain data considered sensitive. Export of privateMetadata can be
     * enabled serverside on an allowlist basis, but requires a Sourcegraph
     * release.
     *
     * Where possible, convert the data into a number representing a known
     * enumeration of categorized values instead, so that it can be included
     * in the exported-by-default metadata field instead.
     *
     * Learn more: https://sourcegraph.com/docs/dev/background-information/telemetry#sensitive-attributes
     */
    source,
  },
});
```

When events are recorded to both systems:

1. `telemetryService` will _only_ send the event directly to dotcom's `event_logs`.
2. `telemetryRecorder` will make sure the connected instance receives the event in the new framework, if the instance is 5.2.0 or later, or translated to the legacy `event_logs` format, if the instance is older.
   1. In instances 5.2.1 or later, the event will [also be exported from the instance](https://sourcegraph.com/docs/dev/background-information/telemetry/architecture).

Allowed values for various fields are declared and tracked in [`lib/shared/src/telemetry-v2`](../lib/shared/src/telemetry-v2).

## Token Counting

LLMs convert text input into tokens and apply limits and billing based
on token counts. This is why token counts are important.

### Principles

When counting tokens, follow these principles:

- Express limits in tokens, not characters.

- Apply limits after a model is chosen. An accurate token count
  depends on the specific tokenizer a model uses.

- When possible, count tokens after appending strings instead of
  counting tokens in each string and summing the counts. This produces
  a more accurate token count.

- If accurate token counting becomes a performance bottleneck, reach
  out for help with algorithms to balance performance and accuracy.

### Rationale

Different LLMs use different tokenizers, so the same string may
produce different token counts in different models. Tokens can span
multiple characters. Some characters can span multiple tokens.

This means accurate token counting is a function of the input string
and the model's tokenizer:

> *countTokens(inputString, tokenizer) &rarr; number*

Cody clients used a heuristic of "4 characters per token" and
conservative token limits, but this heuristic can be off by a factor
of 4x or more, for example, for Japanese.

By the way,

> *countTokens(s1, tok) + countTokens(s2, tok) &neq; countTokens(s1 + s2, tok)*

In practice it is OK to assume token counts sum, but errors will
accumulate the more strings you append.
