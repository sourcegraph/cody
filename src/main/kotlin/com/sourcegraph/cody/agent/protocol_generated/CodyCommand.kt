/*
 * Generated file - DO NOT EDIT MANUALLY
 * They are copied from the cody agent project using the copyProtocol gradle task.
 * This is only a temporary solution before we fully migrate to generated protocol messages.
 */
@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class CodyCommand(
  val slashCommand: String? = null,
  val key: String,
  val prompt: String,
  val description: String? = null,
  val context: CodyCommandContext? = null,
  val type: CodyCommandType? = null, // Oneof: workspace, user, default, experimental, recently used
  val mode: CodyCommandMode? = null, // Oneof: ask, edit, insert
  val requestID: String? = null,
)

