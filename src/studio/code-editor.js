import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/editor/contrib/suggest/browser/suggestController';
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution';
import 'monaco-editor/editor/contrib/parameterHints/browser/parameterHints';
import 'monaco-editor/editor/contrib/find/browser/findController';
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching';
import 'monaco-editor/editor/contrib/comment/browser/comment';
import 'monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { conf, language } from 'monaco-editor/languages/definitions/lua/lua';
import { luaSyntaxError } from '../engine/lua-syntax.js';
import { API, PROPERTIES, SERVICES, completionContext } from './lua-api.js';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
monaco.languages.register({ id: 'lua' });
monaco.languages.setLanguageConfiguration('lua', conf);
monaco.languages.setMonarchTokensProvider('lua', language);
monaco.editor.defineTheme('openengine', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: 'c4a5e8' },
    { token: 'string', foreground: 'd8bd8c' },
    { token: 'comment', foreground: '708b72' },
    { token: 'number', foreground: '9ec6b4' },
    { token: 'identifier', foreground: 'd3d7e0' },
  ],
  colors: {
    'editor.background': '#202226',
    'editorLineNumber.foreground': '#667080',
    'editorLineNumber.activeForeground': '#c0c7d2',
    'editor.lineHighlightBackground': '#282b31',
    'editorCursor.foreground': '#8eb6ed',
    'editor.selectionBackground': '#3b526d',
  },
});

