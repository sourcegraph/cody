using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class GraphqlGetRepoIdIfEmbeddingExistsParams
  {
    [JsonProperty(PropertyName = "repoName")]
    public string RepoName { get; set; }
  }
}
