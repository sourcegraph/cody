using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TelemetryEvent
  {
    [JsonProperty(PropertyName = "feature")]
    public string Feature { get; set; }
    [JsonProperty(PropertyName = "action")]
    public string Action { get; set; }
  }
}
