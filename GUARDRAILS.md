This is the source code for Cody, an AI coding assistant integrated
into IDEs (in this repository: VSCode, JetBrains)

It has a feature called "guardrails" where, when the LLM generates
code, that code is checked by making a call to a backend service to
see if it matches code with incompatible licenses. The check kicks in
at 10 lines of code; anything less than that is deemed acceptable by
default.

A customer, we will call them BANK, wants Guardrails to operate in a
more comprehensive mode of enforcement. In particular:

- Whether Guardrails operates in this tougher mode will be controlled
  by a policy the administrator configures on the server. We will
  develop this part next. For now, we just want to do the client
  implementation with a manually controlled flag so that the product
  manager and QA team can test the product when it is in this mode.

- Guardrails checks need to apply not only to code generated in chats,
  but in "edit" command output (which applies changes to buffers live)
  and autocomplete-type features that can generate many lines of code
  at once.

- For now, Guardrails only needs to be integrated with "generally
  available" (GA) features. However some generally available features
  may be referred to as experimental in out of date comments,
  identifiers, etc. so take caution.

- Code should not be displayed to users until it has passed the
  guardrails check. Naturally this is slower than streaming in the
  changes, so we want to present placeholders that are replaced with
  the code after the check is done.

- This codebase is under active development by multiple people and
  AIs, so we need to make it easy to do the right thing when
  integrating with Guardrails by designing simple, effective
  abstractions.

Before we can implement this successfully, we need to pay down some
tech debt that we have inherited from the first implementation of
Guardrails. It was done by people without much React experience:

- The guardrails check should only trigger when the code block that is
  streaming from the LLM is complete. In the past, SRCH-942 found that
  the call was happening every time the component updated, which is
  inefficient. The factoring here is probably wrong; having the UI
  component initiate these checks seems dubious. We should separate
  presentation and logic.

- The guardrails "controller" did direct DOM manipulation. Instead we
  should separate behavior, state and presentation more cleanly so
  that typical React state updates trigger rerendering in classic
  React style.

- There may be some complexities with how syntax highlighting
  works. We use rehype-sanitize and rehype-markdown. It is fine to
  keep using those. It is critical that syntax highlighting still
  works.

## Technical Design & Implementation Plan

We've developed a clean architecture to address the technical debt and implement the enhanced guardrails mode. You can run

```
git diff e824dcee3fe640ff29683714adaba7d54606fc1c
```

to compare this branch to before we started. The new code has some bugs we can fix by studying how the existing code worked.

The way to build this extension is to run `pnpm -C lib/shared build && pnpm build && pnpm -C vscode build`.

### Component Architecture

1. **Core Components**:
   - `RichCodeBlock`: Handles presentation of code with guardrails checking
   - `GuardrailsManager`: Manages state and behavior of guardrails checks
   - `CodeBlockPlaceholder`: Shows loading state during code generation and checking
   - `MarkdownWithGuardrails`: Integrates guardrails into the markdown renderer

2. **Separation of Concerns**:
   - **State**: Track code block completion and guardrails check status
   - **Behavior**: Trigger checks at appropriate times, handle retries
   - **Presentation**: Show code or placeholders based on state

3. **Guardrails Flow**:
   - Detect when code block is complete in the stream
   - Only run guardrails check on completed code blocks
   - Present placeholder during checks in enforced mode
   - Display appropriate UI based on check results

4. **Implementation Approach**:
   - Customize the markdown renderer to use our `RichCodeBlock` component for code blocks
   - Only generate actual code with syntax highlighting when appropriate
   - Maintain animation and UX consistency with the prototype

### Tasks

