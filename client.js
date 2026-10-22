window.__ModuleLoader__.load({
  id: '@local/github-plugin-finder',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'github-plugin-finder';
    const API = 'https://api.github.com';

    // ---------------------------------------------------------------- i18n
    const EN = {
      tab: 'Discover',
      intro: 'Searches GitHub (plus the npm registry) for DeepSeek Harness / Cordis plugins, translates English descriptions to Chinese, groups results by usage type, and always includes the newest uploads. Pick one, copy the install request, paste it in the chat.',
      'search.placeholder': 'Optional keywords, press Enter to search',
      'search.button': 'Search GitHub',
      'token.toggle': 'GitHub token (optional, raises rate limit)',
      'token.placeholder': 'ghp_... stored only in this browser',
      'status.idle': 'Click "Search GitHub" to discover plugins.',
      'status.loading': 'Searching GitHub...',
      'status.done': 'Candidates found:',
      'status.error': 'Search failed:',
      'rate.label': 'Search quota remaining:',
      'chip.all': 'All',
      'cat.ui': 'UI & Theme',
      'cat.mcp': 'MCP',
      'cat.automation': 'Automation',
      'cat.dev': 'Developer',
      'cat.ai': 'AI & Agents',
      'cat.tools': 'Tools',
      'cat.other': 'Other',
      'card.copy': 'Copy install request',
      'card.copied': 'Copied - paste it in the chat and I will install it.',
      'card.github': 'Repo',
      'card.stars': 'Stars',
      'card.updated': 'Updated',
      'card.noDesc': '(repository has no description)',
      'card.new': 'NEW',
      'trans.toggle.on': 'Chinese descriptions',
      'trans.toggle.off': 'Original text',
      'trans.loading': 'Translating descriptions...',
      empty: 'No matches. Try other keywords.',
      'clipboard.fallback': 'Clipboard unavailable - copy the text below manually:',
      footnote: 'After copying the install request, paste it into the chat; the assistant downloads and installs the plugin from GitHub.',
    };
    const ZH = {
      tab: '发现',
      intro: '在 GitHub（含 npm 镜像源）搜索 DeepSeek Harness / Cordis 插件，英文简介自动翻译成中文，按使用类型分类展示，并且每次都包含最新上传的插件。选中后复制安装指令，粘贴到对话里即可安装。',
      'search.placeholder': '关键词（可选），回车开始搜索',
      'search.button': '搜索 GitHub',
      'token.toggle': 'GitHub 令牌（可选，提高限额）',
      'token.placeholder': 'ghp_…（仅保存在本浏览器）',
      'status.idle': '点击“搜索 GitHub”开始发现插件。',
      'status.loading': '正在搜索 GitHub…',
      'status.done': '找到候选插件：',
      'status.error': '搜索失败：',
      'rate.label': '搜索配额剩余：',
      'chip.all': '全部',
      'cat.ui': '界面与主题',
      'cat.mcp': 'MCP 集成',
      'cat.automation': '自动化与提醒',
      'cat.dev': '开发与调试',
      'cat.ai': 'AI 与智能体',
      'cat.tools': '实用工具',
      'cat.other': '其他',
      'card.copy': '复制安装指令',
      'card.copied': '已复制，粘贴到对话里发给我即可安装。',
      'card.github': '仓库',
      'card.stars': '星标',
      'card.updated': '更新',
      'card.noDesc': '（该仓库未填写简介）',
      'card.new': '新',
      'trans.toggle.on': '中文简介',
      'trans.toggle.off': '原文',
      'trans.loading': '正在翻译简介…',
      empty: '没有匹配结果，换个关键词试试。',
      'clipboard.fallback': '剪贴板不可用，请手动复制下方文字：',
      footnote: '复制安装指令后回到对话粘贴发送，我会从 GitHub 下载并安装该插件。',
    };

    // ------------------------------------------------------------ categories
    // Usage-type rules, matched in order against name + description + topics.
    const CATS = [
      { key: 'ui', re: /\b(ui|ux|theme|interface|sidebar|panel|widget|decor|badge|icon|window|layout|composer|appearance|dark.?mode|css|typography|emoji|gif)\b|界面|主题|窗口|图标|表情|美化/ },
      { key: 'mcp', re: /\bmcp\b/ },
      { key: 'automation', re: /\b(automat\w*|schedule|cron|remind\w*|notif\w*|pipeline|routine|daily|watch|trigger|workflow|hook)\b|自动|提醒|定时|工作流/ },
      { key: 'dev', re: /\b(develop\w*|debug\w*|test\w*|lint|build|git|code|terminal|shell|cli|log\w*|sdk|typescript|javascript|npm|package|editor)\b|开发|调试|终端|编辑器/ },
      { key: 'ai', re: /\b(ai|llm|model|agent|prompt\w*|memory|chat|reasoning|context|embedding|rag|knowledge)\b|模型|智能|助手|记忆|提示/ },
      { key: 'tools', re: /\b(tool\w*|util\w*|helper|search|translat\w*|language|weather|calendar|note|todo|clipboard|file|image|web|browser|fetch|rss|timer|pomodoro|download|export)\b|工具|翻译|笔记|剪贴板|日历|下载/ },
    ];
    const CAT_KEYS = ['ui', 'mcp', 'automation', 'dev', 'ai', 'tools', 'other'];
    function classify(repo, trRepo) {
      const text = [
        repo.name || '',
        (trRepo && trRepo.name) || '',
        repo.description || '',
        (trRepo && trRepo.description) || '',
        (repo.topics || []).join(' '),
      ].join(' ').toLowerCase();
      for (const c of CATS) if (c.re.test(text)) return c.key;
      return 'other';
    }

    // ---------------------------------------------------------- GitHub query
    // Broad query set; results are deduped by full_name, so overlap is free.
    const REPO_QUERIES = [
      'topic:dsh-plugin',
      'topic:deepseek-harness',
      'topic:cordis',
      'topic:cordis-plugin',
      'topic:dsh',
      'dsh-plugin in:name,description',
      '"deepseek harness" plugin in:name,description,readme',
      'plugin in:name,description dsh harness',
      'cordis plugin in:name,description,readme',
      'cordis dsh in:name,description,readme',
    ];
    const CODE_QUERIES = ['filename:dsh-plugin.json', 'filename:cordis.patch.yml'];
    const NPM_QUERIES = ['keywords:dsh-plugin', 'text=cordis dsh plugin'];

    // Fresh-upload channel: created in the last 45 days, sorted by creation
    // time, run FIRST so newly uploaded plugins always surface.
    function newestQueries(kw) {
      const d = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
      return [
        { q: (kw ? kw + ' plugin' : 'dsh plugin') + ' created:>=' + d, sort: 'created' },
        { q: (kw ? kw : 'cordis') + ' created:>=' + d, sort: 'created' },
      ];
    }

    // One query -> up to maxPages pages of results; stops early when the
    // rate budget is exhausted. Errors are recorded on `state`, never thrown.
    async function collectSearch(q, token, opts, state) {
      const perPage = opts.perPage || 100;
      const maxPages = opts.maxPages || 1;
      const out = [];
      for (let page = 1; page <= maxPages; page++) {
        const params = { q: q, per_page: String(perPage), page: String(page) };
        if (opts.sort) { params.sort = opts.sort; params.order = opts.order || 'desc'; }
        let r;
        try {
          r = await ghFetch(opts.path || '/search/repositories', token, params);
        } catch (e) {
          state.lastRate = e.rate || state.lastRate;
          if (e.status === 403 && e.rate && e.rate.remaining === '0') state.rateHit = true;
          if (e.status === 403 || e.status === 429) state.fatal = String(e.message);
          return out;
        }
        state.lastRate = r.rate;
        const items = (r.data && r.data.items) || [];
        for (const item of items) out.push(item);
        if (items.length < perPage) break;
        if (r.rate && r.rate.remaining !== null && r.rate.remaining !== undefined && Number(r.rate.remaining) <= 1) break;
      }
      return out;
    }

    // npm registry channel: independent of the GitHub quota, so coverage
    // survives even when the GitHub search limit is exhausted.
    async function fetchNpm(queryText) {
      const res = await fetch('https://registry.npmjs.org/-/v1/search?size=100&text=' + encodeURIComponent(queryText));
      if (!res.ok) throw new Error('npm ' + res.status);
      const data = await res.json();
      return (data && data.objects) || [];
    }
    function npmToRepo(o) {
      const p = (o && o.package) || {};
      const link = (p.links && (p.links.repository || p.links.npm)) || '';
      const m = /github\.com[/:]([^/]+)\/([^/?#]+)/.exec(link);
      const full = m ? m[1] + '/' + String(m[2]).replace(/\.git$/, '') : 'npm:' + (p.name || '');
      return {
        full_name: full,
        html_url: m ? 'https://github.com/' + full : (link || ('https://www.npmjs.com/package/' + (p.name || ''))),
        description: p.description || '',
        stargazers_count: 0,
        updated_at: p.date || null,
        topics: Array.isArray(p.keywords) ? p.keywords.slice(0, 8) : [],
        language: 'npm',
        _npm: true,
      };
    }

    async function ghFetch(path, token, params) {
      const url = new URL(API + path);
      Object.entries(params || {}).forEach(function (e) { url.searchParams.set(e[0], e[1]); });
      const headers = { Accept: 'application/vnd.github+json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      const res = await fetch(url.toString(), { headers });
      const rate = {
        remaining: res.headers.get('x-ratelimit-remaining'),
        limit: res.headers.get('x-ratelimit-limit'),
        reset: res.headers.get('x-ratelimit-reset'),
        resource: res.headers.get('x-ratelimit-resource') || 'search',
      };
      if (!res.ok) {
        let msg = res.status + ' ' + res.statusText;
        try {
          const body = await res.json();
          if (body && body.message) msg = body.message;
        } catch (e) { /* keep status text */ }
        const err = new Error(msg);
        err.rate = rate;
        err.status = res.status;
        throw err;
      }
      return { data: await res.json(), rate: rate };
    }

    // ------------------------------------------------------------- translate
    // English -> Chinese with a localStorage cache; degrades gracefully to
    // the original English whenever the network/CORS/endpoint fails.
    const CJK = /[㐀-鿿豈-﫿]/;
    function trCacheKey(text) {
      let hv = 5381;
      for (let i = 0; i < text.length; i++) hv = ((hv << 5) + hv + text.charCodeAt(i)) >>> 0;
      return 'ghpf.tr.' + hv.toString(36) + '.' + text.length;
    }
    async function translateText(text) {
      if (!text || text.length < 3 || CJK.test(text)) return null;
      let hit = null;
      try { hit = localStorage.getItem(trCacheKey(text)); } catch (e) { hit = null; }
      if (hit) return hit;
      try {
        const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q='
          + encodeURIComponent(String(text).slice(0, 1800));
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const out = ((data && data[0]) || []).map(function (seg) { return (seg && seg[0]) || ''; }).join('');
          if (out && out !== text) {
            try { localStorage.setItem(trCacheKey(text), out); } catch (e) { /* quota */ }
            return out;
          }
        }
      } catch (e) { /* fall through to MyMemory */ }
      try {
        const url = 'https://api.mymemory.translated.net/get?langpair=en%7Czh-CN&q='
          + encodeURIComponent(String(text).slice(0, 480));
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const out = data && data.responseData && data.responseData.translatedText;
          if (out && out !== text && !/^MYMEMORY WARNING/i.test(out)) {
            try { localStorage.setItem(trCacheKey(text), out); } catch (e) { /* quota */ }
            return out;
          }
        }
      } catch (e) { /* give up, keep original */ }
      return null;
    }

    // -------------------------------------------------------------- styles
    const CSS = `
.ghpf-root{display:flex;flex-direction:column;gap:12px;padding:16px;height:100%;box-sizing:border-box;overflow:auto;color:var(--dsw-alias-label-primary);font-size:13px;}
.ghpf-root *{box-sizing:border-box;}
.ghpf-intro{color:var(--dsw-alias-label-secondary);line-height:1.6;margin:0;}
.ghpf-searchrow{display:flex;gap:8px;flex-wrap:wrap;}
.ghpf-input{flex:1 1 260px;min-width:0;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);}
.ghpf-input:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px;}
.ghpf-btn{padding:8px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;}
.ghpf-btn:hover{border-color:var(--dsw-alias-brand-primary);}
.ghpf-btn:disabled{opacity:0.5;cursor:default;}
.ghpf-btn-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);}
.ghpf-chips{display:flex;gap:8px;flex-wrap:wrap;}
.ghpf-chip{padding:4px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer;}
.ghpf-chip[aria-pressed="true"]{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);}
.ghpf-status{color:var(--dsw-alias-label-secondary);display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;}
.ghpf-status .ghpf-error{color:var(--dsw-alias-state-error-primary);word-break:break-word;}
.ghpf-cat{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);border-bottom:1px solid var(--dsw-alias-border-l1);padding-bottom:4px;margin:8px 0 0;}
.ghpf-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:10px 12px;display:flex;flex-direction:column;gap:6px;}
.ghpf-title{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;}
.ghpf-title a{color:var(--dsw-alias-brand-primary);font-weight:600;text-decoration:none;word-break:break-all;}
.ghpf-title a:hover{text-decoration:underline;}
.ghpf-meta{display:flex;gap:12px;flex-wrap:wrap;color:var(--dsw-alias-label-secondary);}
.ghpf-desc{margin:0;line-height:1.5;color:var(--dsw-alias-label-primary);word-break:break-word;}
.ghpf-nodesc{color:var(--dsw-alias-label-secondary);font-style:italic;}
.ghpf-topics{display:flex;gap:6px;flex-wrap:wrap;}
.ghpf-topic{font-size:11px;padding:1px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);}
.ghpf-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.ghpf-ok{color:var(--dsw-alias-state-success-primary);}
.ghpf-fallback{width:100%;min-height:56px;border:1px dashed var(--dsw-alias-state-warn-primary);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.ghpf-token{border:1px dashed var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;color:var(--dsw-alias-label-secondary);}
.ghpf-token input{padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);}
.ghpf-btn[aria-pressed="true"]{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);}
.ghpf-new{font-size:11px;font-weight:600;padding:1px 8px;border-radius:999px;background:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-bg-base);}
.ghpf-orig{color:var(--dsw-alias-label-secondary);font-size:12px;}
.ghpf-translating{color:var(--dsw-alias-state-warn-primary);}
.ghpf-foot{color:var(--dsw-alias-label-secondary);line-height:1.6;}
`;

    // ------------------------------------------------------------ panel UI
    function FinderPanel() {
      const [query, setQuery] = React.useState('');
      const [token, setToken] = React.useState(function () {
        try { return localStorage.getItem('ghpf.token') || ''; } catch (e) { return ''; }
      });
      const [showToken, setShowToken] = React.useState(false);
      const [repos, setRepos] = React.useState([]);
      const [rate, setRate] = React.useState(null);
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState('');
      const [searched, setSearched] = React.useState(false);
      const [cat, setCat] = React.useState('all');
      const [copied, setCopied] = React.useState('');
      const [zhOn, setZhOn] = React.useState(function () {
        try { return localStorage.getItem('ghpf.zh') !== '0'; } catch (e) { return true; }
      });
      const [trans, setTrans] = React.useState({});
      const [translating, setTranslating] = React.useState(false);
      const seq = React.useRef(0);

      function saveToken(v) {
        setToken(v);
        try { localStorage.setItem('ghpf.token', v); } catch (e) { /* storage unavailable */ }
      }

      function toggleZh() {
        const v = !zhOn;
        setZhOn(v);
        try { localStorage.setItem('ghpf.zh', v ? '1' : '0'); } catch (e) { /* storage unavailable */ }
        if (v && repos.length && !translating) void startTranslate(repos, seq.current);
      }

      // Translate descriptions in the background, guarded by the search seq.
      async function startTranslate(list, forSeq) {
        setTranslating(true);
        const acc = {};
        let n = 0;
        for (const r of list) {
          if (seq.current !== forSeq) return;
          if (n >= 80) break;
          if (!r.description || CJK.test(r.description)) continue;
          n += 1;
          const out = await translateText(r.description);
          if (seq.current !== forSeq) return;
          if (!out) continue;
          acc[r.full_name] = { description: out };
          if (n % 5 === 0) setTrans(Object.assign({}, acc));
        }
        if (seq.current === forSeq) {
          setTrans(Object.assign({}, acc));
          setTranslating(false);
        }
      }

      async function runSearch() {
        const mySeq = ++seq.current;
        setLoading(true); setError(''); setSearched(true); setCopied('');
        setTrans({}); setTranslating(false);
        const kw = query.trim();
        const byKey = new Map();
        const state = { lastRate: null, rateHit: false, fatal: '' };
        const maxPages = token ? 3 : 1;
        // Fresh uploads first, then the broad coverage set.
        const plan = newestQueries(kw).concat(
          REPO_QUERIES.map(function (q0) { return { q: kw ? q0 + ' ' + kw : q0 }; })
        );
        try {
          for (const step of plan) {
            if (state.rateHit || state.fatal) break;
            const items = await collectSearch(step.q, token, {
              perPage: 100, maxPages: maxPages, sort: step.sort, order: 'desc',
            }, state);
            for (const item of items) {
              if (item && item.full_name && !byKey.has(item.full_name)) {
                item._new = !!(item.created_at && Date.now() - new Date(item.created_at).getTime() < 14 * 86400000);
                byKey.set(item.full_name, item);
              }
            }
            if (state.lastRate && state.lastRate.remaining !== null && state.lastRate.remaining !== undefined
              && Number(state.lastRate.remaining) <= 1) break;
          }
          // Code search channel (needs a token); surfaces bundles that declare dsh.plugin/bundle manifests.
          if (token && !state.rateHit && !state.fatal) {
            for (const q of CODE_QUERIES) {
              const items = await collectSearch(q, token, { perPage: 50, maxPages: 1, path: '/search/code' }, state);
              for (const item of items) {
                const repo = item && item.repository;
                if (repo && repo.full_name && !byKey.has(repo.full_name)) byKey.set(repo.full_name, repo);
              }
              if (state.rateHit || state.fatal) break;
            }
          }
          // npm registry channel (independent quota) — keeps coverage alive
          // even when the GitHub search limit is exhausted.
          try {
            for (const nq of NPM_QUERIES) {
              const objs = await fetchNpm(kw ? nq + ' ' + kw : nq);
              for (const o of objs) {
                const repo = npmToRepo(o);
                if (repo && repo.full_name && !byKey.has(repo.full_name)) byKey.set(repo.full_name, repo);
              }
            }
          } catch (e) { /* npm channel is optional */ }
          const merged = Array.from(byKey.values());
          merged.sort(function (a, b) { return (b.stargazers_count || 0) - (a.stargazers_count || 0); });
          if (seq.current === mySeq) {
            setRepos(merged);
            setRate(state.lastRate);
            if (state.rateHit) setError('GitHub search rate limit reached (403). Retry later or add a token below.');
            else if (state.fatal) setError(state.fatal);
            setLoading(false);
            if (zhOn && merged.length) void startTranslate(merged, mySeq);
          }
        } catch (e) {
          if (seq.current === mySeq) {
            setError(String((e && e.message) || e));
            setRate(state.lastRate);
            setLoading(false);
          }
        }
      }

      function installLine(r) {
        if (r._npm && String(r.full_name).indexOf('npm:') === 0) {
          return '请帮我安装 DeepSeek Harness 插件（npm）：' + String(r.full_name).slice(4) + '（' + (r.html_url || '') + '）';
        }
        return '请帮我从 GitHub 安装 DeepSeek Harness 插件：' + r.full_name;
      }

      async function copyInstall(r) {
        const line = installLine(r);
        try {
          await navigator.clipboard.writeText(line);
          setCopied(r.full_name);
        } catch (e) {
          setCopied('!fallback!' + r.full_name);
        }
      }

      const counts = {};
      for (const k of CAT_KEYS) counts[k] = 0;
      for (const r of repos) counts[classify(r, trans[r.full_name])] += 1;
      const visible = repos.filter(function (r) { return cat === 'all' || classify(r, trans[r.full_name]) === cat; });

      const groups = [];
      for (const k of CAT_KEYS) {
        const list = visible.filter(function (r) { return classify(r, trans[r.full_name]) === k; });
        if (!list.length) continue;
        groups.push(h('section', { key: 'cat-' + k, className: 'ghpf-catwrap' },
          h('h3', { className: 'ghpf-cat' }, t('cat.' + k), ' (', String(list.length), ')'),
          h('div', { className: 'ghpf-cards', style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' } },
            list.map(function (r) {
              const fb = copied === '!fallback!' + r.full_name;
              return h('article', { key: r.full_name, className: 'ghpf-card' },
                h('div', { className: 'ghpf-title' },
                  h('a', { href: r.html_url || ('https://github.com/' + r.full_name), target: '_blank', rel: 'noreferrer' }, r.full_name),
                  r._new ? h('span', { className: 'ghpf-new' }, t('card.new')) : null,
                  r.language ? h('span', { className: 'ghpf-topic' }, r.language) : null),
                (zhOn && trans[r.full_name] && trans[r.full_name].description)
                  ? h('p', { className: 'ghpf-desc' }, trans[r.full_name].description,
                    r.description ? h('span', { className: 'ghpf-orig' }, ' — ', r.description) : null)
                  : (r.description
                    ? h('p', { className: 'ghpf-desc' }, r.description)
                    : h('p', { className: 'ghpf-desc ghpf-nodesc' }, t('card.noDesc'))),
                h('div', { className: 'ghpf-meta' },
                  h('span', null, t('card.stars'), ' ', String(r.stargazers_count || 0)),
                  h('span', null, t('card.updated'), ' ', r.updated_at ? String(new Date(r.updated_at).toLocaleDateString()) : '-')),
                (r.topics && r.topics.length)
                  ? h('div', { className: 'ghpf-topics' }, r.topics.slice(0, 8).map(function (tp) {
                    return h('span', { key: tp, className: 'ghpf-topic' }, tp);
                  }))
                  : null,
                h('div', { className: 'ghpf-actions' },
                  h('button', {
                    type: 'button', className: 'ghpf-btn', disabled: loading,
                    onClick: function () { copyInstall(r); },
                  }, copied === r.full_name ? t('card.copied') : t('card.copy')),
                  copied === r.full_name ? h('span', { className: 'ghpf-ok' }, t('card.copied')) : null),
                fb ? h('div', { className: 'ghpf-actions' },
                  h('span', null, t('clipboard.fallback')),
                  h('textarea', { className: 'ghpf-fallback', readOnly: true, value: installLine(r) })) : null
              );
            }))
        ));
      }

      return h('div', { className: 'ghpf-root' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('p', { className: 'ghpf-intro' }, t('intro')),
        h('form', {
          className: 'ghpf-searchrow',
          onSubmit: function (e) { e.preventDefault(); if (!loading) runSearch(); },
        },
          h('input', {
            className: 'ghpf-input', type: 'search', value: query,
            placeholder: t('search.placeholder'),
            onChange: function (e) { setQuery(e.target.value); },
          }),
          h('button', { type: 'submit', className: 'ghpf-btn ghpf-btn-primary', disabled: loading },
            loading ? t('status.loading') : t('search.button')),
          h('button', {
            type: 'button', className: 'ghpf-btn',
            onClick: function () { setShowToken(!showToken); },
          }, t('token.toggle')),
          h('button', {
            type: 'button', className: 'ghpf-btn', 'aria-pressed': String(zhOn),
            onClick: toggleZh,
          }, zhOn ? t('trans.toggle.on') : t('trans.toggle.off'))),
        showToken ? h('div', { className: 'ghpf-token' },
          h('input', {
            type: 'password', value: token, placeholder: t('token.placeholder'),
            onChange: function (e) { saveToken(e.target.value); },
          })) : null,
        h('div', { className: 'ghpf-chips' },
          [{ key: 'all' }].concat(CAT_KEYS.map(function (k) { return { key: k }; })).map(function (c) {
            const n = c.key === 'all' ? repos.length : counts[c.key];
            return h('button', {
              key: c.key, type: 'button', className: 'ghpf-chip',
              'aria-pressed': String(cat === c.key),
              onClick: function () { setCat(c.key); },
            }, c.key === 'all' ? t('chip.all') : t('cat.' + c.key), ' (', String(n), ')');
          })),
        h('div', { className: 'ghpf-status' },
          searched ? null : h('span', null, t('status.idle')),
          loading ? h('span', null, t('status.loading')) : null,
          (!loading && searched && !error) ? h('span', null, t('status.done'), ' ', h('strong', null, String(repos.length))) : null,
          error ? h('span', { className: 'ghpf-error' }, t('status.error'), ' ', error) : null,
          translating ? h('span', { className: 'ghpf-translating' }, t('trans.loading')) : null,
          (rate && rate.remaining !== null && rate.remaining !== undefined)
            ? h('span', null, t('rate.label'), ' ', String(rate.remaining), ' / ', String(rate.limit || '?'))
            : null),
        groups.length ? groups : (searched && !loading ? h('p', { className: 'ghpf-intro' }, t('empty')) : null),
        h('p', { className: 'ghpf-foot' }, t('footnote')));
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
