using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WriteFileOptions
  {
    [JsonProperty(PropertyName = "overwrite")]
    public bool Overwrite { get; set; }
    [JsonProperty(PropertyName = "ignoreIfExists")]
    public bool IgnoreIfExists { get; set; }
  }
}
