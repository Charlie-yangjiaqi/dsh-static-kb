# 发布与收录（DSH 插件分发指南）

本文说明 **DeepSeek Harness（DSH）的插件市场是怎么工作的**，以及 `dsh-static-kb` 怎么发布、怎么让别人搜到。核对时间：2026-11；DSH 版本以 `0.2.2-rc.3` 为准。

## 一句话结论

**DSH 没有官方集中市场，也没有「提交给官方审核」这个入口。** 插件页的「发现 / Discover」读取的是**用户自己添加的索引源**（`plugin-market` 的 `indexes` 默认为 `[]`）。所以「上架」= 两件事：

1. 有一个能装的东西（npm 包，或钉住 commit 的 Git 仓库）；
2. 有一份符合 **format 1** 的索引 JSON，托管在任意 http(s) 静态地址上，用户把它加进 Discover。

官方文档：<https://deepseek-harness.github.io/deepseek-harness/guide/plugin-market>

## 三条安装路径

| 路径 | 用户怎么装 | 依赖 |
| --- | --- | --- |
| 市场索引 → Discover | 添加索引源 → 搜索 → 安装 | 索引 JSON + npm/Git 源 |
| npm | `dsh plugin --profile desktop add dsh-static-kb@0.1.0` | npm 发布 |
| Git commit | `dsh plugin --profile desktop add git+https://github.com/Charlie-yangjiaqi/dsh-static-kb.git#<commit>` | 公开仓库 |

索引里的每个版本二选一：`{"type":"npm"}` 或 `{"type":"git","url":…,"commit":<40位SHA>}`。Git 源要把精确 commit 写死，用户安装时才能复现。

## 本仓库的索引

- 生成：`npm run build:market`（读 `package.json` 与 `icon.svg`，钉住当前 `HEAD`；可传 40 位 SHA，或 `MARKET_SOURCE=npm` 用 npm 源）。
- 当前状态：`dsh-static-kb@0.9.0` 已发布到 npm，索引指向 npm 源。
- 文件：`market/index.json`（格式说明见 [market/README.md](../market/README.md)）。
- 推荐地址：
  `https://raw.githubusercontent.com/Charlie-yangjiaqi/dsh-static-kb/main/market/index.json`
- 备用：
  `https://raw.githubusercontent.com/Charlie-yangjiaqi/dsh-static-kb/main/market/index.json`

jsDelivr 的 `@main` 缓存可能滞后数小时（实测出现过只返回旧版本），所以索引源优先用 raw.githubusercontent；更新后可调用 purge 接口刷新 jsDelivr。

## 发布检查清单

```bash
# 1. 自检
npm test

# 2. 改版本号（语义化版本）
#    package.json -> version

# 3. 提交、打 tag
git add -A
git commit -m "chore(release): v0.1.1"
git tag v0.1.1
git push && git push --tags

# 4. 发布 npm（可选，但推荐：npm 源最省事）
npm login
npm publish --access public

# 5. 重建索引（npm 源）
MARKET_SOURCE=npm npm run build:market
#    或 Git 源（钉发布提交）：
#    npm run build:market $(git rev-parse HEAD)

# 6. 提交索引并推送
git add market/index.json
git commit -m "chore(market): pin v0.1.1"
git push
```

发布前确认 `package.json`：`private` 已移除、`license`/`author`/`repository`/`homepage`/`engines.dsh` 齐全、`files` 覆盖运行所需文件。可用 `npm pack --dry-run` 检查打包内容。

## 收录到社区目录（第三方，非官方）

这些不是 DSH 官方审核，只是社区维护的索引源，可以都做：

- **开放插件市场（dshopen.org）**：索引 `https://dshopen.org/index.json`，站内提供收录申请；一般要求公开源码、可安装的 npm 版本、明确的许可证（也接受固定 Git commit）。
- **awesome-dsh-plugin**：社区目录，索引 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`；向该仓库提交 PR（`data/plugins/*.yml`）即可。
- **GitHub topics**：给仓库加 `dsh-plugin`、`deepseek-harness`、`knowledge-base`，便于被自动采集和搜索。
- **自建索引**：本仓库的 `market/index.json` 本身就是一条索引源，无需任何人批准。

## 命名说明

`dsh-knowledge-base` 这个 npm 名已被占用（同类插件），因此本项目使用 **`dsh-static-kb`**。改名要同步三处，缺一不可：

1. `package.json` 的 `name`；
2. `client.js` 顶部 `window.__ModuleLoader__.load({ id })` —— 必须与包名完全一致；
3. `cordis.patch.yml` 里 `insert.name` 与包名一致。

## 信任与安全

- 索引是**未签名**的：索引里的 name/version/commit 是索引作者的声明，最终以安装下来的 manifest 为准。用户应只添加 HTTPS 的索引源。
- Git 源钉的是完整 commit，可审计；npm 源受 registry 与发布者账号保护。
- 插件运行在 DSH 进程内，拥有插件 API 的全部能力；收录前请自己读源码。本项目 MIT，源码不混淆。

## 参考

- 插件市场用户指南：<https://deepseek-harness.github.io/deepseek-harness/guide/plugin-market>
- DSH 仓库：<https://github.com/deepseek-ai/deepseek-harness>
- 索引格式校验器：`@deepseek-ai/dsh-plugin-market-index`（随 DSH 安装）
