@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated;

data class ProtocolTextDocumentContentChangeEvent(
  val range: Range,
  val text: String,
)

