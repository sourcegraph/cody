using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum ModelUsage
  {
    [EnumMember(Value = "chat")]
    Chat,
    [EnumMember(Value = "edit")]
    Edit,
    [EnumMember(Value = "autocomplete")]
    Autocomplete,
  }
}
