@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class CompletionItemInfo(
  val parseErrorCount: Int? = null,
  val lineTruncatedCount: Int? = null,
  val truncatedWith: TruncatedWithEnum? = null, // Oneof: tree-sitter, indentation
  val nodeTypes: NodeTypesParams? = null,
  val nodeTypesWithCompletion: NodeTypesWithCompletionParams? = null,
  val lineCount: Int? = null,
  val charCount: Int? = null,
  val insertText: String? = null,
  val stopReason: String? = null,
)

