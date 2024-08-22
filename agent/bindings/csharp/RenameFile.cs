using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class RenameFile
  {

    [JsonPropertyName("oldUri")]
    public string OldUri { get; set; }

    [JsonPropertyName("newUri")]
    public string NewUri { get; set; }
  }
}
