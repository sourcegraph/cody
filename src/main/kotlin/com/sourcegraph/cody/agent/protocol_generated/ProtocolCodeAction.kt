/*
 * Generated file - DO NOT EDIT MANUALLY
 * They are copied from the cody agent project using the copyProtocol gradle task.
 * This is only a temporary solution before we fully migrate to generated protocol messages.
 */
@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class ProtocolCodeAction(
  val id: String,
  val commandID: String? = null,
  val title: String,
  val diagnostics: List<ProtocolDiagnostic>? = null,
  val kind: String? = null,
  val isPreferred: Boolean? = null,
  val disabled: DisabledParams? = null,
)

