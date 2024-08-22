using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CompletionBookkeepingEvent
  {

    [JsonPropertyName("id")]
    public CompletionLogID Id { get; set; }

    [JsonPropertyName("startedAt")]
    public int StartedAt { get; set; }

    [JsonPropertyName("networkRequestStartedAt")]
    public int NetworkRequestStartedAt { get; set; }

    [JsonPropertyName("startLoggedAt")]
    public int StartLoggedAt { get; set; }

    [JsonPropertyName("loadedAt")]
    public int LoadedAt { get; set; }

    [JsonPropertyName("suggestedAt")]
    public int SuggestedAt { get; set; }

    [JsonPropertyName("suggestionLoggedAt")]
    public int SuggestionLoggedAt { get; set; }

    [JsonPropertyName("suggestionAnalyticsLoggedAt")]
    public int SuggestionAnalyticsLoggedAt { get; set; }

    [JsonPropertyName("acceptedAt")]
    public int AcceptedAt { get; set; }

    [JsonPropertyName("items")]
    public CompletionItemInfo[] Items { get; set; }

    [JsonPropertyName("loggedPartialAcceptedLength")]
    public int LoggedPartialAcceptedLength { get; set; }

    [JsonPropertyName("read")]
    public bool Read { get; set; }
  }
}
