@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ContextProvider(
  var kind: String? = null, // Oneof: embeddings
  var state: String? = null, // Oneof: indeterminate, no-match, unconsented, indexing, ready
  var errorReason: String? = null, // Oneof: not-a-git-repo, git-repo-has-no-remote
  var type: String? = null, // Oneof: local
  var id: String? = null,
  var inclusion: String? = null, // Oneof: auto, manual
)

