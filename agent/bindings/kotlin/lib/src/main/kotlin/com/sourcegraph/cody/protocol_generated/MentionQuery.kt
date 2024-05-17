@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class MentionQuery(
  val provider: ContextMentionProviderID? = null,
  val text: String,
  val range: RangeData? = null,
  val maybeHasRangeSuffix: Boolean? = null,
)

