@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class ProtocolTextDocument(
  val uri: String,
  val filePath: String? = null,
  val content: String? = null,
  val selection: Range? = null,
  val contentChanges: List<ProtocolTextDocumentContentChangeEvent>? = null,
  val visibleRange: Range? = null,
  val testing: TestingParams? = null,
)

