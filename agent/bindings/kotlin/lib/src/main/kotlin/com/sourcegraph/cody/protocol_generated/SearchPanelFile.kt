@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class SearchPanelFile(
  var uri: Uri? = null,
  var snippets: List<SearchPanelSnippet>? = null,
)

