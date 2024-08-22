using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class Uri
  {

    [JsonPropertyName("scheme")]
    public string Scheme { get; set; }

    [JsonPropertyName("authority")]
    public string Authority { get; set; }

    [JsonPropertyName("path")]
    public string Path { get; set; }

    [JsonPropertyName("query")]
    public string Query { get; set; }

    [JsonPropertyName("fragment")]
    public string Fragment { get; set; }

    [JsonPropertyName("fsPath")]
    public string FsPath { get; set; }
  }
}
