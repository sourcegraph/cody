package com.sourcegraph.cody.config.migration

import com.intellij.ide.util.RunOnceUtil
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.initialization.Activity
import com.sourcegraph.config.ConfigUtil
import com.typesafe.config.ConfigFactory
import kotlin.io.path.exists

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
            "cody.autocomplete.enabled" to true,
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
      val config = ConfigFactory.parseFile(settingsFile.toFile())
      val validEntries = mutableMapOf<String, Any>()

      config.entrySet().forEach { configEntry ->
        val unquotedKey =
            com.typesafe.config.ConfigUtil.splitPath(configEntry.key).joinToString(".")
        val shouldBeRemoved =
            pathsToAlwaysRemove.any { unquotedKey.startsWith(it) } ||
                defaultValues.any {
                  it.key == unquotedKey && configEntry.value.unwrapped() == it.value
                }
        if (shouldBeRemoved) {
          LOG.info("Removing default value from settings: ${configEntry.key}")
        } else {
          validEntries[configEntry.key] = configEntry.value
        }
      }

      if (validEntries.size != config.entrySet().size) {
        LOG.info("Writing cleaned up configuration to $settingsFile")
        val content = ConfigFactory.parseMap(validEntries).root().render(ConfigUtil.renderOptions)
        ConfigUtil.setCustomConfiguration(project, content)
      } else {
        LOG.info("No configuration to clean up found")
      }
    } catch (e: Exception) {
      LOG.warn("Failed to clean up configuration", e)
    }
  }
}
