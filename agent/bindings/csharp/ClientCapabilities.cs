using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ClientCapabilities
  {
    [JsonProperty(PropertyName = "completions")]
    public CompletionsEnum Completions { get; set; } // Oneof: none
    [JsonProperty(PropertyName = "chat")]
    public ChatEnum Chat { get; set; } // Oneof: none, streaming
    [JsonProperty(PropertyName = "git")]
    public GitEnum Git { get; set; } // Oneof: none, enabled
    [JsonProperty(PropertyName = "progressBars")]
    public ProgressBarsEnum ProgressBars { get; set; } // Oneof: none, enabled
    [JsonProperty(PropertyName = "edit")]
    public EditEnum Edit { get; set; } // Oneof: none, enabled
    [JsonProperty(PropertyName = "editWorkspace")]
    public EditWorkspaceEnum EditWorkspace { get; set; } // Oneof: none, enabled
    [JsonProperty(PropertyName = "untitledDocuments")]
    public UntitledDocumentsEnum UntitledDocuments { get; set; } // Oneof: none, enabled
    [JsonProperty(PropertyName = "showDocument")]
    public ShowDocumentEnum ShowDocument { get; set; } // Oneof: none, enabled
    [JsonProperty(PropertyName = "codeLenses")]
    public CodeLensesEnum CodeLenses { get; set; } // Oneof: none, enabled
    [JsonProperty(PropertyName = "showWindowMessage")]
    public ShowWindowMessageEnum ShowWindowMessage { get; set; } // Oneof: notification, request
    [JsonProperty(PropertyName = "ignore")]
    public IgnoreEnum Ignore { get; set; } // Oneof: none, enabled
    [JsonProperty(PropertyName = "codeActions")]
    public CodeActionsEnum CodeActions { get; set; } // Oneof: none, enabled
    [JsonProperty(PropertyName = "webviewMessages")]
    public WebviewMessagesEnum WebviewMessages { get; set; } // Oneof: object-encoded, string-encoded
    [JsonProperty(PropertyName = "globalState")]
    public GlobalStateEnum GlobalState { get; set; } // Oneof: stateless, server-managed, client-managed
    [JsonProperty(PropertyName = "webview")]
    public WebviewEnum Webview { get; set; } // Oneof: agentic, native
    [JsonProperty(PropertyName = "webviewNativeConfig")]
    public WebviewNativeConfigParams WebviewNativeConfig { get; set; }

    public enum CompletionsEnum
    {
      [EnumMember(Value = "none")]
      None,
    }

    public enum ChatEnum
    {
      [EnumMember(Value = "none")]
      None,
      [EnumMember(Value = "streaming")]
      Streaming,
    }

    public enum GitEnum
    {
      [EnumMember(Value = "none")]
      None,
      [EnumMember(Value = "enabled")]
      Enabled,
    }

    public enum ProgressBarsEnum
    {
      [EnumMember(Value = "none")]
      None,
      [EnumMember(Value = "enabled")]
      Enabled,
    }

    public enum EditEnum
    {
      [EnumMember(Value = "none")]
      None,
      [EnumMember(Value = "enabled")]
      Enabled,
    }

    public enum EditWorkspaceEnum
    {
      [EnumMember(Value = "none")]
      None,
      [EnumMember(Value = "enabled")]
      Enabled,
    }

    public enum UntitledDocumentsEnum
    {
      [EnumMember(Value = "none")]
      None,
      [EnumMember(Value = "enabled")]
      Enabled,
    }

    public enum ShowDocumentEnum
    {
      [EnumMember(Value = "none")]
      None,
      [EnumMember(Value = "enabled")]
      Enabled,
    }

    public enum CodeLensesEnum
    {
      [EnumMember(Value = "none")]
      None,
      [EnumMember(Value = "enabled")]
      Enabled,
    }

    public enum ShowWindowMessageEnum
    {
      [EnumMember(Value = "notification")]
      Notification,
      [EnumMember(Value = "request")]
      Request,
    }

    public enum IgnoreEnum
    {
      [EnumMember(Value = "none")]
      None,
      [EnumMember(Value = "enabled")]
      Enabled,
    }

    public enum CodeActionsEnum
    {
      [EnumMember(Value = "none")]
      None,
      [EnumMember(Value = "enabled")]
      Enabled,
    }

    public enum WebviewMessagesEnum
    {
      [EnumMember(Value = "object-encoded")]
      Object-encoded,
      [EnumMember(Value = "string-encoded")]
      String-encoded,
    }

    public enum GlobalStateEnum
    {
      [EnumMember(Value = "stateless")]
      Stateless,
      [EnumMember(Value = "server-managed")]
      Server-managed,
      [EnumMember(Value = "client-managed")]
      Client-managed,
    }

    public enum WebviewEnum
    {
      [EnumMember(Value = "agentic")]
      Agentic,
      [EnumMember(Value = "native")]
      Native,
    }
  }
}
