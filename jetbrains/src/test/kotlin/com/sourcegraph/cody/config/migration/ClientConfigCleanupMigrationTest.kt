package com.sourcegraph.cody.config.migration

import com.intellij.openapi.project.Project
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sourcegraph.config.ConfigUtil
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.exists
import kotlin.io.path.readText
import kotlin.io.path.writeText

class ClientConfigCleanupMigrationTest : BasePlatformTestCase() {

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
            "enabled": false,
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

    ConfigUtil.setCustomConfiguration(project, tempConfig)
    migration.cleanupTemporaryClientConfig(project)

    assertEquals(
        """
      {
          "cody" : {
              "autocomplete" : {
                  "enabled" : false
              }
          }
      }

      """
            .trimIndent(),
        settingsFile.readText())
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
    // Create a settings file without temporary client-side
    // configuration but with a non-default value
    val cleanConfig =
        """
        {
            "cody" : {
                "autocomplete.enabled" : false,
                "experimental" : {
                    "tracing" : true
                }
            }
        }

        """
            .trimIndent()

    settingsFile.writeText(cleanConfig)
    migration.cleanupTemporaryClientConfig(project)

    assertEquals(cleanConfig, settingsFile.readText())
  }
}
