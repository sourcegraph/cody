using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class RemoteRepoListParams
  {
    [JsonProperty(PropertyName = "query")]
    public string Query { get; set; }
    [JsonProperty(PropertyName = "first")]
    public int First { get; set; }
    [JsonProperty(PropertyName = "afterId")]
    public string AfterId { get; set; }
  }
}
