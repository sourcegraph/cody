import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.intellij.platform.gradle.tasks.BuildPluginTask

plugins {
  id("java")
  id("org.jetbrains.kotlin.jvm") version "2.0.20"
  id("org.jetbrains.intellij.platform") version "2.1.0"
  id("spotless-conventions")
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
    id = "cody-test-support"
    name = "Cody Test Support"
    version = "1.0.0"
    ideaVersion { sinceBuild = "242" }
  }
}

tasks {
  val runIdeForTesting by
      intellijPlatformTesting.runIde.registering {
        // TODO: Add the ability to test different products and versions.
        version.set("2024.2")
        type.set(IntelliJPlatformType.IntellijIdeaCommunity)
        task.get().dependsOn(rootProject.tasks.named("buildPlugin"))
        plugins {
          localPlugin(
              rootProject.tasks
                  .named<BuildPluginTask>("buildPlugin")
                  .get()
                  .outputs
                  .files
                  .singleFile)
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
