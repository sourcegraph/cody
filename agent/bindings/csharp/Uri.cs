using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class Uri
  {
    [JsonProperty(PropertyName = "scheme")]
    public string Scheme { get; set; }
    [JsonProperty(PropertyName = "authority")]
    public string Authority { get; set; }
    [JsonProperty(PropertyName = "path")]
    public string Path { get; set; }
    [JsonProperty(PropertyName = "query")]
    public string Query { get; set; }
    [JsonProperty(PropertyName = "fragment")]
    public string Fragment { get; set; }
    [JsonProperty(PropertyName = "fsPath")]
    public string FsPath { get; set; }
  }
}
