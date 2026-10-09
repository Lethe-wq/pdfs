# 验证说明

验证日期：2026-10-09。测试使用合成 PDF，不包含用户文档。

## 自动检查

- 51 项单元测试通过，覆盖范围校验、群组移动、历史恢复、完整生成基准、取消、超时、Worker 自动恢复与重试。
- PDF 引擎检查覆盖混合纸张尺寸、旋转叠加、交错来源页序、共享字体资源、ZIP 内容和失败时不生成部分结果。
- TypeScript 检查和生产构建通过。
- `pnpm test:worker` 使用 Node 线程适配器运行 Vite 构建的真实处理 Worker，验证崩溃后读取来源并恢复导出，以及取消后再次导出。

## 浏览器与文件检查

- 内置浏览器：有效／损坏／加密文件混合导入、范围选择、旋转、多页移动、撤销、选页另存及拆分重叠拦截。
- 内置浏览器实际下载合并 PDF、选中 PDF 和拆分 ZIP；使用独立 pypdf 读取器核对文字、顺序、尺寸、旋转及 ZIP 条目。
- Safari：两文件导入、选页、旋转、移动及合并下载；下载文件经独立读取校验，在 macOS“预览”中显示正常。
- 100 页、29.12 MiB 扫描件：在内置浏览器导入、预览、生成及下载成功；观察时只有附近 4 页分配画布。输出 100 页的尺寸和全部图像哈希与原文件一致。

## 尚未完成的验证

- Chrome 未安装，尚未进行 Chrome 验收；内置浏览器的结果不等同于 Chrome 验证。
- Safari 的选页另存及 ZIP 下载未单独复测。
- 取消及恢复已通过单元测试和真实 Worker 验证；100 页导出在自动化点击取消前已完成，尚未完成界面取消按钮的端到端验收。
- 文件选择和下载自动化耗时异常，未取得可信的浏览器整体导入／首屏预览耗时和浏览器峰值内存。

## 引擎性能测量

同一份 100 页扫描件，在本机使用 Node.js 24.19 的隔离进程进行单次测量：

| 指标 | 优化前 | 优化后 |
| --- | ---: | ---: |
| 读取验证 | 11 ms | 10 ms |
| 完整 PDF 导出 | 54 ms | 50 ms |
| 分成两份并打包 ZIP | 155 ms | 145 ms |
| 进程峰值 RSS | 320.7 MiB | 288.0 MiB |

数据包含测试进程本身，不包含浏览器界面、PDF.js 预览与通信复制。这是单次引擎测量，不能据此承诺浏览器整体提速或内存上限。

使用 Node.js 24+ 可以复测当前引擎：

```sh
mkdir -p tmp/pdfs
node scripts/benchmark-pdf.mjs /path/to/100-page.pdf
```

脚本固定按前 50 页和其余页分成两组，输入需超过 50 页；建议使用 100 页样本进行同口径比较。报告和生成的 PDF／ZIP 写入 `tmp/pdfs/`。

## 生成测试样本

可选的 Python 样本工具需要 reportlab、Pillow 和 pypdf：

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install reportlab Pillow pypdf
python scripts/create-fixtures.py
```

工具生成文字 PDF、损坏 PDF、加密 PDF 和 160 页扫描件到 `tmp/pdfs/`。这些 Python 依赖仅供验证，不影响网页运行。

随后使用 Node.js 24+ 执行导出检查：

```sh
node scripts/verify-exports.mjs
```

输出同样位于 `tmp/pdfs/`，该目录不提交到仓库。
