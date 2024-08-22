using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingTelemetryEvent
  {

    [JsonPropertyName("feature")]
    public string Feature { get; set; }

    [JsonPropertyName("action")]
    public string Action { get; set; }

    [JsonPropertyName("source")]
    public SourceParams Source { get; set; }

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; set; }

    [JsonPropertyName("testOnlyAnonymousUserID")]
    public string TestOnlyAnonymousUserID { get; set; }
  }
}
