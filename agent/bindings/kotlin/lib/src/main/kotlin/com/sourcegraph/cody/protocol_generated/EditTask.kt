@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class EditTask(
  val id: String,
  val state: CodyTaskState, // Oneof: Idle, Working, Inserting, Applying, Formatting, Applied, Finished, Error, Pending
  val error: CodyError? = null,
  val selectionRange: Range,
  val instruction: String? = null,
)

