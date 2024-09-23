package com.sourcegraph.cody.config.notification

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.statusbar.CodyStatusService
import com.sourcegraph.cody.telemetry.TelemetryV2
import com.sourcegraph.common.UpgradeToCodyProNotification
import com.sourcegraph.config.ConfigUtil

@Service(Service.Level.PROJECT)
class AccountSettingChangeListener(project: Project) : ChangeListener(project) {
  init {
    connection.subscribe(
        AccountSettingChangeActionNotifier.TOPIC,
        object : AccountSettingChangeActionNotifier {
          override fun beforeAction(serverUrlChanged: Boolean) {}

          override fun afterAction(context: AccountSettingChangeContext) {
            // Notify JCEF about the config changes
            javaToJSBridge?.callJS("pluginSettingsChanged", ConfigUtil.getConfigAsJson())

            UpgradeToCodyProNotification.autocompleteRateLimitError.set(null)
            UpgradeToCodyProNotification.chatRateLimitError.set(null)
            CodyStatusService.resetApplication(project)

            if (ConfigUtil.isCodyEnabled()) {
              CodyToolWindowContent.executeOnInstanceIfNotDisposed(project) {
                refreshPanelsVisibility()
              }
            }

            if (context.serverUrlChanged) {
              TelemetryV2.sendTelemetryEvent(
                  project, feature = "settings.serverURL", action = "changed")
            } else if (context.accessTokenChanged) {
              TelemetryV2.sendTelemetryEvent(
                  project, feature = "settings.accessToken", action = "changed")
            }
          }
        })
  }
}
