using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProtocolCommand
  {

    [JsonPropertyName("title")]
    public TitleParams Title { get; set; }

    [JsonPropertyName("command")]
    public string Command { get; set; }

    [JsonPropertyName("tooltip")]
    public string Tooltip { get; set; }

    [JsonPropertyName("arguments")]
    public Object[] Arguments { get; set; }
  }
}
