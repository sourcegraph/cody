using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class EnhancedContextParams
  {
    [JsonProperty(PropertyName = "selectedRepos")]
    public SelectedReposParams[] SelectedRepos { get; set; }
  }
}
