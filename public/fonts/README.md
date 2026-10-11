# 本地 PDF 文字层字体

`NotoSansCJKsc-Regular.ttf` 是 Noto Sans SC 的 400 常规静态实例，源自 Noto CJK 官方项目的 `Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf`。

来源：https://github.com/notofonts/noto-cjk
许可证：SIL Open Font License 1.1，见 LICENSE.txt。版权信息保留在字体内部。

下载源文件后，以 FontTools `instantiateVariableFont(font, {'wght': 400}, inplace=True)` 生成静态字体。采用 TrueType，避免当前 pdf-lib/fontkit 的 CFF 子集兼容问题；导出时按实际字符嵌入子集。字体随站点构建提供，运行时仅从本站加载。
