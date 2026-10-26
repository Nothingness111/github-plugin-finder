window.__ModuleLoader__.load({
  id: '@local/github-plugin-finder',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'github-plugin-finder';
    const HOST = '/github-plugin-finder';
    const CJK = /[\u3400-\u9fff]/;

    // ---------------------------------------------------------------- i18n
    const EN = {
      tab: 'Discover',
      intro: 'Searches GitHub (plus npm and a community catalog) for DeepSeek Harness / Cordis plugins, understands exact plugin names, translates descriptions online, and groups results by usage. Copy an install request and paste it in the chat.',
      'search.placeholder': 'Keywords, owner/repo, dsh-name, topic:dsh-plugin ...',
      'search.button': 'Search',
      'search.deep': 'Deep search',
      'search.busy': 'Searching…',
      'mode.label': 'Mode',
      'mode.auto': 'Auto',
      'mode.exact': 'Exact name',
      'mode.keyword': 'Keywords',
      'mode.browse': 'Browse all',
      'mode.hint.exact': 'Detected as an exact name: ',
      'mode.hint.browse': 'Enumerating the ecosystem in a budgeted sweep.',
      'token.toggle': 'Options',
      'token.label': 'GitHub token (optional, 3x quota + code search)',
      'token.placeholder': 'ghp_… or github_pat_… (kept in this browser)',
      'email.label': 'Contact e-mail for MyMemory (optional, higher quota)',
      'seed.label': 'Include community catalog names (Blue-Whale)',
      'status.idle': 'Search by name or keyword, or browse everything.',
      'status.done': 'Candidates:',
      'status.error': 'Search failed:',
      'status.engine.host': 'Local engine',
      'status.engine.direct': 'Browser direct',
      'status.engine.probing': 'Checking engine…',
      'status.engine.hint.host': 'Index + cached translation run inside DSH.',
      'status.engine.hint.direct': 'Host routes unavailable (restart DSH to enable the local engine).',
      'status.channels': 'channels',
      'status.items': 'items',
      'status.index': 'index',
      'status.rounds': 'round',
      'status.candidates': 'candidates',
      'status.more.deferred': 'channels left for the next round',
      'sort.label': 'Order:',
      'sort.relevance': 'Relevance',
      'sort.stars': 'Stars (most first)',
      'sort.updated': 'Recently updated',
      'status.translate': 'Translation routes:',
      'trans.route.llm': 'model',
      'trans.route.dsh': 'DSH service',
      'trans.route.bing': 'Bing',
      'trans.route.mymemory': 'MyMemory',
      'trans.route.google': 'Google',
      'status.quota': 'GitHub quota exhausted — add a token or retry later.',
      'status.deferred': 'deferred',
      'rate.label': 'Quota:',
      'rate.unknown': 'Quota: unknown',
      'exact.hit': 'Exact match',
      'exact.miss': 'No exact match for',
      'exact.note.not-found': 'No repository with that exact name. Similar names are listed below.',
      'exact.note.repo-404': 'That owner/repo does not exist (or is private).',
      'exact.note.exact-npm-only': 'Found on npm; no GitHub repository is declared.',
      'related.title': 'Similar results',
      'chip.all': 'All',
      'cat.ui': 'UI & Theme',
      'cat.mcp': 'MCP',
      'cat.automation': 'Automation',
      'cat.dev': 'Developer',
      'cat.ai': 'AI & Agents',
      'cat.tools': 'Tools',
      'cat.other': 'Other',
      'card.copy': 'Copy install request',
      'card.copied': 'Copied — paste it in the chat.',
      'card.stars': 'Stars',
      'card.updated': 'Updated',
      'card.noDesc': '(repository has no description)',
      'card.new': 'NEW',
      'card.untranslated': 'not translated',
      'card.seed': 'catalog only',
      'trans.toggle.on': 'Chinese',
      'trans.toggle.off': 'Original',
      'trans.loading': 'Translating',
      'trans.retry': 'Retry translation',
      'trans.failed': 'failed',
      'trans.by': 'translated by',
      'empty': 'No matches. Try a different word, or switch to Browse all.',
      'more': 'Show more',
      'clipboard.fallback': 'Clipboard unavailable — copy manually:',
      'footnote': 'Copy an install request, paste it in the chat, and I will audit and install the plugin.',
      'footnote.catalog': 'Coverage includes the community catalog Blue-Whale-Harness (Apache-2.0).',
      'hot.button': 'Hot this week',
      'hot.title': 'Hot this week (≥50 stars in 7 days)',
      'hot.loading': 'Loading hot list…',
      'hot.empty': 'No snapshot older than a week yet — search a few more times and come back.',
      'hot.delta': '7-day +',
      'hot.estimated': 'partial window',
      'risk.badge.high': 'Privacy risk',
      'risk.badge.warn': 'Check permissions',
      'risk.note': 'heuristic scan',
      'risk.unknown': 'scan unavailable',
    };
    const ZH = {
      tab: '发现',
      intro: '在 GitHub（含 npm 与社区目录）搜索 DeepSeek Harness / Cordis 插件：能识别精确插件名、联网翻译简介、按用途分类。选中后复制安装指令，粘贴到对话即可安装。',
      'search.placeholder': '关键词 / owner/repo / dsh-名称 / topic:dsh-plugin …',
      'search.button': '搜索',
      'search.deep': '深度搜索',
      'search.busy': '搜索中…',
      'mode.label': '模式',
      'mode.auto': '自动',
      'mode.exact': '精确名称',
      'mode.keyword': '关键词',
      'mode.browse': '全部浏览',
      'mode.hint.exact': '已识别为精确名称：',
      'mode.hint.browse': '按预算遍历生态目录。',
      'token.toggle': '选项',
      'token.label': 'GitHub 令牌（可选，配额 ×3 并解锁代码搜索）',
      'token.placeholder': 'ghp_… 或 github_pat_…（仅保存在本浏览器）',
      'email.label': 'MyMemory 联系邮箱（可选，提高翻译配额）',
      'seed.label': '并入社区目录（Blue-Whale）的名称',
      'status.idle': '输入名称或关键词开始搜索，或直接浏览全部。',
      'status.done': '候选插件：',
      'status.error': '搜索失败：',
      'status.engine.host': '本地引擎',
      'status.engine.direct': '浏览器直连',
      'status.engine.probing': '检测引擎…',
      'status.engine.hint.host': '索引与翻译缓存在 DSH 内运行。',
      'status.engine.hint.direct': '本地路由不可用（重启 DSH 后启用本地引擎）。',
      'status.channels': '通道',
      'status.items': '条',
      'status.index': '索引',
      'status.rounds': '轮次',
      'status.candidates': '候选',
      'status.more.deferred': '个通道留待下一轮',
      'sort.label': '排序：',
      'sort.relevance': '相关度',
      'sort.stars': '星标从多到少',
      'sort.updated': '最近更新',
      'status.translate': '翻译通道：',
      'trans.route.llm': '模型',
      'trans.route.dsh': 'DSH 服务',
      'trans.route.bing': 'Bing',
      'trans.route.mymemory': 'MyMemory',
      'trans.route.google': 'Google',
      'status.quota': 'GitHub 配额用尽，可填令牌或稍后重试。',
      'status.deferred': '顺延',
      'rate.label': '配额：',
      'rate.unknown': '配额：未知',
      'exact.hit': '精确命中',
      'exact.miss': '未找到精确名称',
      'exact.note.not-found': '没有同名仓库，下面列出相近结果。',
      'exact.note.repo-404': '该 owner/repo 不存在（或为私有仓库）。',
      'exact.note.exact-npm-only': '在 npm 找到，但未声明 GitHub 仓库。',
      'related.title': '相近结果',
      'chip.all': '全部',
      'cat.ui': '界面与主题',
      'cat.mcp': 'MCP 集成',
      'cat.automation': '自动化与提醒',
      'cat.dev': '开发与调试',
      'cat.ai': 'AI 与智能体',
      'cat.tools': '实用工具',
      'cat.other': '其他',
      'card.copy': '复制安装指令',
      'card.copied': '已复制，粘贴到对话即可。',
      'card.stars': '星标',
      'card.updated': '更新',
      'card.noDesc': '（该仓库未填写简介）',
      'card.new': '新',
      'card.untranslated': '未翻译',
      'card.seed': '仅目录收录',
      'trans.toggle.on': '中文',
      'trans.toggle.off': '原文',
      'trans.loading': '翻译中',
      'trans.retry': '重试翻译',
      'trans.failed': '失败',
      'trans.by': '翻译来源',
      'empty': '没有匹配结果，换个关键词或切到「全部浏览」。',
      'more': '显示更多',
      'clipboard.fallback': '剪贴板不可用，请手动复制：',
      'footnote': '复制安装指令后回到对话粘贴发送，我会先审计再安装。',
      'footnote.catalog': '覆盖范围包含社区目录 Blue-Whale-Harness（Apache-2.0）。',
      'hot.button': '本周热门',
      'hot.title': '本周热门（7 天内星标 ≥ 50）',
      'hot.loading': '正在加载本周热门…',
      'hot.empty': '索引还没有满 7 天的快照：再多搜几次，一周后再看。',
      'hot.delta': '本周 +',
      'hot.estimated': '窗口不足',
      'risk.badge.high': '隐私风险',
      'risk.badge.warn': '需留意权限',
      'risk.note': '启发式扫描',
      'risk.unknown': '无法扫描',
    };

    // ------------------------------------------------- client-side parsing
    // The host does the authoritative parse; this mirror only drives the
    // "detected as exact name" hint and the direct-mode fallback.
    const SLUG = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
    function detectExact(text) {
      const raw = String(text || '').trim();
      if (!raw || /\s/.test(raw)) return null;
      const unq = raw.replace(/^[`"']|[`"']$/g, '');
      if (SLUG.test(unq)) return { kind: 'repo', value: unq, name: unq.split('/')[1] };
      if (/^@[a-z0-9][\w.-]*\/[a-z0-9][\w.-]*$/i.test(unq)) return { kind: 'npm', value: unq, name: unq };
      if (/^(?:dsh|cordis|harness)[-_]|[-_](?:plugin|widget|extension|skill|tool|mcp|theme|panel|toolkit)$/i.test(unq)) {
        return { kind: 'npm', value: unq, name: unq };
      }
      if (/^[a-z0-9]+(?:-[a-z0-9]+){2,}$/.test(unq)) return { kind: 'npm', value: unq, name: unq };
      return null;
    }

    const FALLBACK_CATS = [
      ['ui', /\b(ui|ux|theme|sidebar|panel|widget|icon|layout|css|emoji|avatar)\b|界面|主题|图标|表情/i],
      ['mcp', /\bmcp\b/i],
      ['automation', /\b(automat\w*|cron|schedul\w*|remind\w*|notif\w*|workflow|hook)\b|自动|定时|提醒/i],
      ['dev', /\b(debug\w*|test\w*|lint|git|terminal|shell|cli|sdk|typescript|editor)\b|开发|调试|终端/i],
      ['ai', /\b(ai|llm|model|agent|prompt|memory|chat|reasoning|context|embedding|rag)\b|模型|智能|记忆/i],
      ['tools', /\b(tool\w*|util\w*|helper|search|translat\w*|file|image|web|calendar|note|clipboard|download|export|audit)\b|工具|翻译|笔记/i],
    ];
    function classifyClient(card) {
      const text = `${card.full_name} ${card.desc || ''} ${(card.topics || []).join(' ')}`.toLowerCase();
      for (const [key, re] of FALLBACK_CATS) if (re.test(text)) return key;
      return 'other';
    }

    function scoreClient(card, terms, exactName) {
      let score = 0;
      const name = String(card.full_name || '').split('/')[1].toLowerCase();
      const desc = String(card.desc || '').toLowerCase();
      if (exactName && name === exactName.toLowerCase()) score += 1000;
      for (const term of terms) {
        const t = term.toLowerCase();
        if (name === t) score += 400;
        else if (name.includes(t)) score += 150;
        if (desc.includes(t)) score += 40;
      }
      score += Math.log10(1 + (Number(card.stars) || 0)) * 10;
      return score;
    }

    function locLabel(label) {
      if (!label) return '';
      if (typeof label === 'string') return label;
      let zh = true;
      try {
        const snap = window.__ctxLocale && window.__ctxLocale.getLocale ? window.__ctxLocale.getLocale() : null;
        const id = (snap && (snap.id || snap.locale)) || '';
        zh = String(id).toLowerCase().indexOf('zh') === 0;
      } catch (e) { zh = true; }
      return (zh ? (label.zh || label.en) : (label.en || label.zh)) || '';
    }

    // ------------------------------------------------------------ ordering
    /** Re-order already loaded cards without another network round. */
    function reorderItems(items, key) {
      const list = (items || []).slice();
      if (key === 'stars') {
        list.sort(function (a, b) { return (Number(b.stars) || 0) - (Number(a.stars) || 0) || (Number(b.score) || 0) - (Number(a.score) || 0); });
      } else if (key === 'updated') {
        list.sort(function (a, b) { return Date.parse(b.updated || 0) - Date.parse(a.updated || 0) || (Number(b.score) || 0) - (Number(a.score) || 0); });
      } else {
        list.sort(function (a, b) { return (Number(b.score) || 0) - (Number(a.score) || 0) || (Number(b.stars) || 0) - (Number(a.stars) || 0); });
      }
      return list;
    }

    // ------------------------------------------------------- network helper
    function timeoutSignal(ms) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);
      return { signal: controller.signal, clear: () => clearTimeout(timer) };
    }

    async function fetchJson(url, options, timeoutMs) {
      const t = timeoutSignal(timeoutMs || 15000);
      try {
        const res = await fetch(url, Object.assign({}, options, { signal: t.signal }));
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) {
          const err = new Error((data && data.error) || ('HTTP ' + res.status));
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return { data: data, status: res.status };
      } finally {
        t.clear();
      }
    }

    async function hostCall(path, body, timeoutMs) {
      return fetchJson(HOST + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      }, timeoutMs || 45000);
    }

    async function probeHost() {
      try {
        const { data } = await fetchJson(HOST + '/health', { cache: 'no-store' }, 2500);
        if (!data || !data.host) return null;
        return {
          order: Array.isArray(data.translateOrder) ? data.translateOrder : [],
          health: data.translate || {},
        };
      } catch (e) {
        return null;
      }
    }

    // ------------------------------------------------- direct-mode fallback
    const DIRECT_QUERIES = function (keyword) {
      if (keyword) {
        return [
          keyword + ' plugin dsh in:name,description',
          keyword + ' in:name',
          keyword + ' dsh in:name,description,readme',
          'topic:dsh-plugin ' + keyword,
        ];
      }
      return [
        'topic:dsh-plugin',
        'topic:deepseek-harness',
        'topic:cordis-plugin',
        'dsh- in:name',
        'dsh plugin in:name,description',
        '"deepseek harness" plugin in:name,description,readme',
        'cordis plugin in:name,description,readme',
        'topic:dsh',
        'cordis-plugin in:name',
      ];
    };

    // A round may not be able to pay for every planned channel. Paid pages are
    // cached on the host, so the next round re-walks the plan for free and
    // spends its budget on the channels that were deferred.
    const MAX_ROUNDS = 3;

    function mergePayload(prev, next) {
      if (!prev) return next;
      if (!next) return prev;
      const byName = new Map();
      for (const card of (next.items || []).concat(prev.items || [])) {
        if (!card || !card.full_name) continue;
        if (!byName.has(card.full_name)) byName.set(card.full_name, card);
      }
      const channelMap = new Map();
      const prevMeta = prev.meta || {};
      const nextMeta = next.meta || {};
      for (const channel of (prevMeta.channels || []).concat(nextMeta.channels || [])) {
        if (!channel || !channel.id) continue;
        channelMap.set(channel.id, channel);
      }
      const meta = Object.assign({}, prevMeta, nextMeta);
      meta.channels = Array.from(channelMap.values());
      meta.warnings = Array.from(new Set((prevMeta.warnings || []).concat(nextMeta.warnings || [])));
      return Object.assign({}, prev, next, {
        items: Array.from(byName.values()),
        exact: next.exact || prev.exact || null,
        meta: meta,
      });
    }

    function ghHeaders(token) {
      const headers = { Accept: 'application/vnd.github+json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      return headers;
    }

    function toCard(item, source) {
      if (!item || !item.full_name) return null;
      return {
        full_name: item.full_name,
        url: item.html_url || ('https://github.com/' + item.full_name),
        desc: item.description || '',
        stars: item.stargazers_count || 0,
        updated: item.pushed_at || item.updated_at || null,
        created: item.created_at || null,
        topics: Array.isArray(item.topics) ? item.topics.slice(0, 10) : [],
        language: item.language || '',
        archived: Boolean(item.archived),
        sources: [source],
        score: 0,
      };
    }

    async function directSearch(query, mode, depth, token, seed, sortMode) {
      const exact = (mode === 'exact' || (mode === 'auto' && detectExact(query))) ? detectExact(query) : null;
      const started = Date.now();
      const channels = [];
      const warnings = [];
      let rate = null;
      const cards = [];
      let exactCard = null;
      let exactNote = '';

      async function ghSearch(q, perPage) {
        const url = 'https://api.github.com/search/repositories?q=' + encodeURIComponent(q)
          + '&per_page=' + (perPage || 100) + '&sort=stars&order=desc';
        const { data } = await fetchJson(url, { headers: ghHeaders(token) }, 15000);
        return data;
      }

      if (exact) {
        try {
          if (exact.kind === 'repo') {
            const [owner, name] = exact.value.split('/');
            const { data } = await fetchJson('https://api.github.com/repos/' + owner + '/' + name, { headers: ghHeaders(token) }, 15000);
            exactCard = toCard(data, 'exact');
            exactNote = 'exact-hit';
          } else {
            const data = await ghSearch(exact.name + ' in:name', 30);
            const hit = (data.items || []).find(function (item) {
              return String(item.name || '').toLowerCase() === exact.name.toLowerCase();
            });
            if (hit) { exactCard = toCard(hit, 'exact'); exactNote = 'exact-hit'; }
            else exactNote = 'not-found';
          }
        } catch (e) {
          exactNote = e.status === 404 ? 'repo-404' : ('lookup-failed:' + (e.message || ''));
        }
        try {
          const data = await ghSearch((exact.name || exact.value) + ' in:name,description', 30);
          channels.push({ id: 'related', label: '相关结果', count: (data.items || []).length });
          for (const item of data.items || []) {
            const card = toCard(item, 'related');
            if (card && (!exactCard || card.full_name.toLowerCase() !== exactCard.full_name.toLowerCase())) cards.push(card);
          }
        } catch (e) { warnings.push('相关结果: ' + (e.message || e)); }
      } else {
        const keyword = mode === 'browse' ? '' : String(query || '').trim();
        const queries = DIRECT_QUERIES(keyword);
        const results = await Promise.allSettled(queries.map(function (q) { return ghSearch(q, 100); }));
        results.forEach(function (result, index) {
          if (result.status === 'fulfilled') {
            const items = (result.value && result.value.items) || [];
            channels.push({ id: queries[index], label: queries[index], count: items.length });
            for (const item of items) {
              const card = toCard(item, queries[index]);
              if (card) cards.push(card);
            }
          } else {
            const message = String((result.reason && result.reason.message) || result.reason);
            channels.push({ id: queries[index], label: queries[index], count: 0, error: message });
            warnings.push(queries[index] + ': ' + message);
          }
        });
      }

      const byKey = new Map();
      for (const card of cards) {
        const key = card.full_name.toLowerCase();
        if (!byKey.has(key)) byKey.set(key, card);
      }
      const terms = String(query || '').trim().split(/\s+/).filter(Boolean);
      const list = Array.from(byKey.values()).map(function (card) {
        return Object.assign({}, card, {
          score: scoreClient(card, terms, exact && exact.name),
          category: classifyClient(card),
        });
      });
      if (sortMode === 'stars') {
        list.sort(function (a, b) { return (b.stars || 0) - (a.stars || 0) || b.score - a.score; });
      } else if (sortMode === 'updated') {
        list.sort(function (a, b) { return Date.parse(b.updated || 0) - Date.parse(a.updated || 0) || b.score - a.score; });
      } else {
        list.sort(function (a, b) { return b.score - a.score; });
      }

      return {
        ok: true,
        mode: exact ? 'exact' : (mode === 'browse' || !terms.length ? 'browse' : 'keyword'),
        intent: { raw: query, mode: exact ? 'exact' : (mode === 'browse' ? 'browse' : 'keyword'), exact: exact, terms: terms },
        exact: exactCard ? Object.assign({}, exactCard, { category: classifyClient(exactCard) }) : null,
        exactNote: exactNote,
        items: list.slice(0, 200),
        meta: {
          channels: channels,
          deferred: [],
          stopped: '',
          warnings: warnings,
          elapsedMs: Date.now() - started,
          depth: depth,
          sort: sortMode || 'relevance',
          rate: rate,
          engine: 'direct',
          index: null,
          catalog: seed ? { count: 0, source: 'browser' } : null,
        },
      };
    }

    // ---------------------------------------------- direct-mode translation
    const TR_KEY = 'ghpf.tr.v2';
    function readTrCache() {
      try { return JSON.parse(localStorage.getItem(TR_KEY) || '{}'); } catch (e) { return {}; }
    }
    function writeTrCache(cache) {
      try {
        const keys = Object.keys(cache);
        if (keys.length > 400) {
          for (const key of keys.slice(0, keys.length - 400)) delete cache[key];
        }
        localStorage.setItem(TR_KEY, JSON.stringify(cache));
      } catch (e) { /* quota */ }
    }

    async function directTranslate(text, email) {
      const cache = readTrCache();
      const key = text.slice(0, 200);
      if (cache[key]) return { zh: cache[key], provider: 'cache' };
      const params = new URLSearchParams({ q: text.slice(0, 460), langpair: 'en|zh-CN' });
      if (email) params.set('de', email);
      const { data } = await fetchJson('https://api.mymemory.translated.net/get?' + params.toString(), {}, 9000);
      const zh = data && data.responseData && data.responseData.translatedText;
      if (!zh || CJK.test(zh) === false) throw new Error('untranslated');
      cache[key] = zh;
      writeTrCache(cache);
      return { zh: zh, provider: 'mymemory' };
    }

    // -------------------------------------------------------------- styles
    const CSS = `
.ghpf-root{display:flex;flex-direction:column;gap:10px;padding:16px;height:100%;box-sizing:border-box;overflow:auto;color:var(--dsw-alias-label-primary);font-size:13px;}
.ghpf-root *{box-sizing:border-box;}
.ghpf-intro{color:var(--dsw-alias-label-secondary);line-height:1.6;margin:0;}
.ghpf-searchrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.ghpf-input{flex:1 1 260px;min-width:0;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);}
.ghpf-input:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px;}
.ghpf-btn{padding:7px 13px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:13px;}
.ghpf-btn:hover{border-color:var(--dsw-alias-brand-primary);}
.ghpf-btn:disabled{opacity:0.5;cursor:default;}
.ghpf-btn-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);}
.ghpf-modes{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
.ghpf-chip{padding:4px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;}
.ghpf-chip[aria-pressed="true"]{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);}
.ghpf-hint{font-size:12px;color:var(--dsw-alias-label-secondary);}
.ghpf-hint b{color:var(--dsw-alias-brand-primary);}
.ghpf-status{color:var(--dsw-alias-label-secondary);display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;font-size:12px;}
.ghpf-status .ghpf-error{color:var(--dsw-alias-state-error-primary);word-break:break-word;}
.ghpf-badge{font-size:11px;padding:1px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);}
.ghpf-badge.ok{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary);}
.ghpf-badge.warn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary);}
.ghpf-cat{font-size:14px;font-weight:600;border-bottom:1px solid var(--dsw-alias-border-l1);padding-bottom:4px;margin:10px 0 0;}
.ghpf-exact{border:1px solid var(--dsw-alias-state-success-primary);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;background:var(--dsw-alias-bg-layer-1);}
.ghpf-exact-title{font-weight:600;color:var(--dsw-alias-state-success-primary);font-size:12px;}
.ghpf-miss{border:1px dashed var(--dsw-alias-state-warn-primary);border-radius:10px;padding:10px 12px;color:var(--dsw-alias-label-secondary);}
.ghpf-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:10px 12px;display:flex;flex-direction:column;gap:6px;}
.ghpf-title{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;}
.ghpf-title a{color:var(--dsw-alias-brand-primary);font-weight:600;text-decoration:none;word-break:break-all;}
.ghpf-title a:hover{text-decoration:underline;}
.ghpf-meta{display:flex;gap:12px;flex-wrap:wrap;color:var(--dsw-alias-label-secondary);font-size:12px;}
.ghpf-desc{margin:0;line-height:1.5;word-break:break-word;}
.ghpf-desc.orig{color:var(--dsw-alias-label-secondary);font-size:12px;}
.ghpf-nodesc{color:var(--dsw-alias-label-secondary);font-style:italic;}
.ghpf-topics{display:flex;gap:6px;flex-wrap:wrap;}
.ghpf-topic{font-size:11px;padding:1px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);}
.ghpf-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.ghpf-ok{color:var(--dsw-alias-state-success-primary);font-size:12px;}
.ghpf-fallback{width:100%;min-height:52px;border:1px dashed var(--dsw-alias-state-warn-primary);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.ghpf-options{border:1px dashed var(--dsw-alias-border-l1);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;color:var(--dsw-alias-label-secondary);}
.ghpf-options label{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.ghpf-options input[type="text"],.ghpf-options input[type="password"],.ghpf-options input[type="email"]{flex:1 1 220px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);}
.ghpf-new{font-size:11px;font-weight:600;padding:1px 8px;border-radius:999px;background:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-bg-base);}
.ghpf-progress{color:var(--dsw-alias-state-warn-primary);}
.ghpf-foot{color:var(--dsw-alias-label-secondary);line-height:1.6;font-size:12px;}
.ghpf-list{display:flex;flex-direction:column;gap:8px;margin-top:8px;}
.ghpf-risk{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-secondary);border-left:3px solid var(--dsw-alias-state-warn-primary);padding-left:8px;}
.ghpf-risk.high{border-left-color:var(--dsw-alias-state-error-primary);}
.ghpf-risk-badge{font-size:11px;font-weight:600;padding:1px 8px;border-radius:999px;border:1px solid var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary);}
.ghpf-risk.high .ghpf-risk-badge{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);}
.ghpf-risk-note{font-size:11px;opacity:.75;}
.ghpf-growth{color:var(--dsw-alias-state-success-primary);font-weight:600;}
.ghpf-hot-empty{color:var(--dsw-alias-label-secondary);}
`;

    // ------------------------------------------------------------ panel UI
    function FinderPanel() {
      const [query, setQuery] = React.useState('');
      const [mode, setMode] = React.useState('auto');
      const [token, setToken] = React.useState(function () {
        try { return localStorage.getItem('ghpf.token') || ''; } catch (e) { return ''; }
      });
      const [email, setEmail] = React.useState(function () {
        try { return localStorage.getItem('ghpf.email') || ''; } catch (e) { return ''; }
      });
      const [seed, setSeed] = React.useState(true);
      const [showOptions, setShowOptions] = React.useState(false);
      const [data, setData] = React.useState(null);
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState('');
      const [cat, setCat] = React.useState('all');
      const [copied, setCopied] = React.useState('');
      const [zhOn, setZhOn] = React.useState(function () {
        try { return localStorage.getItem('ghpf.zh') !== '0'; } catch (e) { return true; }
      });
      const [translations, setTranslations] = React.useState({});
      const [transProgress, setTransProgress] = React.useState(null);
      const [engine, setEngine] = React.useState('probing');
      const [sort, setSort] = React.useState(function () {
        try { return localStorage.getItem('ghpf.sort') || 'relevance'; } catch (e) { return 'relevance'; }
      });
      const [visible, setVisible] = React.useState(150);
      const [rounds, setRounds] = React.useState(0);
      const [translateRoutes, setTranslateRoutes] = React.useState([]);
      const [hot, setHot] = React.useState(null);
      const [hotLoading, setHotLoading] = React.useState(false);
      const [risks, setRisks] = React.useState({});
      const scansRef = React.useRef(new Set());
      const scanBlockedRef = React.useRef(false);
      const translatedRef = React.useRef(new Set());
      const seq = React.useRef(0);

      React.useEffect(function () {
        let alive = true;
        probeHost().then(function (info) {
          if (!alive) return;
          setEngine(info ? 'host' : 'direct');
          if (info) setTranslateRoutes(info.order || []);
        });
        return function () { alive = false; };
      }, []);

      function savePref(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
      }

      function toggleZh() {
        const next = !zhOn;
        setZhOn(next);
        savePref('ghpf.zh', next ? '1' : '0');
        if (next && data) void translateAll(data, seq.current, false);
      }

      /** Switch the order locally; the next search asks the host for the same one. */
      function chooseSort(key) {
        if (key === sort) return;
        setSort(key);
        savePref('ghpf.sort', key);
        if (data) {
          setData(Object.assign({}, data, {
            items: reorderItems(data.items, key),
            meta: Object.assign({}, data.meta || {}, { sort: key }),
          }));
        }
      }

      const detect = mode === 'auto' || mode === 'exact' ? detectExact(query) : null;

      function mergeTranslations(entries) {
        if (!entries) return 0;
        let count = 0;
        setTranslations(function (prev) {
          const next = Object.assign({}, prev);
          for (const [source, value] of Object.entries(entries)) {
            if (value && value.zh) { next[source] = value; count += 1; }
          }
          return next;
        });
        return count;
      }

      async function translateAll(payload, forSeq, force) {
        const cards = [payload.exact].concat(payload.items || []).filter(Boolean);
        const texts = [];
        for (const card of cards) {
          if (!card.desc || CJK.test(card.desc)) continue;
          // Progressive rounds call this repeatedly; a description that is
          // already translated or queued must not be asked for twice.
          if (!force && translatedRef.current.has(card.desc)) continue;
          if (!texts.includes(card.desc)) texts.push(card.desc);
        }
        if (!texts.length) return;
        setTransProgress({ done: 0, total: texts.length, failed: 0 });
        if (engine === 'host') {
          const chunk = 80;
          let done = 0;
          let failed = 0;
          for (let index = 0; index < texts.length; index += chunk) {
            if (seq.current !== forSeq) return;
            const slice = texts.slice(index, index + chunk);
            let result = null;
            try {
              const { data: body } = await hostCall('/translate', { texts: slice, force: Boolean(force), email: email, deadlineMs: 45000 }, 90000);
              result = body;
            } catch (e) {
              failed += slice.length;
              result = null;
            }
            if (seq.current !== forSeq) return;
            if (result && result.entries) {
              mergeTranslations(result.entries);
              for (const [source, value] of Object.entries(result.entries)) {
                if (value && value.zh) translatedRef.current.add(source);
              }
            }
            done += slice.length;
            if (result && result.stillMissing) failed += (result.stillMissing || []).length;
            setTransProgress({ done: done, total: texts.length, failed: failed });
            if (!result || !result.ok) break;
          }
          return;
        }
        // direct mode: MyMemory, three at a time, with a failure breaker.
        let done = 0;
        let failed = 0;
        let consecutive = 0;
        const queue = texts.slice();
        async function worker() {
          while (queue.length) {
            if (seq.current !== forSeq || consecutive >= 4) return;
            const text = queue.shift();
            try {
              const out = await directTranslate(text, email);
              if (seq.current !== forSeq) return;
              const entries = {};
              entries[text] = out;
              mergeTranslations(entries);
              translatedRef.current.add(text);
              consecutive = 0;
            } catch (e) {
              consecutive += 1;
              failed += 1;
            }
            done += 1;
            if (seq.current !== forSeq) return;
            setTransProgress({ done: done, total: texts.length, failed: failed });
          }
        }
        await Promise.all([worker(), worker(), worker()]);
      }

      /** Weekly hot list: growth comes from the host index's own snapshots. */
      async function loadHot() {
        if (hotLoading) return;
        if (engine !== 'host') {
          setHot({ ok: false, error: t('status.engine.hint.direct') });
          return;
        }
        setHotLoading(true);
        try {
          const { data: body } = await hostCall('/hot', { minGrowth: 50, windowDays: 7, limit: 100 }, 45000);
          setHot(body);
          if (body && body.ok && body.items) void scanRepos(body.items);
        } catch (e) {
          setHot({ ok: false, error: String((e && e.message) || e) });
        } finally {
          setHotLoading(false);
        }
      }

      /** Ask the host to scan the privacy-relevant capabilities of visible cards. */
      async function scanRepos(cards) {
        if (engine !== 'host' || scanBlockedRef.current) return;
        const need = [];
        for (const card of cards || []) {
          const name = card && card.full_name;
          if (!name || String(name).indexOf('npm:') === 0 || risks[name] || scansRef.current.has(name)) continue;
          scansRef.current.add(name);
          need.push({ name: name, hint: card.desc || '' });
          if (need.length >= 12) break;
        }
        if (!need.length) return;
        try {
          const { data: body } = await hostCall('/scan', { repos: need }, 60000);
          if (body && body.results) setRisks(function (prev) { return Object.assign({}, prev, body.results); });
          if (body && body.aborted) scanBlockedRef.current = true;
        } catch (e) {
          // Scanning is a nicety: a failure must never disturb the result list.
        } finally {
          for (const entry of need) scansRef.current.delete(entry.name);
        }
      }

      async function runSearch(depth) {
        const mySeq = ++seq.current;
        const trimmed = query.trim();
        if (mode === 'exact' && !trimmed) {
          setError('请输入要精确查找的插件名（例如 dsh-lean 或 owner/repo）。');
          return;
        }
        setLoading(true);
        setError('');
        setCopied('');
        setTranslations({});
        translatedRef.current = new Set();
        setTransProgress(null);
        setVisible(150);
        setCat('all');
        setRounds(0);
        setData(null);
        const startedAt = Date.now();
        let engineNow = engine;

        async function fetchRound(roundDepth) {
          if (engineNow === 'host') {
            try {
              const { data: body } = await hostCall('/search', {
                query: trimmed,
                mode: mode,
                depth: roundDepth,
                token: token,
                seed: seed,
                sort: sort,
              }, 120000);
              if (!body || body.ok === false) throw new Error((body && body.error) || 'host search failed');
              return body;
            } catch (hostError) {
              // Routes missing (older install) or host crashed: degrade to the
              // browser path instead of showing an empty panel.
              if (hostError && (hostError.status === 404 || hostError.status === 405)) {
                engineNow = 'direct';
                setEngine('direct');
              } else {
                throw hostError;
              }
            }
          }
          return directSearch(trimmed, mode, roundDepth, token, seed, sort);
        }

        try {
          let payload = null;
          let previousTotal = -1;
          // With a token, a later round also pays for page 2/3 of the channels
          // that were already retrieved, which roughly triples coverage.
          const deepest = token ? 3 : 2;
          for (let round = 1; round <= MAX_ROUNDS; round += 1) {
            const roundDepth = Math.min(deepest, (depth || 1) + round - 1);
            const body = await fetchRound(roundDepth);
            if (seq.current !== mySeq) return;
            payload = round === 1 ? body : mergePayload(payload, body);
            setRounds(round);
            setData(payload);
            void scanRepos([payload.exact].concat(payload.items || []).filter(Boolean));
            // Translate what we have right away: the user reads Chinese from the
            // first round while the following rounds keep filling the list. The
            // ref above keeps this from re-asking for descriptions already sent.
            if (zhOn) void translateAll(payload, mySeq, false);
            const meta = body.meta || {};
            const deferred = (meta.deferred || []).length;
            const candidates = Number(meta.totalCandidates) || 0;
            // 'budget' is the signal to come back for the tail; 'rate' means the
            // quota itself is gone, so another round would only spin.
            const rateStopped = Boolean(meta.stopped) && meta.stopped !== 'budget';
            // Another round is worth it only when the host still has channels it
            // could not afford and this round actually found something new.
            if (!deferred || rateStopped || candidates <= previousTotal) break;
            if (Date.now() - startedAt > 90000) break;
            previousTotal = candidates;
          }
          if (seq.current !== mySeq) return;
          setLoading(false);
        } catch (e) {
          if (seq.current !== mySeq) return;
          setError(String((e && e.message) || e));
          setLoading(false);
        }
      }

      function installLine(card) {
        if (String(card.full_name).indexOf('npm:') === 0) {
          return '请帮我安装 DeepSeek Harness 插件（npm）：' + String(card.full_name).slice(4) + '（' + (card.url || '') + '）';
        }
        return '请帮我从 GitHub 安装 DeepSeek Harness 插件：' + card.full_name;
      }

      async function copyInstall(card) {
        const line = installLine(card);
        try {
          await navigator.clipboard.writeText(line);
          setCopied(card.full_name);
        } catch (e) {
          setCopied('!fallback!' + card.full_name);
        }
      }

      function cardNode(card, options) {
        const opts = options || {};
        const translated = translations[card.desc];
        const showZh = zhOn && translated && translated.zh;
        const fallback = copied === '!fallback!' + card.full_name;
        const sourceBadge = card.seedOnly ? h('span', { className: 'ghpf-badge' }, t('card.seed')) : null;
        const risk = risks[card.full_name];
        const riskNode = risk && (risk.level === 'high' || risk.level === 'warn')
          ? h('div', { className: 'ghpf-risk ' + (risk.level === 'high' ? 'high' : 'warn') },
              h('span', { className: 'ghpf-risk-badge' }, risk.level === 'high' ? t('risk.badge.high') : t('risk.badge.warn')),
              h('span', { className: 'ghpf-risk-detail' }, (risk.findings || []).slice(0, 3).map(function (finding) {
                return locLabel(finding.label);
              }).join('、')),
              h('span', { className: 'ghpf-risk-note' }, t('risk.note')))
          : null;
        return h('article', { key: card.full_name, className: 'ghpf-card' },
          h('div', { className: 'ghpf-title' },
            h('a', { href: card.url || ('https://github.com/' + card.full_name), target: '_blank', rel: 'noreferrer' }, card.full_name),
            opts.exact ? h('span', { className: 'ghpf-badge ok' }, t('exact.hit')) : null,
            card.newlyCreated ? h('span', { className: 'ghpf-new' }, t('card.new')) : null,
            card.language ? h('span', { className: 'ghpf-topic' }, card.language) : null,
            sourceBadge),
          card.desc
            ? h('p', { className: 'ghpf-desc' }, showZh ? translated.zh : card.desc,
              showZh && zhOn ? h('span', { className: 'ghpf-desc orig' }, ' — ' + card.desc) : null,
              zhOn && !translated && !CJK.test(card.desc)
                ? h('span', { className: 'ghpf-badge warn', style: { marginLeft: '6px' } }, t('card.untranslated'))
                : null)
            : h('p', { className: 'ghpf-desc ghpf-nodesc' }, t('card.noDesc')),
          riskNode,
          h('div', { className: 'ghpf-meta' },
            h('span', null, t('card.stars') + ' ' + String(card.stars || 0)),
            card.growth && card.growth.delta > 0
              ? h('span', { className: 'ghpf-growth' }, t('hot.delta') + String(card.growth.delta) + (card.growth.estimated ? ' (' + t('hot.estimated') + ')' : ''))
              : null,
            h('span', null, t('card.updated') + ' ' + (card.updated ? String(new Date(card.updated).toLocaleDateString()) : '-')),
            showZh && translated.provider ? h('span', null, t('trans.by') + ' ' + translated.provider) : null),
          (card.topics && card.topics.length)
            ? h('div', { className: 'ghpf-topics' }, card.topics.slice(0, 8).map(function (topic) {
              return h('span', { key: topic, className: 'ghpf-topic' }, topic);
            }))
            : null,
          h('div', { className: 'ghpf-actions' },
            h('button', {
              type: 'button', className: 'ghpf-btn', disabled: loading,
              onClick: function () { copyInstall(card); },
            }, copied === card.full_name ? t('card.copied') : t('card.copy')),
            copied === card.full_name ? h('span', { className: 'ghpf-ok' }, t('card.copied')) : null),
          fallback ? h('div', { className: 'ghpf-actions' },
            h('span', null, t('clipboard.fallback')),
            h('textarea', { className: 'ghpf-fallback', readOnly: true, value: installLine(card) })) : null
        );
      }

      const CAT_KEYS = ['ui', 'mcp', 'automation', 'dev', 'ai', 'tools', 'other'];
      const items = data ? (data.items || []) : [];
      const counts = {};
      for (const key of CAT_KEYS) counts[key] = 0;
      for (const card of items) counts[card.category || classifyClient(card)] += 1;
      const filtered = items.filter(function (card) {
        return cat === 'all' || (card.category || classifyClient(card)) === cat;
      });
      const shown = filtered.slice(0, visible);

      const groups = [];
      if (sort !== 'relevance' && shown.length) {
        // A ranking the user asked for (stars / recently updated) must stay a
        // single ordered list; category headers would hide the order.
        groups.push(h('section', { key: 'ranked' },
          h('h3', { className: 'ghpf-cat' }, t('sort.' + sort) + ' (' + String(shown.length) + ')'),
          h('div', { className: 'ghpf-list' }, shown.map(function (card) { return cardNode(card, {}); }))));
      } else {
        for (const key of CAT_KEYS) {
          const list = shown.filter(function (card) { return (card.category || classifyClient(card)) === key; });
          if (!list.length) continue;
          groups.push(h('section', { key: 'cat-' + key },
            h('h3', { className: 'ghpf-cat' }, t('cat.' + key) + ' (' + String(list.length) + ')'),
            h('div', { className: 'ghpf-list' }, list.map(function (card) { return cardNode(card, {}); }))));
        }
      }

      const meta = data && data.meta ? data.meta : null;
      const channelTotal = meta && meta.channels ? meta.channels.reduce(function (sum, channel) { return sum + (channel.count || 0); }, 0) : 0;
      const rateText = meta && meta.rate && meta.rate.remaining !== null && meta.rate.remaining !== undefined
        ? t('rate.label') + ' ' + meta.rate.remaining + ' / ' + (meta.rate.limit || '?')
        : null;
      const engineLabel = engine === 'host' ? t('status.engine.host') : (engine === 'direct' ? t('status.engine.direct') : t('status.engine.probing'));
      const engineHint = engine === 'host' ? t('status.engine.hint.host') : (engine === 'direct' ? t('status.engine.hint.direct') : '');

      return h('div', { className: 'ghpf-root' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('p', { className: 'ghpf-intro' }, t('intro')),
        h('form', {
          className: 'ghpf-searchrow',
          onSubmit: function (e) { e.preventDefault(); if (!loading) runSearch(1); },
        },
          h('input', {
            className: 'ghpf-input', type: 'search', value: query,
            placeholder: t('search.placeholder'),
            onChange: function (e) { setQuery(e.target.value); },
          }),
          h('button', { type: 'submit', className: 'ghpf-btn ghpf-btn-primary', disabled: loading },
            loading ? t('search.busy') : t('search.button')),
          h('button', {
            type: 'button', className: 'ghpf-btn', disabled: loading,
            onClick: function () { runSearch(2); },
          }, t('search.deep')),
          h('button', {
            type: 'button', className: 'ghpf-btn', 'aria-pressed': String(showOptions),
            onClick: function () { setShowOptions(!showOptions); },
          }, t('token.toggle'))),
        h('div', { className: 'ghpf-modes' },
          ['auto', 'exact', 'keyword', 'browse'].map(function (key) {
            return h('button', {
              key: key, type: 'button', className: 'ghpf-chip',
              'aria-pressed': String(mode === key),
              onClick: function () { setMode(key); },
            }, t('mode.' + key));
          }),
          detect ? h('span', { className: 'ghpf-hint' }, t('mode.hint.exact'), h('b', null, detect.value)) : null,
          mode === 'browse' ? h('span', { className: 'ghpf-hint' }, t('mode.hint.browse')) : null),
        h('div', { className: 'ghpf-modes' },
          h('span', { className: 'ghpf-hint' }, t('sort.label')),
          ['relevance', 'stars', 'updated'].map(function (key) {
            return h('button', {
              key: 'sort-' + key, type: 'button', className: 'ghpf-chip',
              'aria-pressed': String(sort === key),
              onClick: function () { chooseSort(key); },
            }, t('sort.' + key));
          })),
        h('div', { className: 'ghpf-modes' },
          h('button', {
            type: 'button', className: 'ghpf-chip', 'aria-pressed': String(Boolean(hot)),
            onClick: loadHot,
          }, hotLoading ? t('hot.loading') : t('hot.button')),
          hot && hot.ok ? h('span', { className: 'ghpf-hint' }, t('hot.title') + '（' + String((hot.items || []).length) + '）') : null),
        showOptions ? h('div', { className: 'ghpf-options' },
          h('label', null, t('token.label'),
            h('input', {
              type: 'password', value: token, placeholder: t('token.placeholder'),
              onChange: function (e) { setToken(e.target.value); savePref('ghpf.token', e.target.value); },
            })),
          h('label', null, t('email.label'),
            h('input', {
              type: 'email', value: email, placeholder: 'you@example.com',
              onChange: function (e) { setEmail(e.target.value); savePref('ghpf.email', e.target.value); },
            })),
          h('label', null,
            h('input', {
              type: 'checkbox', checked: seed,
              onChange: function (e) { setSeed(e.target.checked); },
            }), t('seed.label')),
          h('div', { className: 'ghpf-foot' }, engineHint)) : null,
        h('div', { className: 'ghpf-status' },
          h('span', { className: 'ghpf-badge ' + (engine === 'host' ? 'ok' : '') }, engineLabel),
          translateRoutes.length
            ? h('span', { className: 'ghpf-hint' }, t('status.translate') + ' ' + translateRoutes.slice(0, 2).map(function (name) {
              return t('trans.route.' + name) !== 'trans.route.' + name ? t('trans.route.' + name) : name;
            }).join(' → '))
            : null,
          rateText ? h('span', null, rateText) : null,
          !loading && data && !error ? h('span', null, t('status.done') + ' ' + String(items.length)) : null,
          meta ? h('span', null, t('status.channels') + ' ' + String((meta.channels || []).length) + ' · ' + String(channelTotal) + ' ' + t('status.items')) : null,
          rounds > 1 ? h('span', { className: 'ghpf-hint' }, t('status.rounds') + ' ' + String(rounds)) : null,
          meta && Number(meta.totalCandidates) > items.length
            ? h('span', null, t('status.candidates') + ' ' + String(meta.totalCandidates)) : null,
          meta && meta.index && meta.index.size ? h('span', null, t('status.index') + ' ' + String(meta.index.size)) : null,
          meta && meta.deferred && meta.deferred.length ? h('span', { className: 'ghpf-hint' }, t('status.deferred') + ' ' + String(meta.deferred.length)) : null,
          meta && meta.stopped === 'rate' ? h('span', { className: 'ghpf-hint' }, t('status.quota')) : null,
          error ? h('span', { className: 'ghpf-error' }, t('status.error') + ' ' + error) : null,
          transProgress ? h('span', { className: 'ghpf-progress' },
            t('trans.loading') + ' ' + transProgress.done + '/' + transProgress.total
            + (transProgress.failed ? '（' + t('trans.failed') + ' ' + transProgress.failed + '）' : '')) : null,
          (transProgress && transProgress.failed && !loading) ? h('button', {
            type: 'button', className: 'ghpf-btn',
            onClick: function () { if (data) void translateAll(data, seq.current, true); },
          }, t('trans.retry')) : null,
          h('button', {
            type: 'button', className: 'ghpf-btn', 'aria-pressed': String(zhOn),
            onClick: toggleZh,
          }, zhOn ? t('trans.toggle.on') : t('trans.toggle.off'))),
        meta && meta.warnings && meta.warnings.length ? h('p', { className: 'ghpf-foot' },
          (meta.warnings.length > 2 ? meta.warnings.slice(0, 2).concat(['…']) : meta.warnings).join(' · ')) : null,
        hot ? h('section', { key: 'hot' },
          hot.ok
            ? (hot.items && hot.items.length
                ? h('div', { className: 'ghpf-list' }, hot.items.slice(0, 60).map(function (card) {
                    return cardNode(Object.assign({}, card, { category: classifyClient(card) }), {});
                  }))
                : h('p', { className: 'ghpf-hot-empty' }, t('hot.empty')))
            : h('p', { className: 'ghpf-hot-empty' }, t('status.error') + ' ' + String(hot.error || ''))) : null,
        data && data.exact ? h('div', { className: 'ghpf-exact' },
          h('div', { className: 'ghpf-exact-title' }, t('exact.hit')),
          cardNode(data.exact, { exact: true })) : null,
        data && !data.exact && data.exactNote && data.exactNote !== 'exact-hit' ? h('div', { className: 'ghpf-miss' },
          t('exact.miss') + ' ' + String((data.intent && data.intent.exact && data.intent.exact.value) || '')
          + ' — ' + (t('exact.note.' + data.exactNote) !== 'exact.note.' + data.exactNote ? t('exact.note.' + data.exactNote) : data.exactNote)) : null,
        h('div', { className: 'ghpf-modes' },
          [{ key: 'all' }].concat(CAT_KEYS.map(function (key) { return { key: key }; })).map(function (entry) {
            const count = entry.key === 'all' ? items.length : counts[entry.key];
            return h('button', {
              key: entry.key, type: 'button', className: 'ghpf-chip',
              'aria-pressed': String(cat === entry.key),
              onClick: function () { setCat(entry.key); },
            }, entry.key === 'all' ? t('chip.all') : t('cat.' + entry.key), ' (', String(count), ')');
          })),
        groups.length ? groups : (data && !loading ? h('p', { className: 'ghpf-intro' }, t('empty')) : null),
        filtered.length > shown.length ? h('div', { className: 'ghpf-actions' },
          h('button', { type: 'button', className: 'ghpf-btn', onClick: function () { setVisible(visible + 150); } },
            t('more') + ' (' + String(filtered.length - shown.length) + ')')) : null,
        h('p', { className: 'ghpf-foot' }, t('footnote')),
        h('p', { className: 'ghpf-foot' }, t('footnote.catalog')));
    }

    // tr is bound in apply() via closure; declared here so the component can use it.
    let tr = function (key) { return key; };

    function t(key) {
      let s;
      try { s = tr(key); } catch (e) { s = undefined; }
      if (typeof s === 'string' && s) return s;
      let loc = '';
      try {
        const snap = (window.__ctxLocale && window.__ctxLocale.getLocale()) || null;
        loc = (snap && (snap.id || snap.locale || '')) || '';
      } catch (e) { loc = ''; }
      const dict = String(loc).toLowerCase().indexOf('zh') === 0 ? ZH : EN;
      return dict[key] || key;
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const cleanups = [];
        function reg(id, dict) {
          try { cleanups.push(ctx.locale.register(NS, id, dict)); } catch (e) { /* duplicate/unsupported id */ }
        }
        reg('en', EN);
        reg('zh', ZH);
        function regCurrent() {
          try {
            const snap = ctx.locale.getLocale();
            const id = snap && (snap.id || snap.locale);
            if (id) reg(String(id), String(id).toLowerCase().indexOf('zh') === 0 ? ZH : EN);
          } catch (e) { /* locale service unavailable */ }
        }
        regCurrent();
        try { cleanups.push(ctx.locale.subscribe(regCurrent)); } catch (e) { /* optional */ }
        try { tr = ctx.locale.bind(NS); } catch (e) { tr = function (key) { return key; }; }
        window.__ctxLocale = ctx.locale;

        cleanups.push(ctx.slots.inject('plugins.tab', function () {
          return ctx.slots.register({
            name: 'plugins.tab',
            id: 'github-plugin-finder',
            order: 10,
            label: function () { return t('tab'); },
          }, FinderPanel);
        }));
        ctx.effect(function () {
          return function () {
            while (cleanups.length) {
              const fn = cleanups.pop();
              try { fn(); } catch (e) { /* already disposed */ }
            }
          };
        }, 'github-plugin-finder');
      },
    };
  },
});
