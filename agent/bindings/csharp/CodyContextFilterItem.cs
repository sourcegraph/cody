using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CodyContextFilterItem
  {

    [JsonPropertyName("repoNamePattern")]
    public string RepoNamePattern { get; set; }

    [JsonPropertyName("filePathPatterns")]
    public string[] FilePathPatterns { get; set; }
  }
}
