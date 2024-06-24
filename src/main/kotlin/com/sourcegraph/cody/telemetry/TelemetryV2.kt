package com.sourcegraph.cody.telemetry

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.TelemetryEvent
import com.sourcegraph.cody.agent.protocol.TelemetryEventParameters

class TelemetryV2 {
  companion object {
    private val intellijProductCodeMap =
        mapOf(
            "IU" to 1L, // IntelliJ IDEA Ultimate
            "IC" to 2L, // IntelliJ IDEA Community
            "IE" to 3L, // IntelliJ IDEA Educational
            "PS" to 4L, // PhpStorm
            "WS" to 5L, // WebStorm
            "PY" to 6L, // PyCharm Professional
            "PC" to 7L, // PyCharm Community
            "PE" to 8L, // PyCharm Educational
            "RM" to 9L, // RubyMine
            "OC" to 10L, // AppCode
            "CL" to 11L, // CLion
            "GO" to 12L, // GoLand
            "DB" to 13L, // DataGrip
            "RD" to 14L, // Rider
            "AI" to 15L, // Android Studio
        )

    fun sendTelemetryEvent(
        project: Project,
        feature: String,
        action: String,
        parameters: TelemetryEventParameters? = null
    ) {
      val build = ApplicationInfo.getInstance().build
      val versionParameters =
          mapOf(
              "ideProductCode" to intellijProductCodeMap.getOrDefault(build.productCode, 0L),
              "ideBaselineVersion" to build.baselineVersion.toLong())
      val newParameters = parameters?.copy(metadata = parameters.metadata?.plus(versionParameters))

      CodyAgentService.withAgent(project) { agent ->
        agent.server.recordEvent(
            TelemetryEvent(feature = "cody.$feature", action = action, parameters = newParameters))
      }
    }

    fun sendCodeGenerationEvent(project: Project, feature: String, action: String, code: String) {
      val op =
          if (action.startsWith("copy")) "copy"
          else if (action.startsWith("insert")) "insert" else "save"

      val metadata =
          mapOf("lineCount" to code.lines().count().toLong(), "charCount" to code.length.toLong())

      val privateMetadata = mapOf("op" to op, "source" to "chat")

      sendTelemetryEvent(
          project = project,
          feature = feature,
          action = action,
          parameters =
              TelemetryEventParameters(metadata = metadata, privateMetadata = privateMetadata))
    }
  }
}
