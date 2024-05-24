import com.jetbrains.plugin.structure.base.utils.isDirectory
import java.net.URL
import java.nio.file.FileSystems
import java.nio.file.FileVisitResult
import java.nio.file.Files
import java.nio.file.PathMatcher
import java.nio.file.Paths
import java.nio.file.SimpleFileVisitor
import java.nio.file.StandardCopyOption
import java.nio.file.attribute.BasicFileAttributes
import java.util.EnumSet
import java.util.jar.JarFile
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

// As https://www.jetbrains.com/updates/updates.xml adds a new "IntelliJ IDEA" YYYY.N version, add
// it to this list.
// Remove unsupported old versions from this list.
val versionsOfInterest =
    listOf("2022.1", "2022.2", "2022.3", "2023.1", "2023.2", "2023.3", "2024.1").sorted()
val versionsToValidate =
    when (project.properties["validation"]?.toString()) {
      "lite" -> listOf(versionsOfInterest.first(), versionsOfInterest.last())
      null,
      "full" -> versionsOfInterest
      else ->
          error(
              "Unexpected validation property: \"validation\" should be \"lite\" or \"full\" (default) was \"${project.properties["validation"]}\"")
    }
val skippedFailureLevels =
    EnumSet.of(
        FailureLevel.DEPRECATED_API_USAGES,
        FailureLevel.SCHEDULED_FOR_REMOVAL_API_USAGES, // blocked by: Kotlin UI DSL Cell.align
        FailureLevel.EXPERIMENTAL_API_USAGES,
        FailureLevel.NOT_DYNAMIC)!!

