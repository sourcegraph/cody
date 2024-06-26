package com.sourcegraph.cody.api

import com.intellij.openapi.progress.ProgressIndicator
import com.sourcegraph.cody.config.CodyAccountCodyProEnabled
import com.sourcegraph.cody.config.CodyAccountDetails
import java.awt.Image

object SourcegraphApiRequests {
  class CurrentUser(
      private val executor: SourcegraphApiRequestExecutor,
      private val progressIndicator: ProgressIndicator
  ) {
    fun getDetails(): CodyAccountDetails =
        getCurrentUser(SourcegraphGQLQueries.getUserDetails, CurrentUserDetailsWrapper::class.java)
            .currentUser

    fun getCodyProEnabled(): CodyAccountCodyProEnabled =
        getCurrentUser(
                SourcegraphGQLQueries.getUserCodyProEnabled,
                CurrentUserCodyProEnabledWrapper::class.java)
            .currentUser

    private fun <T> getCurrentUser(queryName: String, clazz: Class<T>): T =
        executor.execute(
            progressIndicator,
            SourcegraphApiRequest.Post.GQLQuery(
                executor.server.toGraphQLUrl(), queryName, null, clazz))

    data class CurrentUserDetailsWrapper(val currentUser: CodyAccountDetails)

    data class CurrentUserCodyProEnabledWrapper(val currentUser: CodyAccountCodyProEnabled)

    fun getAvatar(url: String): Image =
        executor.execute(
            progressIndicator,
            object : SourcegraphApiRequest.Get<Image>(url) {
                  override fun extractResult(response: SourcegraphApiResponse): Image {
                    return response.handleBody { SourcegraphApiContentHelper.loadImage(it) }
                  }
                }
                .apply { operationName = "get profile avatar" })
  }
}
