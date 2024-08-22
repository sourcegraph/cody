using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class DeleteOptionsParams
  {

    [JsonPropertyName("recursive")]
    public bool Recursive { get; set; }

    [JsonPropertyName("ignoreIfNotExists")]
    public bool IgnoreIfNotExists { get; set; }
  }
}
