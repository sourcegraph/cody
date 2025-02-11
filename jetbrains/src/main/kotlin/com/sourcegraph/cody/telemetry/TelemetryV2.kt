package com.sourcegraph.cody.telemetry

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.ParametersParams
import com.sourcegraph.cody.agent.protocol_generated.TelemetryEvent
import com.sourcegraph.config.ConfigUtil

class TelemetryV2 {
  companion object {
    fun sendTelemetryEvent(
        project: Project,
        feature: String,
        action: String,
        parameters: ParametersParams? = null
    ) {
      val versionParameters =
          mapOf(
              "ideProductCode" to ConfigUtil.getIntellijProductCode(),
              "ideBaselineVersion" to ApplicationInfo.getInstance().build.baselineVersion.toLong())
      val baseParameters = parameters ?: ParametersParams()
      val newParameters =
          baseParameters.copy(metadata = baseParameters.metadata?.plus(versionParameters))

      CodyAgentService.withAgent(project) { agent ->
        agent.server.telemetry_recordEvent(
            TelemetryEvent(feature = "cody.$feature", action = action, parameters = newParameters))
      }
    }
  }
}
