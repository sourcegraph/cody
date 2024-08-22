using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ExtensionConfiguration
  {

    [JsonPropertyName("serverEndpoint")]
    public string ServerEndpoint { get; set; }

    [JsonPropertyName("proxy")]
    public string Proxy { get; set; }

    [JsonPropertyName("accessToken")]
    public string AccessToken { get; set; }

    [JsonPropertyName("customHeaders")]
    public Dictionary<string, string> CustomHeaders { get; set; }

    [JsonPropertyName("anonymousUserID")]
    public string AnonymousUserID { get; set; }

    [JsonPropertyName("autocompleteAdvancedProvider")]
    public string AutocompleteAdvancedProvider { get; set; }

    [JsonPropertyName("autocompleteAdvancedModel")]
    public string AutocompleteAdvancedModel { get; set; }

    [JsonPropertyName("debug")]
    public bool Debug { get; set; }

    [JsonPropertyName("verboseDebug")]
    public bool VerboseDebug { get; set; }

    [JsonPropertyName("telemetryClientName")]
    public string TelemetryClientName { get; set; }

    [JsonPropertyName("codebase")]
    public string Codebase { get; set; }

    [JsonPropertyName("eventProperties")]
    public EventProperties EventProperties { get; set; }

    [JsonPropertyName("customConfiguration")]
    public Dictionary<string, Object> CustomConfiguration { get; set; }

    [JsonPropertyName("baseGlobalState")]
    public Dictionary<string, Object> BaseGlobalState { get; set; }
  }
}
