using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class MemoryUsage
  {

    [JsonPropertyName("rss")]
    public int Rss { get; set; }

    [JsonPropertyName("heapTotal")]
    public int HeapTotal { get; set; }

    [JsonPropertyName("heapUsed")]
    public int HeapUsed { get; set; }

    [JsonPropertyName("external")]
    public int External { get; set; }

    [JsonPropertyName("arrayBuffers")]
    public int ArrayBuffers { get; set; }
  }
}
