/*
 * Generated file - DO NOT EDIT MANUALLY
 * They are copied from the cody agent project using the copyProtocol gradle task.
 * This is only a temporary solution before we fully migrate to generated protocol messages.
 */
@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class MentionQuery(
  val provider: ContextMentionProviderID? = null,
  val text: String,
  val range: RangeData? = null,
  val maybeHasRangeSuffix: Boolean? = null,
  val includeRemoteRepositories: Boolean? = null,
)

