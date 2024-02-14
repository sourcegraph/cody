@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class NodeTypesParams(
  var atCursor: String? = null,
  var parent: String? = null,
  var grandparent: String? = null,
  var greatGrandparent: String? = null,
  var lastAncestorOnTheSameLine: String? = null,
)

