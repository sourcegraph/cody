using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class RemoteRepoListResult
  {

    [JsonPropertyName("startIndex")]
    public int StartIndex { get; set; }

    [JsonPropertyName("count")]
    public int Count { get; set; }

    [JsonPropertyName("repos")]
    public ReposParams[] Repos { get; set; }

    [JsonPropertyName("state")]
    public RemoteRepoFetchState State { get; set; }
  }
}
