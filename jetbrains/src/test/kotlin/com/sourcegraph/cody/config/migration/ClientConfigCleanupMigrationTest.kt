package com.sourcegraph.cody.config.migration

import com.intellij.openapi.project.Project
import com.intellij.testFramework.LightPlatformTestCase
import com.sourcegraph.config.ConfigUtil
import com.typesafe.config.ConfigFactory
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.exists
import kotlin.io.path.readText
import kotlin.io.path.writeText

class ClientConfigCleanupMigrationTest : LightPlatformTestCase() {

  private lateinit var settingsFile: Path
  private lateinit var migration: ClientConfigCleanupMigration
  private lateinit var project: Project

  override fun setUp() {
    super.setUp()
    project = getProject()

    val configDir = ConfigUtil.getConfigDir(project)
    Files.createDirectories(configDir)
    settingsFile = ConfigUtil.getSettingsFile(project)

    migration = ClientConfigCleanupMigration()
  }

  fun testCleanupTemporaryClientConfig() {
    val tempConfig =
        """
      {
        "cody": {
          "advanced": {
            "agent": {
              "capabilities": {
                "storage": true
              },
              "extension": {
                "version": "7.91.2-nightly"
              },
              "ide": {
                "name": "JetBrains",
                "productCode": 1,
                "version": "IU-242.20224.300"
              },
              "running": true
            },
            "hasNativeWebview": true
          },
          "autocomplete": {
            "enabled": true,
            "advanced": {
              "model": null,
              "provider": null
            }
          },
          "debug": {
            "verbose": false
          },
          "customHeaders": {},
          "telemetry": {
            "clientName": null,
            "level": "agent"
          },
          "experimental": {
            "foldingRanges": "indentation-based",
            "tracing": false
          }
        }
      }
    """
            .trimIndent()

    settingsFile.writeText(tempConfig)

    migration.cleanupTemporaryClientConfig(project)

    val configAfterMigration = ConfigFactory.parseString(settingsFile.readText()).resolve()

    // Check that temporary client-side configuration has been removed
    assertFalse(
        "Should have removed cody.advanced.agent",
        configAfterMigration.hasPath("cody.advanced.agent"))
    assertFalse(
        "Should have removed cody.advanced.hasNativeWebview",
        configAfterMigration.hasPath("cody.advanced.hasNativeWebview"))

    // Check that default values have been removed
    assertFalse(
        "Should have removed cody.autocomplete.advanced.model",
        configAfterMigration.hasPath("cody.autocomplete.advanced.model"))
    assertFalse(
        "Should have removed cody.autocomplete.advanced.provider",
        configAfterMigration.hasPath("cody.autocomplete.advanced.provider"))
    assertFalse(
        "Should have removed cody.debug.verbose",
        configAfterMigration.hasPath("cody.debug.verbose"))
    assertFalse(
        "Should have removed cody.customHeaders",
        configAfterMigration.hasPath("cody.customHeaders"))
    assertFalse(
        "Should have removed cody.telemetry.clientName",
        configAfterMigration.hasPath("cody.telemetry.clientName"))
    assertFalse(
        "Should have removed cody.telemetry.level",
        configAfterMigration.hasPath("cody.telemetry.level"))
    assertFalse(
        "Should have removed cody.experimental.foldingRanges",
        configAfterMigration.hasPath("cody.experimental.foldingRanges"))
    assertFalse(
        "Should have removed cody.experimental.tracing",
        configAfterMigration.hasPath("cody.experimental.tracing"))

    // Check that non-default configuration remains intact
    assertTrue(
        "Should not remove cody.autocomplete.enabled",
        configAfterMigration.hasPath("cody.autocomplete.enabled"))
    assertEquals(true, configAfterMigration.getBoolean("cody.autocomplete.enabled"))
  }

  fun testNoErrorOnMissingSettingsFile() {
    // Ensure settings file doesn't exist
    if (settingsFile.exists()) {
      Files.delete(settingsFile)
    }

    // Run the migration - it should not throw any exceptions
    migration.cleanupTemporaryClientConfig(project)

    // Verify the file still doesn't exist
    assertFalse("Settings file should not be created if it didn't exist", settingsFile.exists())
  }

  fun testNoErrorWhenTemporarySettingsNotPresent() {
    // Create a settings file without temporary client-side configuration
    // but with a non-default value
    val cleanConfig =
        """
      {
        "cody": {
          "autocomplete": {
            "enabled": true
          },
          "experimental": {
            "tracing": true
          }
        }
      }
    """
            .trimIndent()

    settingsFile.writeText(cleanConfig)

    migration.cleanupTemporaryClientConfig(project)

    // Verify the result is unchanged for custom values
    val configAfterMigration = ConfigFactory.parseString(settingsFile.readText()).resolve()

    assertTrue(
        "Should keep cody.autocomplete.enabled",
        configAfterMigration.hasPath("cody.autocomplete.enabled"))
    assertEquals(true, configAfterMigration.getBoolean("cody.autocomplete.enabled"))

    // Non-default experimental.tracing value should be preserved
    assertTrue(
        "Should keep non-default cody.experimental.tracing",
        configAfterMigration.hasPath("cody.experimental.tracing"))
    assertEquals(true, configAfterMigration.getBoolean("cody.experimental.tracing"))
  }
}