- Add the feature flag to control the Guardrails mode. (Today it can
  be on or off, now it will have a third state and we will have off,
  permissive (was on: show the code but with an icon indicating the
  Guardrails check result) and enforced (the new mode we are adding
  for BANK. It will be implemented as a generic feature any Enterprise
  customer could turn on, however.)

  For now, make a local flag for testing which will specify the
  Guardrails mode. Later we will connect it to a setting configured by
  the administrator on the server.
  
- Change the UX around code generated in chats. There is a prototype
  from the UX designer in the guardrails/ folder. The LLM response is
  streamed back in Markdown and code blocks are rendered in a
  rectangle with a toolbar to copy, apply, etc. the code. We need to
  present this block differently. Because we use a monospace font, and
  the client is receiving the actual code, we will fill up a
  placeholder block and keep producing the rest of the chat output
  while we are checking the code with the guardrails API.
  
  - ANALYZED: Reviewed prototype in guardrails/my-react-app showing:
    - Uses shimmer loading animation during code generation/guardrails checking
    - Different states: "Generating code", "Checking guardrails", "complete", "error"
    - Error state has a "Retry" action button and explanatory message
    - Complete state shows code with guardrails check indicator and action buttons
    - For longer code (>= 10 lines), it shows an extended guardrails checking state
    
  - Implementation plan:
    - Create `GuardrailsManager` component to handle guardrails check state and logic
    - Create `RichCodeBlock` component for enhanced code block display
    - Create `CodeBlockPlaceholder` component for loading/checking states
    - Enhance markdown renderer to use our custom code block components
    - Implement guardrails check logic that only triggers on complete code blocks
    - Add error states and retry functionality
    - Ensure code is not displayed to users in enforced mode until guardrails check passes

- We need to integrate Guardrails with Edits (Ask Cody to Edit, Ask
  Cody to Fix.) We can display an error message if guardrails fails.

- We need to add metrics around Guardrails: How often we check; how
  long the checks take; how often the check errors, matches or does
  not match the code; how often we are hiding the code because of
  enforcement mode.

- As a stretch goal, we should add a "respin" option to code blocks
  (and maybe edits) so that the LLM can rewrite the code to work
  around whatever matching/copyright restriction that is being hit.

The legal team is aware of the rules like 10 lines of code, respin,
etc. In fact, they helped design these constraints.

The product team in general is unenthusiastic about this feature
because it makes the product less useful. So our direction here is to
keep the user informed, to lay blame for code being blocked on the
administrator of the Sourcegraph instance and not on Sourcegraph, and
to not compromise the speed and effectiveness of features when the
mode is turned off.

The direction of the design team is it is OK to flash content (for
example, briefly show a placeholder and then flick it off) if it makes
things faster--so no hysteresis on those. However the transitions
should be animated so they're not completely jarring. See the React
demo for details.

There are designs for a more complicated backend with license matching
and feedback about allowed licenses in the UI, but that is not our
purpose at the moment, that will come later. For now focus on our core
objectives mentioned above. If you find points to follow up on, let me
know and I will get them to the relevant cross-functional partners for
resolution.

Please ask any questions you like. You are free to edit this file with
notes and findings, remove tasks as you complete them, etc.

I am very grateful for your help with this!

## Progress and Next Steps

We've made significant progress on the guardrails implementation:

1. ✅ Fixed syntax highlighting with punctuation in code blocks
2. ✅ Replaced DOM manipulation with proper React components
3. ✅ Created `GuardrailsManager` to handle guardrails state and logic
4. ✅ Added support for separate raw code text vs. highlighted HTML code
5. ✅ Created `CodeBlockPlaceholder` for loading/checking states
6. ✅ Implemented proper separation of concerns for state, behavior, and presentation

### Remaining Issues to Fix

1. **Execute Button Non-functional**: The Execute button doesn't actually execute the command in the terminal. We need to connect it to the terminal API.

1. **Missing Guardrails indicator**: The Guardrails checkmark does not appear when connected to a Sourcegraph instance with Guardrails/attribution enabled.

1. **GuardrailsCheckManager**: This global variable doesn't respond to
account switches, so it may leak results across accounts. That is
actually not a problem because accounts share an index, but it will be
a problem in the future when enterprises can configure different
license policies, etc. So we should clean that up.

2. **Theme Inconsistencies**: The toolbar and code block use hard-coded color values rather than CSS variables for theming. We should update these to use proper theme variables so they look correct in all themes:
   - Replace direct color references with theme variables
   - Test across multiple themes (light, dark, high contrast)

3. **Apply Button State**: The Apply button doesn't show an "applying" state when clicked. We should add a loading indicator or state transition.

4. **Guardrails Check Optimization**: The guardrails check may fire multiple times for the same code block unnecessarily:
   - We've already added the code completion check (only run when complete)
   - We should add caching to avoid redundant checks for identical code
   - Implement a debounce mechanism to prevent rapid successive checks

5. **Enforcement Mode Testing**: We need to verify that enforcement mode works correctly:
   - Test that code is hidden during guardrails checking
   - Verify that placeholder transitions smoothly to code when check passes
   - Confirm error states work correctly and allow retries
   - Check that enforcement mode is properly applied across all relevant features

6. **Integration with Edit Commands**: We still need to integrate guardrails with Ask Cody to Edit/Fix commands, per the requirements.
