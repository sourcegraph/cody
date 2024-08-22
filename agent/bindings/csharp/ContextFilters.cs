using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ContextFilters
  {

    [JsonPropertyName("include")]
    public CodyContextFilterItem[] Include { get; set; }

    [JsonPropertyName("exclude")]
    public CodyContextFilterItem[] Exclude { get; set; }
  }
}
