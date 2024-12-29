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
import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.intellij.platform.gradle.TestFrameworkType
import org.jetbrains.intellij.platform.gradle.tasks.VerifyPluginTask.FailureLevel
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile
import org.jetbrains.kotlin.gradle.tasks.KotlinJvmCompile

fun properties(key: String) = project.findProperty(key)?.toString()

val codyDir = layout.projectDirectory.asFile.parentFile
val isForceAgentBuild = properties("forceAgentBuild") == "true"
val isForceCodeSearchBuild = properties("forceCodeSearchBuild") == "true"

// As https://www.jetbrains.com/updates/updates.xml adds a new "IntelliJ IDEA" YYYY.N version,
// add it to this list. Remove unsupported old versions from this list.
// Update gradle.properties pluginSinceBuild, pluginUntilBuild
// to match the min, max versions in this list.
val versionsOfInterest = listOf("2023.2", "2023.3", "2024.1", "2024.2.4", "2024.3").sorted()
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
        FailureLevel
            .COMPATIBILITY_PROBLEMS, // blocked by the hacks with the completion provider for the
        // remote IDE
        FailureLevel.DEPRECATED_API_USAGES,
        FailureLevel.EXPERIMENTAL_API_USAGES,
        FailureLevel.INTERNAL_API_USAGES,
        FailureLevel.NOT_DYNAMIC,
        FailureLevel
            .SCHEDULED_FOR_REMOVAL_API_USAGES // HttpConfigurable, migration to coroutines, others
        )!!

plugins {
  id("java")
  id("jvm-test-suite")
  id("org.jetbrains.kotlin.jvm") version "2.0.21"
  id("org.jetbrains.intellij.platform") version "2.1.0"
  id("org.jetbrains.changelog") version "2.2.1"
  id("com.diffplug.spotless") version "6.25.0"
}

val platformVersion: String by project
val platformType: String by project
val javaVersion: String by project
val majorPlatformVersion = platformVersion.split(".").first()

group = properties("pluginGroup")!!

version = properties("pluginVersion")!!

repositories {
  maven { url = uri("https://www.jetbrains.com/intellij-repository/releases") }
  mavenCentral()
  gradlePluginPortal()
  intellijPlatform {
    defaultRepositories()
    jetbrainsRuntime()
  }
}

intellijPlatform {
  pluginConfiguration {
    name = properties("pluginName")
    version = properties("pluginVersion")
    ideaVersion {
      sinceBuild = properties("pluginSinceBuild")
      untilBuild = properties("pluginUntilBuild")
    }
    // Extract the <!-- Plugin description --> section from README.md and provide for the plugin's
    // manifest
    description =
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
            .run { markdownToHTML(this) }
  }

  pluginVerification {
    ides { ides(versionsToValidate) }
    failureLevel = EnumSet.complementOf(skippedFailureLevels)
  }
}

dependencies {
  intellijPlatform {
    jetbrainsRuntime()
    create(platformType, platformVersion)
    bundledPlugins(
        properties("platformPlugins")
            .orEmpty()
            .split(',')
            .map(String::trim)
            .filter(String::isNotEmpty))
    instrumentationTools()
    pluginVerifier()
    testFramework(TestFrameworkType.Platform)

    if (majorPlatformVersion.toInt() >= 2024) {
      bundledModule("intellij.platform.vcs.dvcs.impl")
    }
  }

  implementation("com.typesafe:config:1.4.3")
  implementation("org.eclipse.lsp4j:org.eclipse.lsp4j.jsonrpc:0.23.1")
  testImplementation("net.java.dev.jna:jna:5.10.0") // it is needed for integration tests
  testImplementation("org.awaitility:awaitility-kotlin:4.2.2")
  testImplementation("org.junit.jupiter:junit-jupiter:5.11.3")
  testImplementation("org.jetbrains.kotlin:kotlin-test-junit:2.0.21")
  testImplementation("org.mockito:mockito-core:5.14.2")
  testImplementation("org.mockito.kotlin:mockito-kotlin:5.4.0")
}

spotless {
  lineEndings = com.diffplug.spotless.LineEnding.UNIX
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
    targetExclude("src/main/kotlin/com/sourcegraph/cody/agent/protocol_generated/**")
    toggleOffOn()
  }
}

