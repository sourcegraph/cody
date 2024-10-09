using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ContextFilters
  {
    [JsonProperty(PropertyName = "include")]
    public CodyContextFilterItem[] Include { get; set; }
    [JsonProperty(PropertyName = "exclude")]
    public CodyContextFilterItem[] Exclude { get; set; }
  }
}
