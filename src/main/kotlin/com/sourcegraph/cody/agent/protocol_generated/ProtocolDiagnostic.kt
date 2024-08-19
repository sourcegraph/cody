/*
 * Generated file - DO NOT EDIT MANUALLY
 * They are copied from the cody agent project using the copyProtocol gradle task.
 * This is only a temporary solution before we fully migrate to generated protocol messages.
 */
@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class ProtocolDiagnostic(
  val location: ProtocolLocation,
  val message: String,
  val severity: DiagnosticSeverity, // Oneof: error, warning, info, suggestion
  val code: String? = null,
  val source: String? = null,
  val relatedInformation: List<ProtocolRelatedInformationDiagnostic>? = null,
)

