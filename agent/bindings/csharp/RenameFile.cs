using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class RenameFile
  {
    [JsonProperty(PropertyName = "oldUri")]
    public string OldUri { get; set; }
    [JsonProperty(PropertyName = "newUri")]
    public string NewUri { get; set; }
  }
}
