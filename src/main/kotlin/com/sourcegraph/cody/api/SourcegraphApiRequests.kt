package com.sourcegraph.cody.api

import com.intellij.openapi.progress.ProgressIndicator
import com.sourcegraph.cody.config.CodyAccountDetails
import java.awt.Image

object SourcegraphApiRequests {
  class CurrentUser(
      private val executor: SourcegraphApiRequestExecutor,
      private val progressIndicator: ProgressIndicator
  ) {
    fun getDetails(): CodyAccountDetails {
      return executor
          .execute(
              progressIndicator,
              SourcegraphApiRequest.Post.GQLQuery(
                  executor.server.toGraphQLUrl(),
                  SourcegraphGQLQueries.getUserDetails,
                  null,
                  CurrentUserWrapper::class.java))
          .currentUser
    }

    data class CurrentUserWrapper(val currentUser: CodyAccountDetails)

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
