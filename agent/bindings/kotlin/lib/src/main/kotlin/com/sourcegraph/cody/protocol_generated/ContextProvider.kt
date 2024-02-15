@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ContextProvider(
  val kind: KindEnum? = null, // Oneof: search, search, embeddings
  val state: StateEnum? = null, // Oneof: unindexed, indexing, ready, failed, ready, no-match, indeterminate, no-match, unconsented, indexing, ready
  val errorReason: ErrorReasonEnum? = null, // Oneof: not-a-git-repo, git-repo-has-no-remote
  val type: TypeEnum? = null, // Oneof: remote, local
  val id: String? = null,
  val inclusion: InclusionEnum? = null, // Oneof: auto, manual
)

