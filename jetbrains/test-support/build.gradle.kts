import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.intellij.platform.gradle.tasks.BuildPluginTask

plugins {
  id("java")
  id("org.jetbrains.kotlin.jvm") version "2.0.21"
  id("org.jetbrains.intellij.platform") version "2.1.0"
}

repositories {
  mavenCentral()
  intellijPlatform { defaultRepositories() }
}

dependencies {
  intellijPlatform {
    jetbrainsRuntime()
    create("IC", "2024.2")
    instrumentationTools()
    pluginVerifier()
  }

  implementation("io.ktor:ktor-server-core:3.0.1")
  implementation("io.ktor:ktor-server-netty:3.0.1")
  implementation("io.ktor:ktor-server-websockets:3.0.1")
}

intellijPlatform {
  buildSearchableOptions = false
  pluginConfiguration {
    id = "com.sourcegraph.jetbrains.testing"
    name = "Sourcegraph Test Support"
    version = "1.0.0"
    ideaVersion { sinceBuild = "242" }
  }
}

// tasks.named("buildPlugin").get().dependsOn(rootProject.tasks.named("buildPlugin"))

tasks {
  val runIdeForTesting by
      intellijPlatformTesting.runIde.registering {
          val buildPluginTaskProvider = rootProject.tasks.named<BuildPluginTask>("buildPlugin")
          // TODO: Despite this dependency, plugins/localPlugin below checks
          // the root plugin output exists eagerly. When clean, it does not exist.
          // If this task fails to find build/distributions/Sourcegraph-6.0-localbuild.zip,
          // run ./gradlew :buildPlugin first.
          task.get().dependsOn(buildPluginTaskProvider)
          // TODO: Add the ability to test different products and versions.
        version.set("2024.2")
        type.set(IntelliJPlatformType.IntellijIdeaCommunity)
        plugins {
            localPlugin(buildPluginTaskProvider.get().outputs.files.singleFile)
        }
      }
}

java {
  toolchain {
    languageVersion.set(JavaLanguageVersion.of(21))
    vendor = JvmVendorSpec.JETBRAINS
  }
}

kotlin {
  jvmToolchain {
    languageVersion.set(JavaLanguageVersion.of(21))
    vendor = JvmVendorSpec.JETBRAINS
  }
}
