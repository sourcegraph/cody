using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CodyContextFilterItem
  {
    [JsonProperty(PropertyName = "repoNamePattern")]
    public string RepoNamePattern { get; set; }
    [JsonProperty(PropertyName = "filePathPatterns")]
    public string[] FilePathPatterns { get; set; }
  }
}
