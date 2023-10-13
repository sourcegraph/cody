import com.jetbrains.plugin.structure.base.utils.isDirectory
import de.undercouch.gradle.tasks.download.Download
import java.util.EnumSet
import java.util.zip.ZipFile
import org.jetbrains.changelog.markdownToHTML
import org.jetbrains.intellij.tasks.RunPluginVerifierTask.FailureLevel
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

fun properties(key: String) = project.findProperty(key).toString()

val isForceBuild = properties("forceBuild") == "true"
val isForceAgentBuild =
    isForceBuild ||
        properties("forceCodyBuild") == "true" ||
        properties("forceAgentBuild") == "true"
val isForceCodeSearchBuild = isForceBuild || properties("forceCodeSearchBuild") == "true"

plugins {
  id("java")
  id("de.undercouch.download") version "5.5.0"
  // Dependencies are locked at this version to work with JDK 11 on CI.
  id("org.jetbrains.kotlin.jvm") version "1.9.10"
  id("org.jetbrains.intellij") version "1.15.0"
  id("org.jetbrains.changelog") version "1.3.1"
  id("com.diffplug.spotless") version "6.21.0"
}

group = properties("pluginGroup")

version = properties("pluginVersion")

repositories { mavenCentral() }

intellij {
  pluginName.set(properties("pluginName"))
  version.set(properties("platformVersion"))
  type.set(properties("platformType"))

  // Plugin Dependencies. Uses `platformPlugins` property from the gradle.properties file.
  plugins.set(properties("platformPlugins").split(',').map(String::trim).filter(String::isNotEmpty))

  updateSinceUntilBuild.set(false)
}

dependencies {
  implementation("org.commonmark:commonmark:0.21.0")
  implementation("org.commonmark:commonmark-ext-gfm-tables:0.21.0")
  implementation("org.eclipse.lsp4j:org.eclipse.lsp4j.jsonrpc:0.21.0")
  implementation("com.googlecode.java-diff-utils:diffutils:1.3.0")

  testImplementation(platform("org.junit:junit-bom:5.7.2"))
  testImplementation("org.junit.jupiter:junit-jupiter")
  testImplementation("org.assertj:assertj-core:3.24.2")
}

spotless {
  java {
    target("src/*/java/**/*.java")
    importOrder()
    removeUnusedImports()
    googleJavaFormat()
  }
  kotlinGradle {
    ktfmt()
    trimTrailingWhitespace()
  }
  kotlin {
    ktfmt()
    trimTrailingWhitespace()
    target("src/**/*.kt")
  }
}

java {
  toolchain {
    // Always compile the codebase with Java 11 regardless of what Java
    // version is installed on the computer. Gradle will download Java 11
    // even if you already have it installed on your computer.
    languageVersion.set(JavaLanguageVersion.of(properties("javaVersion").toInt()))
  }
}

