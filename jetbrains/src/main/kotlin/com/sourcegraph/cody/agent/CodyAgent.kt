package com.sourcegraph.cody.agent

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfoRt
import com.intellij.util.net.HttpConfigurable
import com.intellij.util.system.CpuArch
import com.sourcegraph.cody.agent.protocol.*
import com.sourcegraph.cody.agent.protocol_extensions.ProtocolTextDocumentExt
import com.sourcegraph.cody.agent.protocol_generated.ClientCapabilities
import com.sourcegraph.cody.agent.protocol_generated.ClientInfo
import com.sourcegraph.cody.agent.protocol_generated.CodyAgentServer
import com.sourcegraph.cody.agent.protocol_generated.ProtocolTypeAdapters
import com.sourcegraph.cody.agent.protocol_generated.WebviewNativeConfig
import com.sourcegraph.cody.auth.SourcegraphServerPath
import com.sourcegraph.cody.ui.web.WebUIServiceWebviewProvider
import com.sourcegraph.cody.vscode.CancellationToken
import com.sourcegraph.config.ConfigUtil
import java.io.*
import java.net.Socket
import java.net.URI
import java.nio.file.*
import java.util.*
import java.util.concurrent.*
import kotlin.collections.flatten
import org.eclipse.lsp4j.jsonrpc.Launcher

/**
 * Orchestrator for the Cody agent, which is a Node.js program that implements the prompt logic for
 * Cody. The agent communicates via a JSON-RPC protocol that is documented in the file
 * "cody/agent/src/protocol.ts".
 */
