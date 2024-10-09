using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum ContextItemSource
  {
    [EnumMember(Value = "embeddings")]
    Embeddings,
    [EnumMember(Value = "user")]
    User,
    [EnumMember(Value = "editor")]
    Editor,
    [EnumMember(Value = "search")]
    Search,
    [EnumMember(Value = "initial")]
    Initial,
    [EnumMember(Value = "unified")]
    Unified,
    [EnumMember(Value = "selection")]
    Selection,
    [EnumMember(Value = "terminal")]
    Terminal,
    [EnumMember(Value = "uri")]
    Uri,
    [EnumMember(Value = "history")]
    History,
  }
}
