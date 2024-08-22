using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class MessageOptions
  {

    [JsonPropertyName("modal")]
    public bool Modal { get; set; }

    [JsonPropertyName("detail")]
    public string Detail { get; set; }
  }
}
