package com.sourcegraph.cody.config.migration

import com.intellij.ide.util.RunOnceUtil
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.initialization.Activity
import com.sourcegraph.config.ConfigUtil
import com.typesafe.config.ConfigFactory
import kotlin.io.path.exists
import kotlin.io.path.readText
import kotlin.io.path.writeText

/**
 * Migration to clean up temporary client-side configuration variables that were incorrectly written
 * back to cody_settings.json.
 */
class ClientConfigCleanupMigration : Activity {
  companion object {
    private val LOG = logger<ClientConfigCleanupMigration>()

    // List of paths to always remove from configuration (temporary client-side values)
    private val pathsToAlwaysRemove =
        listOf("cody.advanced.agent", "cody.advanced.hasNativeWebview", "cody.customHeaders")

    // Map of paths with their default values
    // If these are found with these default values, they'll be removed
    private val defaultValues =
        mapOf(
            "cody.autocomplete.advanced.model" to null,
            "cody.autocomplete.advanced.provider" to null,
            "cody.codebase" to null,
            "cody.debug.verbose" to false,
            "cody.experimental.foldingRanges" to "indentation-based",
            "cody.experimental.tracing" to false,
            "cody.serverEndpoint" to null,
            "cody.suggestions.mode" to "autocomplete",
            "cody.telemetry.clientName" to null,
            "cody.telemetry.level" to "agent")
  }

  override fun runActivity(project: Project) {
    RunOnceUtil.runOnceForProject(project, "ClientConfigCleanupMigration") {
      cleanupTemporaryClientConfig(project)
    }
  }

  fun cleanupTemporaryClientConfig(project: Project) {
    val settingsFile = ConfigUtil.getSettingsFile(project)

    if (!settingsFile.exists()) {
      LOG.info("No cody_settings.json file found for cleanup")
      return
    }

    try {
      val fileContent = settingsFile.readText()
      val config = ConfigFactory.parseString(fileContent).resolve()

      var modified = false
      var updatedConfig = config

      // 1. First remove the client-side temporary values that should always be removed
      for (path in pathsToAlwaysRemove) {
        if (config.hasPath(path)) {
          LOG.info("Removing temporary client configuration from settings: $path")
          updatedConfig = updatedConfig.withoutPath(path)
          modified = true
        }
      }

      // 2. Now check for default values that can be cleaned up
      for ((path, defaultValue) in defaultValues) {
        if (config.hasPath(path)) {
          val value =
              when (defaultValue) {
                is Boolean -> config.getBoolean(path)
                is String -> config.getString(path)
                null -> null
                else -> "not-null"
              }

          if (value == defaultValue) {
            LOG.info("Removing default value from settings: $path")
            updatedConfig = updatedConfig.withoutPath(path)
            modified = true
          }
        }
      }

      if (modified) {
        LOG.info("Writing cleaned up configuration to $settingsFile")
        val content = updatedConfig.root().render(ConfigUtil.renderOptions)
        settingsFile.writeText(content)
        ConfigUtil.setCustomConfiguration(project, content)
      } else {
        LOG.info("No configuration to clean up found")
      }
    } catch (e: Exception) {
      LOG.warn("Failed to clean up configuration", e)
    }
  }
}
