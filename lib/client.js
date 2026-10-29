"use strict";
(() => {
  // src/shared/brand.ts
  var BRAND_ICON_PATH = "M11.06 2.25L12.38 2.25L12.47 2.34L12.84 2.34L13.5 2.53L14.72 3.19L15.56 4.03L16.22 5.34L16.41 5.53L17.16 7.03L17.16 7.22L18.84 10.5L18.94 10.78L18.84 11.25L18.66 11.53L17.34 12.09L16.88 11.91L16.69 11.72L16.31 10.97L16.31 10.78L16.03 10.41L15.94 10.03L13.78 5.81L13.13 5.06L12.66 4.78L12.38 4.69L11.06 4.69L10.59 4.88L9.75 5.63L9 6.94L7.03 10.97L7.03 11.16L6.56 12L6.09 13.31L5.81 13.78L5.34 15.19L5.06 15.56L4.59 15.75L3.56 15.75L3.09 15.56L2.81 15L3 14.34L3.38 13.59L3.47 13.13L4.13 11.72L4.22 11.25L5.16 9.38L5.16 9.19L7.41 4.69L7.78 4.13L8.63 3.28L9.19 2.91L9.75 2.63Z M12.94 7.78L13.41 7.78L14.06 8.06L14.53 9.09L14.53 9.56L14.63 9.66L14.53 10.5L14.06 11.06L13.69 11.16L13.59 11.25L13.13 11.25L12.66 11.06L12.38 10.78L12.09 10.13L12.09 9.66L11.91 9.09L12.09 8.44L12.47 7.97Z M9.94 8.44L10.31 8.44L10.97 8.72L11.16 8.91L11.44 9.56L11.44 10.97L11.34 11.25L10.97 11.72L10.5 11.91L9.94 11.91L9.47 11.72L9.09 11.25L9 10.59L8.91 10.5L8.91 9.47L9 9.19L9.47 8.63Z M19.03 12.19L19.41 12.28L19.78 12.56L20.72 14.81L20.72 15L20.91 15.28L20.91 15.47L21.09 15.75L21.66 17.44L21.66 18.38L21.38 19.31L21.09 19.88L20.44 20.63L19.5 21.19L18.66 21.47L18.19 21.47L18.09 21.56L17.06 21.56L16.97 21.47L16.5 21.47L15.84 21.28L14.63 20.63L13.97 19.97L13.5 19.22L13.13 18.28L12.84 18L12.19 18.19L11.81 18.19L10.97 18.47L10.59 18.47L10.31 18.75L9.75 19.88L9 20.63L8.06 21.09L7.13 21.38L5.63 21.38L3.94 20.81L2.72 19.69L2.34 18.94L2.34 18.75L2.06 18L2.06 17.25L2.25 16.78L2.44 16.59L2.91 16.41L3.84 16.41L4.31 16.59L4.59 17.16L4.59 18L5.25 18.75L5.91 18.94L6.84 18.94L6.94 18.84L7.22 18.84L7.78 18.38L8.53 16.88L9 16.41L9.84 16.13L10.22 16.13L10.31 16.03L10.69 16.03L11.16 15.84L11.53 15.84L12 15.66L13.59 15.38L14.25 15.66L14.81 16.31L15.75 18.19L16.22 18.75L16.5 18.94L17.25 19.03L17.34 19.13L18.38 19.03L19.03 18.47L19.13 18.28L19.13 17.53L17.44 13.31L17.72 12.75Z";

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
    titleRow: { display: "flex", alignItems: "center", gap: 8 },
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
  function reachSummary(state) {
    const reach = state?.reachability;
    if (!reach) return null;
    const values = Object.values(reach);
    const bad = values.filter((v) => v === "unavailable").length;
    const shaky = values.filter((v) => v === "unknown").length;
    if (bad === 0 && shaky === 0) return null;
    const parts = [];
    if (bad > 0) parts.push(bad + " 个不可用");
    if (shaky > 0) parts.push(shaky + " 个未确认");
    return parts.join("，");
  }
  var PANEL_TITLE = "Aimy-艾米";
  function capacityNote(state) {
    const base = "容量声明来源：站点 /v1/models 声明 → pi-ai 官方目录 → 兜底 1M 上下文 / 128K 输出；输出上限按压缩 headroom 夹过。";
    const models = state?.models ?? [];
    if (models.length === 0) return base;
    const count = (source) => models.filter((m) => m.capacitySource === source).length;
    const parts = [];
    const relay = count("relay");
    const official = count("official");
    const fallback = count("default");
    if (relay > 0) parts.push(relay + " 个来自站点");
    if (official > 0) parts.push(official + " 个来自官方目录");
    if (fallback > 0) parts.push(fallback + " 个走兜底");
    return parts.length === 0 ? base : base + "　本次目录：" + parts.join("，") + "。";
  }
  function makeSection(deps) {
    const { h, useState, useEffect, useCallback, request } = deps;
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
      const [diagnostics, setDiagnostics] = useState(null);
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
      useEffect(() => {
        let alive = true;
        void request("/diagnostics?profile=" + tab).then((res) => {
          if (alive && res && res.data) setDiagnostics(res.data);
        }).catch(() => {
        });
        return () => {
          alive = false;
        };
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
      const saveImageInput = useCallback(
        async (next) => {
          setBusy(true);
          setMessage(null);
          try {
            const res = await request("/config?profile=" + tab, {
              method: "POST",
              body: JSON.stringify({ imageInput: next })
            });
            if (res && res.success === false) {
              setMessage({ kind: "err", text: res.message || "保存失败" });
              return;
            }
            if (res && res.data) putState(tab, res.data);
            setMessage({ kind: "ok", text: next ? "已开启图片输入" : "已关闭图片输入" });
          } catch (error) {
            setMessage({ kind: "err", text: error instanceof Error ? error.message : String(error) });
          } finally {
            setBusy(false);
          }
        },
        [putState, request, tab]
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
        // 标题 + 品牌图标（与侧栏图标同一份 path）。
        h(
          "div",
          { key: "title", style: S.titleRow },
          h(
            "svg",
            {
              key: "icon",
              width: 22,
              height: 22,
              viewBox: "0 0 24 24",
              fill: "currentColor",
              style: { flex: "none", opacity: 0.9 },
              "aria-hidden": "true"
            },
            h("path", { d: BRAND_ICON_PATH, fillRule: "evenodd", clipRule: "evenodd" })
          ),
          h("span", { style: S.pageTitle }, PANEL_TITLE)
        ),
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
          h("span", { style: S.label }, "图片输入"),
          h("input", {
            type: "checkbox",
            checked: state ? state.imageInput !== false : true,
            disabled: busy,
            style: { width: 16, height: 16, cursor: busy ? "default" : "pointer" },
            title: "声明模型支持图片输入：关闭后模型只声明文本，贴图会被当场拒绝而不是等上游报错",
            onChange: (e) => void saveImageInput(Boolean(e.target.checked))
          }),
          h(
            "span",
            { style: S.hint },
            state && state.imageInput === false ? "已关闭（模型只声明文本）" : "已开启（文本 + 图片）· 上下文 1M / 输出 128K 为兜底值"
          )
        ),
        /*
         * 能力声明的来源必须写明：/v1/models 通常只返回 id，上下文与输出上限是
         * 按「站点声明 → 官方目录 → 兜底」三层推出来的，不是站点确认过的能力。
         * 用户据此判断会不会撞上下文墙、长回答会不会被截断——混淆代价很实。
         */
        h("div", { style: S.hint }, capacityNote(state)),
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
          h("span", { style: S.hint }, state ? "模型 " + state.models.length + " 个" : ""),
          reachSummary(state) ? h("span", { style: S.err, title: "「未确认」是网关故障或限流，不代表模型不存在" }, reachSummary(state)) : null
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
        diagnostics ? h(
          "div",
          { style: S.hint },
          "诊断：注册表 " + String(diagnostics.registryPresent) + " · 路由模型 " + String(diagnostics.registryModels ?? "—") + " · 密钥 " + String(diagnostics.credentialResolve ?? "—") + " · settings " + String(diagnostics.settingsChannel ?? "—") + " · providers " + JSON.stringify(diagnostics.providers ?? [])
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
        { style: S.page },
        ...header,
        statusCard,
        compatCard,
        keyCard,
        groupCard
      );
      return h("div", { style: S.panelRoot }, body);
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
          h("path", { d: BRAND_ICON_PATH, fillRule: "evenodd", clipRule: "evenodd" })
        );
      }
      function apply(ctx) {
        const deps = { h, useState, useEffect, useCallback, request };
        const Panel = makeSection(deps, { variant: "panel" });
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
