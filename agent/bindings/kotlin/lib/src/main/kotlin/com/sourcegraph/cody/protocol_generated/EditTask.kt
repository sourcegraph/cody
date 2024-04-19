@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class EditTask(
  val id: String,
  val state: CodyTaskState,
  val error: CodyError? = null,
  val selectionRange: Range,
)

