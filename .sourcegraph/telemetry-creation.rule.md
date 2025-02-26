Check that new user-facing features or other significant features have appropriate event recording in place:

- If a new feature is being added, check that the feature is being recorded (e.g., via a telemetryRecorder.recordEvent() call, or equivalent in another language).
- Check that newly added events are being recorded with feature and action names that reflect the actual user action(s).
- "Core" events are events that occur when a user chooses to interact or engage with Sourcegraph/Cody and likely gets value from it. As an example, simply seeing an autocomplete suggestion is not a core event, but accepting one is. If the new feature is likely something defined as core based on that guideline, ensure that the event's billing metadata is recorded with the event indicating this.
- "Billable" events are events that occur when a user is signed into their Sourcegraph account and actively interacts with the product. For example, even just seeing autocompletion suggestions qualifies. Background events, that are the result of just having Cody installed, are not enough to be considered billable. If the new feature is likely something defined as billable based on that guideline, ensure that the event's billing metadata is recorded with the event indicating this.
- If the new event is not a core or billable event, its billing metadata field can be excluded.
