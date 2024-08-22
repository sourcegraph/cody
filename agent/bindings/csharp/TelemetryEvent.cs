using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TelemetryEvent
  {

    [JsonPropertyName("feature")]
    public string Feature { get; set; }

    [JsonPropertyName("action")]
    public string Action { get; set; }
  }
}
