using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class RemoteRepoListResult
  {
    [JsonProperty(PropertyName = "startIndex")]
    public int StartIndex { get; set; }
    [JsonProperty(PropertyName = "count")]
    public int Count { get; set; }
    [JsonProperty(PropertyName = "repos")]
    public ReposParams[] Repos { get; set; }
    [JsonProperty(PropertyName = "state")]
    public RemoteRepoFetchState State { get; set; }
  }
}
