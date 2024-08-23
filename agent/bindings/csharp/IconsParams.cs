using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class IconsParams
  {
    [JsonProperty(PropertyName = "value")]
    public string Value { get; set; }
    [JsonProperty(PropertyName = "position")]
    public int Position { get; set; }
  }
}