tasks {
  val codeSearchCommit = "9d86a4f7d183e980acfe5d6b6468f06aaa0d8acf"
  val downloadCodeSearch =
      register<Download>("downloadCodeSearch") {
        val url = "https://github.com/sourcegraph/sourcegraph/archive/$codeSearchCommit.zip"
        src(url)
        dest(buildDir.resolve("$codeSearchCommit.zip"))
        overwrite(false)
      }

  val unzipCodeSearch =
      register<Copy>("unzipCodeSearch") {
        dependsOn(downloadCodeSearch)
        from(zipTree(downloadCodeSearch.get().dest))
        val dir = buildDir.resolve("code-search")
        into(dir)
        include("**/*")
        exclude("**/*.go")
        destinationDir = dir.resolve("sourcegraph-$codeSearchCommit")
      }

  val buildCodeSearch =
      register<Copy>("buildCodeSearch") {
        val unzipDir = unzipCodeSearch.get().destinationDir
        if (!unzipDir.exists()) {
          dependsOn(unzipCodeSearch)
        } else {
          println("Cached $unzipDir")
        }
        doLast {
          val sourcegraphDir = unzipCodeSearch.get().destinationDir
          val destinationDir =
              rootDir.resolve("src").resolve("main").resolve("resources").resolve("dist")
          if (destinationDir.isDirectory && !isForceCodeSearchBuild) {
            println("Cached $destinationDir")
            return@doLast
          }
          exec {
            workingDir(sourcegraphDir.toString())
            commandLine("pnpm", "install", "--frozen-lockfile")
          }
          exec {
            workingDir(sourcegraphDir.toString())
            commandLine("pnpm", "generate")
          }
          val jetbrainsDir = sourcegraphDir.resolve("client").resolve("jetbrains")
          exec {
            commandLine("pnpm", "build")
            workingDir(jetbrainsDir)
          }
          val buildOutput =
              jetbrainsDir.resolve("src").resolve("main").resolve("resources").resolve("dist")
          from(fileTree(buildOutput))
          into(destinationDir)
          include("**/*")
        }
      }

  processResources { dependsOn(buildCodeSearch) }

  val codyCommit = "68281675fd0731c0b2d30f61b85bb84dea165242"
  val downloadCody =
      register<Download>("downloadCody") {
        val url = "https://github.com/sourcegraph/cody/archive/$codyCommit.zip"
        src(url)
        dest(buildDir.resolve("$codyCommit.zip"))
        overwrite(false)
      }

  val unzipCody =
      register<Copy>("unzipCody") {
        val customCodyDir = System.getenv("CODY_DIR")
        if (customCodyDir != null) {
          destinationDir = file(customCodyDir)
          return@register
        }
        dependsOn(downloadCody)
        from(zipTree(downloadCody.get().dest))
        val dir = buildDir.resolve("cody")
        into(dir)
        include("**/*")
        destinationDir = dir.resolve("cody-$codyCommit")
      }

  val buildCody =
      register<Copy>("buildCody") {
        val unzipDir = unzipCody.get().destinationDir
        if (!unzipDir.exists()) {
          dependsOn(unzipCody)
        } else {
          println("Cached $unzipDir")
        }
        destinationDir = buildDir.resolve("sourcegraph").resolve("agent")
        doLast {
          val codyDir = unzipCody.get().destinationDir
          if (destinationDir.isDirectory && !isForceAgentBuild) {
            println("Cached $destinationDir")
            return@doLast
          }
          println("pnpm install in directory $codyDir")
          println("children ${codyDir.listFiles()?.map { it.absolutePath }}")
          exec {
            workingDir(codyDir.toString())
            commandLine("pnpm", "install", "--frozen-lockfile")
          }
          exec {
            commandLine("pnpm", "run", "build-agent-binaries")
            workingDir(codyDir.resolve("agent").toString())
            environment("AGENT_EXECUTABLE_TARGET_DIRECTORY", destinationDir.toString())
          }
        }
      }

  // Set the JVM compatibility versions
  properties("javaVersion").let {
    withType<JavaCompile> {
      sourceCompatibility = it
      targetCompatibility = it
    }
    withType<KotlinCompile> { kotlinOptions.jvmTarget = it }
  }

  wrapper { gradleVersion = properties("gradleVersion") }

  patchPluginXml {
    version.set(properties("pluginVersion"))

    // Extract the <!-- Plugin description --> section from README.md and provide for the plugin's
    // manifest
    pluginDescription.set(
        projectDir
            .resolve("README.md")
            .readText()
            .lines()
            .run {
              val start = "<!-- Plugin description -->"
              val end = "<!-- Plugin description end -->"

              if (!containsAll(listOf(start, end))) {
                throw GradleException(
                    "Plugin description section not found in README.md:\n$start ... $end")
              }
              subList(indexOf(start) + 1, indexOf(end))
            }
            .joinToString("\n")
            .run { markdownToHTML(this) },
    )

    // Get the latest available change notes from the changelog file
    changeNotes.set(
        provider {
          changelog.run { getOrNull(properties("pluginVersion")) ?: getLatest() }.toHTML()
        },
    )
  }

  buildPlugin {
    dependsOn(buildCodeSearch)
    val agentDir = buildCody.get().destinationDir.toString()
    from(
        fileTree(agentDir) { include("*") },
    ) {
      into("agent/")
    }
  }

  register("buildPluginAndAssertAgentBinariesExist") {
    dependsOn(buildPlugin)
    doLast {
      val pluginPath = buildPlugin.get().outputs.files.first()
      ZipFile(pluginPath).use { zip ->
        fun assertExists(name: String): Unit {
          val path = "Sourcegraph/agent/$name"
          if (zip.getEntry(path) == null) {
            throw Error("Agent binary '$path' not found in plugin zip $pluginPath")
          }
        }
        assertExists("agent-macos-arm64")
        assertExists("agent-macos-x64")
        assertExists("agent-linux-arm64")
        assertExists("agent-linux-x64")
        assertExists("agent-win-x64.exe")
      }
    }
  }

  runIde {
    dependsOn(buildCody)
    jvmArgs("-Djdk.module.illegalAccess.silent=true")
    systemProperty("cody-agent.trace-path", "$buildDir/sourcegraph/cody-agent-trace.json")
    systemProperty("cody-agent.directory", buildCody.get().destinationDir.toString())
    systemProperty("sourcegraph.verbose-logging", "true")
  }

  runPluginVerifier {
    ideVersions.set(listOf("2022.1", "2022.2", "2022.3", "2023.1", "2023.2"))
    val skippedFailureLevels =
        EnumSet.of(
            FailureLevel.DEPRECATED_API_USAGES,
            FailureLevel.SCHEDULED_FOR_REMOVAL_API_USAGES, // blocked by: Kotlin UI DSL Cell.align
            FailureLevel.EXPERIMENTAL_API_USAGES,
            FailureLevel.NOT_DYNAMIC)
    failureLevel.set(EnumSet.complementOf(skippedFailureLevels))
  }

  // Configure UI tests plugin
  // Read more: https://github.com/JetBrains/intellij-ui-test-robot
  runIdeForUiTests {
    systemProperty("robot-server.port", "8082")
    systemProperty("ide.mac.message.dialogs.as.sheets", "false")
    systemProperty("jb.privacy.policy.text", "<!--999.999-->")
    systemProperty("jb.consents.confirmation.enabled", "false")
  }

  signPlugin {
    certificateChain.set(System.getenv("CERTIFICATE_CHAIN"))
    privateKey.set(System.getenv("PRIVATE_KEY"))
    password.set(System.getenv("PRIVATE_KEY_PASSWORD"))
  }

  publishPlugin {
    dependsOn("patchChangelog")
    token.set(System.getenv("PUBLISH_TOKEN"))
    // pluginVersion is based on the SemVer (https://semver.org) and supports pre-release labels,
    // like 2.1.7-alpha.3
    // Specify pre-release label to publish the plugin in a custom Release Channel automatically.
    // Read more:
    // https://plugins.jetbrains.com/docs/intellij/deployment.html#specifying-a-release-channel
    channels.set(
        listOf(
            properties("pluginVersion").split('-').getOrElse(1) { "default" }.split('.').first()))
  }
}

tasks.test { useJUnitPlatform() }
