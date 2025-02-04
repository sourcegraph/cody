@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class Rule(
  val path_filters: PatternFilters? = null,
  val repo_filters: PatternFilters? = null,
  val language_filters: PatternFilters? = null,
  val text_content_filters: PatternFilters? = null,
  val uri: String,
  val display_name: String,
  val title: String? = null,
  val description: String? = null,
  val instruction: String? = null,
  val tags: List<String>? = null,
)

