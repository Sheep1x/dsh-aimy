"use strict";
(() => {
  // src/shared/types.ts
  var DEFAULT_API = "openai-responses";
  var API_OPTIONS = [
    { value: "openai-responses", label: "OpenAI Responses" },
    { value: "openai-completions", label: "OpenAI Chat Completions" },
    { value: "anthropic-messages", label: "Anthropic Messages" }
  ];

  // src/client/section.ts
  var S = {
    // 面板页根节点：centerCol 是 overflow:hidden 的 flex 列，根节点负责撑满 + 滚动
    panelRoot: {
      flex: "1 1 auto",
      minHeight: 0,
      width: "100%",
      display: "flex",
      flexDirection: "column",
      overflowY: "auto"
    },
    page: {
      boxSizing: "border-box",
      width: "100%",
      maxWidth: 880,
      margin: "0 auto",
      padding: "24px 24px 48px",
      display: "flex",
      flexDirection: "column",
      gap: 14
    },
    wrap: { maxWidth: 720, display: "flex", flexDirection: "column", gap: 12 },
    tabs: { display: "flex", gap: 6, borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))" },
    tab: {
      padding: "6px 12px",
      fontSize: 13,
      cursor: "pointer",
      background: "transparent",
      color: "inherit",
      border: "none",
      borderBottom: "2px solid transparent",
      opacity: 0.7
    },
    tabActive: { borderBottom: "2px solid var(--dsw-alias-label-primary, #4a7dff)", opacity: 1, fontWeight: 600 },
    card: {
      border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))",
      borderRadius: 8,
      padding: "12px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 8
    },
    row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
    label: { fontSize: 12, opacity: 0.7, minWidth: 64 },
    // 可点复制的地址：按钮本身不可见，靠 hover 底色 + 「复制 / 已复制」提示表达可点
    copy: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "2px 6px",
      marginLeft: -6,
      border: "none",
      borderRadius: 6,
      background: "transparent",
      color: "inherit",
      cursor: "pointer",
      font: "inherit",
      lineHeight: 1.4
    },
    copyHover: { background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,.16))" },
    copyIdle: { background: "transparent" },
    title: { fontSize: 14, fontWeight: 600 },
    pageTitle: { fontSize: 18, fontWeight: 650, letterSpacing: "-0.01em" },
    mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 },
    hint: { fontSize: 12, opacity: 0.7, lineHeight: 1.5 },
    err: { fontSize: 12, color: "var(--dsw-alias-state-error-primary, #d9534f)" },
    ok: { fontSize: 12, color: "var(--dsw-alias-state-success-primary, #2e9e5b)" },
    /**
     * 原生 <select> 的弹层是操作系统画的，只给 select 设颜色不够：
     * 每个 <option> 也必须显式带 background/color，否则暗色模式下会是
     * 白底 + 深色文字的默认配色（浅色主题下反而正常，所以容易漏）。
     * colorScheme 由组件按 DSH 当前主题注入（见 useDarkTheme），这里只留兜底值。
     */
    select: {
      boxSizing: "border-box",
      padding: "6px 8px",
      borderRadius: 6,
      border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))",
      background: "var(--dsw-alias-bg-layer-1, transparent)",
      color: "var(--dsw-alias-label-primary, inherit)",
      fontSize: 13,
      cursor: "pointer"
    },
    option: {
      background: "var(--dsw-alias-bg-layer-2, #ffffff)",
      color: "var(--dsw-alias-label-primary, #1a1a1a)"
    },
    field: {
      boxSizing: "border-box",
      padding: "6px 8px",
      borderRadius: 6,
      border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))",
      background: "var(--dsw-alias-bg-layer-1, transparent)",
      color: "var(--dsw-alias-label-primary, inherit)",
      fontSize: 13,
      flex: 1,
      minWidth: 200
    },
    button: {
      padding: "6px 12px",
      borderRadius: 6,
      border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))",
      background: "var(--dsw-alias-bg-layer-2, transparent)",
      color: "inherit",
      fontSize: 13,
      cursor: "pointer"
    }
  };
  function displayBaseURL(state) {
    if (!state || !state.baseURL) return "";
    return state.preset ? state.baseURL.replace(/\/v1$/i, "") : state.baseURL;
  }
  async function copyText(text) {
    try {
      const clipboard = navigator?.clipboard;
      if (clipboard && typeof clipboard.writeText === "function") {
        await clipboard.writeText(text);
        return true;
      }
    } catch {
    }
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "readonly");
      area.style.position = "fixed";
      area.style.top = "-9999px";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
  function ratioText(ratio) {
    return "×" + (Number.isFinite(ratio) ? ratio : 1).toFixed(2);
  }
  var PANEL_TITLE = "Aimy-艾米";
  function makeSection(deps, options = {}) {
    const { h, useState, useEffect, useCallback, request } = deps;
    const variant = options.variant ?? "settings";
    function useDarkTheme() {
      const read = () => typeof document !== "undefined" && document.body !== null && document.body.hasAttribute("data-ds-dark-theme");
      const [dark, setDark] = useState(read);
      useEffect(() => {
        if (typeof document === "undefined" || typeof MutationObserver === "undefined") return void 0;
        const observer = new MutationObserver(() => setDark(read()));
        observer.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
        setDark(read());
        return () => observer.disconnect();
      }, []);
      return dark;
    }
    function AddressValue(props) {
      const value = props && typeof props.value === "string" ? props.value : "";
      const [copied, setCopied] = useState(false);
      const [hovered, setHovered] = useState(false);
      const copy = useCallback(async () => {
        if (!value) return;
        const ok = await copyText(value);
        setCopied(ok);
        if (ok) setTimeout(() => setCopied(false), 1400);
      }, [value]);
      if (!value) return h("span", { style: S.hint }, "未配置");
      return h(
        "button",
        {
          type: "button",
          title: copied ? "已复制" : "点击复制地址",
          "aria-label": "复制地址 " + value,
          style: { ...S.copy, ...hovered ? S.copyHover : S.copyIdle },
          onClick: () => void copy(),
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => setHovered(false)
        },
        h("span", { style: S.mono }, value),
        h(
          "svg",
          {
            width: 12,
            height: 12,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 2,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            style: { opacity: 0.55, flex: "none" },
            "aria-hidden": "true"
          },
          h("rect", { x: 9, y: 9, width: 12, height: 12, rx: 2 }),
          h("path", { d: "M5 15V5a2 2 0 0 1 2-2h8" })
        ),
        h("span", { style: copied ? S.ok : S.hint }, copied ? "已复制" : "复制")
      );
    }
    return function OneHubSection() {
      const dark = useDarkTheme();
      const [tab, setTab] = useState("aimy");
      const [states, setStates] = useState({});
      const [busy, setBusy] = useState(false);
      const [message, setMessage] = useState(null);
      const [pendingGroup, setPendingGroup] = useState("");
      const [keyInput, setKeyInput] = useState("");
      const [compatURL, setCompatURL] = useState("");
      const [compatApi, setCompatApi] = useState(DEFAULT_API);
      const state = states[tab] ?? null;
      const putState = useCallback((id, next) => {
        setStates((prev) => ({ ...prev, [id]: next }));
      }, []);
      const load = useCallback(
        async (id, refresh) => {
          setBusy(true);
          try {
            const path = (refresh ? "/refresh" : "/state") + "?profile=" + id;
            const res = await request(path, refresh ? { method: "POST" } : void 0);
            if (res && res.data) {
              putState(id, res.data);
              if (!pendingGroup && res.data.token && res.data.token.group) setPendingGroup(res.data.token.group);
              setMessage(res.data.error ? { kind: "err", text: String(res.data.error) } : null);
            } else {
              setMessage({ kind: "err", text: res && res.message || "读取状态失败" });
            }
          } catch (error) {
            setMessage({ kind: "err", text: error instanceof Error ? error.message : String(error) });
          } finally {
            setBusy(false);
          }
        },
        [pendingGroup, putState, request]
      );
      useEffect(() => {
        void load(tab, false);
      }, [tab]);
      const saveKey = useCallback(async () => {
        const value = keyInput.trim();
        if (!value) {
          setMessage({ kind: "err", text: "请先填写 API Key" });
          return;
        }
        setBusy(true);
        setMessage(null);
        try {
          const res = await request("/credentials?profile=" + tab, {
            method: "POST",
            body: JSON.stringify({ apiKey: value })
          });
          if (res && res.success === false) {
            setMessage({ kind: "err", text: res.message || "保存失败" });
            return;
          }
          setKeyInput("");
          if (res && res.data) putState(tab, res.data);
          setMessage({ kind: "ok", text: "密钥已保存" });
        } catch (error) {
          setMessage({ kind: "err", text: error instanceof Error ? error.message : String(error) });
        } finally {
          setBusy(false);
        }
      }, [keyInput, putState, request, tab]);
      const clearKey = useCallback(async () => {
        setBusy(true);
        setMessage(null);
        try {
          const res = await request("/credentials?profile=" + tab, { method: "DELETE" });
          if (res && res.success === false) {
            setMessage({ kind: "err", text: res.message || "清除失败" });
            return;
          }
          if (res && res.data) putState(tab, res.data);
          setMessage({ kind: "ok", text: "密钥已清除" });
        } catch (error) {
          setMessage({ kind: "err", text: error instanceof Error ? error.message : String(error) });
        } finally {
          setBusy(false);
        }
      }, [putState, request, tab]);
      const saveApi = useCallback(
        async (nextApi) => {
          const previous = state && state.api ? state.api : null;
          setCompatApi(nextApi);
          setBusy(true);
          setMessage(null);
          try {
            const res = await request("/config?profile=" + tab, {
              method: "POST",
              body: JSON.stringify({ api: nextApi })
            });
            if (res && res.success === false) {
              setMessage({ kind: "err", text: res.message || "切换协议失败" });
              if (previous) setCompatApi(previous);
              return;
            }
            if (res && res.data) {
              putState(tab, res.data);
              const confirmed = res.data.api;
              if (confirmed) setCompatApi(confirmed);
            }
            setMessage({ kind: "ok", text: "协议已切换" });
          } catch (error) {
            setMessage({ kind: "err", text: error instanceof Error ? error.message : String(error) });
            if (previous) setCompatApi(previous);
          } finally {
            setBusy(false);
          }
        },
        [putState, request, state, tab]
      );
      const saveCompat = useCallback(async () => {
        const url = compatURL.trim();
        if (!url) {
          setMessage({ kind: "err", text: "请填写兼容模式的地址" });
          return;
        }
        setBusy(true);
        setMessage(null);
        try {
          const res = await request("/config?profile=compat", {
            method: "POST",
            body: JSON.stringify({ baseURL: url, api: compatApi })
          });
          if (res && res.success === false) {
            setMessage({ kind: "err", text: res.message || "保存失败" });
            return;
          }
          if (res && res.data) putState("compat", res.data);
          setMessage({ kind: "ok", text: "地址已保存" });
        } catch (error) {
          setMessage({ kind: "err", text: error instanceof Error ? error.message : String(error) });
        } finally {
          setBusy(false);
        }
      }, [compatApi, compatURL, putState, request]);
      const clearCompat = useCallback(async () => {
        setBusy(true);
        setMessage(null);
        try {
          const res = await request("/config?profile=compat", { method: "DELETE" });
          if (res && res.success === false) {
            setMessage({ kind: "err", text: res.message || "清除失败" });
            return;
          }
          if (res && res.data) putState("compat", res.data);
          setCompatURL("");
          setMessage({ kind: "ok", text: "兼容模式已清除" });
        } catch (error) {
          setMessage({ kind: "err", text: error instanceof Error ? error.message : String(error) });
        } finally {
          setBusy(false);
        }
      }, [putState, request]);
      const doSwitch = useCallback(async () => {
        if (!pendingGroup) return;
        setBusy(true);
        setMessage(null);
        try {
          const res = await request("/switch?profile=" + tab, {
            method: "POST",
            body: JSON.stringify({ group: pendingGroup })
          });
          if (res && res.success === false) {
            setMessage({ kind: "err", text: res.message || "切换失败" });
            return;
          }
          const next = res && res.data && res.data.state ? res.data.state : null;
          if (next) putState(tab, next);
          const warning = res && res.data ? res.data.warning : void 0;
          setMessage(
            warning ? { kind: "err", text: String(warning) } : { kind: "ok", text: "已切换到分组 " + (next && next.token && next.token.group || pendingGroup) }
          );
        } catch (error) {
          setMessage({ kind: "err", text: error instanceof Error ? error.message : String(error) });
        } finally {
          setBusy(false);
        }
      }, [pendingGroup, putState, request, tab]);
      const token = state && state.token ? state.token : null;
      const groups = token && token.groups ? token.groups : [];
      const current = token ? token.group : "";
      const canSwitch = Boolean(state && state.supportsSwitch && groups.length > 0);
      const optionChildren = groups.length ? groups.map(
        (g) => h("option", { key: g.symbol, value: g.symbol, style: S.option }, g.name + "（" + ratioText(g.ratio) + "）")
      ) : [h("option", { key: "none", value: "", style: S.option }, "（无可选分组）")];
      const tabButton = (id, text) => h(
        "button",
        {
          key: id,
          style: { ...S.tab, ...tab === id ? S.tabActive : {} },
          onClick: () => {
            setTab(id);
            setMessage(null);
            setPendingGroup("");
          }
        },
        text
      );
      const header = [
        h("div", { key: "title", style: variant === "panel" ? S.pageTitle : S.title }, PANEL_TITLE),
        h(
          "div",
          { key: "hint", style: S.hint },
          "解决中转站多分组多倍率的管理问题：站点提供分组接口时可就地切换，模型列表与计费倍率同步刷新。"
        ),
        h("div", { key: "tabs", style: S.tabs }, tabButton("aimy", "Aimy-艾米"), tabButton("compat", "兼容模式"))
      ];
      const statusCard = h(
        "div",
        { style: S.card },
        h(
          "div",
          { style: S.row },
          h("span", { style: S.label }, "地址"),
          h(AddressValue, { value: displayBaseURL(state) }),
          state && state.preset ? h("span", { style: S.hint }, "预设地址（不可修改）") : null
        ),
        h(
          "div",
          { style: S.row },
          h("span", { style: S.label }, "协议"),
          h(
            "select",
            {
              style: { ...S.select, colorScheme: dark ? "dark" : "light", flex: "0 0 220px", minWidth: 180 },
              value: state && state.api ? state.api : compatApi,
              disabled: busy,
              title: "三种协议对应中转站的三套线路，切换后会重新挂载模型路由",
              onChange: (e) => void saveApi(e.target.value)
            },
            ...API_OPTIONS.map((opt) => h("option", { key: opt.value, value: opt.value, style: S.option }, opt.label))
          ),
          h("span", { style: S.hint }, busy ? "切换中…" : "切换后自动重挂模型路由")
        ),
        h(
          "div",
          { style: S.row },
          h("span", { style: S.label }, "状态"),
          h(
            "span",
            { style: state && state.connected ? S.ok : S.err },
            !state ? "读取中…" : state.connected ? "已连接" : "未连接"
          ),
          state ? h("span", { style: S.hint }, "协议 " + state.api) : null
        ),
        state && !state.preset ? null : h(
          "div",
          { style: S.row },
          h("span", { style: S.label }, "当前分组"),
          h(
            "span",
            { style: S.mono },
            current ? current + "（" + ratioText(token ? token.ratio : 1) + "）" : "—"
          ),
          h("span", { style: S.hint }, state ? "模型 " + state.models.length + " 个" : "")
        ),
        h(
          "div",
          { style: S.row },
          h("span", { style: S.label }, "模型路由"),
          h(
            "span",
            { style: state && state.provider && state.provider.mounted ? S.ok : S.err },
            state && state.provider ? state.provider.mounted ? "已挂载（" + state.provider.routeName + " · " + state.provider.modelCount + " 个模型）" : "未挂载" : "—"
          )
        ),
        state && state.provider && state.provider.error ? h("div", { style: S.err }, state.provider.error) : null,
        state && state.error ? h("div", { style: S.err }, state.error) : null,
        state && state.diagnostics ? h(
          "div",
          { style: S.hint },
          "诊断：注册表 " + String(state.diagnostics.registryPresent) + " · 路由模型 " + String(state.diagnostics.registryModels ?? "—") + " · 密钥 " + String(state.diagnostics.credentialResolve ?? "—") + " · settings " + String(state.diagnostics.settingsChannel ?? "—") + " · providers " + JSON.stringify(state.diagnostics.providers ?? [])
        ) : null
      );
      const compatCard = tab === "compat" ? h(
        "div",
        { style: S.card },
        h("div", { style: S.row }, h("span", { style: S.label }, "地址")),
        h(
          "div",
          { style: S.row },
          h("input", {
            style: { ...S.field, colorScheme: dark ? "dark" : "light" },
            placeholder: "https://your-gateway.example.com（/v1 可填可不填）",
            value: compatURL,
            onChange: (e) => setCompatURL(e.target.value)
          })
        ),
        h(
          "div",
          { style: S.row },
          h("button", { style: S.button, disabled: busy, onClick: () => void saveCompat() }, "保存地址"),
          h("button", { style: S.button, disabled: busy, onClick: () => void clearCompat() }, "清除")
        ),
        h(
          "div",
          { style: S.hint },
          "适配 new-api / sub2api / 任意 OpenAI 兼容网关。地址填到域名即可：OpenAI 协议会自动补 /v1，Anthropic 协议不会带 /v1（两者都会剥离你误填的完整端点路径）。这类站点通常没有 /v1/token/group，分组切换会自动降级为只读。"
        )
      ) : null;
      const keyCard = h(
        "div",
        { style: S.card },
        h(
          "div",
          { style: S.row },
          h("span", { style: S.label }, "API Key"),
          h(
            "span",
            { style: state && state.credential && state.credential.configured ? S.ok : S.err },
            state && state.credential ? state.credential.configured ? "已保存" + (state.credential.source ? "（来源：" + state.credential.source + "）" : "") : "未保存" : "凭据服务不可用"
          )
        ),
        h(
          "div",
          { style: S.row },
          h("input", {
            style: { ...S.field, colorScheme: dark ? "dark" : "light" },
            type: "password",
            autoComplete: "new-password",
            placeholder: "粘贴中转站的 sk- 令牌，保存后写入凭据库",
            value: keyInput,
            onChange: (e) => setKeyInput(e.target.value)
          }),
          h("button", { style: S.button, disabled: busy || !keyInput.trim(), onClick: () => void saveKey() }, "保存"),
          h("button", { style: S.button, disabled: busy, onClick: () => void clearKey() }, "清除")
        ),
        h("div", { style: S.hint }, "密钥写入 DSH 凭据库（write-only，不回显、不进配置文件）。保存后立即探测并挂载模型。")
      );
      const groupCard = tab === "aimy" || state && state.supportsSwitch ? h(
        "div",
        { style: S.card },
        h(
          "div",
          { style: S.row },
          h("span", { style: S.label }, "切换到分组"),
          h(
            "select",
            {
              style: { ...S.select, colorScheme: dark ? "dark" : "light", flex: "0 0 220px", minWidth: 180 },
              value: pendingGroup,
              disabled: busy || !canSwitch,
              onChange: (e) => setPendingGroup(e.target.value)
            },
            ...optionChildren
          ),
          h(
            "button",
            {
              style: S.button,
              disabled: busy || !pendingGroup || pendingGroup === current || !canSwitch,
              onClick: () => void doSwitch()
            },
            busy ? "处理中…" : "切换分组"
          ),
          h("button", { style: S.button, disabled: busy, onClick: () => void load(tab, true) }, "刷新")
        ),
        h(
          "div",
          { style: S.hint },
          state && state.supportsSwitch === false ? "当前站点不支持切换分组（缺少 /v1/token/group），仅支持查看与调用。" : "切换会同时影响使用同一把密钥的其它客户端；建议给 DSH 单独建一个令牌，并开启「允许客户端切换分组」。"
        ),
        state && state.staleModel ? h(
          "div",
          { style: S.err },
          "当前选中的模型 " + (state.selection ? state.selection.model : "") + " 不在本分组里，请到模型选择器重新选择（不会自动改选，避免悄悄切换计费对象）。"
        ) : null,
        message ? h("div", { style: message.kind === "ok" ? S.ok : S.err }, message.text) : null
      ) : h(
        "div",
        { style: S.card },
        h("div", { style: S.hint }, "该站点不支持分组切换，只提供模型调用。"),
        h("div", { style: S.row }, h("button", { style: S.button, disabled: busy, onClick: () => void load(tab, true) }, "刷新")),
        message ? h("div", { style: message.kind === "ok" ? S.ok : S.err }, message.text) : null
      );
      const body = h(
        "div",
        { style: variant === "panel" ? S.page : S.wrap },
        ...header,
        statusCard,
        compatCard,
        keyCard,
        groupCard
      );
      return variant === "panel" ? h("div", { style: S.panelRoot }, body) : body;
    };
  }

  // src/client/app.ts
  var PANEL_ID = "dsh-aimy";
  var PANEL_LABEL = "Aimy-艾米";
  function makeFactory() {
    return (require2) => {
      const module = { exports: {} };
      const react = require2("react");
      const { createElement: h, useCallback, useEffect, useState } = react;
      const name = "onehub";
      const inject = ["slots"];
      async function request(path, init) {
        const res = await fetch("/dsh-aimy-relay" + path, {
          ...init,
          headers: { "Content-Type": "application/json", ...init?.headers ?? {} }
        });
        const text = await res.text();
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          return { success: false, message: "响应解析失败" };
        }
      }
      const RELAY_ICON_PATH = "M11.06 3L12.38 3L12.47 3.09L13.22 3.19L14.25 3.75L15 4.5L16.5 7.31L16.5 7.5L18.19 10.78L18.19 10.97L17.34 11.34L17.25 11.25L16.97 10.69L16.97 10.5L16.59 9.94L16.59 9.75L14.34 5.34L14.16 5.06L13.31 4.31L12.38 3.94L11.06 3.94L10.5 4.13L9.84 4.5L9.19 5.16L8.72 5.91L5.91 11.72L5.91 11.91L5.16 13.5L4.69 14.91L4.59 15L3.56 15L3.66 14.63L4.78 12L4.88 11.53L5.25 10.88L5.25 10.69L7.97 5.16L8.34 4.59L9.09 3.84L10.03 3.28L10.59 3.09L10.97 3.09Z M12.94 8.53L13.41 8.53L13.59 8.63L13.69 8.81L13.78 9.56L13.88 9.66L13.88 10.22L13.69 10.41L13.59 10.5L13.13 10.5L12.84 10.13L12.84 9.66L12.66 9Z M9.94 9.19L10.31 9.19L10.5 9.28L10.69 9.56L10.69 10.97L10.5 11.16L9.94 11.16L9.75 10.97L9.66 9.47Z M19.03 12.94L19.22 13.03L19.22 13.22L19.69 14.16L19.69 14.34L20.44 16.03L20.53 16.5L20.72 16.78L20.91 17.44L20.91 18.38L20.72 19.03L20.34 19.69L19.59 20.34L18.66 20.72L17.06 20.81L16.97 20.72L16.13 20.63L15.38 20.25L14.53 19.5L14.06 18.75L13.69 17.81L13.22 17.16L12.28 17.34L12.19 17.44L11.81 17.44L10.97 17.72L10.13 17.81L9.84 18.09L9.19 19.41L8.53 20.06L7.78 20.44L7.13 20.63L5.63 20.63L4.41 20.25L3.28 19.22L3 18.66L2.81 17.81L2.81 17.25L2.91 17.16L3.84 17.16L3.84 18L3.94 18.28L4.13 18.66L4.78 19.31L5.91 19.69L6.84 19.69L7.69 19.41L8.34 18.84L9.09 17.34L9.47 16.97L13.59 16.13L13.78 16.22L13.97 16.59L14.25 16.78L15.19 18.66L15.75 19.31L16.41 19.69L16.69 19.69L16.78 19.78L17.25 19.78L17.34 19.88L18.38 19.78L19.31 19.31L19.69 18.84L19.88 18.28L19.88 17.53L19.59 16.69L19.41 16.41L18.47 13.88L18.19 13.41L18.19 13.31Z";
      function RelayIcon(props) {
        const size = props && typeof props.size === "number" ? props.size : 18;
        const active = Boolean(props && props.active);
        return h(
          "svg",
          {
            width: size,
            height: size,
            viewBox: "0 0 24 24",
            fill: "currentColor",
            style: { display: "block", opacity: active ? 1 : 0.8 },
            "aria-hidden": "true"
          },
          h("path", { d: RELAY_ICON_PATH, fillRule: "evenodd", clipRule: "evenodd" })
        );
      }
      function apply(ctx) {
        const deps = { h, useState, useEffect, useCallback, request };
        const Section = makeSection(deps, { variant: "settings" });
        const Panel = makeSection(deps, { variant: "panel" });
        ctx.slots.inject("settings.section", function* () {
          yield ctx.slots.register(
            {
              name: "settings.section",
              id: "onehub-relay",
              order: 40,
              label: () => PANEL_LABEL
            },
            Section
          );
        });
        ctx.slots.inject("main", function* () {
          yield ctx.slots.register({ name: "main", key: PANEL_ID }, Panel);
        });
        ctx.slots.inject("sidebar.panellist", function* () {
          yield ctx.slots.register(
            {
              name: "sidebar.panellist",
              id: PANEL_ID,
              order: 30,
              label: () => PANEL_LABEL
            },
            RelayIcon
          );
        });
      }
      module.exports = { apply, inject, name };
      return module.exports;
    };
  }

  // src/client/index.ts
  window.__ModuleLoader__.load({
    id: "dsh-aimy",
    factory: makeFactory()
  });
})();
