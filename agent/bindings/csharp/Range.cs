using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class Range
  {
    [JsonProperty(PropertyName = "start")]
    public Position Start { get; set; }
    [JsonProperty(PropertyName = "end")]
    public Position End { get; set; }
  }
}
