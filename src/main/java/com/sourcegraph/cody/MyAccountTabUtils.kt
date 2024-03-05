package com.sourcegraph.cody

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.annotations.RequiresBackgroundThread
import com.sourcegraph.cody.agent.CodyAgentServer
import com.sourcegraph.cody.config.CodyAuthenticationManager
import java.util.concurrent.CompletableFuture

data class MyAccountTabPanelData(val isDotcomAccount: Boolean, val isCurrentUserPro: Boolean?)

@RequiresBackgroundThread
fun fetchMyAccountPanelData(
    project: Project,
    server: CodyAgentServer
): CompletableFuture<MyAccountTabPanelData?> {
  val activeAccountType = CodyAuthenticationManager.instance.getActiveAccount(project)
  val result = CompletableFuture<MyAccountTabPanelData?>()

  if (activeAccountType != null) {
    ensureUserIdMatchInAgent(activeAccountType.id, server)

    if (activeAccountType.isDotcomAccount()) {
      ApplicationManager.getApplication().executeOnPooledThread {
        val isCurrentUserPro = getIsCurrentUserPro(server) ?: false
        result.complete(
            MyAccountTabPanelData(
                activeAccountType.isDotcomAccount(), isCurrentUserPro = isCurrentUserPro))
      }
    } else {
      result.complete(
          MyAccountTabPanelData(activeAccountType.isDotcomAccount(), isCurrentUserPro = false))
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
private fun getUserId(server: CodyAgentServer): String? = server.currentUserId().get()

@RequiresBackgroundThread
private fun getIsCurrentUserPro(server: CodyAgentServer): Boolean? = server.isCurrentUserPro().get()
