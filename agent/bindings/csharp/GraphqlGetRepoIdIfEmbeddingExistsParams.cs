using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class GraphqlGetRepoIdIfEmbeddingExistsParams
  {

    [JsonPropertyName("repoName")]
    public string RepoName { get; set; }
  }
}