java {
  toolchain {
    languageVersion.set(JavaLanguageVersion.of(javaVersion.toInt()))
    vendor = JvmVendorSpec.JETBRAINS
  }
}

kotlin {
  jvmToolchain {
    languageVersion.set(JavaLanguageVersion.of(javaVersion.toInt()))
    vendor = JvmVendorSpec.JETBRAINS
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

val githubArchiveCache: File =
    Paths.get(System.getProperty("user.home"), ".sourcegraph", "caches", "jetbrains").toFile()

fun Test.sharedIntegrationTestConfig(buildCodyDir: File, mode: String) {
  group = "verification"
  testClassesDirs = sourceSets["integrationTest"].output.classesDirs
  classpath = sourceSets["integrationTest"].runtimeClasspath

  include("**/AllSuites.class")

  maxHeapSize = "8G"

  jvmArgs(
      "-Djava.system.class.loader=com.intellij.util.lang.PathClassLoader",
      "--add-opens=java.desktop/java.awt.event=ALL-UNNAMED",
      "--add-opens=java.desktop/sun.font=ALL-UNNAMED",
      "--add-opens=java.desktop/java.awt=ALL-UNNAMED",
      "--add-opens=java.desktop/sun.awt=ALL-UNNAMED",
      "--add-opens=java.base/java.lang=ALL-UNNAMED",
      "--add-opens=java.base/java.util=ALL-UNNAMED",
      "--add-opens=java.desktop/javax.swing=ALL-UNNAMED",
      "--add-opens=java.desktop/sun.swing=ALL-UNNAMED",
      "--add-opens=java.desktop/javax.swing.plaf.basic=ALL-UNNAMED",
      "--add-opens=java.desktop/java.awt.peer=ALL-UNNAMED",
      "--add-opens=java.desktop/javax.swing.text.html=ALL-UNNAMED",
      "--add-exports=java.base/jdk.internal.vm=ALL-UNNAMED",
      "--add-exports=java.desktop/sun.font=ALL-UNNAMED")

  val resourcesDir = project.file("src/integrationTest/resources")
  systemProperties(
      "cody-agent.trace-path" to
          "${layout.buildDirectory.asFile.get()}/sourcegraph/cody-agent-trace.json",
      "cody-agent.directory" to buildCodyDir.parent,
      "sourcegraph.verbose-logging" to "true",
      "cody.autocomplete.enableFormatting" to
          (project.property("cody.autocomplete.enableFormatting") as String? ?: "true"),
      "cody.integration.testing" to "true",
      "cody.ignore.policy.timeout" to 1500, // Increased to 1500ms as CI tends to be slower
      "idea.test.execution.policy" to "com.sourcegraph.cody.NonEdtIdeaTestExecutionPolicy",
      "test.resources.dir" to resourcesDir.absolutePath)

  environment(
      "CODY_RECORDING_MODE" to mode,
      "CODY_RECORDING_NAME" to "integration-test",
      "CODY_RECORDING_DIRECTORY" to resourcesDir.resolve("recordings").absolutePath,
      "CODY_SHIM_TESTING" to "true",
      "CODY_TEMPERATURE_ZERO" to "true",
      "CODY_TELEMETRY_EXPORTER" to "testing",
      // Fastpass has custom bearer tokens that are difficult to record with Polly
      "CODY_DISABLE_FASTPATH" to "true",
  )

  useJUnit()
  dependsOn("buildCody")
}

val isWindows = System.getProperty("os.name").lowercase().contains("win")
val pnpmPath =
    if (isWindows) {
      arrayOf("cmd", "/k", "pnpm")
    } else {
      arrayOf("pnpm")
    }

tasks {
  val codeSearchCommit = "9d86a4f7d183e980acfe5d6b6468f06aaa0d8acf"
  fun downloadCodeSearch(): File {
    val url =
        "https://github.com/sourcegraph/sourcegraph-public-snapshot/archive/$codeSearchCommit.zip"
    val destination = githubArchiveCache.resolve("$codeSearchCommit.zip")
    download(url, destination)
    return destination
  }

  fun unzipCodeSearch(): File {
    val zip = downloadCodeSearch()
    val dir = githubArchiveCache.resolve("code-search")
    unzip(zip, dir, FileSystems.getDefault().getPathMatcher("glob:**.go"))
    return dir.resolve("sourcegraph-public-snapshot-$codeSearchCommit")
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
      commandLine(*pnpmPath, "install", "--frozen-lockfile", "--fix-lockfile")
    }
    exec {
      workingDir(sourcegraphDir.toString())
      commandLine(*pnpmPath, "generate")
    }
    val jetbrainsDir = sourcegraphDir.resolve("client").resolve("jetbrains")
    exec {
      commandLine(*pnpmPath, "build")
      workingDir(jetbrainsDir)
    }
    val buildOutput =
        jetbrainsDir.resolve("src").resolve("main").resolve("resources").resolve("dist")
    copyRecursively(buildOutput, destinationDir)
    return destinationDir
  }

  fun downloadNodeBinaries(): File {
    val nodeCommit = properties("nodeBinaries.commit")!!
    val nodeVersion = properties("nodeBinaries.version")!!
    val url = "https://github.com/sourcegraph/node-binaries/archive/$nodeCommit.zip"
    val zipFile = githubArchiveCache.resolve("$nodeCommit.zip")
    download(url, zipFile)
    val destination = githubArchiveCache.resolve("node").resolve("node-binaries-$nodeCommit")
    unzip(zipFile, destination.parentFile)
    return destination.resolve(nodeVersion)
  }

  val buildCodyDir = layout.buildDirectory.asFile.get().resolve("sourcegraph").resolve("agent")

  fun buildCody(): File {
    if (!isForceAgentBuild && (buildCodyDir.listFiles()?.size ?: 0) > 0) {
      println("Cached $buildCodyDir")
      return buildCodyDir
    }
    exec {
      workingDir(codyDir)
      commandLine(*pnpmPath, "install", "--frozen-lockfile")
    }
    val agentDir = codyDir.resolve("agent")
    exec {
      workingDir(agentDir)
      commandLine(*pnpmPath, "run", "build")
    }
    copy {
      from(agentDir.resolve("dist"))
      into(buildCodyDir)
    }
    copy {
      from(downloadNodeBinaries())
      into(buildCodyDir)
      eachFile { permissions { unix("rwxrwxrwx") } }
    }

    return buildCodyDir
  }
  fun copyProtocol() {
    val sourceDir =
        codyDir.resolve(
            Paths.get(
                    "agent",
                    "bindings",
                    "kotlin",
                    "lib",
                    "src",
                    "main",
                    "kotlin",
                    "com",
                    "sourcegraph",
                    "cody",
                    "agent",
                    "protocol_generated")
                .toString())
    val targetDir =
        layout.projectDirectory.asFile.resolve(
            "src/main/kotlin/com/sourcegraph/cody/agent/protocol_generated")

    targetDir.deleteRecursively()
    sourceDir.copyRecursively(targetDir, overwrite = true)
    // in each file replace the package name
    for (file in targetDir.walkTopDown()) {
      if (file.isFile && file.extension == "kt") {
        val content = file.readText()
        // This is only a temporary solution to inject the notice.
        // I've kept here so that it's clear where the files are modified.
        val newContent =
            """
        |/*
        | * Generated file - DO NOT EDIT MANUALLY
        | * They are copied from the cody agent project using the copyProtocol gradle task.
        | * This is only a temporary solution before we fully migrate to generated protocol messages.
        | */
        |
    """
                .trimMargin() + content
        file.writeText(newContent)
      }
    }
  }

  // System properties that are used for testing purposes. These properties
  // should be consistently set in different local dev environments, like `./gradlew :customRunIde`,
  // `./gradlew test` or when testing inside IntelliJ
  val agentProperties =
      mapOf<String, Any>(
          "cody-agent.trace-path" to
              "${layout.buildDirectory.asFile.get()}/sourcegraph/cody-agent-trace.json",
          "cody-agent.directory" to buildCodyDir.parent,
          "sourcegraph.verbose-logging" to "true",
          "cody-agent.is-dev-mode" to (System.getProperty("cody-agent.is-dev-mode") ?: "true"),
          "cody-agent.fullDocumentSyncEnabled" to
              (System.getProperty("cody-agent.fullDocumentSyncEnabled") ?: "false"),
          "cody.autocomplete.enableFormatting" to
              (project.property("cody.autocomplete.enableFormatting") ?: "true"))

  fun getIdeaInstallDir(ideaVersion: String, ideaType: String): File? {
    val gradleHome = project.gradle.gradleUserHomeDir
    val cacheDir =
        File(gradleHome, "caches/modules-2/files-2.1/com.jetbrains.intellij.idea/idea$ideaType")
    val ideaDir = File(cacheDir, ideaVersion)
    return ideaDir.walk().find { it.name == "idea$ideaType-$ideaVersion" }
  }

  register("copyProtocol") { copyProtocol() }
  register("buildCodeSearch") { buildCodeSearch() }
  register("buildCody") { buildCody() }

  processResources { dependsOn(":buildCodeSearch") }

  // Set the JVM compatibility versions
  javaVersion.let {
    withType<JavaCompile> {
      sourceCompatibility = it
      targetCompatibility = it
    }
    withType<KotlinJvmCompile> { compilerOptions.jvmTarget.set(JvmTarget.JVM_17) }
  }

  buildPlugin {
    dependsOn(project.tasks.getByPath("buildCody"))
    composedJar.get().exclude("com/intellij/codeInsight/inline/completion/**")
    from(
        fileTree(buildCodyDir) {
          include("*")
          include("webviews/**")
        },
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

  val customRunIde by
      intellijPlatformTesting.runIde.registering {
        task.get().dependsOn(project.tasks.getByPath("buildCody"))
        task.get().jvmArgs("-Djdk.module.illegalAccess.silent=true")

        version.set(properties("platformRuntimeVersion"))
        val myType = IntelliJPlatformType.fromCode(properties("platformRuntimeType") ?: "IC")
        type.set(myType)
        plugins { plugins(properties("platformRuntimePlugins").orEmpty()) }
        splitMode.set(properties("splitMode")?.toBoolean() ?: false)

        agentProperties.forEach { (key, value) -> task.get().systemProperty(key, value) }
      }

  runIde {
    doLast {
      project.logger.error(
          """
          ==========================================
          The :runIde task is no longer supported.
          Please use the :customRunIde task instead.
          ==========================================
        """)
    }
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
    val channel = properties("pluginVersion")!!.split('-').getOrElse(1) { "default" }
    channels.set(listOf(channel))

    if (channel == "default") {
      // The published version WILL NOT be available right after the JetBrains approval.
      // Instead, we control if and when we want to make it available.
      // (Note: there is ~48h waiting time for JetBrains approval).
      hidden.set(true)
    }
  }

  test { dependsOn(project.tasks.getByPath("buildCody")) }

  sourceSets {
    main { kotlin.srcDir("src/intellij${majorPlatformVersion}/kotlin") }

    create("integrationTest") {
      kotlin.srcDir("src/integrationTest/kotlin")
      compileClasspath += main.get().output + configurations.testCompileClasspath.get()
      runtimeClasspath += compileClasspath + configurations.testRuntimeClasspath.get()
    }
  }

  register<Test>("integrationTest") {
    description = "Runs the integration tests."
    sharedIntegrationTestConfig(buildCodyDir, "replay")
    dependsOn("processIntegrationTestResources")
    project.properties["repeatTests"]?.let { systemProperty("repeatTests", it) }
  }

  register<Test>("passthroughIntegrationTest") {
    description = "Runs the integration tests, passing everything through to the LLM."
    sharedIntegrationTestConfig(buildCodyDir, "passthrough")
    dependsOn("processIntegrationTestResources")
  }

  register<Test>("recordingIntegrationTest") {
    description = "Runs the integration tests and records the responses."
    sharedIntegrationTestConfig(buildCodyDir, "record")
    dependsOn("processIntegrationTestResources")
  }

  named<Copy>("processIntegrationTestResources") {
    from(sourceSets["integrationTest"].resources)
    into("${layout.buildDirectory.asFile.get()}/resources/integrationTest")
    exclude("**/.idea/**")
    exclude("**/*.xml")
    duplicatesStrategy = DuplicatesStrategy.EXCLUDE
  }

  withType<Test> {
    systemProperty(
        "idea.test.src.dir", "${layout.buildDirectory.asFile.get()}/resources/integrationTest")
    systemProperty("idea.force.use.core.classloader", "true")
  }

  withType<KotlinCompile> { dependsOn("copyProtocol") }

  named("check") { dependsOn("integrationTest") }

  test {
    jvmArgs("-Didea.ProcessCanceledException=disabled")
    agentProperties.forEach { (key, value) -> systemProperty(key, value) }
    dependsOn("buildCody")
  }
}
