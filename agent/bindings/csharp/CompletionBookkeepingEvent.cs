using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CompletionBookkeepingEvent
  {
    [JsonProperty(PropertyName = "id")]
    public CompletionLogID Id { get; set; }
    [JsonProperty(PropertyName = "startedAt")]
    public int StartedAt { get; set; }
    [JsonProperty(PropertyName = "networkRequestStartedAt")]
    public int NetworkRequestStartedAt { get; set; }
    [JsonProperty(PropertyName = "startLoggedAt")]
    public int StartLoggedAt { get; set; }
    [JsonProperty(PropertyName = "loadedAt")]
    public int LoadedAt { get; set; }
    [JsonProperty(PropertyName = "suggestedAt")]
    public int SuggestedAt { get; set; }
    [JsonProperty(PropertyName = "suggestionLoggedAt")]
    public int SuggestionLoggedAt { get; set; }
    [JsonProperty(PropertyName = "suggestionAnalyticsLoggedAt")]
    public int SuggestionAnalyticsLoggedAt { get; set; }
    [JsonProperty(PropertyName = "acceptedAt")]
    public int AcceptedAt { get; set; }
    [JsonProperty(PropertyName = "items")]
    public CompletionItemInfo[] Items { get; set; }
    [JsonProperty(PropertyName = "loggedPartialAcceptedLength")]
    public int LoggedPartialAcceptedLength { get; set; }
    [JsonProperty(PropertyName = "read")]
    public bool Read { get; set; }
  }
}
