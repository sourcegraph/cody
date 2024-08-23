using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingTelemetryEvent
  {
    [JsonProperty(PropertyName = "feature")]
    public string Feature { get; set; }
    [JsonProperty(PropertyName = "action")]
    public string Action { get; set; }
    [JsonProperty(PropertyName = "source")]
    public SourceParams Source { get; set; }
    [JsonProperty(PropertyName = "timestamp")]
    public string Timestamp { get; set; }
    [JsonProperty(PropertyName = "testOnlyAnonymousUserID")]
    public string TestOnlyAnonymousUserID { get; set; }
  }
}
