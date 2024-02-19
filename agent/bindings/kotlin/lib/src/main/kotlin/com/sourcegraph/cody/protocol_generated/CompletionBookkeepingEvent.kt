@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class CompletionBookkeepingEvent(
  val id: CompletionLogID? = null,
  val startedAt: Int? = null,
  val networkRequestStartedAt: Int? = null,
  val startLoggedAt: Int? = null,
  val loadedAt: Int? = null,
  val suggestedAt: Int? = null,
  val suggestionLoggedAt: Int? = null,
  val suggestionAnalyticsLoggedAt: Int? = null,
  val acceptedAt: Int? = null,
  val items: List<CompletionItemInfo>? = null,
  val loggedPartialAcceptedLength: Int? = null,
)

