# Black PIC v2

零依赖的手机相机 Web 交互原型，使用原生 JavaScript、CSS 和 WebGL。支持个人灵感图库、取景辅助、实时影调、拍摄与本地作品管理。桌面浏览器中显示手机外壳，手机浏览器中全屏显示。

## 本地运行

需要 Node.js 18 或更高版本，无需安装依赖。在项目目录运行：

```bash
npm run dev
```

打开 [本地预览](http://localhost:4175)。端口占用时可用 `PORT=4176 npm run dev`。页面使用 ES modules，需要通过 HTTP 服务访问；图片和样式均为本地资源。

## 体验流程

- 点击 **AI**，依次体验场景识别、构图与滤镜，再按快门保存当前画面。支持前后对比、返回调整和取消。
- 首次打开时灵感库为空，可以从“调节”选择六个初始滤镜，或上传自己的图片。
- 相机左上角 **“…” → 演示起点** 可切换“空灵感库 / 已有图片”。切换保留已上传图片和作品；切回“已有图片”可重新看到原有图片。
- 也可打开 [已有图片的演示](http://localhost:4175/?inspirations=sample)，加入两张内置参考图。参考图影响海港示例的数字取景和影调，拍摄选择会参与后续相关场景的推荐。
- 支持导入照片、视频和 `.cube` LUT。可用 [示例 LUT](./assets/luma-warm-demo.cube) 体验 LUT 导入。

## 实现边界

- 场景识别、灵感特征和推荐使用预设数据与本地规则，尚未接入视觉模型、云端记忆或任意上传图片分析。新上传图片显示“待处理”。
- WebGL 实时处理色彩与数字取景；数字取景不代表相机会自动改变机位。ISO、快门等专业硬件参数仅为操作示意。
- 作品、上传图片和手动配方存入 IndexedDB，示例参考与采用历史存入 localStorage。数据按浏览器和站点地址区分，存储失败时会提示。
- 视频录制无音轨；Live 保存为照片与独立短视频，不是原生 Apple Live Photo。

## 代码结构

| 文件 | 用途 |
| --- | --- |
| `index.html`、`*.css` | 页面结构、手机布局与交互样式 |
| `app.js` | 相机状态、拍摄、配方和本地存储 |
| `core.js`、`interaction-core.js` | 参数、LUT 解析与交互计算 |
| `renderer.js` | WebGL 实时渲染 |
| `camera-interactions.js` | AI 流程、对比恢复与变焦手势 |
| `experience-model.js`、`personal-style.js` | 预设线索、推荐、灵感图库与采用记录 |
| `assets/` | 运行所需图片、示例 LUT 与素材来源说明 |
| `server.mjs` | 本地静态服务器 |
| `tests/` | 单元测试与浏览器回归测试 |
| `scripts/record-demo.mjs` | 浏览器演示录屏脚本 |

## 检查

```bash
npm run check
npm test
```

浏览器回归需要 Node.js 22+ 和开启本机调试端口的 Chrome。请使用独立的 Chrome 测试配置目录：测试会清空该浏览器中的演示站点数据。保持本地服务运行后执行：

```bash
npm run test:browser
```

默认连接 `http://127.0.0.1:9227`，演示地址为 `http://localhost:4175/`；可通过 `CAMERA_CDP_ENDPOINT` 和 `CAMERA_DEMO_URL` 覆盖。测试包含 AI 流程、拍摄与记忆复用、图片上传及删除、演示切换和不同屏幕尺寸，截图自动写入 `previews/`。

录屏脚本复用相同的浏览器配置，另需 `/opt/homebrew/bin/ffmpeg`，可运行 `node scripts/record-demo.mjs`。输出位于 `recordings/`。

`previews/`、`recordings/`、缓存、日志和本地环境配置均由 `.gitignore` 排除，不需要提交到 GitHub。素材出处见 [素材来源说明](./assets/来源说明.md)。
