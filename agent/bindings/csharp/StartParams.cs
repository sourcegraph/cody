using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class StartParams
  {

    [JsonPropertyName("line")]
    public int Line { get; set; }

    [JsonPropertyName("character")]
    public int Character { get; set; }
  }
}
