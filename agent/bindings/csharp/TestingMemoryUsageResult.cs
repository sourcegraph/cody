using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingMemoryUsageResult
  {
    [JsonProperty(PropertyName = "usage")]
    public MemoryUsage Usage { get; set; }
  }
}
