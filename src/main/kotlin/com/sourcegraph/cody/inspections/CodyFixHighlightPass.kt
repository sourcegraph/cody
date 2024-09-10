package com.sourcegraph.cody.inspections

import com.intellij.codeHighlighting.Pass
import com.intellij.codeHighlighting.TextEditorHighlightingPass
import com.intellij.codeHighlighting.TextEditorHighlightingPassFactory
import com.intellij.codeHighlighting.TextEditorHighlightingPassFactoryRegistrar
import com.intellij.codeHighlighting.TextEditorHighlightingPassRegistrar
import com.intellij.codeInsight.daemon.DaemonCodeAnalyzer
import com.intellij.codeInsight.daemon.impl.DaemonCodeAnalyzerImpl
import com.intellij.codeInsight.daemon.impl.HighlightInfo
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.util.ProgressIndicatorUtils
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.intellij_extensions.codyRange
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument.Companion.uriFor
import com.sourcegraph.cody.agent.protocol_generated.CodeActions_ProvideParams
import com.sourcegraph.cody.agent.protocol_generated.Diagnostics_PublishParams
import com.sourcegraph.cody.agent.protocol_generated.ProtocolDiagnostic
import com.sourcegraph.cody.agent.protocol_generated.ProtocolLocation
import com.sourcegraph.cody.agent.protocol_generated.Range
import com.sourcegraph.utils.ThreadingUtil
import java.util.concurrent.CompletableFuture

class CodyFixHighlightPass(val file: PsiFile, val editor: Editor) :
    TextEditorHighlightingPass(file.project, editor.document, false) {

  private val logger = Logger.getInstance(CodyFixHighlightPass::class.java)
  private var myHighlights = emptyList<HighlightInfo>()
  private val myRangeActions = mutableMapOf<Range, List<CodeActionQuickFixParams>>()

  override fun doCollectInformation(progress: ProgressIndicator) {
    if (!DaemonCodeAnalyzer.getInstance(file.project).isHighlightingAvailable(file) ||
        progress.isCanceled) {
      // wait until after code-analysis is completed
      return
    }
    val uri = uriFor(file.virtualFile)

    myRangeActions.clear()

    myHighlights =
        DaemonCodeAnalyzerImpl.getHighlights(editor.document, HighlightSeverity.ERROR, file.project)

    val protocolDiagnostics =
        ThreadingUtil.runInEdtAndGet {
          myHighlights
              // TODO: We need to check how Enum comparison works to check if we can do things like
              // >=
              // HighlightSeverity.INFO
              .asSequence()
              .filter { it.severity == HighlightSeverity.ERROR }
              .filter { it.startOffset <= document.textLength }
              .filter { it.endOffset <= document.textLength }
              .filter { it.startOffset <= it.endOffset }
              .mapNotNull {
                try {
                  ProtocolDiagnostic(
                      message = it.description,
                      severity =
                          "error", // TODO: Wait for CODY-2882. This isn't currently used by the
                      // agent,
                      // so we just keep our lives simple.
                      location =
                          // TODO: Rik Nauta -- Got incorrect range; see QA report Aug 6 2024.
                          ProtocolLocation(
                              uri = uri, range = document.codyRange(it.startOffset, it.endOffset)),
                      code = it.problemGroup?.problemName)
                } catch (x: Exception) {
                  // Don't allow range errors to throw user-visible exceptions (QA found this).
                  logger.warn("Failed to convert highlight to protocol diagnostic", x)
                  null
                }
              }
              .toList()
        }

    if (protocolDiagnostics.isEmpty()) {
      return
    }

    val done = CompletableFuture<Unit>()
    CodyAgentService.withAgentRestartIfNeeded(file.project) { agent ->
      try {
        agent.server.diagnostics_publish(
            Diagnostics_PublishParams(diagnostics = protocolDiagnostics))

        for (highlight in myHighlights) {
          if (progress.isCanceled) {
            break
          }

          val range =
              ThreadingUtil.runInEdtAndGet {
                if (highlight.startOffset > document.textLength ||
                    highlight.endOffset > document.textLength ||
                    highlight.startOffset > highlight.endOffset) {
                  return@runInEdtAndGet null
                }

                return@runInEdtAndGet document.codyRange(highlight.startOffset, highlight.endOffset)
              } ?: break

          if (myRangeActions.containsKey(range)) {
            continue
          }
          val location = ProtocolLocation(uri = uri, range = range)
          val provideResponse =
              agent.server
                  .codeActions_provide(
                      CodeActions_ProvideParams(triggerKind = "Invoke", location = location))
                  .get()
          myRangeActions[range] =
              provideResponse.codeActions.map {
                CodeActionQuickFixParams(action = it, location = location)
              }
        }
        done.complete(Unit)
      } catch (e: Exception) {
        done.completeExceptionally(e)
      }
    }
    ProgressIndicatorUtils.awaitWithCheckCanceled(done, progress)
  }

  @RequiresEdt
  override fun doApplyInformationToEditor() {
    for (highlight in myHighlights) {
      highlight.unregisterQuickFix { it.familyName == CodeActionQuickFix.FAMILY_NAME }

      if (highlight.startOffset > document.textLength ||
          highlight.endOffset > document.textLength ||
          highlight.startOffset > highlight.endOffset) {
        break
      }

      val range = document.codyRange(highlight.startOffset, highlight.endOffset)
      for (action in myRangeActions[range].orEmpty()) {
        highlight.registerFix(
            CodeActionQuickFix(action),
            /* options = */ null,
            /* displayName = */ null,
            /* fixRange = */ null,
            /* key = */ null)
      }
    }
  }
}

class CodyFixHighlightPassFactory : TextEditorHighlightingPassFactoryRegistrar {
  private val factory: TextEditorHighlightingPassFactory =
      TextEditorHighlightingPassFactory { file, editor ->
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
