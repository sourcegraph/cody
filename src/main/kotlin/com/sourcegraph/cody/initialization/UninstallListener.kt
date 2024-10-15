package com.sourcegraph.cody.initialization

import com.intellij.ide.plugins.IdeaPluginDescriptor
import com.intellij.ide.plugins.PluginInstaller
import com.intellij.ide.plugins.PluginStateListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.BillingCategory
import com.sourcegraph.cody.agent.protocol.BillingMetadata
import com.sourcegraph.cody.agent.protocol.BillingProduct
import com.sourcegraph.cody.agent.protocol.TelemetryEventParameters
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.telemetry.TelemetryV2
import java.util.concurrent.TimeUnit

class UninstallListener : StartupActivity {
  override fun runActivity(project: Project) {
    PluginInstaller.addStateListener(
        object : PluginStateListener {
          override fun uninstall(descriptor: IdeaPluginDescriptor) {
            val authManager = CodyAuthenticationManager.getInstance()
            authManager.setActiveAccount(null)
            authManager.removeAll()
            TelemetryV2.sendTelemetryEvent(
                project,
                "cody.extension",
                "uninstalled",
                TelemetryEventParameters(
                    billingMetadata =
                        BillingMetadata(BillingProduct.CODY, BillingCategory.BILLABLE)))
            CodyAgentService.withAgent(project) {
              it.server.extension_reset(null).get(20, TimeUnit.SECONDS)
            }
          }

          override fun install(descriptor: IdeaPluginDescriptor) {}
        })
  }
}
