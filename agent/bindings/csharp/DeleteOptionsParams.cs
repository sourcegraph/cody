using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class DeleteOptionsParams
  {
    [JsonProperty(PropertyName = "recursive")]
    public bool Recursive { get; set; }
    [JsonProperty(PropertyName = "ignoreIfNotExists")]
    public bool IgnoreIfNotExists { get; set; }
  }
}
