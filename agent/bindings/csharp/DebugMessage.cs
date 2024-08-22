using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class DebugMessage
  {

    [JsonPropertyName("channel")]
    public string Channel { get; set; }

    [JsonPropertyName("message")]
    public string Message { get; set; }
  }
}
