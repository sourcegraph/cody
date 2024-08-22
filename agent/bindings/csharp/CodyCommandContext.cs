using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CodyCommandContext
  {

    [JsonPropertyName("none")]
    public bool None { get; set; }

    [JsonPropertyName("openTabs")]
    public bool OpenTabs { get; set; }

    [JsonPropertyName("currentDir")]
    public bool CurrentDir { get; set; }

    [JsonPropertyName("currentFile")]
    public bool CurrentFile { get; set; }

    [JsonPropertyName("selection")]
    public bool Selection { get; set; }

    [JsonPropertyName("command")]
    public string Command { get; set; }

    [JsonPropertyName("filePath")]
    public string FilePath { get; set; }

    [JsonPropertyName("directoryPath")]
    public string DirectoryPath { get; set; }

    [JsonPropertyName("codebase")]
    public bool Codebase { get; set; }
  }
}
