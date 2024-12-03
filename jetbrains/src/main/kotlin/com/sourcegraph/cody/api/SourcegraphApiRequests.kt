package com.sourcegraph.cody.api

import com.intellij.openapi.progress.ProgressIndicator

object SourcegraphApiRequests {
  class CurrentUser(
      private val executor: SourcegraphApiRequestExecutor,
      private val progressIndicator: ProgressIndicator
  ) {
    fun getDetails(): CodyAccountDetails =
        getCurrentUser(SourcegraphGQLQueries.getUserDetails, CurrentUserDetailsWrapper::class.java)
            .currentUser

    private fun <T> getCurrentUser(queryName: String, clazz: Class<T>): T =
        executor.execute(
            progressIndicator,
            SourcegraphApiRequest.Post.GQLQuery(
                executor.server.toGraphQLUrl(), queryName, null, clazz))

    data class CurrentUserDetailsWrapper(val currentUser: CodyAccountDetails)

    class CodyAccountDetails(
        val id: String,
        val username: String,
        val displayName: String?,
        val avatarURL: String?
    ) {
      val name: String
        get() = displayName ?: username
    }
  }
}
