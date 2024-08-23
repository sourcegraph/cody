using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CodyCommandContext
  {
    [JsonProperty(PropertyName = "none")]
    public bool None { get; set; }
    [JsonProperty(PropertyName = "openTabs")]
    public bool OpenTabs { get; set; }
    [JsonProperty(PropertyName = "currentDir")]
    public bool CurrentDir { get; set; }
    [JsonProperty(PropertyName = "currentFile")]
    public bool CurrentFile { get; set; }
    [JsonProperty(PropertyName = "selection")]
    public bool Selection { get; set; }
    [JsonProperty(PropertyName = "command")]
    public string Command { get; set; }
    [JsonProperty(PropertyName = "filePath")]
    public string FilePath { get; set; }
    [JsonProperty(PropertyName = "directoryPath")]
    public string DirectoryPath { get; set; }
    [JsonProperty(PropertyName = "codebase")]
    public bool Codebase { get; set; }
  }
}
