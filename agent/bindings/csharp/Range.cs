using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class Range
  {

    [JsonPropertyName("start")]
    public Position Start { get; set; }

    [JsonPropertyName("end")]
    public Position End { get; set; }
  }
}
