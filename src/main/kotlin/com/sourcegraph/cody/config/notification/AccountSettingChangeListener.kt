package com.sourcegraph.cody.config.notification

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.statusbar.CodyAutocompleteStatusService
import com.sourcegraph.common.UpgradeToCodyProNotification
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.telemetry.GraphQlLogger

@Service(Service.Level.PROJECT)
class AccountSettingChangeListener(project: Project) : ChangeListener(project) {
  init {
    connection.subscribe(
        AccountSettingChangeActionNotifier.TOPIC,
        object : AccountSettingChangeActionNotifier {
          override fun beforeAction(serverUrlChanged: Boolean) {}

          override fun afterAction(context: AccountSettingChangeContext) {
            val codyApplicationSettings = CodyApplicationSettings.instance
            // Notify JCEF about the config changes
            javaToJSBridge?.callJS("pluginSettingsChanged", ConfigUtil.getConfigAsJson(project))

            // Notify Cody Agent about config changes.
            CodyAgentService.applyAgentOnBackgroundThread(project) { agent ->
              if (ConfigUtil.isCodyEnabled()) {
                agent.server.configurationDidChange(ConfigUtil.getAgentConfiguration(project))
              }
            }

            val codyToolWindowContent = CodyToolWindowContent.getInstance(project)
            // Refresh onboarding panels
            if (ConfigUtil.isCodyEnabled()) {
              codyToolWindowContent.refreshPanelsVisibility()
              codyToolWindowContent.embeddingStatusView.updateEmbeddingStatus()
            }

            UpgradeToCodyProNotification.autocompleteRateLimitError.set(null)
            UpgradeToCodyProNotification.chatRateLimitError.set(null)
            CodyAutocompleteStatusService.resetApplication(project)
            ApplicationManager.getApplication().executeOnPooledThread {
              codyToolWindowContent.refreshSubscriptionTab()
            }

            if (context.serverUrlChanged) {
              GraphQlLogger.logCodyEvent(project, "settings.serverURL", "changed")
            } else if (context.accessTokenChanged) {
              GraphQlLogger.logCodyEvent(project, "settings.accessToken", "changed")
            }
          }
        })
  }
}
