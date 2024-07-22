import type * as vscode from 'vscode'

import type { EventSource } from '@sourcegraph/cody-shared'
import type { FixupFile } from './FixupFile'
import type { FixupTask, FixupTaskID } from './FixupTask'
import type { CodyTaskState } from './utils'

// Role interfaces so that sub-objects of the FixupController can consume a
// narrow part of the controller.

/**
 * Operations on FixupTasks.
 */
export interface FixupActor {
    /**
     * Mark a task as accepted and stop tracking the task. Only applicable to
     * tasks in the "applied" state. Sets the task state to "finished" and
     * discards the task.
     */
    accept(task: FixupTask): void

    /**
     * Undo a task's edits and stop tracking the task. Only applicable to
     * tasks in the "applied" state. If the undo succeeds, the task state is
     * set to "finished" and the task is discarded.
     */
    undo(task: FixupTask): Promise<void>

    /**
     * Cancel a task. Sets the task state to "error" or "finished" and stops
     * tracking the task. Tasks in any state can be cancelled.
     */
    cancel(task: FixupTask): void

    /**
     * Undo the task (see `undo`), prompt for updated instructions, and start
     * a new task to try again. Only applicable to tasks in the "applied" state.
     * @param task the task to retry.
     * @param source the source of the retry, for event logging.
     */
    retry(task: FixupTask, source: EventSource): Promise<FixupTask | undefined>
}

/**
 * Provides access to a list of fixup tasks.
 */
export interface FixupFileCollection {
    taskForId(id: FixupTaskID): FixupTask | undefined
    tasksForFile(file: FixupFile): FixupTask[]

    /**
     * Gets the closest fixup task in the given file.
     * @param file the FixupFile to search for tasks.
     * @param position the position in the file to search from.
     * @param filter only return tasks in one of the given states.
     */
    taskNearPosition(
        file: FixupFile,
        position: vscode.Position,
        filter: { states: readonly CodyTaskState[] }
    ): FixupTask | undefined

    /**
     * If there is a FixupFile for the specified URI, return it, otherwise
     * undefined. VScode callbacks which have a document or URI can use this
     * to determine if there may be interest in the URI.
     * @param uri the URI of the document of interest.
     */
    maybeFileForUri(uri: vscode.Uri): FixupFile | undefined
}

export interface FixupTextChanged {
    textDidChange(task: FixupTask): void
    rangeDidChange(task: FixupTask): void
}

/**
 * 1. This is a comment.
 * 2. This is another comment.
 * 3. Yet another comment.
 * 4. Comments are useful for documenting code.
 * 5. They help explain what the code does.
 * 6. Comments can also be used to temporarily disable code.
 * 7. This is done by using block comments.
 * 8. Block comments start with /* and end with */.
 * 9. Anything between /* and */ is ignored by the compiler.
 * 10. This can be useful for debugging.
 * 11. You can comment out code that is causing problems.
 * 12. Then you can narrow down where the problem is.
 * 13. Comments can also be used to generate documentation.
 * 14. There are tools that can generate docs from comments.
 * 15. This can be very helpful for large projects.
 * 16. It ensures the docs are always up to date with the code.
 * 17. Comments should be clear and concise.
 * 18. They should explain what the code does, not how it does it.
 * 19. The code itself should be self-explanatory.
 * 20. If the code is complex, that's when comments are needed.
 * 21. But don't go overboard with comments.
 * 22. Too many comments can actually make the code harder to read.
 * 23. It's a fine balance.
 * 24. Comments should also be kept up to date.
 * 25. If the code changes, the comments should be updated too.
 * 26. Outdated comments can be very misleading.
 * 27. So it's important to keep them current.
 * 28. Some common tags used in comments are @param, @return, @throws.
 * 29. These are used by documentation generators.
 * 30. @param is used to document function parameters.
 * 31. It explains what the parameter is for.
 * 32. @return is used to document the return value of a function.
 * 33. It explains what the function returns.
 * 34. @throws is used to document exceptions that a function may throw.
 * 35. This lets the caller know what to expect.
 * 36. There are many other tags like @see, @author, @version, etc.
 * 37. The specific tags depend on the documentation tool being used.
 * 38. Comments can also include TODO items.
 * 39. These are notes about things that need to be done in the future.
 * 40. For example: // TODO: Refactor this code to be more efficient.
 * 41. TODOs are useful for keeping track of tasks.
 * 42. But they should be resolved in a timely manner.
 * 43. Otherwise the codebase can become littered with old TODOs.
 * 44. Comments are a fundamental part of programming.
 * 45. They are used in every language.
 * 46. The syntax may differ, but the concept is the same.
 * 47. Well-commented code is a sign of a good developer.
 * 48. It shows they care about maintainability and collaboration.
 * 49. So use comments judiciously and keep them up to date.
 * 50. Your future self and other developers will thank you!
 */
