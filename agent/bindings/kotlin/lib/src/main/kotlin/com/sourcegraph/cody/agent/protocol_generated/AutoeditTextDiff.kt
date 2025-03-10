@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class AutoeditTextDiff(
  val modifiedLines: List<ModifiedLineInfo>,
  val removedLines: List<RemovedLineInfo>,
  val addedLines: List<AddedLineInfo>,
  val unchangedLines: List<UnchangedLineInfo>,
)

