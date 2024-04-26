@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class Selection(
  val start: Position,
  val end: Position,
  val isEmpty: Boolean,
  val isSingleLine: Boolean,
  val anchor: Position,
  val active: Position,
  val isReversed: Boolean,
)

