using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class RangeData
  {

    [JsonPropertyName("start")]
    public StartParams Start { get; set; }

    [JsonPropertyName("end")]
    public EndParams End { get; set; }
  }
}
