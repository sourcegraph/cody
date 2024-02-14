@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class Selection(
  var start: Position? = null,
  var end: Position? = null,
  var isEmpty: Boolean? = null,
  var isSingleLine: Boolean? = null,
  var anchor: Position? = null,
  var active: Position? = null,
  var isReversed: Boolean? = null,
)