/** Monaco provides editing mechanics; project-aware providers describe the actual engine API. */
export class LuaEditor {
  constructor(host, store) {
    this.store = store;
    this.models = new Map();
    this.node = null;
    this.syncing = false;
    this.editor = monaco.editor.create(host, {
      language: 'lua',
      theme: 'openengine',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      lineHeight: 22,
      fontFamily: 'Consolas, "SFMono-Regular", monospace',
      scrollBeyondLastLine: false,
      tabSize: 4,
      insertSpaces: true,
      wordBasedSuggestions: 'currentDocument',
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      ariaLabel: 'Lua script source',
      padding: { top: 14 },
      fixedOverflowWidgets: true,
    });
    this.editor.onDidChangeModelContent(() => {
      if (this.syncing || !this.node) return;
      const node = this.store.nodes.find((item) => item.Id === this.node.Id);
      if (!node) return;
      store.transact(() => (node.Source = this.editor.getValue()), 'source:' + node.Id);
      this.validateSoon();
    });
    this.providers = [
      monaco.languages.registerCompletionItemProvider('lua', {
        triggerCharacters: ['.', ':', '"', "'"],
        provideCompletionItems: (model, position) => this.completions(model, position),
      }),
      monaco.languages.registerHoverProvider('lua', {
        provideHover: (model, position) => {
          const word = model.getWordAtPosition(position)?.word;
          for (const methods of Object.values(API)) {
            const entry = methods[word];
            if (entry)
              return {
                contents: [{ value: '**' + word + '(' + entry[0] + ')**' }, { value: entry[1] }],
              };
          }
          return null;
        },
      }),
      monaco.languages.registerSignatureHelpProvider('lua', {
        signatureHelpTriggerCharacters: ['(', ','],
        provideSignatureHelp: (model, position) => this.signature(model, position),
      }),
    ];
    this.observer = new ResizeObserver(() => this.editor.layout());
    this.observer.observe(host);
  }
  setNode(node) {
    if (!node) {
      this.editor.updateOptions({ readOnly: true });
      this.node = null;
      this.editor.setModel(null);
      return;
    }
    this.node = node;
    this.editor.updateOptions({ readOnly: false });
    let model = this.models.get(node.Id);
    if (!model) {
      model = monaco.editor.createModel(
        node.Source,
        'lua',
        monaco.Uri.parse('openengine://project/' + node.Id + '.lua'),
      );
      this.models.set(node.Id, model);
    }
    this.syncing = true;
    try {
      if (model.getValue() !== node.Source) model.setValue(node.Source);
      if (this.editor.getModel() !== model) this.editor.setModel(model);
    } finally {
      this.syncing = false;
    }
    this.validateSoon();
  }
  validateSoon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const model = this.editor.getModel();
      if (!model || !this.node) return;
      const issue = luaSyntaxError(model.getValue(), this.node.Name);
      monaco.editor.setModelMarkers(
        model,
        'lua',
        issue
          ? [
              {
                severity: monaco.MarkerSeverity.Error,
                startLineNumber: issue.line,
                endLineNumber: issue.line,
                startColumn: 1,
                endColumn: model.getLineMaxColumn(Math.min(issue.line, model.getLineCount())),
                message: issue.message,
              },
            ]
          : [],
      );
    }, 220);
  }
  completions(model, position) {
    const source = model.getValue(),
      before = model.getLineContent(position.lineNumber).slice(0, position.column - 1),
      word = model.getWordUntilPosition(position);
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };
    const receiver = before.match(/([\w.]+)[:.]\w*$/)?.[1];
    const suggestions = [];
    const add = (label, kind, insertText = label, documentation = '') =>
      suggestions.push({
        label,
        kind,
        insertText,
        documentation,
        range,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      });
    if (receiver) {
      const context = completionContext(receiver, source, this.node, this.store.workspace);
      for (const [name, [params, description]] of Object.entries(context.methods)) {
        const args = params
          ? params
              .split(', ')
              .map((param, index) => '${' + (index + 1) + ':' + param + '}')
              .join(', ')
          : '';
        add(name, monaco.languages.CompletionItemKind.Method, name + '(' + args + ')', description);
      }
      for (const name of [
        ...context.properties,
        ...context.children.filter((name) => /^[A-Za-z_]\w*$/.test(name)),
      ])
        add(name, monaco.languages.CompletionItemKind.Property);
    } else {
      for (const name of [
        'game',
        'workspace',
        'script',
        'Vector2',
        'Vector3',
        'Instance',
        'print',
        'warn',
        'require',
        'math',
        'string',
        'table',
        'pairs',
        'ipairs',
        'tonumber',
        'tostring',
      ])
        add(name, monaco.languages.CompletionItemKind.Variable);
      for (const name of [
        'local',
        'function',
        'if',
        'then',
        'else',
        'elseif',
        'end',
        'for',
        'while',
        'do',
        'return',
        'true',
        'false',
        'nil',
        'and',
        'or',
        'not',
      ])
        add(name, monaco.languages.CompletionItemKind.Keyword);
      for (const match of source.matchAll(/\blocal\s+(\w+)/g))
        add(match[1], monaco.languages.CompletionItemKind.Variable);
    }
    if (/GetService\(["'][^"']*$/.test(before))
      for (const service of SERVICES)
        add(service, monaco.languages.CompletionItemKind.Value, service);
    return { suggestions };
  }
  signature(model, position) {
    const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1),
      match = before.match(/([\w.]+)[:.](\w+)\(([^()]*)$/);
    if (!match) return null;
    const entry = completionContext(match[1], model.getValue(), this.node, this.store.workspace)
      .methods[match[2]];
    if (!entry) return null;
    const parameters = entry[0] ? entry[0].split(', ').map((label) => ({ label })) : [];
    return {
      value: {
        signatures: [
          { label: match[2] + '(' + entry[0] + ')', documentation: entry[1], parameters },
        ],
        activeSignature: 0,
        activeParameter: Math.min(
          match[3].split(',').length - 1,
          Math.max(0, parameters.length - 1),
        ),
      },
      dispose() {},
    };
  }
  clearProject() {
    this.editor.setModel(null);
    for (const model of this.models.values()) model.dispose();
    this.models.clear();
    this.node = null;
  }
  layout() {
    this.editor.layout();
  }
  dispose() {
    clearTimeout(this.timer);
    this.observer.disconnect();
    this.providers.forEach((provider) => provider.dispose());
    this.clearProject();
    this.editor.dispose();
  }
}