plugins {
  id("java")
  // Dependencies are locked at this version to work with JDK 11 on CI.
  id("org.jetbrains.kotlin.jvm") version "1.9.22"
  id("org.jetbrains.intellij") version "1.17.3"
  id("org.jetbrains.changelog") version "1.3.1"
  id("com.diffplug.spotless") version "6.25.0"
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
  testImplementation("org.awaitility:awaitility-kotlin:4.2.0")
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

fun download(url: String, output: File) {
  if (output.exists()) {
    println("Cached $output")
    return
  }
  println("Downloading... $url")
  assert(output.parentFile.mkdirs()) { output.parentFile }
  Files.copy(URL(url).openStream(), output.toPath())
}

fun copyRecursively(input: File, output: File) {
  if (!input.isDirectory) {
    throw IllegalArgumentException("not a directory: $input")
  }
  if (!output.isDirectory) {
    Files.createDirectories(output.toPath())
  }
  val inputPath = input.toPath()
  val outputPath = output.toPath()
  Files.walkFileTree(
      inputPath,
      object : SimpleFileVisitor<java.nio.file.Path>() {
        override fun visitFile(
            file: java.nio.file.Path?,
            attrs: BasicFileAttributes?
        ): FileVisitResult {
          if (file != null) {
            val destination = outputPath.resolve(file.fileName)
            if (!destination.parent.isDirectory) {
              Files.createDirectories(destination.parent)
            }
            println("Copy ${inputPath.relativize(file)}")
            Files.copy(file, outputPath.resolve(file.fileName), StandardCopyOption.REPLACE_EXISTING)
          }
          return super.visitFile(file, attrs)
        }
      })
}

fun unzip(input: File, output: File, excludeMatcher: PathMatcher? = null) {
  var first = true
  val outputPath = output.toPath()
  JarFile(input).use { zip ->
    val entries = zip.entries()
    while (entries.hasMoreElements()) {
      val element = entries.nextElement()
      if (element.name.endsWith("/")) {
        continue
      }
      zip.getInputStream(element).use { stream ->
        val dest = outputPath.resolve(element.name)
        if (!dest.parent.isDirectory) {
          Files.createDirectories(dest.parent)
        }
        if (first) {
          if (Files.isRegularFile(dest)) {
            println("Cached $output")
            return
          } else {
            println("Unzipping... $input")
          }
        }
        first = false
        if (excludeMatcher?.matches(dest) != true) {
          println("unzip: ${element.name}")
          Files.copy(stream, dest, StandardCopyOption.REPLACE_EXISTING)
        }
      }
    }
  }
}

val githubArchiveCache =
    Paths.get(System.getProperty("user.home"), ".sourcegraph", "caches", "jetbrains").toFile()

tasks {
  val codeSearchCommit = "9d86a4f7d183e980acfe5d6b6468f06aaa0d8acf"
  fun downloadCodeSearch(): File {
    val url = "https://github.com/sourcegraph/sourcegraph/archive/$codeSearchCommit.zip"
    val destination = githubArchiveCache.resolve("$codeSearchCommit.zip")
    download(url, destination)
    return destination
  }

  fun unzipCodeSearch(): File {
    val zip = downloadCodeSearch()
    val dir = githubArchiveCache.resolve("code-search")
    unzip(zip, dir, FileSystems.getDefault().getPathMatcher("glob:**.go"))
    return dir.resolve("sourcegraph-$codeSearchCommit")
  }

  fun buildCodeSearch(): File? {
    if (System.getenv("SKIP_CODE_SEARCH_BUILD") == "true") return null
    val destinationDir = rootDir.resolve("src").resolve("main").resolve("resources").resolve("dist")
    if (!isForceCodeSearchBuild && destinationDir.exists()) {
      println("Cached $destinationDir")
      return destinationDir
    }

    val sourcegraphDir = unzipCodeSearch()
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
    copyRecursively(buildOutput, destinationDir)
    return destinationDir
  }

  fun downloadNodeBinaries(): File {
    val nodeCommit = properties("nodeBinaries.commit")
    val nodeVersion = properties("nodeBinaries.version")
    val url = "https://github.com/sourcegraph/node-binaries/archive/$nodeCommit.zip"
    val zipFile = githubArchiveCache.resolve("$nodeCommit.zip")
    download(url, zipFile)
    val destination = githubArchiveCache.resolve("node").resolve("node-binaries-$nodeCommit")
    unzip(zipFile, destination.parentFile)
    return destination.resolve(nodeVersion)
  }

  fun downloadCody(): File {
    val codyCommit = properties("cody.commit")
    val fromEnvironmentVariable = System.getenv("CODY_DIR")
    if (!fromEnvironmentVariable.isNullOrEmpty()) {
      // "~" works fine from the terminal, however it breaks IntelliJ's run configurations
      val pathString =
          if (fromEnvironmentVariable.startsWith("~")) {
            System.getProperty("user.home") + fromEnvironmentVariable.substring(1)
          } else {
            fromEnvironmentVariable
          }
      return Paths.get(pathString).toFile()
    }
    val url = "https://github.com/sourcegraph/cody/archive/$codyCommit.zip"
    val zipFile = githubArchiveCache.resolve("$codyCommit.zip")
    download(url, zipFile)
    val destination = githubArchiveCache.resolve("cody").resolve("cody-$codyCommit")
    unzip(zipFile, destination.parentFile)
    return destination
  }

  val buildCodyDir = buildDir.resolve("sourcegraph").resolve("agent")
  fun buildCody(): File {
    if (!isForceAgentBuild && (buildCodyDir.listFiles()?.size ?: 0) > 0) {
      println("Cached $buildCodyDir")
      return buildCodyDir
    }
    val codyDir = downloadCody()
    println("Using cody from codyDir=$codyDir")
    exec {
      workingDir(codyDir)
      commandLine("pnpm", "install", "--frozen-lockfile")
    }
    val agentDir = codyDir.resolve("agent")
    exec {
      workingDir(agentDir)
      commandLine("pnpm", "run", "build:agent")
    }
    copy {
      from(agentDir.resolve("dist")) {
        include("index.js")
        include("index.js.map")
        include("*.wasm")
      }
      into(buildCodyDir)
    }

    copy {
      from(downloadNodeBinaries())
      into(buildCodyDir)
    }

    return buildCodyDir
  }

  fun getIdeaInstallDir(ideaVersion: String): File? {
    val gradleHome = project.gradle.gradleUserHomeDir
    val cacheDir = File(gradleHome, "caches/modules-2/files-2.1/com.jetbrains.intellij.idea/ideaIC")
    val ideaDir = File(cacheDir, ideaVersion)
    return ideaDir.walk().find { it.name == "ideaIC-$ideaVersion" }
  }

  register("buildCodeSearch") { buildCodeSearch() }
  register("buildCody") { buildCody() }

  processResources { dependsOn(":buildCodeSearch") }

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
  }

  buildPlugin {
    dependsOn(project.tasks.getByPath("buildCody"))
    from(
        fileTree(buildCodyDir) { include("*") },
    ) {
      into("agent/")
    }

    doLast {
      // Assert that agent binaries are included in the plugin
      val pluginPath = buildPlugin.get().outputs.files.first()
      ZipFile(pluginPath).use { zip ->
        fun assertExists(name: String) {
          val path = "Sourcegraph/agent/$name"
          if (zip.getEntry(path) == null) {
            throw Error("Agent binary '$path' not found in plugin zip $pluginPath")
          }
        }
        assertExists("node-macos-arm64")
        assertExists("node-macos-x64")
        assertExists("node-linux-arm64")
        assertExists("node-linux-x64")
        assertExists("node-win-x64.exe")
      }
    }
  }

  runIde {
    dependsOn(project.tasks.getByPath("buildCody"))
    jvmArgs("-Djdk.module.illegalAccess.silent=true")
    systemProperty("cody-agent.trace-path", "$buildDir/sourcegraph/cody-agent-trace.json")
    systemProperty("cody-agent.directory", buildCodyDir.parent)
    systemProperty("sourcegraph.verbose-logging", "true")
    systemProperty(
        "cody.autocomplete.enableFormatting",
        project.property("cody.autocomplete.enableFormatting") ?: "true")

    val platformRuntimeVersion = project.findProperty("platformRuntimeVersion")
    if (platformRuntimeVersion != null) {
      val ideaInstallDir =
          getIdeaInstallDir(platformRuntimeVersion.toString())
              ?: throw GradleException(
                  "Could not find IntelliJ install for $platformRuntimeVersion")
      ideDir.set(ideaInstallDir)
    }
  }

  runPluginVerifier {
    ideVersions.set(versionsToValidate)
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
    token.set(System.getenv("PUBLISH_TOKEN"))

    // pluginVersion is based on the SemVer (https://semver.org) and supports pre-release labels,
    // like 2.1.7-nightly
    // Specify pre-release label to publish the plugin in a custom Release Channel automatically.
    // Read more:
    // https://plugins.jetbrains.com/docs/intellij/deployment.html#specifying-a-release-channel
    val channel = properties("pluginVersion").split('-').getOrElse(1) { "default" }
    channels.set(listOf(channel))

    if (channel == "default") {
      // The published version WILL NOT be available right after the JetBrains approval.
      // Instead, we control if and when we want to make it available.
      // (Note: there is ~48h waiting time for JetBrains approval).
      hidden.set(true)
    }
  }

  test {
    systemProperty("cody-agent.directory", buildCodyDir.parent)
    dependsOn(project.tasks.getByPath("buildCody"))
  }
}
