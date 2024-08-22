using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WorkspaceFolderDidChangeParams
  {

    [JsonPropertyName("uris")]
    public string[] Uris { get; set; }
  }
}
