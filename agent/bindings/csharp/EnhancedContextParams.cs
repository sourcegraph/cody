using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class EnhancedContextParams
  {

    [JsonPropertyName("selectedRepos")]
    public SelectedReposParams[] SelectedRepos { get; set; }
  }
}
