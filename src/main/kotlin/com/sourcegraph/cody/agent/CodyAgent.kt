package com.sourcegraph.cody.agent

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfoRt
import com.intellij.util.system.CpuArch
import com.sourcegraph.cody.agent.protocol.*
import com.sourcegraph.cody.vscode.CancellationToken
import com.sourcegraph.config.ConfigUtil
import java.io.*
import java.net.Socket
import java.net.URI
import java.nio.file.*
import java.util.*
import java.util.concurrent.*
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
    return server.shutdown().completeOnTimeout(null, 15, TimeUnit.SECONDS).handle { _, throwable ->
      if (throwable != null) logger.warn("Graceful shutdown of Cody agent server failed", throwable)
      server.exit()
      logger.info("Cody Agent shut down gracefully")
      listeningToJsonRpc.cancel(true)
      connection.close()
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

    class ProcessConnection(val process: Process) : AgentConnection() {
      override fun isConnected(): Boolean = process.isAlive

      override fun close() {
        process.destroy()
      }

      override fun getInputStream(): InputStream = process.inputStream

      override fun getOutputStream(): OutputStream = process.outputStream
    }

    class SocketConnection(val socket: Socket) : AgentConnection() {
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
    @JvmField val executorService: ExecutorService = Executors.newCachedThreadPool()

    private fun shouldConnectToDebugAgent() = System.getenv("CODY_AGENT_DEBUG_REMOTE") == "true"

    private fun shouldSpawnDebuggableAgent() = System.getenv("CODY_AGENT_DEBUG_INSPECT") == "true"

    fun create(project: Project): CompletableFuture<CodyAgent> {
      try {
        val conn = startAgentProcess()
        val client = CodyAgentClient()
        client.onSetConfigFeatures = project.service<CurrentConfigFeatures>()
        val launcher = startAgentLauncher(conn, client)
        val server = launcher.remoteProxy
        val listeningToJsonRpc = launcher.startListening()

        try {
          return server
              .initialize(
                  ClientInfo(
                      version = ConfigUtil.getPluginVersion(),
                      workspaceRootUri =
                          ConfigUtil.getWorkspaceRootPath(project).toUri().toString(),
                      extensionConfiguration = ConfigUtil.getAgentConfiguration(project)))
              .thenApply { info ->
                logger.info("Connected to Cody agent " + info.name)
                server.initialized()
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
      if (shouldConnectToDebugAgent()) {
        return connectToDebugAgent()
      }
      val token = CancellationToken()
      val command: List<String> =
          if (System.getenv("CODY_DIR") != null) {
            val script = File(System.getenv("CODY_DIR"), "agent/dist/index.js")
            logger.info("using Cody agent script " + script.absolutePath)
            if (shouldSpawnDebuggableAgent()) {
              listOf("node", "--inspect", "--enable-source-maps", script.absolutePath)
            } else {
              listOf("node", "--enable-source-maps", script.absolutePath)
            }
          } else {
            val binary = agentBinary()
            logger.info("starting Cody agent " + binary.absolutePath)
            listOf(binary.absolutePath)
          }

      val processBuilder = ProcessBuilder(command)
      if (java.lang.Boolean.getBoolean("cody.accept-non-trusted-certificates-automatically") ||
          ConfigUtil.getShouldAcceptNonTrustedCertificatesAutomatically()) {
        processBuilder.environment()["NODE_TLS_REJECT_UNAUTHORIZED"] = "0"
      }

      if (java.lang.Boolean.getBoolean("cody.log-events-to-connected-instance-only")) {
        processBuilder.environment()["CODY_LOG_EVENT_MODE"] = "connected-instance-only"
      }

      val process =
          processBuilder
              .redirectErrorStream(false)
              .redirectError(ProcessBuilder.Redirect.PIPE)
              .start()
      process.onExit().thenAccept { token.abort() }

      // Redirect agent stderr into idea.log by buffering line by line into `logger.warn()`
      // statements. Without this logic, the stderr output of the agent process is lost if
      // the process fails to start for some reason. We use `logger.warn()` because the
      // agent shouldn't print much normally (excluding a few noisy messages during
      // initialization), it's mostly used to report unexpected errors.
      Thread { process.errorStream.bufferedReader().forEachLine { line -> logger.warn(line) } }
          .start()

      return AgentConnection.ProcessConnection(process)
    }

    @Throws(IOException::class, CodyAgentException::class)
    private fun startAgentLauncher(
        process: AgentConnection,
        client: CodyAgentClient
    ): Launcher<CodyAgentServer> {
      return Launcher.Builder<CodyAgentServer>()
          .configureGson { gsonBuilder ->
            gsonBuilder
                // emit `null` instead of leaving fields undefined because Cody
                // VSC has many `=== null` checks that return false for undefined fields.
                .serializeNulls()
                .registerTypeAdapter(CompletionItemID::class.java, CompletionItemIDSerializer)
                .registerTypeAdapter(ContextItem::class.java, ContextItem.deserializer)
                .registerTypeAdapter(Speaker::class.java, speakerDeserializer)
                .registerTypeAdapter(Speaker::class.java, speakerSerializer)
                .registerTypeAdapter(URI::class.java, uriDeserializer)
                .registerTypeAdapter(URI::class.java, uriSerializer)
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

    private fun agentBinaryName(): String {
      val os = if (SystemInfoRt.isMac) "macos" else if (SystemInfoRt.isWindows) "win" else "linux"
      // Only use x86 for macOS because of this issue here https://github.com/vercel/pkg/issues/2004
      // TLDR; we're not able to run macos-arm64 binaries when they're created on ubuntu-latest
      val arch = if (CpuArch.isArm64()) "arm64" else "x64"
      return "agent-" + os + "-" + arch + binarySuffix()
    }

    private fun agentDirectory(): Path? {
      // N.B. this is the default/production setting. CODY_DIR overrides it locally.
      val fromProperty = System.getProperty("cody-agent.directory", "")
      if (fromProperty.isNotEmpty()) {
        return Paths.get(fromProperty)
      }
      val plugin = PluginManagerCore.getPlugin(PLUGIN_ID) ?: return null
      return plugin.pluginPath
    }

    @Throws(CodyAgentException::class)
    private fun agentBinary(): File {
      val pluginPath =
          agentDirectory()
              ?: throw CodyAgentException("Sourcegraph Cody + Code Search plugin path not found")
      val binarySource = pluginPath.resolve("agent").resolve(agentBinaryName())
      if (!Files.isRegularFile(binarySource)) {
        throw CodyAgentException(
            "Cody agent binary not found at path " + binarySource.toAbsolutePath())
      }
      return binarySource.toFile()
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
