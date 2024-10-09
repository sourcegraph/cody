using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ExtensionConfiguration
  {
    [JsonProperty(PropertyName = "serverEndpoint")]
    public string ServerEndpoint { get; set; }
    [JsonProperty(PropertyName = "proxy")]
    public string Proxy { get; set; }
    [JsonProperty(PropertyName = "accessToken")]
    public string AccessToken { get; set; }
    [JsonProperty(PropertyName = "customHeaders")]
    public Dictionary<string, string> CustomHeaders { get; set; }
    [JsonProperty(PropertyName = "anonymousUserID")]
    public string AnonymousUserID { get; set; }
    [JsonProperty(PropertyName = "autocompleteAdvancedProvider")]
    public string AutocompleteAdvancedProvider { get; set; }
    [JsonProperty(PropertyName = "autocompleteAdvancedModel")]
    public string AutocompleteAdvancedModel { get; set; }
    [JsonProperty(PropertyName = "debug")]
    public bool Debug { get; set; }
    [JsonProperty(PropertyName = "verboseDebug")]
    public bool VerboseDebug { get; set; }
    [JsonProperty(PropertyName = "telemetryClientName")]
    public string TelemetryClientName { get; set; }
    [JsonProperty(PropertyName = "codebase")]
    public string Codebase { get; set; }
    [JsonProperty(PropertyName = "eventProperties")]
    public EventProperties EventProperties { get; set; }
    [JsonProperty(PropertyName = "customConfiguration")]
    public Dictionary<string, Object> CustomConfiguration { get; set; }
    [JsonProperty(PropertyName = "baseGlobalState")]
    public Dictionary<string, Object> BaseGlobalState { get; set; }
  }
}
