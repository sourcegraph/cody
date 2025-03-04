package com.sourcegraph.cody.inspections

import com.intellij.codeHighlighting.Pass
import com.intellij.codeHighlighting.TextEditorHighlightingPass
import com.intellij.codeHighlighting.TextEditorHighlightingPassFactory
import com.intellij.codeHighlighting.TextEditorHighlightingPassFactoryRegistrar
import com.intellij.codeHighlighting.TextEditorHighlightingPassRegistrar
import com.intellij.codeInsight.daemon.DaemonCodeAnalyzer
import com.intellij.codeInsight.daemon.impl.DaemonCodeAnalyzerImpl
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.util.ProgressIndicatorUtils
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.intellij_extensions.codyRange
import com.sourcegraph.cody.agent.protocol_extensions.ProtocolTextDocumentExt
import com.sourcegraph.cody.agent.protocol_generated.CodeActions_ProvideParams
import com.sourcegraph.cody.agent.protocol_generated.Diagnostics_PublishParams
import com.sourcegraph.cody.agent.protocol_generated.ProtocolDiagnostic
import com.sourcegraph.cody.agent.protocol_generated.ProtocolLocation
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutionException
import org.eclipse.lsp4j.jsonrpc.ResponseErrorException

class CodyFixHighlightPass(val file: PsiFile, val editor: Editor) :
    TextEditorHighlightingPass(file.project, editor.document, false) {

  private val logger = Logger.getInstance(CodyFixHighlightPass::class.java)

  override fun doCollectInformation(progress: ProgressIndicator) {
    if (!DaemonCodeAnalyzer.getInstance(file.project).isHighlightingAvailable(file) ||
        progress.isCanceled) {
      // wait until after code-analysis is completed
      return
    }

    val myHighlights =
        DaemonCodeAnalyzerImpl.getHighlights(editor.document, HighlightSeverity.ERROR, file.project)

    // TODO: We need to check how Enum comparison works to check if we can do things like
    // >= HighlightSeverity.INFO
    val actionPromises =
        myHighlights
            .filter { it.severity == HighlightSeverity.ERROR }
            .map { highlight ->
              try {
                val uri = ProtocolTextDocumentExt.fileUriFor(file.virtualFile)

                if (progress.isCanceled || uri == null) {
                  return@map CompletableFuture.completedFuture(emptyList<CodeActionQuickFix>())
                }

                val range =
                    document.codyRange(highlight.startOffset, highlight.endOffset)
                        ?: return@map CompletableFuture.completedFuture(
                            emptyList<CodeActionQuickFix>())
                val diagnostic =
                    ProtocolDiagnostic(
                        message = highlight.description,
                        // TODO: Wait for CODY-2882. This isn't currently used by the agent,  so we
                        // just keep our lives simple.
                        severity = "error",
                        // TODO: Rik Nauta -- Got incorrect range; see QA report Aug 6 2024.
                        location = ProtocolLocation(uri = uri, range = range),
                        code = highlight.problemGroup?.problemName)

                val existingAction =
                    myHighlightActions[file.virtualFile]?.filter {
                      it.getDiagnostics()?.contains(diagnostic) == true
                    }

                if (!existingAction.isNullOrEmpty()) {
                  return@map CompletableFuture.completedFuture(existingAction)
                } else {
                  val result = CompletableFuture<List<CodeActionQuickFix>>()

                  CodyAgentService.withAgentRestartIfNeeded(file.project) { agent ->
                    agent.server
                        .diagnostics_publish(Diagnostics_PublishParams(listOf(diagnostic)))
                        .get()

                    val provideParam =
                        CodeActions_ProvideParams(
                            triggerKind = "Invoke", location = diagnostic.location)
                    val actions =
                        agent.server.codeActions_provide(provideParam).get().codeActions.map {
                          CodeActionQuickFix(
                              CodeActionQuickFixParams(action = it, location = diagnostic.location))
                        }

                    runReadAction {
                      for (action in actions) {
                        highlight.registerFix(
                            action,
                            /* options = */ null,
                            /* displayName = */ null,
                            /* fixRange = */ null,
                            /* key = */ null)
                      }
                    }

                    result.complete(actions)
                  }

                  return@map result
                }
              } catch (e: Exception) {
                val responseErrorException =
                    (e as? ExecutionException)?.cause as? ResponseErrorException
                if (responseErrorException != null) {
                  logger.warn("Failed to get code actions for diagnostic", e)
                }
                return@map CompletableFuture.completedFuture(emptyList<CodeActionQuickFix>())
              }
            }

    val allActions = CompletableFuture.allOf(*actionPromises.toTypedArray())
    ProgressIndicatorUtils.awaitWithCheckCanceled(allActions, progress)

    myHighlightActions[file.virtualFile] =
        actionPromises.flatMap { actionPromise ->
          if (!actionPromise.isCompletedExceptionally) actionPromise.get() else emptyList()
        }
  }

  @RequiresEdt override fun doApplyInformationToEditor() {}

  companion object CodyFixHighlightPass {
    private var myHighlightActions = ConcurrentHashMap<VirtualFile, List<CodeActionQuickFix>>()
  }
}

class CodyFixHighlightPassFactory : TextEditorHighlightingPassFactoryRegistrar {
  private val factory: TextEditorHighlightingPassFactory =
      TextEditorHighlightingPassFactory { file, editor ->
        if (file.virtualFile == null) null
        else
            when (file.virtualFile.fileSystem.protocol) {
              "mock" -> null
              else -> CodyFixHighlightPass(file, editor)
            }
      }

  override fun registerHighlightingPassFactory(
      registrar: TextEditorHighlightingPassRegistrar,
      project: Project
  ) {
    registrar.registerTextEditorHighlightingPass(
        factory,
        TextEditorHighlightingPassRegistrar.Anchor.LAST,
        Pass.UPDATE_ALL,
        /* needAdditionalIntentionsPass = */ false,
        /* inPostHighlightingPass = */ false)
  }
}
