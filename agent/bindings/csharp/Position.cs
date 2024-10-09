using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class Position
  {
    [JsonProperty(PropertyName = "line")]
    public int Line { get; set; }
    [JsonProperty(PropertyName = "character")]
    public int Character { get; set; }
  }
}
