package com.sourcegraph.cody.agent;

import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.editor.Editor;
import com.sourcegraph.cody.agent.protocol.*;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import java.util.function.Supplier;
import org.eclipse.lsp4j.jsonrpc.services.JsonNotification;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

/**
 * Implementation of the client part of the Cody agent protocol. This class dispatches the requests
 * and notifications sent by the agent.
 */
@SuppressWarnings("unused")
public class CodyAgentClient {

  private static final Logger logger = Logger.getInstance(CodyAgentClient.class);

  @Nullable public Editor editor;

  // Callback that is invoked when the agent sends a "chat/updateMessageInProgress" notification.
  @Nullable public Consumer<WebviewPostMessageParams> onNewMessage;

  // Callback that is invoked when the agent sends a "setConfigFeatures" message.
  @Nullable public ConfigFeaturesObserver onSetConfigFeatures;

  // Callback that is invoked on webview messages which aren't handled by onNewMessage or
  // onSetConfigFeatures
  @Nullable public Consumer<WebviewPostMessageParams> onReceivedWebviewMessage;

  // Callback for the "editTask/didUpdate" notification from the agent.
  @Nullable private Consumer<EditTask> onEditTaskDidUpdate;

  // Callback for the "editTask/didDelete" notification from the agent.
  @Nullable private Consumer<EditTask> onEditTaskDidDelete;

  // Callback for the "textDocument/edit" request from the agent.
  @Nullable private Consumer<TextDocumentEditParams> onTextDocumentEdit;

  // Callback for the "workspace/edit" request from the agent.
  @Nullable private Consumer<WorkspaceEditParams> onWorkspaceEdit;

  public void setOnEditTaskDidUpdate(@Nullable Consumer<EditTask> callback) {
    onEditTaskDidUpdate = callback;
  }

  public void setOnEditTaskDidDelete(@Nullable Consumer<EditTask> callback) {
    onEditTaskDidDelete = callback;
  }

  @JsonNotification("editTask/didUpdate")
  public void editTaskDidUpdate(EditTask params) {
    onEventThread(
        () -> {
          if (onEditTaskDidUpdate != null) {
            onEditTaskDidUpdate.accept(params);
          } else {
            logger.warn("No callback registered for editTask/didUpdate");
          }
          return null;
        });
  }

  @JsonNotification("editTask/didDelete")
  public void editTaskDidDelete(EditTask params) {
    onEventThread(
        () -> {
          if (onEditTaskDidDelete != null) {
            onEditTaskDidDelete.accept(params);
          } else {
            logger.warn("No callback registered for editTask/didDelete");
          }
          return null;
        });
  }

  public void setOnTextDocumentEdit(@Nullable Consumer<TextDocumentEditParams> callback) {
    onTextDocumentEdit = callback;
  }

  @JsonRequest("textDocument/edit")
  public CompletableFuture<Boolean> textDocumentEdit(TextDocumentEditParams params) {
    return onEventThread(
        () -> {
          if (onTextDocumentEdit != null) {
            onTextDocumentEdit.accept(params);
          } else {
            logger.warn("No callback registered for textDocument/edit");
          }
          return true;
        });
  }

  public void setOnWorkspaceEdit(@Nullable Consumer<WorkspaceEditParams> callback) {
    onWorkspaceEdit = callback;
  }

  @JsonRequest("workspace/edit")
  public CompletableFuture<Boolean> workspaceEdit(WorkspaceEditParams params) {
    return onEventThread(
        () -> {
          if (onWorkspaceEdit != null) {
            onWorkspaceEdit.accept(params);
          } else {
            logger.warn("No callback registered for workspace/edit");
          }
          return true;
        });
  }

  /**
   * Helper to run client request/notification handlers on the IntelliJ event thread. Use this
   * helper for handlers that require access to the IntelliJ editor, for example to read the text
   * contents of the open editor.
   */
  private <T> @NotNull CompletableFuture<T> onEventThread(Supplier<T> handler) {
    CompletableFuture<T> result = new CompletableFuture<>();
    ApplicationManager.getApplication()
        .invokeLater(
            () -> {
              try {
                result.complete(handler.get());
              } catch (Exception e) {
                result.completeExceptionally(e);
              }
            });
    return result;
  }

  // Webviews
  @JsonRequest("webview/create")
  public CompletableFuture<Void> webviewCreate(WebviewCreateParams params) {
    logger.error("webview/create This request should not happen if you are using chat/new.");
    return CompletableFuture.completedFuture(null);
  }

  // =============
  // Notifications
  // =============

  @JsonNotification("debug/message")
  public void debugMessage(@NotNull DebugMessage msg) {
    logger.warn(String.format("%s: %s", msg.getChannel(), msg.getMessage()));
  }

  @JsonNotification("webview/postMessage")
  public void webviewPostMessage(@NotNull WebviewPostMessageParams params) {
    ExtensionMessage extensionMessage = params.getMessage();

    if (onNewMessage != null
        && extensionMessage.getType().equals(ExtensionMessage.Type.TRANSCRIPT)) {
      ApplicationManager.getApplication().invokeLater(() -> onNewMessage.accept(params));
      return;
    }

    if (onSetConfigFeatures != null
        && extensionMessage.getType().equals(ExtensionMessage.Type.SET_CONFIG_FEATURES)) {
      ApplicationManager.getApplication()
          .invokeLater(() -> onSetConfigFeatures.update(extensionMessage.getConfigFeatures()));
      return;
    }

    if (onReceivedWebviewMessage != null) {
      ApplicationManager.getApplication()
          .invokeLater(() -> onReceivedWebviewMessage.accept(params));
      return;
    }

    logger.debug(String.format("webview/postMessage %s: %s", params.getId(), params.getMessage()));
  }
}
