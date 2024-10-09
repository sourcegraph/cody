using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class RangeData
  {
    [JsonProperty(PropertyName = "start")]
    public StartParams Start { get; set; }
    [JsonProperty(PropertyName = "end")]
    public EndParams End { get; set; }
  }
}
