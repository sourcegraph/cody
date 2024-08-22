using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class IconsParams
  {

    [JsonPropertyName("value")]
    public string Value { get; set; }

    [JsonPropertyName("position")]
    public int Position { get; set; }
  }
}
