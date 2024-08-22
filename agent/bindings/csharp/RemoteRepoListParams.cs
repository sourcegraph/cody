using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class RemoteRepoListParams
  {

    [JsonPropertyName("query")]
    public string Query { get; set; }

    [JsonPropertyName("first")]
    public int First { get; set; }

    [JsonPropertyName("afterId")]
    public string AfterId { get; set; }
  }
}
