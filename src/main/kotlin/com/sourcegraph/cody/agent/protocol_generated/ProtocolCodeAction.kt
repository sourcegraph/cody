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

