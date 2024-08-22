using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WriteFileOptions
  {

    [JsonPropertyName("overwrite")]
    public bool Overwrite { get; set; }

    [JsonPropertyName("ignoreIfExists")]
    public bool IgnoreIfExists { get; set; }
  }
}
