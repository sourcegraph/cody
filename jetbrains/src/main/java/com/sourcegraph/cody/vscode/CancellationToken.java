package com.sourcegraph.cody.vscode;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.function.Consumer;

public class CancellationToken {
  private final CompletableFuture<Boolean> cancelled = new CompletableFuture<>();

  public boolean isDone() {
    return cancelled.isDone();
  }

  public void onCancellationRequested(Runnable callback) {
    onFinished(
        isCancelled -> {
          if (isCancelled) callback.run();
        });
  }

  public CompletableFuture<Void> onFinished(Consumer<Boolean> callback) {
    return this.cancelled.thenAccept(
        (isCancelled) -> {
          try {
            callback.accept(isCancelled);
          } catch (Exception ignored) {
            // Do nothing about exceptions in cancellation callbacks
          }
        });
  }

  public boolean isCancelled() {
    try {
      return this.cancelled.isDone() && this.cancelled.get();
    } catch (ExecutionException | InterruptedException ignored) {
      return true;
    }
  }

  public void dispose() {
    this.cancelled.complete(false);
  }

  public void abort() {
    this.cancelled.complete(true);
  }
}
