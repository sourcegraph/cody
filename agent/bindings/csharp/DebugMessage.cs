using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class DebugMessage
  {
    [JsonProperty(PropertyName = "channel")]
    public string Channel { get; set; }
    [JsonProperty(PropertyName = "message")]
    public string Message { get; set; }
  }
}
