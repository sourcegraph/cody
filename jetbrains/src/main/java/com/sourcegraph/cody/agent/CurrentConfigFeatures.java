package com.sourcegraph.cody.agent;

import com.intellij.openapi.components.Service;
import com.sourcegraph.cody.vscode.CancellationToken;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

/**
 * {@link CurrentConfigFeatures} distributes the information about Cody feature configuration, like
 * whether attribution is turned on or off, so that UI can adapt accordingly.
 *
 * <p>These features are turned on/off on the Sourcegraph instance and are fetched periodically by
 * the agent.
 *
 * <p>Observers implementing {@link Consumer<ConfigFeatures>} can {@link #attach} and then will be
 * notified of each config feature. Note: the observers will be notified irrespective of whether
 * value of config feature is the same or different from the previous value, and need to
 * de-duplicate individually if needed.
 */
@Service(Service.Level.PROJECT)
public final class CurrentConfigFeatures implements ConfigFeaturesObserver {

  /** Most recent {@link ConfigFeatures}. */
  private final AtomicReference<ConfigFeatures> features =
      new AtomicReference<>(new ConfigFeatures(false));

  /**
   * Observers that are attached (see {@link #attach}) and receive updates
   * ({@link ConfigFeaturesObserver#update).
   *
   * <p>{@link IdentityObserver} is used here in order to provide precise
   * dispose semantics (removal from this set) irrespecitve of {@link #equals}
   * behavior on the delegate {@link ConfigFeaturesObserver}.
   */
  private final Set<IdentityObserver> observers = ConcurrentHashMap.newKeySet();

  /** Retrieve the most recent {@link ConfigFeatures} value. */
  public ConfigFeatures get() {
    return features.get();
  }

  /**
   * New {@link ConfigFeatures} arrive from the agent. This method updates state and notifies all
   * observers.
   */
  @Override
  public void update(ConfigFeatures configFeatures) {
    this.features.set(configFeatures);
    observers.forEach((observer) -> observer.update(configFeatures));
  }

  /**
   * Given listener will be given new {@link ConfigFeatures} whenever they arrive. Observation
   * relationship is ended once the returned cleanup {@link CancellationToken} is disposed.
   */
  public CancellationToken attach(ConfigFeaturesObserver observer) {
    IdentityObserver id = new IdentityObserver(observer);
    observers.add(id);
    CancellationToken cancellation = new CancellationToken();
    cancellation.onFinished((disposedOrAborted) -> observers.remove(id));
    return cancellation;
  }

  /**
   * {@link IdentityObserver} wraps {@link ConfigFeaturesObserver} reimplementing {@link #equals}
   * with identity for precise cleanup. This way cleanup {@link Runnable} returned from {@link
   * #attach} can drop precisely that given {@link ConfigFeaturesObserver} irrespective of the
   * {@link #equals} semantics implemented.
   */
  private static class IdentityObserver implements ConfigFeaturesObserver {
    final ConfigFeaturesObserver delegate;

    IdentityObserver(ConfigFeaturesObserver delegate) {
      this.delegate = delegate;
    }

    @Override
    public void update(ConfigFeatures newConfigFeatures) {
      delegate.update(newConfigFeatures);
    }

    @Override
    public boolean equals(Object other) {
      if (!(other instanceof IdentityObserver)) {
        return false;
      }
      IdentityObserver that = (IdentityObserver) other;
      return this.delegate == that.delegate;
    }

    /**
     * {@link #delegate#hashCode} meets the {@link #equals} / {@link #hashCode} contract since
     * {@link #equals} uses identity semantics on {@link IdentityObserver} which is stronger than
     * identity semantics on {@link #delegate}.
     */
    @Override
    public int hashCode() {
      return delegate.hashCode();
    }
  }
}
