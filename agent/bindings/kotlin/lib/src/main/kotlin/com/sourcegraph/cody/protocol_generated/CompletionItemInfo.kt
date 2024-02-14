@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class CompletionItemInfo(
  var parseErrorCount: Int? = null,
  var lineTruncatedCount: Int? = null,
  var truncatedWith: String? = null, // Oneof: tree-sitter, indentation
  var nodeTypes: NodeTypesParams? = null,
  var nodeTypesWithCompletion: NodeTypesWithCompletionParams? = null,
  var lineCount: Int? = null,
  var charCount: Int? = null,
  var insertText: String? = null,
  var stopReason: String? = null,
)

