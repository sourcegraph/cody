package com.sourcegraph.cody.agent;

/**
 * {@link ConfigFeaturesObserver} can be notified of changes in {@link ConfigFeatures} from the
 * agent.
 *
 * <p>This can be attached to {@link CurrentConfigFeatures}, which multiplexes notifications from
 * {@link CodyAgentClient#onConfigFeatures}.
 */
@FunctionalInterface
public interface ConfigFeaturesObserver {
  void update(ConfigFeatures newConfigFeatures);
}
