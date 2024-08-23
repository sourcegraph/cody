using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class MemoryUsage
  {
    [JsonProperty(PropertyName = "rss")]
    public int Rss { get; set; }
    [JsonProperty(PropertyName = "heapTotal")]
    public int HeapTotal { get; set; }
    [JsonProperty(PropertyName = "heapUsed")]
    public int HeapUsed { get; set; }
    [JsonProperty(PropertyName = "external")]
    public int External { get; set; }
    [JsonProperty(PropertyName = "arrayBuffers")]
    public int ArrayBuffers { get; set; }
  }
}
