/*
 * Generated file - DO NOT EDIT MANUALLY
 * They are copied from the cody agent project using the copyProtocol gradle task.
 * This is only a temporary solution before we fully migrate to generated protocol messages.
 */
@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class EditTask(
  val id: String,
  val state: CodyTaskState, // Oneof: Idle, Working, Inserting, Applying, Applied, Finished, Error, Pending
  val error: CodyError? = null,
  val selectionRange: Range,
  val instruction: String? = null,
)

