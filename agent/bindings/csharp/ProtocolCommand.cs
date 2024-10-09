using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProtocolCommand
  {
    [JsonProperty(PropertyName = "title")]
    public TitleParams Title { get; set; }
    [JsonProperty(PropertyName = "command")]
    public string Command { get; set; }
    [JsonProperty(PropertyName = "tooltip")]
    public string Tooltip { get; set; }
    [JsonProperty(PropertyName = "arguments")]
    public Object[] Arguments { get; set; }
  }
}
