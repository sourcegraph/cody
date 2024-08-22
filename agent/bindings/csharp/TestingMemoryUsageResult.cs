using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingMemoryUsageResult
  {

    [JsonPropertyName("usage")]
    public MemoryUsage Usage { get; set; }
  }
}