class CodyAgent
private constructor(
    val client: CodyAgentClient,
    val server: CodyAgentServer,
    val launcher: Launcher<CodyAgentServer>,
    private val connection: AgentConnection,
    private val listeningToJsonRpc: Future<Void?>
) {

  fun shutdown(): CompletableFuture<Unit> {
    return server.shutdown(null).completeOnTimeout(null, 15, TimeUnit.SECONDS).handle { _, throwable
      ->
      if (throwable != null) logger.warn("Graceful shutdown of Cody agent server failed", throwable)
      server.exit(null)
      listeningToJsonRpc.cancel(true)
      connection.close()
      logger.info("Cody Agent shut down gracefully")
    }
  }

  fun isConnected(): Boolean {
    // NOTE(olafurpg): there are probably too many conditions below. We test multiple conditions
    // because we don't know 100% yet what exactly constitutes a "connected" state. Out of
    // abundance of caution, we check everything we can think of.
    return connection.isConnected() && !listeningToJsonRpc.isDone && !listeningToJsonRpc.isCancelled
  }

  /** Abstracts over the Process and Socket types to the extent we need it. */
  sealed class AgentConnection {
    abstract fun isConnected(): Boolean

    abstract fun close()

    abstract fun getInputStream(): InputStream

    abstract fun getOutputStream(): OutputStream

    class ProcessConnection(private val process: Process) : AgentConnection() {
      override fun isConnected(): Boolean = process.isAlive

      override fun close() {
        process.destroy()
      }

      override fun getInputStream(): InputStream = process.inputStream

      override fun getOutputStream(): OutputStream = process.outputStream
    }

    class SocketConnection(private val socket: Socket) : AgentConnection() {
      override fun isConnected(): Boolean = socket.isConnected && !socket.isClosed

      override fun close() {
        socket.close()
      }

      override fun getInputStream(): InputStream = socket.getInputStream()

      override fun getOutputStream(): OutputStream = socket.getOutputStream()
    }
  }

  companion object {
    private val logger = Logger.getInstance(CodyAgent::class.java)
    private val PLUGIN_ID = PluginId.getId("com.sourcegraph.jetbrains")
    private const val DEFAULT_AGENT_DEBUG_PORT = 3113 // Also defined in agent/src/cli/jsonrpc.ts
    private val globalState =
        if (ConfigUtil.isIntegrationTestModeEnabled()) ClientCapabilities.GlobalStateEnum.Stateless
        else ClientCapabilities.GlobalStateEnum.`Server-managed`
    @JvmField val executorService: ExecutorService = Executors.newCachedThreadPool()

    enum class Debuggability {
      NotDebuggable,
      Debuggable,
      DebuggableWaitForAttach,
    }

    private fun shouldSpawnDebuggableAgent(): Debuggability =
        when (System.getenv("CODY_AGENT_DEBUG_INSPECT")) {
          "true" -> Debuggability.Debuggable
          "wait" -> Debuggability.DebuggableWaitForAttach
          else -> Debuggability.NotDebuggable
        }

    fun create(
        project: Project,
        endpoint: SourcegraphServerPath?,
        token: String?,
    ): CompletableFuture<CodyAgent> {
      try {
        val conn = startAgentProcess()
        val client = CodyAgentClient(project, WebUIServiceWebviewProvider(project))
        val launcher = startAgentLauncher(conn, client)
        val server = launcher.remoteProxy
        val listeningToJsonRpc = launcher.startListening()
        try {
          val workspaceRootPath = ConfigUtil.getWorkspaceRootPath(project)
          val workspaceRootUri =
              ProtocolTextDocumentExt.normalizeFileUri(workspaceRootPath.toUri().toString())
                  ?: throw CodyAgentException("Unsupported workspace location: $workspaceRootPath")

          return server
              .initialize(
                  ClientInfo(
                      name = "JetBrains",
                      version = ConfigUtil.getPluginVersion(),
                      ideVersion = ApplicationInfo.getInstance().build.toString(),
                      workspaceRootUri = workspaceRootUri,
                      extensionConfiguration =
                          ConfigUtil.getAgentConfiguration(project, endpoint, token),
                      capabilities =
                          ClientCapabilities(
                              authentication = ClientCapabilities.AuthenticationEnum.Enabled,
                              edit = ClientCapabilities.EditEnum.Enabled,
                              editWorkspace = ClientCapabilities.EditWorkspaceEnum.Enabled,
                              codeLenses = ClientCapabilities.CodeLensesEnum.Enabled,
                              disabledMentionsProviders = listOf("symbol"),
                              showDocument = ClientCapabilities.ShowDocumentEnum.Enabled,
                              ignore = ClientCapabilities.IgnoreEnum.Enabled,
                              untitledDocuments = ClientCapabilities.UntitledDocumentsEnum.Enabled,
                              codeActions = ClientCapabilities.CodeActionsEnum.Enabled,
                              shell = ClientCapabilities.ShellEnum.Enabled,
                              globalState = globalState,
                              secrets = ClientCapabilities.SecretsEnum.`Client-managed`,
                              webview = ClientCapabilities.WebviewEnum.Native,
                              webviewNativeConfig =
                                  WebviewNativeConfig(
                                      view = WebviewNativeConfig.ViewEnum.Multiple,
                                      cspSource = "'self' https://*.sourcegraphstatic.com",
                                      webviewBundleServingPrefix =
                                          "https://file+.sourcegraphstatic.com",
                                  ),
                              webviewMessages =
                                  ClientCapabilities.WebviewMessagesEnum.`String-encoded`,
                              accountSwitchingInWebview =
                                  ClientCapabilities.AccountSwitchingInWebviewEnum.Enabled,
                              showWindowMessage =
                                  ClientCapabilities.ShowWindowMessageEnum.Request)))
              .thenApply { info ->
                logger.warn("Connected to Cody agent " + info.name)
                server.initialized(null)
                CodyAgent(client, server, launcher, conn, listeningToJsonRpc)
              }
        } catch (e: Exception) {
          logger.warn("Failed to send 'initialize' JSON-RPC request Cody agent", e)
          throw e
        }
      } catch (e: Exception) {
        logger.warn("Unable to start Cody agent", e)
        throw e
      }
    }

    private fun startAgentProcess(): AgentConnection {
      if (ConfigUtil.shouldConnectToDebugAgent()) {
        return connectToDebugAgent()
      }
      val token = CancellationToken()

      val binaryPath = nodeBinary(token).absolutePath
      val jsonRpcArgs = listOf("api", "jsonrpc-stdio")
      val script =
          agentDirectory()?.resolve("index.js")
              ?: throw CodyAgentException("Sourcegraph Cody + Code Search plugin path not found")
      val debuggerArgs =
          when (shouldSpawnDebuggableAgent()) {
            Debuggability.NotDebuggable -> emptyList()
            Debuggability.Debuggable -> listOf("--enable-source-maps", "--inspect")
            Debuggability.DebuggableWaitForAttach -> listOf("--enable-source-maps", "--inspect-brk")
          }
      val command: List<String> =
          listOf(
                  listOf(binaryPath),
                  debuggerArgs,
                  listOf(script.toFile().absolutePath),
                  jsonRpcArgs)
              .flatten()

      val processBuilder = ProcessBuilder(command)
      if (java.lang.Boolean.getBoolean("cody.accept-non-trusted-certificates-automatically") ||
          ConfigUtil.getShouldAcceptNonTrustedCertificatesAutomatically()) {
        processBuilder.environment()["CODY_NODE_TLS_REJECT_UNAUTHORIZED"] = "0"
      }

      if (java.lang.Boolean.getBoolean("cody.log-events-to-connected-instance-only")) {
        processBuilder.environment()["CODY_LOG_EVENT_MODE"] = "connected-instance-only"
      }

      configureIntegrationTestingProcess(processBuilder)

      val proxy = HttpConfigurable.getInstance()
      val proxyUrl = proxy.PROXY_HOST + ":" + proxy.PROXY_PORT
      val proxyProto =
          if (proxy.PROXY_TYPE_IS_SOCKS) {
            "socks:"
          } else {
            "http:"
          }
      val proxyAuth =
          if (proxy.PROXY_AUTHENTICATION) {
            // TODO: we should maybe prompt the user here instead?
            val password = proxy.plainProxyPassword
            val username = proxy.proxyLogin
            if (!password.isNullOrEmpty() && !username.isNullOrEmpty()) {
              "${username}:${password}@"
            } else {
              ""
            }
          } else {
            ""
          }
      if (proxy.USE_HTTP_PROXY) {
        if (!proxy.PROXY_EXCEPTIONS.isNullOrEmpty()) {
          processBuilder.environment()["CODY_NODE_NO_PROXY"] = proxy.PROXY_EXCEPTIONS
        }
        processBuilder.environment()["CODY_NODE_DEFAULT_PROXY"] =
            "${proxyProto}//${proxyAuth}${proxyUrl}"
      }

      logger.info("starting Cody agent ${command.joinToString(" ")}")

      val process =
          processBuilder
              .redirectErrorStream(false)
              .redirectError(ProcessBuilder.Redirect.PIPE)
              .start()
      process.onExit().thenAccept { finishedProcess ->
        finishedProcess.exitValue().let {
          if (it != 0) {
            logger.warn("Cody agent process exited with code $it")
          }
        }
        token.abort()
      }

      // Redirect agent stderr into idea.log by buffering line by line into `logger.warn()`
      // statements. Without this logic, the stderr output of the agent process is lost if
      // the process fails to start for some reason. We use `logger.warn()` because the
      // agent shouldn't print much normally (excluding a few noisy messages during
      // initialization), it's mostly used to report unexpected errors.
      Thread { process.errorStream.bufferedReader().forEachLine { line -> logger.warn(line) } }
          .start()

      return AgentConnection.ProcessConnection(process)
    }

    private fun configureIntegrationTestingProcess(processBuilder: ProcessBuilder) {
      // N.B. Do not set CODY_TESTING=true -- that is for Agent-side tests.
      if (!ConfigUtil.isIntegrationTestModeEnabled()) return

      processBuilder.environment().apply {
        // N.B. If you set CODY_RECORDING_MODE, you must set CODY_RECORDING_DIRECTORY,
        // or the Agent will throw an error and your test will fail.
        when (val mode = System.getenv("CODY_RECORDING_MODE")) {
          null -> {
            logger.warn(
                """Polly is not enabled for this test.
                   Set CODY_RECORDING_MODE and CODY_RECORDING_DIRECTORY
                   variables to turn on Polly."""
                    .trimMargin())
          }
          "record",
          "replay",
          "passthrough" -> {
            logger.warn("Cody integration test recording mode: $mode")

            this["DISABLE_UPSTREAM_HEALTH_PINGS"] = "true"
            this["DISABLE_FEATURE_FLAGS"] = "true"

            System.getenv()
                .filter { it.key.startsWith("CODY_") }
                .forEach { (key, value) -> this[key] = value }
          }
          else -> throw CodyAgentException("Unknown CODY_RECORDING_MODE: $mode")
        }
      }
    }

    @Throws(IOException::class, CodyAgentException::class)
    private fun startAgentLauncher(
        process: AgentConnection,
        client: CodyAgentClient
    ): Launcher<CodyAgentServer> {
      return Launcher.Builder<CodyAgentServer>()
          .configureGson { gsonBuilder ->
            run {
              gsonBuilder
                  // emit `null` instead of leaving fields undefined because Cody
                  // VSC has many `=== null` checks that return false for
                  // undefined fields.
                  .serializeNulls()
                  // TODO: Once all protocols have migrated we can remove these
                  // legacy enum conversions
                  .registerTypeAdapter(URI::class.java, uriDeserializer)
                  .registerTypeAdapter(URI::class.java, uriSerializer)

              ProtocolTypeAdapters.register(gsonBuilder)
              // This ensures that by default all enums are always serialized to their
              // string equivalents string equivalents
              gsonBuilder.registerTypeAdapterFactory(EnumTypeAdapterFactory())
            }
          }
          .setRemoteInterface(CodyAgentServer::class.java)
          .traceMessages(traceWriter())
          .setExecutorService(executorService)
          .setInput(process.getInputStream())
          .setOutput(process.getOutputStream())
          .setLocalService(client)
          .create()
    }

    private fun binarySuffix(): String {
      return if (SystemInfoRt.isWindows) ".exe" else ""
    }

    private fun nodeBinaryName(): String {
      val os = if (SystemInfoRt.isMac) "macos" else if (SystemInfoRt.isWindows) "win" else "linux"
      val arch =
          if (CpuArch.isArm64()) {
            if (SystemInfoRt.isWindows) {
              // Use x86 emulation on arm64 Windows
              "x64"
            } else {
              "arm64"
            }
          } else {
            "x64"
          }
      return "node-" + os + "-" + arch + binarySuffix()
    }

    fun agentDirectory(): Path? {
      return pluginDirectory()?.resolve("agent")
    }

    /**
     * Gets the plugin path, or null if not found. Can be overridden with the cody-agent.directory
     * system property.
     */
    fun pluginDirectory(): Path? {
      val fromProperty = System.getProperty("cody-agent.directory", "")
      return if (fromProperty.isNotEmpty()) {
        Paths.get(fromProperty)
      } else {
        PluginManagerCore.getPlugin(PLUGIN_ID)?.pluginPath
      }
    }

    @Throws(CodyAgentException::class)
    private fun nodeBinary(token: CancellationToken): File {
      val pluginPath =
          agentDirectory()
              ?: throw CodyAgentException("Sourcegraph Cody + Code Search plugin path not found")
      val binarySource = pluginPath.resolve(nodeBinaryName())
      if (!Files.isRegularFile(binarySource)) {
        throw CodyAgentException("Node binary not found at path " + binarySource.toAbsolutePath())
      }
      val binaryTarget = Files.createTempFile("cody-agent", binarySuffix())
      return try {
        binaryTarget?.toFile()?.deleteOnExit()
        token.onFinished {
          // Important: delete the file from disk after the process exists Ideally, we
          // should eventually replace this temporary file with a permanent location in
          // the plugin directory.
          Files.deleteIfExists(binaryTarget)
        }
        logger.info("Extracting Node binary to " + binaryTarget.toAbsolutePath())
        Files.copy(binarySource, binaryTarget, StandardCopyOption.REPLACE_EXISTING)
        val binary = binaryTarget.toFile()
        if (binary.setExecutable(true)) {
          binary
        } else {
          throw CodyAgentException("Failed to make Node process executable " + binary.absolutePath)
        }
      } catch (e: Exception) {
        logger.warn(e)
        logger.info("Failed to create a copy of the Node binary, proceeding with $binarySource")
        Files.deleteIfExists(binaryTarget)
        binarySource.toFile()
      }
    }

    private fun traceWriter(): PrintWriter? {
      val tracePath = System.getProperty("cody-agent.trace-path", "")
      if (tracePath.isNotEmpty()) {
        val trace = Paths.get(tracePath)
        try {
          Files.createDirectories(trace.parent)
          return PrintWriter(
              Files.newOutputStream(
                  trace, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING))
        } catch (e: IOException) {
          logger.warn("unable to trace JSON-RPC debugging information to path $tracePath", e)
        }
      }
      return null
    }

    private fun connectToDebugAgent(): AgentConnection {
      val port = System.getenv("CODY_AGENT_DEBUG_PORT")?.toInt() ?: DEFAULT_AGENT_DEBUG_PORT
      return AgentConnection.SocketConnection(Socket("localhost", port))
    }
  }
}
