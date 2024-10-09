using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WorkspaceFolderDidChangeParams
  {
    [JsonProperty(PropertyName = "uris")]
    public string[] Uris { get; set; }
  }
}
