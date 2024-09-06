@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class ParametersParams(
  val metadata: Map<String, Long>,
  val privateMetadata: Map<String, Any>,
  val billingMetadata: BillingMetadataParams,
)

