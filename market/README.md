# market —— DSH 插件市场索引（format 1）

DSH **没有官方集中市场**：插件页的「发现 / Discover」读取的是用户自己添加的索引源。索引就是一个符合 **format 1** 的 JSON 文件，托管在任意 http(s) 静态地址即可。

本目录的 `index.json` 由 `npm run build:market` 生成（不要手改）：

```bash
node scripts/build-market-index.mjs            # 钉当前 HEAD
node scripts/build-market-index.mjs <40位SHA>   # 钉发布提交
MARKET_SOURCE=npm node scripts/build-market-index.mjs   # 发布到 npm 后用 npm 源
```

## 索引地址

- raw.githubusercontent（推荐，始终最新）：
  `https://raw.githubusercontent.com/Charlie-yangjiaqi/dsh-static-kb/main/market/index.json`
- jsDelivr（备用，`@main` 缓存可能滞后数小时）：
  `https://cdn.jsdelivr.net/gh/Charlie-yangjiaqi/dsh-static-kb@main/market/index.json`

在 DSH：设置 → 插件 → 打开「自定义插件索引」→ 发现 → 添加索引源，粘贴上面的 URL。

## format 1 关键字段（由 `@deepseek-ai/dsh-plugin-market-index` 严格校验）

| 字段 | 要求 |
| --- | --- |
| `format` | 必须是整数 `1` |
| `title` | `LocalizedText`；对象形式必须含 `en` |
| `plugins[].name` | 合法 npm 包名，索引内唯一 |
| `plugins[].versions` | 非空，按 SemVer 降序；`version` 是精确版本（不能写 `^1.0.0`） |
| `versions[].publishTimestamp` | **整数秒**（毫秒会被拒），范围 `[0, 1e11)` |
| `versions[].source` | `{type:'npm'}` 或 `{type:'git', url, commit}`；`commit` 必须是**完整 40 位小写 SHA** |
| `metadata.category` / `labels` | 用到就必须在索引根的 `metadata` 里先声明 |
| `icon` | https 绝对地址或 `data:` URL（解码后 ≤ 32 KiB） |

详细规则见 DSH 官方说明：<https://deepseek-harness.github.io/deepseek-harness/guide/plugin-market>。

## 发布后如何让索引指到新版本

1. 改 `package.json` 版本号；
2. 提交并打 tag（`git tag v0.1.1 && git push --tags`）；
3. 发布 npm（可选）：`npm publish --access public`；
4. `npm run build:market`（npm 源用 `MARKET_SOURCE=npm`）；
5. 提交 `market/index.json` 并 push；
6. jsDelivr 有缓存，通常几分钟内生效，也可以在 URL 里加 `?t=<时间戳>` 强刷。
