package com.sourcegraph.cody

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.annotations.RequiresBackgroundThread
import com.sourcegraph.cody.agent.CodyAgentServer
import com.sourcegraph.cody.agent.protocol.GetFeatureFlag
import com.sourcegraph.cody.config.CodyAuthenticationManager
import java.util.concurrent.CompletableFuture

data class SubscriptionTabPanelData(
    val isDotcomAccount: Boolean,
    val codyProFeatureFlag: Boolean,
    val isCurrentUserPro: Boolean?
)

@RequiresBackgroundThread
fun fetchSubscriptionPanelData(
    project: Project,
    server: CodyAgentServer
): CompletableFuture<SubscriptionTabPanelData?> {
  val activeAccountType = CodyAuthenticationManager.instance.getActiveAccount(project)
  val result = CompletableFuture<SubscriptionTabPanelData?>()

  if (activeAccountType != null) {
    ensureUserIdMatchInAgent(activeAccountType.id, server)

    if (activeAccountType.isDotcomAccount()) {
      ApplicationManager.getApplication().executeOnPooledThread {
        val codyProFeatureFlag =
            server.evaluateFeatureFlag(GetFeatureFlag.CodyProJetBrains).get() == true
        if (codyProFeatureFlag) {
          val isCurrentUserPro = getIsCurrentUserPro(server) ?: false
          result.complete(
              SubscriptionTabPanelData(
                  activeAccountType.isDotcomAccount(),
                  codyProFeatureFlag = true,
                  isCurrentUserPro = isCurrentUserPro))
        } else {
          result.complete(
              SubscriptionTabPanelData(
                  activeAccountType.isDotcomAccount(),
                  codyProFeatureFlag = false,
                  isCurrentUserPro = null))
        }
      }
    } else {
      result.complete(
          SubscriptionTabPanelData(
              activeAccountType.isDotcomAccount(),
              codyProFeatureFlag = false,
              isCurrentUserPro = false))
    }

    return result
  }

  return CompletableFuture.completedFuture(null)
}

@RequiresBackgroundThread
private fun ensureUserIdMatchInAgent(jetbrainsUserId: String, server: CodyAgentServer) {
  var agentUserId = getUserId(server)
  var retryCount = 3
  while (jetbrainsUserId != agentUserId && retryCount > 0) {
    Thread.sleep(200)
    retryCount--
    CodyToolWindowContent.logger.warn("Retrying call for userId from agent")
    agentUserId = getUserId(server)
  }
}

@RequiresBackgroundThread
private fun getUserId(server: CodyAgentServer): String? =
    server
        .currentUserId()
        .exceptionally {
          CodyToolWindowContent.logger.warn("Unable to fetch user id from agent")
          null
        }
        .get()

@RequiresBackgroundThread
private fun getIsCurrentUserPro(server: CodyAgentServer): Boolean? =
    server
        .isCurrentUserPro()
        .exceptionally { e ->
          CodyToolWindowContent.logger.warn("Error getting user pro status", e)
          null
        }
        .get()
