package com.sourcegraph.cody.initialization

import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.GetFeatureFlag
import com.sourcegraph.cody.agent.protocol_extensions.isPendingStatus
import com.sourcegraph.cody.agent.protocol_extensions.isProPlan
import com.sourcegraph.cody.agent.protocol_generated.CurrentUserCodySubscription
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.config.ConfigUtil
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class EndOfTrialNotificationScheduler private constructor(val project: Project) : Disposable {

  private val logger = Logger.getInstance(EndOfTrialNotificationScheduler::class.java)

  private val scheduler = Executors.newScheduledThreadPool(1)

  init {
    scheduler.scheduleAtFixedRate(
        /* command = */ {
          if (!ConfigUtil.isCodyEnabled()) {
            return@scheduleAtFixedRate
          }

          if (project.isDisposed) {
            this.dispose()
          }

          if (CodyAuthenticationManager.getInstance().account?.isDotcomAccount() != true) {
            return@scheduleAtFixedRate
          }

          CodyAgentService.withAgentRestartIfNeeded(project) { agent ->
            val currentUserCodySubscription =
                agent.server
                    .graphql_getCurrentUserCodySubscription(null)
                    .completeOnTimeout(null, 4, TimeUnit.SECONDS)
                    .exceptionally { e ->
                      logger.warn("Error while getting currentUserCodySubscription ", e)
                      null
                    }
                    .get()

            if (currentUserCodySubscription == null) {
              logger.debug("currentUserCodySubscription is null")
              return@withAgentRestartIfNeeded
            }

            val codyProTrialEnded =
                agent.server
                    .featureFlags_getFeatureFlag(GetFeatureFlag.CodyProTrialEnded)
                    .completeOnTimeout(false, 4, TimeUnit.SECONDS)
                    .get() == true

            val useSscForCodySubscription =
                agent.server
                    .featureFlags_getFeatureFlag(GetFeatureFlag.UseSscForCodySubscription)
                    .orTimeout(4, TimeUnit.SECONDS)
                    .completeOnTimeout(false, 4, TimeUnit.SECONDS)
                    .get() == true

            showProperNotificationIfApplicable(
                currentUserCodySubscription, codyProTrialEnded, useSscForCodySubscription)
          }
        },
        /* initialDelay = */ 0,
        /* period = */ 2,
        /* unit = */ TimeUnit.HOURS)
  }

  private fun showProperNotificationIfApplicable(
      currentUserCodySubscription: CurrentUserCodySubscription,
      codyProTrialEnded: Boolean,
      useSscForCodySubscription: Boolean
  ) {
    if (currentUserCodySubscription.isProPlan() &&
        currentUserCodySubscription.isPendingStatus() &&
        useSscForCodySubscription) {
      if (codyProTrialEnded) {
        if (PropertiesComponent.getInstance().getBoolean(TrialEndedNotification.ignore)) {
          dispose()
          return
        }
        TrialEndedNotification(disposable = this).notify(project)
      }
    }
  }

  override fun dispose() {
    scheduler.shutdown()
  }

  companion object {
    fun createAndStart(project: Project): EndOfTrialNotificationScheduler {
      return EndOfTrialNotificationScheduler(project)
    }
  }
}
